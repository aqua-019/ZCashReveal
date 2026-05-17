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

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; commitmentCount: bigint } {
    return { pool: this.pool, commitmentCount: this.size() };
  }
}
