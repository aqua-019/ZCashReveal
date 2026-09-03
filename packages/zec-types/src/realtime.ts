/**
 * Shared realtime contract between indexer (publisher) and gateway (subscriber).
 *
 * A `LeakReport` carries bigints - zatoshi, and since HANDOFF-12 the counts and
 * positions inside an assessment - that JSON cannot encode. Publishers put a
 * report on the wire through `serializeWire` and consumers take it off through
 * `reviveWire`, both below; nothing else stringifies or revives one.
 */

import type { Hex } from "./transactions.js";
import type { LeakReport } from "./leaks.js";

export const REDIS_CHANNELS = {
  mempool: "zcashreveal:mempool",
  tip: "zcashreveal:tip",
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

export const REDIS_KEYS = {
  /** Hash: txid -> JSON-serialized LeakReport. Canonical live mempool snapshot. */
  mempoolLive: "zcashreveal:mempool:live",
  /**
   * String: JSON `MempoolDrainState`. How complete the hash above is.
   *
   * A SECOND KEY RATHER THAN A FIELD ON THE REPORTS, because the fact it
   * carries is about the SET and not about any member. "Three of nine
   * transactions analysed" cannot be stored on a transaction.
   */
  mempoolDrain: "zcashreveal:mempool:drain",
} as const;

export type MempoolChannelPayload =
  | { type: "tx_added"; report: LeakReport }
  | {
      type: "tx_removed";
      txid: Hex;
      reason: "confirmed" | "evicted" | "replaced";
    };

export type TipChannelPayload = {
  type: "tip";
  height: number;
  hash: Hex;
};

/**
 * How complete the live mempool view is, written by the indexer's poll loop.
 *
 * ONE PRODUCER, AND THAT IS THE WHOLE REASON THIS TYPE EXISTS RATHER THAN THE
 * GATEWAY DERIVING IT. The gateway can already count the reports it read and
 * the txids `getrawmempool` returned, and subtracting those two would look like
 * the same figure. It is not: the gateway's difference is "reports I could not
 * find", which a mempool that changed between the two calls produces on a
 * perfectly healthy stack, while the indexer's is "transactions I did not get
 * to", which is the one a reader needs. Two producers of one field, meaning
 * different things by it, is the defect shape `summary.shielded` and
 * `conventionalFeeZat` each cost this project a handoff to fix - both recorded
 * in `views.ts` beside the fields themselves. So the process that knows writes
 * it, and every consumer reads it.
 *
 * `completeAtMs` IS NULLABLE AND THE NULL IS NOT "ZERO SECONDS AGO". It is null
 * when this process has never completed a drain - a cold start under a ceiling
 * reaches its first tick before its first complete view - and a consumer must
 * render that as an absence. A staleness of 0 on a view that has never been
 * complete is the `snapshot age: 0 blocks` defect HANDOFF-14 removed from the
 * system bar, on a different surface.
 */
export type MempoolDrainState = {
  /** Transactions the node reported in the mempool at the last tick. */
  observed: number;
  /** Transactions this process holds an analysed report for. */
  analysed: number;
  /** True when the last tick left nothing unanalysed. */
  complete: boolean;
  /** How many the last tick deferred because its budget ran out. */
  deferred: number;
  /** True when a 429 cut the last tick short. */
  refused: boolean;
  /** `Date.now()` at the last COMPLETE drain, or null if there has never been one. */
  completeAtMs: number | null;
  /** `Date.now()` at the last tick, complete or not. */
  updatedAtMs: number;
  /** The ceiling this process is metering itself against, or null when unmetered. */
  ceilingPerMinute: number | null;
  /** Transactions per minute the plan affords, or null when unmetered. */
  txPerMinute: number | null;
};

/* ============================================================================
   The wire form, and getting back from it
   ========================================================================== */

/**
 * The one way a `bigint` crosses a JSON seam in this project, and the one way
 * it comes back.
 *
 * WHAT THIS REPLACES, AND WHY THE REPLACEMENT IS ABOUT THE CONVENTION'S DOMAIN
 * RATHER THAN ABOUT FOUR FIELD NAMES (HANDOFF-12, A3). Until HANDOFF-12 the
 * producer stringified every bigint BY VALUE - `JSON.stringify` with a replacer
 * turning `123n` into `"123"` - and the consumer, `reviveWireZatoshi`, revived
 * BY KEY: a decimal string under a key ending in `Zat` became a bigint again.
 * HANDOFF-11 accepted that on the argument that a convention asserted rather
 * than trusted is a schema by other means, and the assertion was a round trip
 * over five real `LeakReport` shapes.
 *
 * That holds only if the assertion covers the convention's DOMAIN, and it did
 * not. `ClaimAssessment` carries `rawCount` and `effectiveSetSize`, every
 * `FilterApplication` carries `countIn` and `countOut`, `CandidateRange`
 * carries three positions and `Anchor` one - twenty bigints in `analysis.ts`
 * with no `Zat` suffix, because they are COUNTS and POSITIONS and the suffix
 * means zatoshi. None of the five shapes populated an assessment, so the round
 * trip was a sample of the convention and was read as a proof of it. Executed
 * through the real serialiser and the real reviver, a report carrying an
 * assessment came back with four of five bigint fields as `string` while the
 * declared type said `bigint` on every one, and the `as T` cast meant the
 * compiler never objected. Renaming those fields `*Zat` would have been wrong
 * in the other direction: a count is not an amount.
 *
 * SO THE CONVENTION MOVES FROM THE KEY TO THE VALUE. `serializeWire` tags every
 * bigint it meets, whatever its key, as `{ "$bigint": "<decimal>" }`, and
 * `reviveWire` turns exactly that shape back into a bigint, whatever its key.
 * The two functions now agree on the whole domain BY CONSTRUCTION rather than
 * by a list somebody has to keep complete: a bigint field added anywhere in
 * `LeakReport`, or in any type it will ever carry, is on the wire in the one
 * form the reviver recognises the moment it exists. That is what makes the
 * convention CHECKABLE - the round trip can be stated as a property over
 * arbitrary object graphs with bigints at arbitrary keys, and
 * `apps/indexer/src/analysis/__tests__/wire-seam.test.ts` states it that way
 * beside the named worked case, a report carrying a spend assessment and a
 * link assessment with two applied filters.
 *
 * ONE FORM, NO FALLBACK. The key rule is not kept as a second reading of the
 * same wire: a value an older indexer wrote would then revive its zatoshi and
 * silently leave its counts as strings, which is the defect wearing a
 * compatibility badge. Nothing is deployed yet and both processes ship from one
 * compose file, so there is no window in which the two forms meet on a live
 * stack; if one ever did, a string where a bigint belongs throws on its first
 * arithmetic, loudly, which is the correct outcome for a version skew rather
 * than a quiet half-revival.
 *
 * WHY A TAGGED OBJECT AND NOT A SUFFIXED STRING. `"123n"` would be ambiguous
 * against any string field that happens to be digits and an `n` - there is no
 * such field today, and "today" is the word the key rule also relied on. An
 * object with exactly one key, `$bigint`, holding a decimal-integer string
 * cannot arise from any typed value in this repository, so the reviver's test
 * for it has no false positive to worry about.
 *
 * WHAT DOES NOT GO THROUGH HERE, stated so the two boundaries are not
 * confused: the gateway's REST and WebSocket output to the BROWSER uses
 * `toJsonSafe` (bigint to decimal string) validated by `zatSchema` at the
 * client, and that contract is unchanged. This module is the seam BETWEEN the
 * indexer and the gateway - the `zcashreveal:mempool` channel, the
 * `zcashreveal:mempool:live` hash and the `leak_reports.report` JSONB column,
 * which the indexer writes and the gateway reads.
 */
export const WIRE_BIGINT_TAG = "$bigint" as const;

const DECIMAL_INTEGER = /^-?\d+$/;

/**
 * Put a value into the wire form: a JSON-safe tree in which every bigint,
 * whatever its key, is `{ "$bigint": "<decimal>" }`.
 *
 * Goes through `JSON.stringify`/`JSON.parse` rather than walking the object
 * itself so that what comes back is EXACTLY what a consumer will parse -
 * `undefined` properties dropped, `Date`s stringified, `toJSON` honoured - and
 * not an approximation of it.
 */
export function serializeWire(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) =>
      typeof v === "bigint" ? { [WIRE_BIGINT_TAG]: v.toString() } : v,
    ),
  );
}

/**
 * Bring a value back from the wire form: every `{ "$bigint": "<decimal>" }`
 * becomes a bigint again, whatever its key, and nothing else is touched.
 *
 * A tagged object whose payload is not a decimal integer is LEFT ALONE rather
 * than coerced: `BigInt("")` is `0n` and `BigInt("1.5")` throws, and turning an
 * unparseable value into a zero is how `feeZat` came to be `0n` for every
 * transaction this project ever analysed. A malformed tag then fails on its
 * first arithmetic, as a string, which is visible.
 *
 * `T` is the caller's assertion about the shape, exactly as it was for
 * `reviveWireZatoshi`; what this function guarantees is the bigint HALF of
 * that shape, over the whole tree, and the property test is what says so.
 */
export function reviveWire<T>(value: unknown): T {
  return revive(value) as T;
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => revive(v));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === WIRE_BIGINT_TAG) {
      const payload = record[WIRE_BIGINT_TAG];
      if (typeof payload === "string" && DECIMAL_INTEGER.test(payload)) return BigInt(payload);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) out[k] = revive(v);
    return out;
  }
  return value;
}
