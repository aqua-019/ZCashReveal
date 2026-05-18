/**
 * Map an effective anonymity set size to one of four claim levels per
 * RESEARCH.md thresholds:
 *
 *   N_eff > 1000          → "aggregate_only"
 *   100 < N_eff <= 1000   → "broad_candidate_set"
 *   10  < N_eff <= 100    → "small_heuristic_set"
 *   N_eff <= 10           → "requires_disclosure"
 *
 * Lower-end inclusive: the threshold value itself stays in the tighter
 * claim level (e.g. N_eff = 100 is "small_heuristic_set", not "broad...").
 * Decimal-order thresholds are deliberately coarse so small estimation
 * errors don't bump a finding across categories.
 */

import type { ClaimLevel } from "@zcashreveal/types";

/**
 * Classify an effective set size to a claim level. Accepts 0n (treated as
 * "requires_disclosure" — fewer candidates than 10 means a disclosure-backed
 * signal would name the note).
 */
export function classifyByEffectiveSet(N_eff: bigint): ClaimLevel {
  if (N_eff <= 10n) return "requires_disclosure";
  if (N_eff <= 100n) return "small_heuristic_set";
  if (N_eff <= 1000n) return "broad_candidate_set";
  return "aggregate_only";
}
