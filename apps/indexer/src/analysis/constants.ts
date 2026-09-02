/**
 * Round-trip matching constants. Lifted from the now-deleted link-engine.ts
 * and centralised so future tuning happens in one place.
 *
 * All four constants below are part of the same threat-model calibration —
 * FEE_TOLERANCE_ZAT is derived from ZIP317_MARGINAL_FEE_ZAT and
 * MAX_INTERNAL_HOPS, and the meaning of "fee tolerance" only makes sense
 * inside the MAX_LINK_WINDOW_MS time window. Edit them together.
 */

import { ZIP317_MARGINAL_FEE } from "@zcashreveal/types";

/**
 * Maximum time window (ms) for matching a shielding deposit to an
 * unshielding withdrawal. 7 days. Beyond this, the matching heuristic
 * produces unacceptably weak claims and the candidate count balloons
 * past the point where the entropy bound is meaningful.
 */
export const MAX_LINK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * ZIP 317's marginal fee per logical action, in zatoshi, used in the
 * FEE_TOLERANCE_ZAT derivation below.
 *
 * RE-EXPORTED FROM THE CANONICAL DECLARATION SINCE HANDOFF-06 rather than
 * written out again. It was a second copy of a consensus constant, and there
 * was a third in `config.ts` that made it settable from the ENVIRONMENT - a
 * deployment could have given this network rule a different value for one
 * process, which is not a configuration, it is a fork. That one is deleted; the
 * two that remain are one declaration and this alias.
 */
export const ZIP317_MARGINAL_FEE_ZAT = ZIP317_MARGINAL_FEE;

/**
 * Maximum number of internal shielded hops we assume a user might chain
 * between the shielding deposit and the unshielding withdrawal. Each
 * internal hop pays its own ZIP-317 fee, contributing linearly to the
 * deposit/withdrawal amount mismatch.
 */
export const MAX_INTERNAL_HOPS = 4n;

/**
 * Fee tolerance for fee-tolerant amount matching.
 *
 *   FEE_TOLERANCE_ZAT
 *     = ZIP317_MARGINAL_FEE_ZAT × MAX_INTERNAL_HOPS × 8
 *     = 5_000 × 4 × 8
 *     = 160,000 zatoshi
 *     ≈ 0.0016 ZEC
 *
 * The factor of 8 is a safety margin covering: 2 actions per hop × 2
 * (split outputs + change) × 2 (round-trip miner ZEC for hop fees).
 *
 * Intentionally loose — tighten only with calibration data, not by
 * intuition. Matches the value the v0.1 link-engine.ts shipped with,
 * verified empirically by the round-trip integration tests below.
 */
export const FEE_TOLERANCE_ZAT = ZIP317_MARGINAL_FEE_ZAT * MAX_INTERNAL_HOPS * 8n;

/**
 * The target block spacing since Blossom: 75 seconds. A consensus parameter,
 * not a tuning knob, and declared once so the two windows below cannot
 * disagree about it.
 */
export const BLOCK_TARGET_MS = 75_000;

/**
 * `MAX_LINK_WINDOW_MS` in BLOCKS, for `timeWindowFilter` (HANDOFF-12).
 *
 * The round-trip index matches on wall-clock time because a mempool
 * transaction has no height; the candidate-set filter narrows by height
 * because a note-commitment tree has no clock. The two are the same window
 * stated in the two units, and this is the conversion - 7 days at the target
 * spacing is 8,064 blocks. Stated as a derivation so that tightening one
 * tightens the other.
 */
export const LINK_WINDOW_BLOCKS = Math.round(MAX_LINK_WINDOW_MS / BLOCK_TARGET_MS);
