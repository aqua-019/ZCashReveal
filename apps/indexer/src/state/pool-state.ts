/**
 * PoolState — S^p_h, the composition of the four per-pool indexes into
 * the full state machine described in RESEARCH.md.
 *
 * The five files in this directory each implement one component:
 *
 *   commitment-index.ts → T^p_h      append-only commitment tree
 *   anchor-index.ts     → Roots^p_h  set of valid anchors with max positions
 *   nullifier-index.ts  → NFSet^p_h  spent nullifier set
 *   value-pool.ts       → Bal^p_h    pool balance via turnstile deltas
 *   pool-state.ts       → S^p_h      composition + cross-index invariants
 *
 * Each index is pool-typed (`<P extends Pool>`) so Sapling and Orchard
 * state are distinct types at compile time. Inside an index, the
 * generic parameter is unused at runtime — it exists purely to make
 * cross-pool data corruption impossible to express.
 *
 * PoolState owns only the cross-index invariant: an anchor's maxPosition
 * must reference a real commitment position (`< commitments.size()`).
 * Everything else is locally enforced by the individual indexes.
 */

import type { Anchor, Pool, PoolStateSnapshot } from "@zcashreveal/types";
import { CommitmentIndex } from "./commitment-index.js";
import { AnchorIndex } from "./anchor-index.js";
import { NullifierIndex } from "./nullifier-index.js";
import { ValuePool } from "./value-pool.js";
import { AnchorOutOfBoundsError } from "./errors.js";

export class PoolState<P extends Pool> {
  public readonly commitments: CommitmentIndex<P>;
  public readonly anchors: AnchorIndex<P>;
  public readonly nullifiers: NullifierIndex<P>;
  public readonly value: ValuePool<P>;

  constructor(public readonly pool: P) {
    this.commitments = new CommitmentIndex<P>(pool);
    this.anchors = new AnchorIndex<P>(pool);
    this.nullifiers = new NullifierIndex<P>(pool);
    this.value = new ValuePool<P>(pool);
  }

  /**
   * Record an anchor while enforcing the cross-index invariant that
   * `anchor.maxPosition` references a real commitment position
   * (i.e. `maxPosition < commitments.size()`). Use this in place of
   * `anchors.record()` whenever commitment state has been populated.
   *
   * @throws AnchorOutOfBoundsError if `maxPosition >= commitments.size()`.
   */
  recordAnchor(anchor: Anchor<P>): void {
    const size = this.commitments.size();
    if (anchor.maxPosition >= size) {
      throw new AnchorOutOfBoundsError(
        `anchor ${anchor.root} maxPosition=${anchor.maxPosition} ` +
          `>= ${this.pool} commitments.size()=${size}`,
      );
    }
    this.anchors.record(anchor);
  }

  /** Full point-in-time snapshot. */
  snapshot(height: number): PoolStateSnapshot<P> {
    return {
      pool: this.pool,
      height,
      commitmentCount: this.commitments.size(),
      anchorCount: this.anchors.snapshot().anchorCount,
      nullifierCount: this.nullifiers.snapshot().nullifierCount,
      balanceZat: this.value.balance(),
    };
  }
}
