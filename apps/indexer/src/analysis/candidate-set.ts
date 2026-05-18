/**
 * Module 3 — raw candidate set Cand_0(nf).
 *
 * Given a (pool, anchorRoot), returns the inclusive [minPosition, maxPosition]
 * range of commitments the anchor sees. No filtering — anchor membership
 * is the only constraint applied here. The filter stack (time, amount,
 * nullifier-uniqueness cardinality) and the entropy/N_eff computation land
 * in Modules 4-5. See RESEARCH.md "Candidate set construction".
 */

import type { CandidateRange, Hex, Pool } from "@zcashreveal/types";
import type { PoolState } from "../state/pool-state.js";

/**
 * Compute Cand_0 for (pool, anchorRoot) against an in-memory PoolState.
 *
 * Returns the inclusive position range with:
 *   minPosition = 0n          (always; lower-bound filters arrive in Module 4)
 *   maxPosition = anchor's maxPosition
 *   rawCount    = maxPosition + 1n
 *
 * Returns null when `anchorRoot` is unknown to `state.anchors` — callers
 * must handle this case explicitly. An unknown anchor typically means the
 * spend cites an anchor we have not yet indexed (sync gap), or the input
 * is malformed. Either way, a candidate count cannot be claimed.
 *
 * Pure function — no I/O, no caching, no logging, no state mutation.
 * The `<P extends Pool>` generic ensures `pool` and `state.pool` match at
 * the call site; cross-pool combinations are a compile-time error.
 */
export function rawCandidateRange<P extends Pool>(
  pool: P,
  anchorRoot: Hex,
  state: PoolState<P>,
): CandidateRange<P> | null {
  const maxPosition = state.anchors.maxPositionFor(anchorRoot);
  if (maxPosition === undefined) return null;
  return {
    pool,
    anchorRoot,
    minPosition: 0n,
    maxPosition,
    rawCount: maxPosition + 1n,
  };
}
