/**
 * AnchorIndex — Roots^p_h, the set of NCT roots published in one pool.
 *
 * Each anchor binds (root, heightCreated, maxPosition). `maxPosition` is
 * the upper bound on commitment positions visible under this anchor and
 * defines the raw candidate set for any nullifier citing it (RESEARCH.md).
 *
 * Idempotency is required: re-recording an identical (root, maxPosition,
 * heightCreated) triple is a no-op. Recording the same root with any
 * different field is an error — silently overwriting would corrupt every
 * downstream anonymity-set calculation.
 *
 * The cross-index invariant (`maxPosition` must reference a real
 * commitment position) is enforced in PoolState, NOT here — AnchorIndex
 * does not know about CommitmentIndex.
 */

import type { Anchor, Hex, Pool } from "@zcashreveal/types";
import { ConflictingAnchorError } from "./errors.js";

export class AnchorIndex<P extends Pool> {
  private byRoot = new Map<Hex, Anchor<P>>();

  constructor(public readonly pool: P) {}

  /**
   * Record an anchor. Idempotent on identical (root, maxPosition,
   * heightCreated). The `pool` field is locked by the generic parameter.
   *
   * @throws ConflictingAnchorError if `anchor.root` is already recorded
   * with a different `maxPosition` or `heightCreated`.
   */
  record(anchor: Anchor<P>): void {
    const existing = this.byRoot.get(anchor.root);
    if (existing) {
      if (
        existing.maxPosition === anchor.maxPosition &&
        existing.heightCreated === anchor.heightCreated
      ) {
        return;
      }
      throw new ConflictingAnchorError(
        `anchor ${anchor.root} already recorded with different data: ` +
          `existing maxPosition=${existing.maxPosition} heightCreated=${existing.heightCreated}, ` +
          `new maxPosition=${anchor.maxPosition} heightCreated=${anchor.heightCreated}`,
      );
    }
    this.byRoot.set(anchor.root, anchor);
  }

  /** Returns the maxPosition committed by `root`, or undefined if unknown. */
  maxPositionFor(root: Hex): bigint | undefined {
    return this.byRoot.get(root)?.maxPosition;
  }

  /** True iff `root` has been recorded. */
  hasRoot(root: Hex): boolean {
    return this.byRoot.has(root);
  }

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; anchorCount: number } {
    return { pool: this.pool, anchorCount: this.byRoot.size };
  }
}
