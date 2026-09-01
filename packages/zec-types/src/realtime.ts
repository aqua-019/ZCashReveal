/**
 * Shared realtime contract between indexer (publisher) and gateway (subscriber).
 *
 * Publishers must apply a `bigint -> string` replacer (see
 * apps/indexer/src/persistence.ts `serializeReport`) before JSON.stringify,
 * since LeakReport contains Zatoshi (bigint) fields that JSON cannot encode.
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

/* ============================================================================
   The wire form, and getting back from it
   ========================================================================== */

/**
 * Revive the zatoshi a `JSON.parse` left as strings.
 *
 * WHY THIS EXISTS, AND IT IS A DEFECT THAT WAS LIVE ON THE REST PATH.
 * `apps/indexer` writes a `LeakReport` to `zcashreveal:mempool:live` and to the
 * `zcashreveal:mempool` channel through a `bigint -> string` replacer, because
 * `JSON.stringify` throws on a `bigint`. The gateway read it back with
 * `JSON.parse(raw) as LeakReport` - a CAST, which asserts a shape rather than
 * producing one - and handed it to `buildMempoolView`, whose first arithmetic
 * on a zatoshi is `abs % ZAT_PER_ZEC`. Mixing a string with a bigint throws.
 *
 * So `GET /v2/mempool` answered 500 for every non-empty mempool on a live
 * stack, and no test saw it because every gateway suite built its reports with
 * real `bigint`s and never sent one through the wire form. Reproduced in both
 * polarities before this was written: `buildMempoolView` over a report with
 * real bigints does not throw, and over the same report round-tripped through
 * the replacer it throws `TypeError: Cannot mix BigInt and other types`.
 *
 * BY THE `Zat` SUFFIX, WHICH IS THIS PROJECT'S OWN CONVENTION AND NOT A GUESS.
 * CLAUDE.md: "`bigint` for zatoshi; heights/counts `number`". Every zatoshi
 * field in `LeakReport` and everything it contains ends in `Zat` -
 * `feeZat`, `deltaZat`, `valueZat`, `amountZat`, `arrivedZat`,
 * `netTransparentInflowZat`, the four `*ValueBalanceZat`. A schema would be
 * exact where this is conventional, and there is no zod schema for
 * `LeakReport`; writing one to solve this would be several hundred lines that
 * must then be kept in step with the interface by hand. The convention is
 * checked instead by a ROUND TRIP over the real fixture, which is the test that
 * covers a field added later: serialise a report, revive it, and require deep
 * equality with the original.
 *
 * THE VALUE MUST LOOK LIKE A DECIMAL INTEGER. A string under a `Zat` key that
 * is not one is left alone rather than coerced: `BigInt("")` is `0n` and
 * `BigInt("1.5")` throws, and turning an unparseable value into a zero is how
 * `feeZat` came to be `0n` for every transaction this project ever analysed.
 * `null` stays `null` - `feeZat` is `Zatoshi | null` and "unknown" is neither
 * true nor false.
 */
export function reviveWireZatoshi<T>(value: unknown): T {
  return revive(value, "") as T;
}

const ZAT_KEY = /Zat$/;
const DECIMAL_INTEGER = /^-?\d+$/;

function revive(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map((v) => revive(v, key));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = revive(v, k);
    return out;
  }
  // An ARRAY's elements inherit the array's key, so `perPoolZat: [...]` does not
  // turn its objects into bigints - only a string DIRECTLY under a `Zat` key,
  // or one inside an array under such a key, is a candidate. `perPoolZat` holds
  // objects, so the recursion above takes them and this line never sees them.
  if (typeof value === "string" && ZAT_KEY.test(key) && DECIMAL_INTEGER.test(value)) return BigInt(value);
  return value;
}
