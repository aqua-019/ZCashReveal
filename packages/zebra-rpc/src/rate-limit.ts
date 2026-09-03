/**
 * The request budget a third-party RPC endpoint imposes, and the two things a
 * client needs to respect one: a gate that will not let a request through when
 * the window is full, and a reader for the `Retry-After` a 429 may carry.
 *
 * WHY THIS EXISTS AT ALL. Zebra over loopback has no ceiling worth modelling -
 * `INDEXER_POLL_INTERVAL_MS` at 2000 issues 30 `getrawmempool` a minute plus one
 * `getrawtransaction` per new txid and nobody minds. A keyless public gateway
 * does mind: HANDOFF-15's brief carries a measurement of exactly five requests
 * per minute against `zcash-mainnet-zebrad.gateway.tatum.io`, taken as a
 * sixteen-request burst over 1.4 seconds - five 200s, then 429 for every
 * request from the sixth on, and it stayed refused. The default poll is six
 * times that ceiling before a single transaction is fetched.
 *
 * A CEILING IS NOT A RETRY POLICY AND THIS FILE IS NOT ONE. `client.ts` already
 * retries a transport failure with a doubling backoff; that is a policy about
 * FAILURES. This is a policy about SUCCESSES - it slows requests that would
 * otherwise succeed, so that they keep succeeding. Collapsing the two is how a
 * client ends up spending three of its five requests retrying the 429 the first
 * one earned, which is what this package did before HANDOFF-15: a 429 fell to
 * `if (!res.ok) throw new Error(...)` at the bottom of `#once`, `call()` read it
 * as a transport failure because it was not an `RpcError`, and it slept 200 ms
 * and 400 ms and asked twice more.
 *
 * NO JITTER, for the reason `client.ts` already gives: `Math.random` is banned
 * project-wide and the thundering herd it solves is not this shape. One process
 * is metering itself against one endpoint.
 */

/**
 * A rolling-window request budget.
 *
 * THE WINDOW ROLLS RATHER THAN RESETS, and that is the whole of the design. A
 * fixed bucket that empties on the minute lets a caller spend five requests at
 * 59.9 s and five more at 60.1 s - ten inside one real minute, and the endpoint
 * measured above refuses on the sixth. Timestamps are kept per request and
 * expire individually, so the invariant "no more than `perMinute` requests in
 * ANY 60-second span" holds at every instant rather than at each boundary.
 */
export class RateGate {
  readonly #perMinute: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  /** Issue times, oldest first. Trimmed on every read. */
  #issued: number[] = [];
  /** A deadline set by a 429; no request goes out before it. */
  #penaltyUntil = 0;
  /** A serialising tail, so concurrent callers queue instead of racing. */
  #tail: Promise<void> = Promise.resolve();

  constructor(opts: {
    /** Requests permitted in any rolling window. Must be positive. */
    readonly perMinute: number;
    /** The window, in ms. 60_000 everywhere except a test that does not want to wait. */
    readonly windowMs?: number;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
  }) {
    if (!Number.isFinite(opts.perMinute) || opts.perMinute <= 0) {
      throw new RangeError(`RateGate: perMinute must be positive, got ${String(opts.perMinute)}`);
    }
    this.#perMinute = Math.floor(opts.perMinute);
    this.#windowMs = opts.windowMs ?? 60_000;
    this.#now = opts.now ?? Date.now;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The configured ceiling, so a caller can size a per-tick budget from it. */
  get perMinute(): number {
    return this.#perMinute;
  }

  /** The window, so a planner can state its arithmetic in the same units. */
  get windowMs(): number {
    return this.#windowMs;
  }

  #trim(now: number): void {
    const cutoff = now - this.#windowMs;
    // `noUncheckedIndexedAccess` is on, so the element is `number | undefined`
    // and the guard has to say so. An `undefined` slot cannot occur - the array
    // is only ever pushed to - and treating it as expired would silently widen
    // the budget, so it stops the walk instead.
    let i = 0;
    for (; i < this.#issued.length; i += 1) {
      const at = this.#issued[i];
      if (at === undefined || at > cutoff) break;
    }
    if (i > 0) this.#issued = this.#issued.slice(i);
  }

