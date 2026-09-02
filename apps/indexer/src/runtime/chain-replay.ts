/**
 * Startup: read where the chain state opened and rebuild it from disk
 * (HANDOFF-12, "replay on startup").
 */
import type { Network } from "@zcashreveal/instruments";

import { replayPool } from "../persistence/replay.js";
import type { PoolStateBase } from "../state/pool-state.js";
import { createChainState, POOLS, type ChainBase, type ChainState } from "./chain-state.js";
import type { ChainStore } from "./chain-store.js";
import { ChainRuntimeError } from "./errors.js";

/**
 * The base the store was opened at, or `null` on a cold store.
 *
 * The lowest `blocks` row is the base height and hash; the snapshot each pool
 * wrote at that height carries the node's tree size and balance for it. A
 * store with a lowest block and no snapshot for some pool at that height is
 * not a base - it is a store somebody has edited - and is refused.
 */
export async function readChainBase(store: ChainStore): Promise<ChainBase | null> {
  const lowest = await store.readLowestBlock();
  if (lowest === null) return null;
  const pools = {} as { [P in (typeof POOLS)[number]]: PoolStateBase };
  for (const pool of POOLS) {
    const snapshot = (await store.readSnapshots(pool, lowest.height, lowest.height))[0];
    if (snapshot === undefined) {
      throw new ChainRuntimeError(
        `the store's lowest block is ${lowest.height} but ${pool} has no snapshot at that height, so no base can be read`,
      );
    }
    pools[pool] = { commitmentBase: snapshot.commitmentCount, openingBalanceZat: snapshot.balanceZat };
  }
  return { height: lowest.height, hash: lowest.hash, pools };
}

/**
 * A fresh {@link ChainState} at `base`, with every pool replayed from the store
 * and the tip set to the highest block the store holds.
 *
 * THE REPLAY IS THE ONE IN persistence/replay.ts, not a copy: `replayPool`
 * over the store's readers, which is the same function `replayInto` is. Its
 * position check runs here, so a store whose rows do not agree with its own
 * base throws rather than replaying into a renumbered tree.
 */
export async function replayChainState(base: ChainBase, store: ChainStore, network: Network = "mainnet"): Promise<ChainState> {
  const chain = createChainState(base, network);
  for (const pool of POOLS) {
    await replayPool(chain.pools[pool], store);
  }
  const highest = await store.readHighestBlock();
  if (highest === null) {
    throw new ChainRuntimeError(`a base at ${base.height} was read but the store holds no blocks row - the base row is missing`);
  }
  chain.height = highest.height;
  chain.hash = highest.hash;
  return chain;
}
