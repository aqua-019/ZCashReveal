/**
 * Confirmed-block decoder.
 *
 * `decodeBlock` is a pure projection of a verbosity-2 `getblock` response
 * into the structural shielded surface 7B feeds into PoolState: per-tx
 * Sapling spends/outputs, Orchard actions and Ironwood actions, per-tx
 * turnstile value balances, and the block-level commitment-tree roots.
 *
 * IRONWOOD IS DECODED HERE SINCE HANDOFF-07 and it is the one pool with NO
 * block-level root on this response. Through HANDOFF-07 that was a suspicion
 * carried as an alarm on an inferred field name; L2 read Zebra's source and it
 * is now a settled fact (LEDGER-07 Q5). `decodeBlock` therefore emits no
 * Ironwood block anchor at all, reports the tree SIZE the response does carry,
 * and marks the heights whose anchor the confirmed-block driver fetches from
 * `z_gettreestate` - see `ironwoodTreeSize` and `ironwoodAnchorPendingTreestate`,
 * and `runtime/confirmed-block.ts`, which consumes both.
 *
 * No I/O, no state, no findings, no identity inference — this layer is the
 * confirmed-chain analogue of decoder/leak-analyzer.ts's mempool decode,
 * minus everything that depends on tip context or the anchor registry.
 */

import type {
  BoundaryDelta,
  Hex,
  RpcTransaction,
  ShieldedPool,
  Zatoshi,
} from "@zcashreveal/types";
import type {
  DecodedSaplingSpend,
  DecodedSaplingOutput,
  DecodedOrchardAction,
  DecodedIronwoodAction,
} from "@zcashreveal/types";

import { decodeSaplingSpends, decodeSaplingOutputs } from "./sapling.js";
import { decodeOrchardBundle } from "./orchard.js";
import { decodeIronwoodBundle } from "./ironwood.js";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";

/**
 * A block-level note-commitment-tree root, captured from the block header's
 * `finalsaplingroot` / `finalorchardroot`. This is the anchor that spends in
 * *subsequent* blocks may cite; 7B records it as an Anchor whose maxPosition
 * is the highest commitment position the pool reached in this block.
 *
 * Emitted only when the block actually appended commitments to the pool — an
 * unchanged root carries no new information and recording it would duplicate
 * the prior block's anchor (see {@link decodeBlock}).
 */
export interface BlockAnchor {
  pool: ShieldedPool;
  /** finalsaplingroot / finalorchardroot — lowercase hex, no `0x`. */
  root: Hex;
  /** Height of the block this root is final as of. */
  height: number;
}

/**
 * One transaction's shielded surface within a confirmed block. Structural
 * normalization only; mirrors the field set of the mempool decode so the two
 * code paths stay aligned.
 *
 * `saplingValueBalanceZat`, `orchardValueBalanceZat` and
 * `ironwoodValueBalanceZat` are the raw RPC value balances and follow the
 * BoundaryDelta sign convention (analysis.ts):
 *   > 0n → value leaving the pool (unshielding / withdrawal)
 *   < 0n → value entering the pool (shielding / deposit)
 *   = 0n → intra-pool transfer, no public boundary movement
 */
export interface DecodedBlockTx {
  txid: Hex;
  /** 0-based position within `block.tx` (coinbase is index 0). */
  index: number;
  saplingSpends: DecodedSaplingSpend[];
  saplingOutputs: DecodedSaplingOutput[];
  saplingValueBalanceZat: Zatoshi;
  orchardActions: DecodedOrchardAction[];
  orchardValueBalanceZat: Zatoshi;
  /** The Orchard bundle anchor this tx's actions cite, or null if no bundle. */
  orchardAnchor: Hex | null;
  orchardFlags: { enableSpends: boolean; enableOutputs: boolean } | null;
  ironwoodActions: DecodedIronwoodAction[];
  ironwoodValueBalanceZat: Zatoshi;
  /** The Ironwood bundle anchor this tx's actions cite, or null if no bundle. */
  ironwoodAnchor: Hex | null;
  ironwoodFlags: { enableSpends: boolean; enableOutputs: boolean } | null;
}

/**
 * A fully decoded confirmed block. Pure, deterministic projection of an
 * {@link RpcBlock} — same input always yields a deep-equal output, and the
 * input is never mutated. 7B's onConfirmedBlock consumes this.
 */
