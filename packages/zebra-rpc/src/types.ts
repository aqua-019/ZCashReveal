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
 * decoder/activation-heights.ts). Treat their absence as "pool not yet
 * active at this height", not as "no commitments in this block".
 */
export interface RpcBlock {
  hash: Hex;
  height: number;
  time: number;
  /** Sapling NCT root as of this block. Absent pre-Sapling-activation. */
  finalsaplingroot?: Hex | undefined;
  /** Orchard NCT root as of this block. Absent pre-NU5-activation. */
  finalorchardroot?: Hex | undefined;
  /**
   * Ironwood NCT root as of this block. Absent pre-NU6.3-activation - and
   * absent, on every block, if this field name is wrong.
   *
   * INFERRED BY ANALOGY FROM ITS TWO SIBLINGS AND NEVER OBSERVED. See the note
   * on `finalironwoodroot` in `schemas.ts`. `decodeBlock` reports a block that
   * added Ironwood commitments while carrying no root, so the guess cannot fail
   * quietly.
   */
  finalironwoodroot?: Hex | undefined;
  /** Full transaction objects (verbosity 2). */
  tx: RpcTransaction[];
  previousblockhash?: Hex | undefined;
  nextblockhash?: Hex | undefined;
  confirmations?: number | undefined;
  /** Serialised size in bytes. Present at verbosity 1 and 2 alike in Zebra 6.3.0. */
  size?: number | undefined;
}
