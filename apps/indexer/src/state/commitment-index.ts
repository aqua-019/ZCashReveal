/**
 * CommitmentIndex — T^p_h, the append-only commitment tree for one pool.
 *
 * Commitments are appended in NCT order and assigned a monotonic position
 * starting from 0n. Positions are contiguous: if position k exists, every
 * position 0..k-1 exists. cmId is unique within the index.
 *
 * Pool is locked at construction and enforced at the type level: a
 * CommitmentIndex<"sapling"> cannot accept Commitment<"orchard">.
 */

import type { Commitment, Hex, Pool } from "@zcashreveal/types";
import { CommitmentAlreadyExistsError } from "./errors.js";

export class CommitmentIndex<P extends Pool> {
  private byPosition: Commitment<P>[] = [];
  private byId = new Map<Hex, Commitment<P>>();

  constructor(public readonly pool: P) {}

  /**
   * Append a commitment to the end of the tree. Position is assigned
   * automatically (monotonic from 0n, contiguous, no gaps). Returns the
   * assigned position.
   *
   * @throws CommitmentAlreadyExistsError if `record.cmId` is already in the index.
   */
  append(record: Omit<Commitment<P>, "position">): bigint {
    if (this.byId.has(record.cmId)) {
      throw new CommitmentAlreadyExistsError(
        `commitment ${record.cmId} already in ${this.pool} index`,
      );
    }
    const position = BigInt(this.byPosition.length);
    const full: Commitment<P> = {
      pool: record.pool,
      cmId: record.cmId,
      position,
      txid: record.txid,
      height: record.height,
    };
    this.byPosition.push(full);
    this.byId.set(record.cmId, full);
    return position;
  }

  /** Returns the commitment at `position`, or undefined if out of range. */
  atPosition(position: bigint): Commitment<P> | undefined {
    if (position < 0n) return undefined;
    if (position >= BigInt(this.byPosition.length)) return undefined;
    return this.byPosition[Number(position)];
  }

  /** Returns the commitment with `cmId`, or undefined if unknown. */
  byCmId(cmId: Hex): Commitment<P> | undefined {
    return this.byId.get(cmId);
  }

  /** Current number of commitments in the tree. */
  size(): bigint {
    return BigInt(this.byPosition.length);
  }

  /**
   * Count commitments whose height falls in the half-open range (lo, hi]
   * (exclusive lo, inclusive hi).
   *
   * - If lo === hi, the range is empty and the result is 0n.
   * - If lo > hi, the range is empty and the result is 0n.
   * - If lo < 0, the lower bound is effectively unbounded since chain
   *   heights are non-negative; all commitments at height <= hi count.
   *   (No clamping is performed — the half-open inequality handles this
   *   naturally.)
   *
   * Used by the Module 5 time-window filter to count commitments added
   * within the last W blocks before an anchor's heightCreated.
   */
  countBetweenHeights(lo: number, hi: number): bigint {
    if (lo >= hi) return 0n;
    let count = 0n;
    for (const c of this.byPosition) {
      if (c.height > lo && c.height <= hi) count++;
    }
    return count;
  }

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; commitmentCount: bigint } {
    return { pool: this.pool, commitmentCount: this.size() };
  }
}