export interface DecodedBlock {
  height: number;
  hash: Hex;
  /** Block header time (unix seconds) as returned by the RPC. */
  time: number;
  /** finalsaplingroot anchor — non-null only when this block added Sapling commitments. */
  saplingAnchor: BlockAnchor | null;
  /** finalorchardroot anchor — non-null only when this block added Orchard commitments. */
  orchardAnchor: BlockAnchor | null;
  /*
   * THERE IS NO `ironwoodAnchor` HERE, AND ITS ABSENCE IS THE FINDING.
   *
   * This interface carried one through HANDOFF-07, built from an inferred
   * `finalironwoodroot`, plus an `ironwoodRootUnobserved` alarm for the case
   * where the guess was wrong. The guess WAS wrong: L2 read
   * `zebra-rpc/src/methods.rs` on `main` and Zebra defines `finalsaplingroot`
   * and `finalorchardroot` on the verbose block and no Ironwood root under any
   * spelling (LEDGER-07 Q5). So `ironwoodAnchor` would be `null` on every block
   * forever and the alarm would fire on every block that moved the pool.
   *
   * An alarm that fires on every block is a broken build, not a signal, and a
   * field that is `null` on every block is the hardcoded zero this project
   * keeps removing. Both are gone. What replaces them is the pair below: the
   * SIZE the node really sends, and a flag naming the heights whose anchor has
   * to be fetched from somewhere else.
   */
  /**
   * The number of commitments in the Ironwood tree as of this block, from
   * `trees.ironwood.size`, or `null` when the node did not report one.
   *
   * A SIZE IS NOT AN ANCHOR, BUT IT IS AN ANCHOR'S `maxPosition`. The highest
   * occupied position is `size - 1n`, so when HANDOFF-12 fetches the root from
   * `z_gettreestate` it already has the other half of the `Anchor` from this
   * response. `null` means the node sent no `trees.ironwood` at all, which
   * PR #10888 makes the expected shape for a block whose Ironwood tree is still
   * empty (`skip_serializing_if = "IronwoodTrees::is_empty"`) - and also what an
   * older node does on every block. It is deliberately not coalesced to `0n`.
   */
  ironwoodTreeSize: bigint | null;
  /**
   * True when this block appended Ironwood commitments, and therefore when an
   * Ironwood anchor EXISTS for this height that `getblock` cannot supply.
   *
   * A SCHEDULING SIGNAL, CONSUMED, SINCE HANDOFF-12 - NOT A REPORTED ABSENCE
   * (deliverable 3). Its predecessor, `ironwoodRootUnobserved`, meant "the pool
   * moved and no root came back under the name we guessed" and was designed to
   * fire rarely and loudly; under the confirmed shape it would have fired on
   * every such block, which is noise. This boolean answers a different
   * question: `runtime/confirmed-block.ts` calls `z_gettreestate` at exactly
   * the heights it marks and at no other, because a pool most blocks do not
   * move should not cost a second RPC on every block. The absence it used to
   * report is now recorded where it is decided - as a notice from the driver
   * when the treestate is withheld, names another block or carries no root,
   * and never as an anchor made up to fill the gap. `z_getsubtreesbyindex`
   * (which accepts `pool = "ironwood"`) is not called: the subtree path is not
   * needed for an anchor, and Zebra 6.0.0 names it beside `getblock` and
   * `z_gettreestate` as the Ironwood tree surface only.
   */
  ironwoodAnchorPendingTreestate: boolean;
  txs: DecodedBlockTx[];
}

/**
 * Decode a confirmed block into its structural shielded surface.
 *
 * Block-level anchors are gated on the pool having appended commitments *in
 * this block*: `saplingHadOutputs && block.finalsaplingroot` for Sapling, and
 * the Orchard equivalent. (There is no Ironwood equivalent: the node sends no
 * Ironwood root. See `ironwoodAnchorPendingTreestate`.) Two reasons:
 *   1. `finalsaplingroot` is present in every block after Sapling activation
 *      regardless of whether commitments advanced; emitting an anchor for an
 *      unchanged root would duplicate the prior block's entry.
 *   2. An Anchor's maxPosition must reference a real commitment position, so a
 *      block-level anchor is only meaningful once the tree has grown.
 *
 * @param block verbosity-2 getblock response (each `tx` is a full RpcTransaction)
 * @returns the decoded block; the input `block` is not mutated
 */
