/**
 * Bundle a CandidateRange with its entropy and claim level — the
 * analysis-layer entry points.
 *
 *   assessRaw      — uniform posterior over un-filtered Cand_0 (Module 4)
 *   assessFiltered — runs a filter pipeline, then computes entropy over
 *                    the narrowed count (Module 5A)
 *
 * Both share a private buildAssessment helper. The granular primitives
 * (entropyBitsUniform, classifyByEffectiveSet) stay public for Module 5B's
 * round-trip composition.
 */

import type {
  Anchor,
  CandidateRange,
  ClaimAssessment,
  FilterApplication,
  Hex,
  Pool,
} from "@zcashreveal/types";
import type { PoolState } from "../state/pool-state.js";
import { entropyBitsUniform } from "@zcashreveal/instruments";
import { classifyByEffectiveSet } from "@zcashreveal/instruments";
import { applyFilters, type Filter } from "./scoring.js";

/**
 * Shared assembly helper. Takes the (possibly filtered) range and the
 * audit applications and produces the final ClaimAssessment.
 *
 * Empty-set short-circuit: when effectiveSetSize is 0n, entropyBits is 0
 * and claimLevel is "requires_disclosure". This avoids calling
 * entropyBitsUniform (which throws on N <= 0n) and matches classifier
 * semantics (0n already maps to requires_disclosure).
 */
function buildAssessment<P extends Pool>(
  pool: P,
  anchorRoot: Hex,
  originalRawCount: bigint,
  filteredRange: CandidateRange<P>,
  applications: ReadonlyArray<FilterApplication>,
): ClaimAssessment<P> {
  const effectiveSetSize = filteredRange.rawCount;
  const entropyBits =
    effectiveSetSize === 0n ? 0 : entropyBitsUniform(effectiveSetSize);
  const claimLevel = classifyByEffectiveSet(effectiveSetSize);
  return {
    pool,
    anchorRoot,
    rawCount: originalRawCount,
    effectiveSetSize,
    entropyBits,
    claimLevel,
    appliedFilters: applications,
  };
}

/**
 * Compute the raw (un-filtered) ClaimAssessment for a CandidateRange.
 * No filters applied: rawCount === effectiveSetSize, appliedFilters: [].
 *
 * @throws TypeError via entropyBitsUniform if rawCount <= 0n.
 */
export function assessRaw<P extends Pool>(
  range: CandidateRange<P>,
): ClaimAssessment<P> {
  return buildAssessment(
    range.pool,
    range.anchorRoot,
    range.rawCount,
    range,
    [],
  );
}

/**
 * Compute a filtered ClaimAssessment. Runs the filter stack over `range`
 * with `anchor` and `state` as context, then derives entropy and claim
 * level from the filtered count.
 *
 * The returned assessment preserves the un-filtered rawCount in its
 * rawCount field. effectiveSetSize reflects the post-filter count.
 * appliedFilters records every filter that ran, in order.
 *
 * If the filter stack reduces the count to 0n, short-circuits to
 * claimLevel = "requires_disclosure", entropyBits = 0; no throw.
 */
export function assessFiltered<P extends Pool>(
  range: CandidateRange<P>,
  anchor: Anchor<P>,
  state: PoolState<P>,
  filters: ReadonlyArray<Filter<P>>,
): ClaimAssessment<P> {
  const { range: filtered, applications } = applyFilters(
    range,
    anchor,
    state,
    filters,
  );
  return buildAssessment(
    range.pool,
    range.anchorRoot,
    range.rawCount,
    filtered,
    applications,
  );
}
