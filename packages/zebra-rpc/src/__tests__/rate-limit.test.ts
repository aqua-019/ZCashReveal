/**
 * The request budget, the `Retry-After` reader, and the 429 the client used to
 * mistake for a dead socket.
 *
 * DRIVEN THROUGH A REAL SERVER AND REAL UNDICI, NOT A `FetchLike` DOUBLE, and
 * that is the point rather than thoroughness. LEDGER-11's diagnosis is that this
 * project's defects live at seams where two suites each build their own input;
 * a 429 is an HTTP status and a header, so a double asserting "the client sees
 * status 429" is a statement about the double. `MockRpcEndpoint` makes one side
 * actually produce the value and hands it to the other.
 *
 * F-56-1: every module these probes mutate was read line-by-line first -
 * `client.ts` (the retry loop at 175-215 and `#once` at 239-290), `errors.ts`
 * whole, and `rate-limit.ts` whole, which this session wrote.
 */
import { describe, expect, it } from "vitest";

import { ZebraRpc } from "../client.js";
import { RpcRateLimitError, RpcTransportError } from "../errors.js";
import { MockRpcEndpoint } from "../mock-endpoint.js";
import { RateGate, parseRetryAfterMs } from "../rate-limit.js";

/** A clock a test drives by hand, so a rolling window costs no wall clock. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("parseRetryAfterMs", () => {
  const NOW = Date.parse("2026-09-03T22:44:05Z");

  it("reads the delta-seconds form", () => {
    expect(parseRetryAfterMs("30", NOW)).toBe(30_000);
    expect(parseRetryAfterMs("  0 ", NOW)).toBe(0);
  });

  it("reads the HTTP-date form, which a client that only reads seconds ignores", () => {
    // RFC 9110 gives Retry-After two forms. A reader that handles one silently
    // treats the other as absent, which looks exactly like a server that did
    // not send the header - the two are indistinguishable from the result.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:44:35 GMT", NOW)).toBe(30_000);
  });

  it("clamps a date already in the past rather than going negative", () => {
    // A negative wait reads as "go now" to `penalise`, which would turn a
    // refusal into an immediate retry - the exact behaviour this file removes.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:43:05 GMT", NOW)).toBe(0);
  });

  it("answers null for absent, empty and unparseable values", () => {
    expect(parseRetryAfterMs(null, NOW)).toBeNull();
    expect(parseRetryAfterMs(undefined, NOW)).toBeNull();
    expect(parseRetryAfterMs("", NOW)).toBeNull();
    expect(parseRetryAfterMs("   ", NOW)).toBeNull();
    expect(parseRetryAfterMs("soon", NOW)).toBeNull();
    // THE MEMBER THAT FOUND A REAL DEFECT. `delta-seconds` is an integer in the
    // grammar, so "1.5" is in neither form and the answer is an absence. The
    // first implementation fell through to `Date.parse`, which reads "1.5" as
    // 5 January 2001, clamped the resulting negative to 0, and handed every
    // caller "retry immediately" for a header it had failed to understand.
    // Absence rendered as a zero, in a parser written the same hour, found by
    // executing this line rather than by reading the function.
    expect(parseRetryAfterMs("1.5", NOW)).toBeNull();
    expect(parseRetryAfterMs("0.5", NOW)).toBeNull();
    // And the fix does not swallow the valid past date, which legitimately IS 0.
    expect(parseRetryAfterMs("Wed, 03 Sep 2026 22:43:05 GMT", NOW)).toBe(0);
  });
});

describe("RateGate", () => {
  it("refuses a sixth request inside one window and admits it after the window rolls", async () => {
    const clock = fakeClock();
    const slept: number[] = [];
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        slept.push(ms);
        clock.advance(ms);
        return Promise.resolve();
      },
    });

    for (let i = 0; i < 5; i += 1) {
      expect(gate.waitMs()).toBe(0);
      await gate.take();
      clock.advance(100);
    }
    expect(gate.remaining()).toBe(0);
    // 500 ms have passed since the first request - the loop advances 100 ms
    // AFTER each of the five takes, not between them - so the oldest slot frees
    // in 59,500 ms. Asserted as the number rather than "greater than zero",
    // because a gate that waits the WRONG amount and a gate that waits are
    // indistinguishable from a boolean.
    //
    // THIS PROBE WAS WRONG BEFORE THE CODE WAS, and it is left recorded rather
    // than quietly corrected (LEDGER-05 fold 7). Its first draft asserted
    // 59,600 by counting four advances where the loop runs five, and the run
    // that failed named the gate. Checking the probe before judging the code is
    // what separated it from the case one describe() up, where the same move
    // found a real defect in `parseRetryAfterMs`.
    expect(gate.waitMs()).toBe(59_500);
    await gate.take();
    expect(slept).toEqual([59_500]);
  });

  it("holds across a window BOUNDARY, which is what makes the window rolling rather than a bucket", async () => {
    // THE DATA MUTATION FOR THE FIXED-BUCKET DESIGN. A bucket that empties on
    // the minute admits five requests at 59.9 s and five more at 60.1 s: ten
    // inside one real minute, and the measured endpoint refuses on the sixth.
    // The member of the exclusion set is that 200 ms straddle.
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    clock.advance(59_900);
    for (let i = 0; i < 5; i += 1) await gate.take();
    clock.advance(200);
    expect(gate.remaining()).toBe(0);
    expect(gate.waitMs()).toBe(59_800);
  });

  it("serialises concurrent takes so N callers consume N slots rather than all reading one free slot", async () => {
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 2,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    // Three at once against a ceiling of two. Without the serialising tail all
    // three read `remaining() === 2` before any of them consumed a slot.
    await Promise.all([gate.take(), gate.take(), gate.take()]);
    // The third waited a full window rather than going out with the first two.
    expect(clock.now()).toBe(1_060_000);
  });

  it("fills the window on a refusal, and honours a Retry-After longer than the window", () => {
    const clock = fakeClock();
    const gate = new RateGate({ perMinute: 5, now: clock.now });
    expect(gate.remaining()).toBe(5);
    gate.penalise(null);
    expect(gate.remaining()).toBe(0);
    expect(gate.waitMs()).toBe(60_000);

    const clock2 = fakeClock();
    const gate2 = new RateGate({ perMinute: 5, now: clock2.now });
    gate2.penalise(90_000);
    expect(gate2.waitMs()).toBe(90_000);
  });

  it("rejects a non-positive ceiling rather than admitting everything", () => {
    // A ceiling of zero read as "unlimited" is the failure mode where a
    // misconfiguration removes the protection it was meant to add.
    expect(() => new RateGate({ perMinute: 0 })).toThrow(RangeError);
    expect(() => new RateGate({ perMinute: -1 })).toThrow(RangeError);
    expect(() => new RateGate({ perMinute: Number.NaN })).toThrow(RangeError);
  });
});

describe("a 429 over the wire", () => {
  it("arrives as RpcRateLimitError and costs exactly ONE request, not three", async () => {
    // THE DEFECT THIS REPLACES, MEASURED. Before HANDOFF-15 a 429 fell to
    // `if (!res.ok) throw new Error(...)` at the bottom of `#once`; `call()`
    // read it as a transport failure because it was not an `RpcError`, slept
    // 200 ms and 400 ms and asked twice more. At the measured five-per-minute
    // ceiling that is 60 per cent of the minute spent on one refused call, and
    // the caller was then told "no response after 3 attempts" - a timeout, for
    // an endpoint that answered all three times.
    const endpoint = new MockRpcEndpoint({ refuseAt: [1, 2, 3, 4] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 2, sleep: () => Promise.resolve() });
      await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcRateLimitError);
      expect(endpoint.requestCount).toBe(1);
    } finally {
      await endpoint.stop();
    }
  });

  it("carries Retry-After when the endpoint sends one, and null when it does not", async () => {
    const withHeader = new MockRpcEndpoint({ refuseAt: [1], retryAfter: "30" });
    const u1 = await withHeader.start();
    try {
      const rpc = new ZebraRpc({ url: u1, retries: 0 });
      const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RpcRateLimitError);
      expect((err as RpcRateLimitError).retryAfterMs).toBe(30_000);
      expect((err as RpcRateLimitError).status).toBe(429);
      expect((err as RpcRateLimitError).method).toBe("getblockchaininfo");
    } finally {
      await withHeader.stop();
    }

    // THE NULL SIDE IS THE COMMON ONE AND IS ASSERTED AS SUCH. The measured
    // Tatum endpoint sends no Retry-After, so a suite that only drove the
    // present branch would leave the live branch untested.
    const without = new MockRpcEndpoint({ refuseAt: [1] });
    const u2 = await without.start();
    try {
      const rpc = new ZebraRpc({ url: u2, retries: 0 });
      const err = await rpc.getBlockchainInfo().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RpcRateLimitError);
      expect((err as RpcRateLimitError).retryAfterMs).toBeNull();
    } finally {
      await without.stop();
    }
  });

  it("is NOT confused with a 500, which is still retried", async () => {
    // Two-polarity for the distinction itself: the retryable neighbour must
    // still retry, or "429 is distinguished" would be satisfied by a client
    // that stopped retrying everything.
    let hits = 0;
    const rpc = new ZebraRpc({
      url: "http://127.0.0.1:1/",
      retries: 2,
      sleep: () => Promise.resolve(),
      fetch: () => {
        hits += 1;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve("{}"),
        });
      },
    });
    await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcTransportError);
    expect(hits).toBe(3);
  });

  it("penalises the gate, so the NEXT call waits rather than asking straight into the refusal", async () => {
    const clock = fakeClock();
    const gate = new RateGate({
      perMinute: 5,
      now: clock.now,
      sleep: (ms) => {
        clock.advance(ms);
        return Promise.resolve();
      },
    });
    const endpoint = new MockRpcEndpoint({ refuseAt: [1] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0, gate });
      expect(gate.remaining()).toBe(5);
      await expect(rpc.getBlockchainInfo()).rejects.toBeInstanceOf(RpcRateLimitError);
      // The window is FULL after a refusal, not merely one slot lighter: the
      // endpoint's count disagrees with ours and its answer is the one that
      // decides. Trusting our count would ask again immediately.
      expect(gate.remaining()).toBe(0);
      expect(gate.waitMs()).toBe(60_000);
    } finally {
      await endpoint.stop();
    }
  });
});

describe("MockRpcEndpoint", () => {
  it("refuses on the sixth request of a five-per-minute window, which is the measured shape", async () => {
    // The mock reproduces HANDOFF-15 section 1's measurement: sixteen requests
    // in a burst, five 200s, then 429 for every request from the sixth on.
    const endpoint = new MockRpcEndpoint({ perMinute: 5 });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const statuses: string[] = [];
      for (let i = 0; i < 16; i += 1) {
        statuses.push(await rpc.getBlockchainInfo().then(() => "200", () => "429"));
      }
      expect(statuses.slice(0, 5)).toEqual(["200", "200", "200", "200", "200"]);
      expect(statuses.slice(5)).toEqual(Array.from({ length: 11 }, () => "429"));
      expect(endpoint.records.filter((r) => r.status === 200)).toHaveLength(5);
    } finally {
      await endpoint.stop();
    }
  });

  it("answers -5 for a transaction it does not hold, and a method error for an unknown method", async () => {
    // The keyless endpoint's own behaviour, recorded in section 1: a fake txid
    // answers "No such mempool or main chain transaction", which is how L2
    // established getrawtransaction is SERVED rather than blocked.
    const endpoint = new MockRpcEndpoint({ mempool: ["a".repeat(64)] });
    const url = await endpoint.start();
    try {
      const rpc = new ZebraRpc({ url, retries: 0 });
      const err = await rpc.getRawTransaction("b".repeat(64) as never).catch((e: unknown) => e);
      expect(String(err)).toContain("No such mempool or main chain transaction");
      expect(await rpc.getRawMempool()).toEqual(["a".repeat(64)]);
      expect(await rpc.getRawMempoolVerbose()).toEqual({ ["a".repeat(64)]: { size: 1_024 } });
    } finally {
      await endpoint.stop();
    }
  });
});
