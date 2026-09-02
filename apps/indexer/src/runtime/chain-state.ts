/**
 * The four pools' state as one chain, and where it starts (HANDOFF-12).
 *
 * THE INDEXER STARTS MID-CHAIN AND SAYS SO. Every `PoolState` opens at a
 * {@link PoolStateBase} - the tree size and the balance at the height before
 * the first block it applies - and every one of those figures is the NODE'S,
 * read off a verbosity-2 block: `valuePools[].chainValueZat` cumulative,
 * `valueDeltaZat` for the block, `trees.<pool>.size` cumulative. A base is
 * derived from a block's own figures by subtracting what the block itself
 * added, so the first block the driver applies can also be the block the base
 * came from, and A1's cross-check runs on it exactly as on every later one.
 */
import type { Hex, Pool } from "@zcashreveal/types";
import type { RpcBlock, ValuePoolBalance } from "@zcashreveal/zebra-rpc";
import type { Network } from "@zcashreveal/instruments";

import { decodeBlock } from "../decoder/block-decoder.js";
import { PoolState, type PoolStateBase, type PoolStates } from "../state/pool-state.js";
import { ChainBaseUnavailableError } from "./errors.js";

/** The four pools, in the order the node lists them and the tables check them. */
export const POOLS = ["sprout", "sapling", "orchard", "ironwood"] as const satisfies readonly Pool[];

export type PoolBases = { readonly [P in Pool]: PoolStateBase };

/**
 * Where a chain state opens. `height` is the block BEFORE the first one this
 * state applies; `hash` is that block's hash when the base was derived from a
 * block that named its predecessor, and `null` when it was not.
 */
export interface ChainBase {
  readonly height: number;
  readonly hash: Hex | null;
  readonly pools: PoolBases;
}

export interface ChainState {
  readonly network: Network;
  readonly base: ChainBase;
  readonly pools: PoolStates;
  /** Height of the last block applied; `base.height` before any. */
  height: number;
  /** Hash of the last block applied; `base.hash` before any. */
  hash: Hex | null;
}

export function createChainState(base: ChainBase, network: Network = "mainnet"): ChainState {
  return {
    network,
    base,
    pools: {
      sprout: new PoolState<"sprout">("sprout", network, base.pools.sprout),
      sapling: new PoolState<"sapling">("sapling", network, base.pools.sapling),
      orchard: new PoolState<"orchard">("orchard", network, base.pools.orchard),
      ironwood: new PoolState<"ironwood">("ironwood", network, base.pools.ironwood),
    },
    height: base.height,
    hash: base.hash,
  };
}

/** The `valuePools` entry for a pool, by the `id` the node gives it. */
export function valuePoolEntry(block: RpcBlock, pool: Pool): ValuePoolBalance | undefined {
  return block.valuePools?.find((p) => p.id === pool);
}

/**
 * How many commitments a block appends to each pool's tree, from its own
 * transactions: Sapling outputs, Orchard actions, Ironwood actions. Sprout's
 * tree is not tracked by this indexer (its JoinSplits are decoded for value,
 * never for commitments), so its count is always zero and its commitment
 * index stays empty by design.
 */
export function appendedCommitments(block: RpcBlock): Readonly<Record<Pool, number>> {
  const decoded = decodeBlock(block);
  let sapling = 0;
  let orchard = 0;
  let ironwood = 0;
  for (const tx of decoded.txs) {
    sapling += tx.saplingOutputs.length;
    orchard += tx.orchardActions.length;
    ironwood += tx.ironwoodActions.length;
  }
  return { sprout: 0, sapling, orchard, ironwood };
}

/**
 * The node's own figures for the state BEFORE `block`, read off `block`.
 *
 * `chainValueZat - valueDeltaZat` is the balance before the block, and
 * `trees.<pool>.size` minus what this block appended is the tree size before
 * it. Both subtractions use the block's own transactions, so the base and the
 * block agree with each other by construction and the driver's cross-check on
 * the block is a real check of the decode rather than of the arithmetic here.
 *
 * REFUSES RATHER THAN INVENTS. A block with no `valuePools`, or no tree size
 * for a pool it moved, cannot yield a base - an older node, or a verbosity
 * this project does not use - and a base of zero in its place would be the
 * counter this whole design exists to remove. An absent `trees.ironwood` on a
 * block that appended NO Ironwood commitments is the expected shape for an
 * empty tree (PR #10888 skips it) and yields a base of zero honestly.
 */
export function chainBaseFromBlock(block: RpcBlock): ChainBase {
  if (block.valuePools === undefined) {
    throw new ChainBaseUnavailableError(
      `block ${block.height} carries no valuePools, so no opening balance can be derived from it`,
    );
  }
  const appended = appendedCommitments(block);
  const pools = {} as { [P in Pool]: PoolStateBase };
  for (const pool of POOLS) {
    const entry = valuePoolEntry(block, pool);
    if (entry === undefined || entry.valueDeltaZat === undefined) {
      throw new ChainBaseUnavailableError(
        `block ${block.height} carries no valuePools entry with a valueDeltaZat for ${pool}`,
      );
    }
    const size = pool === "sprout" ? 0 : block.trees?.[pool]?.size;
    if (size === undefined) {
      if (appended[pool] > 0) {
        throw new ChainBaseUnavailableError(
          `block ${block.height} appended ${appended[pool]} ${pool} commitments but carries no trees.${pool}.size`,
        );
      }
    }
    const treeSize = BigInt(size ?? 0);
    pools[pool] = {
      commitmentBase: treeSize - BigInt(appended[pool]),
      openingBalanceZat: entry.chainValueZat - entry.valueDeltaZat,
    };
  }
  return { height: block.height - 1, hash: block.previousblockhash ?? null, pools };
}