  /**
   * How many requests could go out right now without waiting.
   *
   * A REPORT, NOT A RESERVATION. Two callers reading `remaining()` and then both
   * calling `take()` do not both get through: `take()` re-checks under the
   * serialising tail. This is what a planner sizes a tick against, and it is
   * allowed to be stale by the time the tick runs.
   */
  remaining(): number {
    const now = this.#now();
    if (now < this.#penaltyUntil) return 0;
    this.#trim(now);
    return Math.max(0, this.#perMinute - this.#issued.length);
  }

  /** Milliseconds until the next slot frees, 0 when one is free now. */
  waitMs(): number {
    const now = this.#now();
    const penalty = Math.max(0, this.#penaltyUntil - now);
    this.#trim(now);
    if (this.#issued.length < this.#perMinute) return penalty;
    const oldest = this.#issued[0];
    // Unreachable: the branch above returned when the array was shorter than
    // the ceiling, and the ceiling is positive by construction. Written as a
    // real branch rather than a `!` because a non-null assertion here would be
    // the one place this file lies about what it knows.
    if (oldest === undefined) return penalty;
    return Math.max(penalty, oldest + this.#windowMs - now);
  }

  /**
   * Wait for a slot, then consume it.
   *
   * Serialised on `#tail` so that N concurrent `take()`s consume N slots in
   * order rather than all reading the same free slot and all going out. The
   * loop re-checks after every sleep because a penalty can be set while it
   * waits.
   */
  take(): Promise<void> {
    const run = this.#tail.then(async () => {
      for (;;) {
        const wait = this.waitMs();
        if (wait <= 0) break;
        await this.#sleep(wait);
      }
      this.#issued.push(this.#now());
    });
    // The tail must not reject for the next caller; failures belong to `run`.
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Record a refusal.
   *
   * THE WINDOW IS FILLED, NOT JUST DELAYED. A 429 says the endpoint's own count
   * disagrees with ours - it thinks we have spent the budget - so trusting our
   * count and retrying at the next free slot asks again immediately. Marking
   * the window full makes our count agree with the answer we were given, and
   * the penalty deadline covers the case where `retryAfterMs` is longer than
   * the window.
   */
  penalise(retryAfterMs: number | null): void {
    const now = this.#now();
    this.#issued = Array.from({ length: this.#perMinute }, () => now);
    const wait = retryAfterMs === null ? this.#windowMs : retryAfterMs;
    this.#penaltyUntil = Math.max(this.#penaltyUntil, now + Math.max(0, wait));
  }
}

/**
 * `Retry-After`, in milliseconds, or null when the header is absent or unusable.
 *
 * RFC 9110 gives it TWO forms and a client that reads only one silently ignores
 * the other: `delta-seconds` (`Retry-After: 30`) and `HTTP-date`
 * (`Retry-After: Wed, 03 Sep 2026 22:44:05 GMT`). Cloudflare-fronted gateways -
 * which is what a public Zcash endpoint usually is - send the first; some
 * origin servers send the second.
 *
 * NULL IS A REAL ANSWER AND NOT A FAILURE. The header is not required on a 429,
 * so its absence is the common case rather than an error; the caller's fallback
 * is the window itself, which is the only bound available when the endpoint
 * declines to give one. A date in the past clamps to 0 rather than going
 * negative, because a negative wait would read as "go now" to `penalise`.
 */
export function parseRetryAfterMs(raw: string | null | undefined, now: number): number | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (text === "") return null;

  // delta-seconds first: it is the common form and it is unambiguous.
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    if (!Number.isFinite(seconds)) return null;
    return seconds * 1000;
  }

  // `Date.parse` IS NOT A DATE VALIDATOR AND USING IT AS ONE PRODUCES A ZERO
  // WHERE THE ANSWER IS AN ABSENCE. Measured against Node 22:
  // `Date.parse("1.5")` is 978,652,800,000 - 5 January 2001 - and
  // `Date.parse("0.5")` is 1 May 2000. Both are in the past, so the clamp below
  // turned them into `0`, which every caller reads as "the endpoint said retry
  // immediately". The endpoint said nothing of the sort; it sent a value in
  // neither form the grammar allows. That is this project's absence-versus-zero
  // rule arriving in a header parser, and it was live in this function for the
  // half hour between writing it and running the probe that found it.
  //
  // So the date form is admitted only when it CONTAINS A MONTH NAME, which
  // every form RFC 9110 requires a recipient to accept does carry - IMF-fixdate
  // ("Wed, 03 Sep 2026 22:44:05 GMT"), the obsolete RFC 850 form
  // ("Wednesday, 03-Sep-26 22:44:05 GMT") and asctime
  // ("Wed Sep  3 22:44:05 2026"). `Date.parse` still does the parsing; this only
  // decides whether the string is a date at all.
  if (!/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  // A DATE IN THE PAST CLAMPS TO 0 AND THAT IS CORRECT HERE, unlike the case
  // above: a well-formed date that has already passed genuinely means "you may
  // retry now". The two zeros looked identical from the result, which is why
  // only re-reading the instrument told them apart.
  return Math.max(0, at - now);
}
