/**
 * Bundle a CandidateRange with its uniform-posterior entropy and claim
 * level — Module 4's all-in-one entry point.
 *
 * The granular functions (entropyBitsUniform, classifyByEffectiveSet)
 * stay public for Module 5's filter-stack composition: Module 5 will
 * compute its own filtered effectiveSetSize (post-pruning), call
 * entropyBitsUniform on it, and re-run classifyByEffectiveSet — reusing
 * exactly the same primitives this function composes for the raw case.
 *
 * For the raw assessment, the posterior is uniform across the un-filtered
 * candidate set, so effectiveSetSize === rawCount by definition.
 */

import type { CandidateRange, ClaimAssessment, Pool } from "@zcashreveal/types";
import { entropyBitsUniform } from "./entropy.js";
import { classifyByEffectiveSet } from "./claim-classifier.js";

/**
 * Compute the raw (un-filtered) ClaimAssessment for a CandidateRange.
 *
 * @throws TypeError via entropyBitsUniform if rawCount <= 0n.
 */
export function assessRaw<P extends Pool>(
  range: CandidateRange<P>,
): ClaimAssessment<P> {
  const entropyBits = entropyBitsUniform(range.rawCount);
  const effectiveSetSize = range.rawCount;
  const claimLevel = classifyByEffectiveSet(effectiveSetSize);
  return {
    pool: range.pool,
    anchorRoot: range.anchorRoot,
    rawCount: range.rawCount,
    effectiveSetSize,
    entropyBits,
    claimLevel,
  };
}
