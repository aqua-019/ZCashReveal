/**
 * Confirmed-block decoder.
 *
 * `decodeBlock` is a pure projection of a verbosity-2 `getblock` response
 * into the structural shielded surface 7B feeds into PoolState: per-tx
 * Sapling spends/outputs and Orchard actions, per-tx turnstile value
 * balances, and the two block-level commitment-tree roots.
 *
 * No I/O, no state, no findings, no identity inference — this layer is the
 * confirmed-chain analogue of decoder/leak-analyzer.ts's mempool decode,
 * minus everything that depends on tip context or the anchor registry.
 */

import type { Hex, RpcTransaction, ShieldedPool, Zatoshi } from "@zcashreveal/types";
import type {
  DecodedSaplingSpend,
  DecodedSaplingOutput,
  DecodedOrchardAction,
} from "@zcashreveal/types";

import { decodeSaplingSpends, decodeSaplingOutputs } from "./sapling.js";
import { decodeOrchardBundle } from "./orchard.js";
import type { RpcBlock } from "../zebrad-rpc.js";

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
 * `saplingValueBalanceZat` / `orchardValueBalanceZat` are the raw RPC value
 * balances and follow the BoundaryDelta sign convention (analysis.ts):
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
  txs: DecodedBlockTx[];
}

/**
 * Decode a confirmed block into its structural shielded surface.
 *
 * Block-level anchors are gated on the pool having appended commitments *in
 * this block*: `saplingHadOutputs && block.finalsaplingroot` for Sapling, and
 * the Orchard equivalent. Two reasons:
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

  const txs: DecodedBlockTx[] = block.tx.map((tx: RpcTransaction, index) => {
    const saplingSpends = decodeSaplingSpends(tx.vShieldedSpend);
    const saplingOutputs = decodeSaplingOutputs(tx.vShieldedOutput);
    const orchard = decodeOrchardBundle(tx.orchard);

    if (saplingOutputs.length > 0) saplingHadOutputs = true;

    // Every Orchard action simultaneously publishes a nullifier AND a cmx —
    // there is no output-only or spend-only action. So any action at all means
    // the Orchard commitment tree advanced in this block. Do NOT "optimize"
    // this to inspect flags.enableOutputs; that flag governs note decryption,
    // not whether a cmx was appended.
    if (orchard.actions.length > 0) orchardHadOutputs = true;

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

  return {
    height: block.height,
    hash: block.hash,
    time: block.time,
    saplingAnchor,
    orchardAnchor,
    txs,
  };
}
