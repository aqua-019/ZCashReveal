/**
 * ValuePool — Bal^p_h, the running pool balance via turnstile deltas.
 *
 * Sign convention (RESEARCH.md and Zcash RPC valueBalanceZat):
 *   deltaZat > 0n  →  value leaving the pool (unshielding / withdrawal)
 *   deltaZat < 0n  →  value entering the pool (shielding / deposit)
 *
 * Balance is mutated by `-delta.deltaZat`: a positive delta decreases
 * balance, a negative delta increases it. The pool balance is a hard
 * consensus invariant that cannot go negative (ZIP 209, which names Sprout,
 * Sapling, Orchard and Ironwood) — `apply()` validates this before mutating,
 * so failed applies leave state untouched.
 *
 * From NU6.3 a second consensus invariant applies to Orchard alone: ZIP 2006
 * makes it exit-only, so `deltaZat >= 0` for every Orchard delta at or after
 * that height. Both checks throw rather than logging, because a violation
 * means our decoder is wrong and never that the chain is.
 *
 * Per-tx deltas are retained in insertion order to support Module 2's
 * reorg replay (rewind by tx, replay forward).
 */

import type { BoundaryDelta, Hex, Pool } from "@zcashreveal/types";
import { type Network, orchardExitOnlyFrom } from "@zcashreveal/instruments";
import { ExitOnlyViolation, NegativeBalanceError } from "./errors.js";

export class ValuePool<P extends Pool> {
  private bal: bigint;
  private byTx = new Map<Hex, BoundaryDelta<P>[]>();

  /**
   * @param pool which pool this tracks.
   * @param network which network's activation heights the invariants use.
   *   Defaults to mainnet, so every existing construction site keeps its
   *   meaning; a testnet replay must say so, because the height Orchard
   *   becomes exit-only at differs between the two by nearly 706,000 blocks.
   * @param openingBalanceZat the pool's balance at the height BEFORE the first
   *   delta this pool will see (HANDOFF-12). Zero only for a pool indexed from
   *   its birth. The live indexer starts mid-chain, where Sapling holds
   *   hundreds of thousands of ZEC, and a pool that opened at zero would refuse
   *   the first withdrawal as a negative balance and publish a balance that is
   *   a running delta rather than the quantity `chainValueZat` names. The
   *   opening figure is the node's own `chainValueZat` at that height, and A1
   *   asserts the two stay equal block after block.
   */
  constructor(
    public readonly pool: P,
    public readonly network: Network = "mainnet",
    openingBalanceZat: bigint = 0n,
  ) {
    if (openingBalanceZat < 0n) {
      throw new NegativeBalanceError(
        `${pool} pool cannot open at a negative balance: ${openingBalanceZat} (ZIP 209)`,
      );
    }
    this.bal = openingBalanceZat;
  }

  /**
   * Apply a turnstile boundary delta. Balance changes by `-delta.deltaZat`.
   * Nothing is mutated if either invariant would be broken.
   *
   * TWO INVARIANTS, CHECKED IN THIS ORDER.
   *
   * Exit-only first (ZIP 2006): from NU6.3, no new value may enter Orchard.
   * It goes first because it is the more specific diagnosis - a delta that
   * breaks both should be reported as the consensus rule it broke, not as
   * arithmetic. A negative Orchard delta at such a height can never drive the
   * balance negative on its own, so ordering does not change which deltas are
   * rejected, only what the message says.
   *
   * Then `Bal >= 0` (ZIP 209), which holds for all four pools at all heights.
   *
   * @throws ExitOnlyViolation for value entering Orchard at or after NU6.3.
   * @throws NegativeBalanceError if the delta would push the balance below 0n.
   * State is unchanged on either throw.
   */
  apply(delta: BoundaryDelta<P>): void {
    if (
      this.pool === "orchard" &&
      delta.deltaZat < 0n &&
      delta.height >= orchardExitOnlyFrom(this.network)
    ) {
      throw new ExitOnlyViolation(
        `value may not enter the orchard pool at or after NU6.3 on ${this.network} ` +
          `(ZIP 2006, exit-only from height ${orchardExitOnlyFrom(this.network)}): ` +
          `height=${delta.height} delta=${delta.deltaZat} (tx ${delta.txid}). ` +
          `A block that reached consensus cannot break this, so our decoding of this ` +
          `transaction is wrong.`,
      );
    }
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