export function decodeBlock(block: RpcBlock): DecodedBlock {
  let saplingHadOutputs = false;
  let orchardHadOutputs = false;
  let ironwoodHadOutputs = false;

  const txs: DecodedBlockTx[] = block.tx.map((tx: RpcTransaction, index) => {
    const saplingSpends = decodeSaplingSpends(tx.vShieldedSpend);
    const saplingOutputs = decodeSaplingOutputs(tx.vShieldedOutput);
    const orchard = decodeOrchardBundle(tx.orchard);
    const ironwood = decodeIronwoodBundle(tx.ironwood);

    if (saplingOutputs.length > 0) saplingHadOutputs = true;

    // Every Orchard action simultaneously publishes a nullifier AND a cmx —
    // there is no output-only or spend-only action. So any action at all means
    // the Orchard commitment tree advanced in this block. Do NOT "optimize"
    // this to inspect flags.enableOutputs; that flag governs note decryption,
    // not whether a cmx was appended.
    if (orchard.actions.length > 0) orchardHadOutputs = true;
    // Ironwood actions have the same dual nature, so the same rule applies.
    if (ironwood.actions.length > 0) ironwoodHadOutputs = true;

    return {
      txid: tx.txid,
      index,
      saplingSpends,
      saplingOutputs,
      saplingValueBalanceZat: BigInt(tx.valueBalanceZat ?? 0),
      orchardActions: orchard.actions,
      orchardValueBalanceZat: orchard.valueBalanceZat,
      orchardAnchor: orchard.anchor,
      orchardFlags: orchard.flags,
      ironwoodActions: ironwood.actions,
      ironwoodValueBalanceZat: ironwood.valueBalanceZat,
      ironwoodAnchor: ironwood.anchor,
      ironwoodFlags: ironwood.flags,
    };
  });

  const saplingAnchor: BlockAnchor | null =
    saplingHadOutputs && block.finalsaplingroot
      ? { pool: "sapling", root: block.finalsaplingroot, height: block.height }
      : null;

  const orchardAnchor: BlockAnchor | null =
    orchardHadOutputs && block.finalorchardroot
      ? { pool: "orchard", root: block.finalorchardroot, height: block.height }
      : null;

  // No Ironwood block anchor is constructed, because no Ironwood root reaches
  // this function. See the note on the missing `ironwoodAnchor` field above.
  const ironwoodSize = block.trees?.ironwood?.size;

  return {
    height: block.height,
    hash: block.hash,
    time: block.time,
    saplingAnchor,
    orchardAnchor,
    ironwoodTreeSize: ironwoodSize === undefined ? null : BigInt(ironwoodSize),
    ironwoodAnchorPendingTreestate: ironwoodHadOutputs,
    txs,
  };
}

/**
 * Every pool boundary movement in a decoded block, as `BoundaryDelta` records.
 *
 * WHY THIS LIVES IN SHIPPED CODE RATHER THAN IN THE TEST THAT NEEDS IT.
 * When it was written nothing in this repository drove `PoolState` from a
 * decoded block, so the temptation was to write this mapping inside the
 * replay test. A green test would then have certified a mapping that existed
 * only in the test file, which is the Sprout defect in a new place: the
 * consumer accepts four pools, and the only producer lives somewhere nothing
 * ships. Putting it here meant the assertion exercised the projection the
 * driver would use, and since HANDOFF-12 `runtime/confirmed-block.ts` is that
 * driver and inherits something already exercised.
 *
 * A POOL THAT DID NOT MOVE PRODUCES NO DELTA. Same rule as `perPoolZat`: a zero
 * delta is a `ValuePool.apply` that changes nothing and a row in
 * `pool_boundary_flows` asserting a crossing of zero. Neither is worth writing,
 * and the second is a measurement nobody took.
 *
 * SPROUT IS ABSENT AND THAT IS NOT AN OVERSIGHT. Sprout's movement is a
 * JoinSplit sum rather than a bundle balance, and `DecodedBlockTx` carries no
 * JoinSplit surface - `decodeBlock` is the confirmed-chain STRUCTURAL decode,
 * and the Sprout term is computed in `leak-analyzer.ts` from the raw
 * transaction. Adding a Sprout delta here would mean re-deriving it from a
 * different input than the analyser uses, which is how one quantity comes to
 * have two answers. The driver has the raw block and supplies it from
 * `sproutValueBalanceZat`, the analyser's own function.
 *
 * The sign convention is the RPC's own, unchanged: positive means value LEFT
 * the pool, negative means it entered. `ValuePool.apply` moves the balance by
 * `-deltaZat`.
 */
export function boundaryDeltasOf(block: DecodedBlock): BoundaryDelta[] {
  const out: BoundaryDelta[] = [];
  for (const tx of block.txs) {
    if (tx.saplingValueBalanceZat !== 0n) {
      out.push({
        pool: "sapling",
        txid: tx.txid,
        height: block.height,
        deltaZat: tx.saplingValueBalanceZat,
      });
    }
    if (tx.orchardValueBalanceZat !== 0n) {
      out.push({
        pool: "orchard",
        txid: tx.txid,
        height: block.height,
        deltaZat: tx.orchardValueBalanceZat,
      });
    }
    if (tx.ironwoodValueBalanceZat !== 0n) {
      out.push({
        pool: "ironwood",
        txid: tx.txid,
        height: block.height,
        deltaZat: tx.ironwoodValueBalanceZat,
      });
    }
  }
  return out;
}
