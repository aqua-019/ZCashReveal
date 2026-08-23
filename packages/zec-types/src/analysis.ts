/**
 * Analysis-layer types — the public observables consumed by the per-pool
 * state machine and downstream candidate-set construction.
 *
 * Module 1 (this file's first cut) ships the subset needed for the five
 * state classes in apps/indexer/src/state/. Later modules add types for
 * Cand_0/filter results, entropy/N_eff annotations, and claim levels.
 *
 * Every type here describes a *public* observable. No identity-implying
 * fields — see RESEARCH.md for the framing.
 */

import type { Hex } from "./transactions.js";
import type { ShieldedPool } from "./shielded.js";

/**
 * The shielded pools ZCashReveal reasons about, aliased to `ShieldedPool` so
 * there is a single source of truth across the type graph.
 *
 * FOUR SINCE HANDOFF-06 - sprout, sapling, orchard, ironwood. It read "the two
 * shielded pools" until then, and `views.ts` carried a docblock saying this
 * alias was "still the v0.2 pair" and naming HANDOFF-06 as the owner of the
 * widening. Both were true statements that this commit makes false, so both are
 * corrected here rather than left for a reader to trip over.
 *
 * Widening this admits `"sprout"` and `"ironwood"` into every generic below -
 * `Commitment<P>`, `Anchor<P>`, `SpentNullifier<P>`, `BoundaryDelta<P>`,
 * `PoolStateSnapshot<P>`, `CandidateRange<P>`, `ClaimAssessment<P>` - with no
 * accompanying runtime check. The two that now exist are the database CHECK
 * that migration 003 widens, and `ValuePool`'s exit-only guard.
 */
export type Pool = ShieldedPool;

/**
 * A note commitment that has been added to a pool's append-only commitment
 * tree (T^p in RESEARCH.md). `position` is the NCT index assigned on
 * append; positions are monotonic and contiguous from 0n.
 */
export type Commitment<P extends Pool = Pool> = {
  readonly pool: P;
  readonly cmId: Hex;
  readonly position: bigint;
  readonly txid: Hex;
  readonly height: number;
};

/**
 * A note commitment tree root, with the maximum NCT position it commits
 * to. `maxPosition` bounds the raw candidate set for any nullifier that
 * cites this anchor: Cand_0(nf) ⊆ { cm | pos(cm) ≤ maxPosition }.
 */
export type Anchor<P extends Pool = Pool> = {
  readonly pool: P;
  readonly root: Hex;
  readonly heightCreated: number;
  readonly maxPosition: bigint;
};

/**
 * A nullifier that has been published in pool P, marking that some note
 * in T^p has been spent. The mapping from nfId back to a specific
 * commitment is private and cannot be reconstructed from public data —
 * this type only records that the spend happened.
 */
export type SpentNullifier<P extends Pool = Pool> = {
  readonly pool: P;
  readonly nfId: Hex;
  readonly spentTxid: Hex;
  readonly spentHeight: number;
};

/**
 * A per-transaction turnstile boundary delta for pool P.
 *
 * Sign convention (matches Zcash RPC valueBalanceZat and existing decoder):
 *   deltaZat > 0n  → value leaving the pool (unshielding / withdrawal)
 *   deltaZat < 0n  → value entering the pool (shielding / deposit)
 *   deltaZat = 0n  → intra-pool transfer with no public boundary movement
 */
export type BoundaryDelta<P extends Pool = Pool> = {
  readonly pool: P;
  readonly txid: Hex;
  readonly height: number;
  readonly deltaZat: bigint;
};

/**
 * A point-in-time summary of a PoolState. Cheap to compute; safe to log,
 * publish, or compare across heights for monitoring.
 */
export type PoolStateSnapshot<P extends Pool = Pool> = {
  readonly pool: P;
  readonly height: number;
  readonly commitmentCount: bigint;
  readonly anchorCount: number;
  readonly nullifierCount: number;
  readonly balanceZat: bigint;
};

