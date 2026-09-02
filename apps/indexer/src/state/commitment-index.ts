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

  /**
   * @param pool which pool this tree belongs to.
   * @param basePosition the NCT position the FIRST appended commitment receives.
   *
   * ZERO ONLY FOR A TREE INDEXED FROM ITS BIRTH, AND THAT IS NOT THE LIVE CASE
   * (HANDOFF-12). The indexer starts at a configured height with millions of
   * commitments already in every tree - 73,944,723 in Sapling at the committed
   * capture - and a position is an NCT index, not a row number: `Anchor.
   * maxPosition` is "the upper bound on commitment positions visible under this
   * anchor" and `rawCount = maxPosition + 1n` is Cand_0, the whole anonymity
   * set. An index that numbered from zero at the start height would publish a
   * candidate count a few thousand wide for a tree seventy million wide, and
   * every claim level would fall to `requires_disclosure` - an accusation this
   * site does not make, manufactured by a counter. So the base is the tree size
   * at the height BEFORE the first indexed block, `size()` is the real tree
   * size, and a recorded anchor's `maxPosition` is a real position. The
   * persistence layer stores positions absolute already; `replayInto` now
   * checks that a replayed record's stored position equals the one this index
   * assigns, which catches a state replayed against the wrong base.
   */
  constructor(
    public readonly pool: P,
    public readonly basePosition: bigint = 0n,
  ) {
    if (basePosition < 0n) {
      throw new TypeError(`${pool} commitment index: basePosition must be >= 0n, got ${basePosition}`);
    }
  }

  /**
   * Append a commitment to the end of the tree. Position is assigned
   * automatically (monotonic from `basePosition`, contiguous, no gaps).
   * Returns the assigned position.
   *
   * @throws CommitmentAlreadyExistsError if `record.cmId` is already in the index.
   */
  append(record: Omit<Commitment<P>, "position">): bigint {
    if (this.byId.has(record.cmId)) {
      throw new CommitmentAlreadyExistsError(
        `commitment ${record.cmId} already in ${this.pool} index`,
      );
    }
    const position = this.basePosition + BigInt(this.byPosition.length);
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
    const local = position - this.basePosition;
    if (local < 0n) return undefined;
    if (local >= BigInt(this.byPosition.length)) return undefined;
    return this.byPosition[Number(local)];
  }

  /** Returns the commitment with `cmId`, or undefined if unknown. */
  byCmId(cmId: Hex): Commitment<P> | undefined {
    return this.byId.get(cmId);
  }

  /**
   * The size of the TREE - `basePosition` plus every commitment appended here -
   * which is the number `trees.<pool>.size` on a verbosity-2 block reports, and
   * therefore the cross-check the confirmed-block driver makes on every block.
   */
  size(): bigint {
    return this.basePosition + BigInt(this.byPosition.length);
  }

  /** How many commitments THIS index holds - the part of the tree it has seen. */
  indexedCount(): bigint {
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

  /**
   * Returns the position of the first commitment added at exactly `height`,
   * and the count of commitments at that height. Returns null if no
   * commitment at `height` exists.
   *
   * Commitments at a given height are always contiguous in position
   * because the tree is append-only and each block is processed
   * atomically: a block's commitments are appended as a single contiguous
   * slice before the next block's commitments arrive.
   *
   * Used by Module 5B's amountMatchFilter to map a matched deposit's
   * height onto the corresponding slice of commitment positions in the
   * candidate range. Linear scan — same complexity profile as
   * countBetweenHeights.
   */
  positionRangeAtHeight(
    height: number,
  ): { firstPosition: bigint; count: bigint } | null {
    let firstPosition: bigint | null = null;
    let count = 0n;
    for (const c of this.byPosition) {
      if (c.height === height) {
        if (firstPosition === null) firstPosition = c.position;
        count++;
      } else if (firstPosition !== null) {
        // We've passed the contiguous slice — stop scanning.
        break;
      }
    }
    if (firstPosition === null) return null;
    return { firstPosition, count };
  }

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; commitmentCount: bigint } {
    return { pool: this.pool, commitmentCount: this.size() };
  }
}
