/**
 * NullifierIndex — NFSet^p_h, the set of spent nullifiers in one pool.
 *
 * Records that some commitment in T^p has been spent, along with the
 * spending tx and height. CRITICAL: the public chain does not reveal
 * which commitment a nullifier corresponds to — that mapping is private.
 * This index supports membership and per-nullifier lookup only; it does
 * not (and cannot) support reverse lookup from nullifier to commitment.
 *
 * See RESEARCH.md "Nullifier uniqueness" for why NFSet does NOT remove
 * specific commitments from candidate sets — it only bounds cardinality.
 */

import type { Hex, Pool, SpentNullifier } from "@zcashreveal/types";
import { DoubleSpendError } from "./errors.js";

export class NullifierIndex<P extends Pool> {
  private spent = new Map<Hex, SpentNullifier<P>>();

  constructor(public readonly pool: P) {}

  /**
   * Record a published nullifier as spent. Each nfId can be recorded at
   * most once — a duplicate indicates either a double-spend (consensus
   * violation upstream) or a bug.
   *
   * @throws DoubleSpendError on duplicate nfId.
   */
  record(nf: SpentNullifier<P>): void {
    const existing = this.spent.get(nf.nfId);
    if (existing) {
      throw new DoubleSpendError(
        `nullifier ${nf.nfId} already recorded as spent in tx ${existing.spentTxid} at height ${existing.spentHeight} ` +
          `(new attempt: tx ${nf.spentTxid} at height ${nf.spentHeight})`,
      );
    }
    this.spent.set(nf.nfId, nf);
  }

  /** True iff `nfId` has been recorded as spent. */
  isSpent(nfId: Hex): boolean {
    return this.spent.has(nfId);
  }

  /**
   * Returns the (txid, height) of the spend that consumed `nfId`, or
   * undefined if the nullifier has not been observed.
   */
  spendingTx(nfId: Hex): { txid: Hex; height: number } | undefined {
    const r = this.spent.get(nfId);
    if (!r) return undefined;
    return { txid: r.spentTxid, height: r.spentHeight };
  }

  /** Cheap point-in-time summary. */
  snapshot(): { pool: P; nullifierCount: number } {
    return { pool: this.pool, nullifierCount: this.spent.size };
  }
}
