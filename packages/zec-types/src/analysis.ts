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
 * The two shielded pools ZCashReveal reasons about. Aliased to
 * ShieldedPool so there is a single source of truth across the type graph.
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
