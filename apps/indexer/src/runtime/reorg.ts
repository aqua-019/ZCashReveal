/**
 * Reorg: find the split height, roll the store back to it, and rebuild the
 * in-memory state from what survives (HANDOFF-12, section 3: "rollback to the
 * split then replay").
 *
 * THE SPLIT IS FOUND BY WALKING HEADERS, NOT BLOCKS. A block the follower has
 * just fetched for height h+1 names a `previousblockhash` that is not our tip
 * at h. The node's chain is walked back from that hash by `getblockheader` -
 * one header per step, each naming its own predecessor - and compared with the
 * hash this store wrote at the same height, until the two agree. That height
 * is the split; everything above it is the orphaned branch. A reorg that goes
 * below the base height cannot be resolved by this process, because nothing
 * below the base was ever recorded, and is fatal.
 *
 * THE REBUILD IS A FRESH REPLAY, NOT AN IN-PLACE UNDO. The state layer's
 * indexes are append-only and carry no undo log; the persistence layer's
 * rollback is exact and cheap. So the store is rolled back and the chain
 * state is constructed again from it - which makes A4's property ("equal to a
 * fresh replay of the new branch") hold by the same mechanism the driver uses,
 * rather than by a second implementation the property would then be testing.
 */
import type { Logger } from "pino";
import type { Hex } from "@zcashreveal/types";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";

import { replayChainState } from "./chain-replay.js";
import type { ChainState } from "./chain-state.js";
import type { ChainStore, RollbackCounts } from "./chain-store.js";
import { ChainRuntimeError, ReorgBelowBaseError } from "./errors.js";

export interface HeaderSource {
  getBlockHeader(hash: Hex): Promise<{ readonly height: number; readonly hash: Hex; readonly previousblockhash?: Hex | undefined }>;
}

export interface ReorgResolution {
  readonly splitHeight: number;
  readonly rolledBack: RollbackCounts;
  /** The rebuilt state. The caller REPLACES its reference; the old object is dead. */
  readonly chain: ChainState;
}

/**
 * The highest height at which the store's block hash equals the hash on the
 * node's chain that `block` extends.
 */
export async function findSplitHeight(
  chain: ChainState,
  store: ChainStore,
  rpc: HeaderSource,
  block: RpcBlock,
): Promise<number> {
  let hash = block.previousblockhash;
  let height = block.height - 1;
  while (height >= chain.base.height) {
    if (hash === undefined) {
      throw new ChainRuntimeError(`the node's chain names no predecessor at height ${height + 1}; the split cannot be found`);
    }
    const ours = (await store.readBlocks(height, height))[0];
    if (ours === undefined) {
      throw new ChainRuntimeError(`this store holds no block at ${height} although its tip is ${chain.height}; the split cannot be found`);
    }
    if (ours.hash === hash) return height;
    const header = await rpc.getBlockHeader(hash);
    if (header.height !== height) {
      throw new ChainRuntimeError(`the header for ${hash} says height ${header.height} where ${height} was expected`);
    }
    hash = header.previousblockhash;
    height -= 1;
  }
  throw new ReorgBelowBaseError(
    `the node's chain diverges from this store at or below its base height ${chain.base.height}; nothing below the base was recorded and it cannot be rolled back`,
  );
}

export async function resolveReorg(
  chain: ChainState,
  store: ChainStore,
  rpc: HeaderSource,
  block: RpcBlock,
  log: Logger,
): Promise<ReorgResolution> {
  const splitHeight = await findSplitHeight(chain, store, rpc, block);
  const rolledBack = await store.rollbackToHeight(splitHeight);
  log.warn(
    { splitHeight, fromTip: chain.height, ...rolledBack },
    "reorg: rolled the store back to the split height and replaying",
  );
  const fresh = await replayChainState(chain.base, store, chain.network);
  return { splitHeight, rolledBack, chain: fresh };
}