/**
 * Anchor-bounded raw candidate range for a single spend.
 * No filtering — this is Cand_0 from RESEARCH.md.
 *
 * - minPosition is always 0n in Module 3; lower-bound heuristics land in Modules 4-5.
 * - maxPosition is the anchor's maxPosition (the highest commitment position the anchor sees).
 * - rawCount = maxPosition - minPosition + 1n  (positions are 0-indexed inclusive).
 */
export type CandidateRange<P extends Pool = Pool> = {
  readonly pool: P;
  readonly anchorRoot: Hex;
  readonly minPosition: bigint;
  readonly maxPosition: bigint;
  readonly rawCount: bigint;
};

/**
 * Claim level mapped from N_eff per RESEARCH.md thresholds. Thresholds are
 * chosen so the levels match the "report uncertainty, not identity" framing:
 * above 1000 candidates is genuinely aggregate, below 10 effectively names a
 * single note and requires a disclosure-backed signal to act on.
 *
 *   N_eff > 1000          → "aggregate_only"
 *   100 < N_eff <= 1000   → "broad_candidate_set"
 *   10  < N_eff <= 100    → "small_heuristic_set"
 *   N_eff <= 10           → "requires_disclosure"
 */
export type ClaimLevel =
  | "aggregate_only"
  | "broad_candidate_set"
  | "small_heuristic_set"
  | "requires_disclosure";

/**
 * Audit record produced by each filter in the scoring stack. The
 * discriminator is the `filter` name; `params` is typed per-variant.
 * countIn/countOut are bigint so the entire audit trail preserves
 * precision across the chain of filter applications.
 *
 * Future filters extend this discriminated union. Anchor-membership and
 * pool-separation filters are intentionally absent: both are enforced at
 * the TypeScript layer (CandidateRange<P> only exists for a known anchor,
 * and the generic P prevents cross-pool composition), so no runtime audit
 * entry would carry new information.
 */
export type FilterApplication =
  | {
      readonly filter: "time_window";
      readonly params: {
        readonly windowBlocks: number;
        /** Exclusive lower bound of the half-open (lo, hi] height range. */
        readonly lowHeight: number;
        /** Inclusive upper bound — equals anchor.heightCreated. */
        readonly highHeight: number;
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    }
  | {
      readonly filter: "amount_match";
      readonly params: {
        /** Txid of the matched shielding deposit (the upstream half of the round-trip pair). */
        readonly matchedDepositTxid: Hex;
        /** Block height of the matched shielding deposit; filter narrows to commitments at this height. */
        readonly matchedDepositHeight: number;
        /** Deposit's net value (positive zat, into-pool). */
        readonly matchedDepositAmountZat: bigint;
        /** Withdrawal's net value (positive zat, out-of-pool). */
        readonly withdrawalAmountZat: bigint;
        /** Fee tolerance used at match time; documents the assumption envelope. */
        readonly toleranceZat: bigint;
        /** Whether the match was exact (amounts equal) or fee-tolerant (within toleranceZat). */
        readonly matchKind: "EXACT" | "FEE_TOLERANT";
      };
      readonly countIn: bigint;
      readonly countOut: bigint;
    };

/**
 * Combines a CandidateRange with its derived uncertainty quantification
 * and the audit trail of filters that produced it. Module 4's assessRaw
 * returns appliedFilters: [] (no filters applied). Module 5's assessFiltered
 * populates appliedFilters with one record per filter run.
 *
 * Invariant: rawCount is the size of un-filtered Cand_0; effectiveSetSize
 * is the post-filter count. The two diverge as filters narrow the set;
 * they are equal when appliedFilters is empty.
 */
export type ClaimAssessment<P extends Pool = Pool> = {
  readonly pool: P;
  readonly anchorRoot: Hex;
  readonly rawCount: bigint;
  readonly effectiveSetSize: bigint;
  readonly entropyBits: number;
  readonly claimLevel: ClaimLevel;
  readonly appliedFilters: ReadonlyArray<FilterApplication>;
};
