/**
 * The interface shapes the confirmed-block decoder consumes.
 *
 * These moved here verbatim from `apps/indexer/src/zebrad-rpc.ts` (HANDOFF-05
 * deliverable 1). They are kept as interfaces rather than folded into the Zod
 * schemas next door because `apps/indexer/src/decoder/*` is written against
 * them and this handoff does not change the indexer's analysis: a decoder that
 * compiled yesterday against `RpcBlock` compiles today against the same
 * declaration, now imported from a package instead of from a sibling file.
 *
 * `schemas.ts` is what the wire is validated against; this is what the decoder
 * reads. `client.ts` is the one place the two meet, and it meets them with a
 * declared `z.ZodType<T>` so `tsc` proves the validated output IS the declared
 * interface rather than a cast asserting it.
 */
import type { Hex, RpcTransaction } from "@zcashreveal/types";
import type { RpcBlockTrees } from "./schemas.js";

export interface BlockchainInfoResult {
  chain: string;
  blocks: number;
  bestblockhash: Hex;
  verificationprogress?: number | undefined;
}

export interface BlockHeaderResult {
  hash: Hex;
  height: number;
  time: number;
  previousblockhash?: Hex | undefined;
}

/**
 * A verbosity-2 `getblock` response: full transaction objects inline plus the
 * block-level commitment-tree roots.
 *
 * `finalsaplingroot` is absent in blocks before Sapling activation, and
 * `finalorchardroot` is absent before NU5 activation (see
 * `@zcashreveal/instruments`' activation-heights.ts). Treat their absence as "pool not yet
 * active at this height", not as "no commitments in this block".
 *
 * TWO ROOTS, THREE POOLS THAT HAVE ONE, AND THAT IS THE NODE'S SHAPE RATHER
 * THAN THIS TYPE'S OMISSION. Ironwood's block-level root is not on `getblock`
 * under any name - confirmed against Zebra's source, LEDGER-07 Q5 - so it is
 * absent here on purpose and `trees.ironwood.size` is what this response can
 * tell you about that pool.
 */
export interface RpcBlock {
  hash: Hex;
  height: number;
  time: number;
  /** Sapling NCT root as of this block. Absent pre-Sapling-activation. */
  finalsaplingroot?: Hex | undefined;
  /** Orchard NCT root as of this block. Absent pre-NU5-activation. */
  finalorchardroot?: Hex | undefined;
  /*
   * THERE IS NO IRONWOOD ROOT ON THIS RESPONSE. `finalironwoodroot` was
   * declared here through HANDOFF-07 as an inference from the two fields above,
   * and L2 confirmed against Zebra's source that no such field exists
   * (`zebra-rpc/src/methods.rs` on `main`; LEDGER-07 Q5). It is removed rather
   * than kept as an always-undefined optional. What `getblock` does carry for
   * Ironwood is a tree SIZE, in `trees` below; the root is on `z_gettreestate`,
   * which HANDOFF-12 wires.
   */
  /**
   * Per-pool note-commitment-tree state as of this block, when the node sends
   * it. `trees.ironwood.size` is the count of Ironwood commitments, so the
   * highest occupied position is `size - 1` - the `maxPosition` an anchor
   * needs, arriving one RPC before the root does.
   */
  trees?: RpcBlockTrees | undefined;
  /** Full transaction objects (verbosity 2). */
  tx: RpcTransaction[];
  previousblockhash?: Hex | undefined;
  nextblockhash?: Hex | undefined;
  confirmations?: number | undefined;
  /** Serialised size in bytes. Present at verbosity 1 and 2 alike in Zebra 6.3.0. */
  size?: number | undefined;
}
