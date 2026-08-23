/**
 * Confirmed-block decoder.
 *
 * `decodeBlock` is a pure projection of a verbosity-2 `getblock` response
 * into the structural shielded surface 7B feeds into PoolState: per-tx
 * Sapling spends/outputs, Orchard actions and Ironwood actions, per-tx
 * turnstile value balances, and the block-level commitment-tree roots.
 *
 * IRONWOOD IS DECODED HERE SINCE HANDOFF-07 and it is the one pool whose
 * BLOCK-LEVEL root this build has never seen. `finalironwoodroot` is inferred
 * by analogy from its two siblings, so `decodeBlock` reports the case that
 * would otherwise hide a wrong guess - see `ironwoodRootUnobserved`.
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
  /** finalironwoodroot anchor — non-null only when this block added Ironwood commitments. */
  ironwoodAnchor: BlockAnchor | null;
  /**
   * True when this block appended Ironwood commitments and no Ironwood root
   * came back with it.
   *
   * THIS FLAG IS THE ONLY THING STANDING BETWEEN A WRONG FIELD NAME AND A
   * SILENT ZERO. `finalironwoodroot` is inferred by analogy from
   * `finalsaplingroot` and `finalorchardroot`; nothing in this repository has
   * observed it (see `packages/zebra-rpc/src/types.ts`). If the real name is
   * something else, `ironwoodAnchor` is `null` on every block forever, and a
   * null anchor is indistinguishable from "this block added no Ironwood
   * commitments" - which is the `expiryheight` failure mode exactly.
   *
   * So the two are separated here: `ironwoodAnchor === null` with this flag
   * FALSE means the pool did not move in this block, and `null` with this flag
   * TRUE means the pool moved and the node did not give us a root under the
   * name we asked for. The second is a fact about this build, not about the
   * chain, and a caller that sees it should suspect the field name before it
   * suspects the block.
   */
  ironwoodRootUnobserved: boolean;
  txs: DecodedBlockTx[];
}

/**
 * Decode a confirmed block into its structural shielded surface.
 *
 * Block-level anchors are gated on the pool having appended commitments *in
 * this block*: `saplingHadOutputs && block.finalsaplingroot` for Sapling, and
 * the Orchard and Ironwood equivalents. Two reasons:
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

  const ironwoodAnchor: BlockAnchor | null =
    ironwoodHadOutputs && block.finalironwoodroot
      ? { pool: "ironwood", root: block.finalironwoodroot, height: block.height }
      : null;

  return {
    height: block.height,
    hash: block.hash,
    time: block.time,
    saplingAnchor,
    orchardAnchor,
    ironwoodAnchor,
    ironwoodRootUnobserved: ironwoodHadOutputs && !block.finalironwoodroot,
    txs,
  };
}

/**
 * Every pool boundary movement in a decoded block, as `BoundaryDelta` records.
 *
 * WHY THIS LIVES IN SHIPPED CODE RATHER THAN IN THE TEST THAT NEEDS IT.
 * Nothing in this repository drives `PoolState` from a decoded block yet -
 * HANDOFF-12 owns the confirmed-block driver - so the temptation is to write
 * this mapping inside the replay test. A green test would then certify a
 * mapping that exists only in the test file, which is the Sprout defect in a new
 * place: the consumer accepts four pools, and the only producer lives somewhere
 * nothing ships. Putting it here means the assertion exercises the projection
 * the driver will use, and the driver inherits something already exercised.
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
 * have two answers. HANDOFF-12's driver has the raw block and can supply it.
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
