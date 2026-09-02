/**
 * Startup, in the order section 3 fixes: replay before anything subscribes
 * (HANDOFF-12, A2).
 */
import type { Logger } from "pino";
import type { Network } from "@zcashreveal/instruments";
import type { Hex } from "@zcashreveal/types";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";

import { readChainBase, replayChainState } from "./chain-replay.js";
import { chainBaseFromBlock, createChainState, type ChainState } from "./chain-state.js";
import type { ChainStore } from "./chain-store.js";
import { ChainBaseUnavailableError } from "./errors.js";

export interface BootstrapRpc {
  getBlock(id: { readonly height: number }): Promise<RpcBlock>;
  getBlockHeader(hash: Hex): Promise<{ readonly height: number; readonly time: number }>;
}

export interface BootstrapDeps {
  readonly rpc: BootstrapRpc;
  readonly store: ChainStore;
  /** The first block to index on a COLD store. Ignored once a base is on disk. */
  readonly startHeight: number;
  readonly network: Network;
  readonly log: Logger;
}

/**
 * The chain state at startup: replayed from the store when it holds a base,
 * opened at `startHeight` when it does not.
 *
 * A COLD START FETCHES ONE BLOCK AND ONE HEADER. The block at `startHeight`
 * yields the base by its own figures (`chainBaseFromBlock`); its predecessor's
 * header supplies the base row's time, because a `blocks` row carries a block
 * time and never a wall clock. The base is written before the state is
 * returned, so a crash between here and the first applied block still leaves
 * a store the next start can read a base from.
 */
export async function bootstrapChain(deps: BootstrapDeps): Promise<ChainState> {
  const base = await readChainBase(deps.store);
  if (base !== null) {
    deps.log.info({ baseHeight: base.height }, "replaying the chain state from the store");
    const chain = await replayChainState(base, deps.store, deps.network);
    deps.log.info(
      {
        baseHeight: base.height,
        height: chain.height,
        commitments: Object.fromEntries(
          (["sapling", "orchard", "ironwood"] as const).map((p) => [p, chain.pools[p].commitments.indexedCount().toString()]),
        ),
      },
      "chain state replayed",
    );
    return chain;
  }
  deps.log.info({ startHeight: deps.startHeight }, "cold store: opening the chain state at the start height");
  const first = await deps.rpc.getBlock({ height: deps.startHeight });
  const derived = chainBaseFromBlock(first);
  if (derived.hash === null) {
    throw new ChainBaseUnavailableError(`block ${deps.startHeight} names no predecessor, so no base row can be written`);
  }
  const header = await deps.rpc.getBlockHeader(derived.hash);
  await deps.store.writeBase(derived, header.time);
  return createChainState(derived, deps.network);
}

/**
 * The three things the indexer starts, in the one order that is correct.
 *
 * A2: the replay resolves before ZMQ is started - and, since Zebra has no
 * ZMQ, before the follower that stands in for it starts too. The mempool
 * analyser reads the chain state for every spend it assesses, so a
 * transaction analysed against a state still being replayed would carry an
 * assessment over a partial tree, published as if over the whole one.
 */
export interface StartupSteps {
  readonly bootstrap: () => Promise<void>;
  readonly startFollower: () => void;
  readonly startZmq: () => Promise<void>;
}

export async function runStartup(steps: StartupSteps): Promise<void> {
  await steps.bootstrap();
  steps.startFollower();
  await steps.startZmq();
}
