/**
 * ValuePool — Bal^p_h, the running pool balance via turnstile deltas.
 *
 * Sign convention (RESEARCH.md and Zcash RPC valueBalanceZat):
 *   deltaZat > 0n  →  value leaving the pool (unshielding / withdrawal)
 *   deltaZat < 0n  →  value entering the pool (shielding / deposit)
 *
 * Balance is mutated by `-delta.deltaZat`: a positive delta decreases
 * balance, a negative delta increases it. The pool balance is a hard
 * consensus invariant that cannot go negative — `apply()` validates this
 * before mutating, so failed applies leave state untouched.
 *
 * Per-tx deltas are retained in insertion order to support Module 2's
 * reorg replay (rewind by tx, replay forward).
 */

import type { BoundaryDelta, Hex, Pool } from "@zcashreveal/types";
import { NegativeBalanceError } from "./errors.js";

export class ValuePool<P extends Pool> {
  private bal: bigint = 0n;
  private byTx = new Map<Hex, BoundaryDelta<P>[]>();

  constructor(public readonly pool: P) {}

  /**
   * Apply a turnstile boundary delta. Balance changes by `-delta.deltaZat`.
   * No mutation occurs if the operation would push balance below 0n.
   *
   * @throws NegativeBalanceError if applying this delta would push the
   * balance below 0n. State is unchanged on throw.
   */
  apply(delta: BoundaryDelta<P>): void {
    const next = this.bal - delta.deltaZat;
    if (next < 0n) {
      throw new NegativeBalanceError(
        `apply would push ${this.pool} balance negative: ` +
          `current=${this.bal} delta=${delta.deltaZat} next=${next} (tx ${delta.txid})`,
      );
    }
    this.bal = next;
    const arr = this.byTx.get(delta.txid);
    if (arr) {
      arr.push(delta);
    } else {
      this.byTx.set(delta.txid, [delta]);
    }
  }

  /** Current pool balance. Invariant: always >= 0n. */
  balance(): bigint {
    return this.bal;
  }

  /**
   * Deltas applied for a given tx, in insertion order. Module 2's reorg
   * replay reads these to rewind value state by tx.
   */
  deltasFor(txid: Hex): readonly BoundaryDelta<P>[] {
    return this.byTx.get(txid) ?? [];
  }

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; balanceZat: bigint } {
    return { pool: this.pool, balanceZat: this.bal };
  }
}
