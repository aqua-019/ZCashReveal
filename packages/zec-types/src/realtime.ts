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
