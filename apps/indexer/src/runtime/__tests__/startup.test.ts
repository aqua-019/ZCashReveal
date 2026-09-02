/**
 * A2 - the replay resolves before ZMQ is started (spy order), and the cold
 * and warm halves of bootstrap.
 *
 * NOT IN THE POSTGRES GATE, on purpose (section 5's note on A2): the store is
 * in memory, so this file cannot skip itself on a runner without a database
 * and report green having executed nothing.
 */
import pino from "pino";
import { describe, expect, it } from "vitest";
import { asHex, type Hex } from "@zcashreveal/types";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";

import { createChainState, type ChainBase } from "../chain-state.js";
import { MemoryChainStore } from "../chain-store.js";
import { applyConfirmedBlock } from "../confirmed-block.js";
import { ChainRuntimeError } from "../errors.js";
import { bootstrapChain, runStartup, type BootstrapRpc } from "../startup.js";

const SILENT = pino({ level: "silent" });
const h = (n: number): Hex => asHex(n.toString(16).padStart(64, "0"));
const H0 = asHex("00");

describe("A2 - replayInto resolves before zmq.start() is called", () => {
  /** A bootstrap that takes a real turn of the event loop, so an orchestration that merely CALLED it would race it. */
  function steps(order: string[]) {
    return {
      bootstrap: () =>
        new Promise<void>((resolve) =>
          setImmediate(() => {
            order.push("replay");
            resolve();
          }),
        ),
      startFollower: () => {
        order.push("follower");
      },
      startZmq: () => {
        order.push("zmq");
        return Promise.resolve();
      },
    };
  }

  it("PASS STATE: the shipped orchestration records replay, then the follower, then ZMQ", async () => {
    const order: string[] = [];
    await runStartup(steps(order));
    expect(order).toEqual(["replay", "follower", "zmq"]);
  });

  it("FAIL STATE: an orchestration that starts ZMQ first records the inverted order - the spy discriminates", async () => {
    // The member of the excluded set: a startup that awaits zmq.start() first.
    // The same steps, the same spy; only the orchestration differs, and the
    // order it records is the inverted one.
    const order: string[] = [];
    const s = steps(order);
    await s.startZmq();
    await s.bootstrap();
    s.startFollower();
    expect(order).toEqual(["zmq", "replay", "follower"]);
    expect(order).not.toEqual(["replay", "follower", "zmq"]);
  });

  it("FAIL STATE, BY DATA: with the bootstrap not awaited, ZMQ would start before the replay resolved", async () => {
    // What the shipped `await` buys, shown by removing it: the replay resolves
    // on a later turn, so an orchestration that did not wait would let ZMQ go
    // first with the state still empty.
    const order: string[] = [];
    const s = steps(order);
    void s.bootstrap();
    s.startFollower();
    await s.startZmq();
    expect(order).toEqual(["follower", "zmq"]);
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(["follower", "zmq", "replay"]);
  });
});

/* ----------------------------------------------------------------------------
   bootstrapChain: cold, warm, corrupt
   ------------------------------------------------------------------------- */

const START = 1_700_000;

/** The start block, with the node figures a base is derived from. */
function startBlock(): RpcBlock {
  return {
    hash: h(0x5000),
    height: START,
    time: 1_600_000_000,
    previousblockhash: h(0x4fff),
    tx: [
      {
        txid: h(0x6000),
        version: 5,
        locktime: 0,
        size: 0,
        vin: [],
        vout: [],
        vShieldedOutput: [{ cv: h(1), cmu: h(2), ephemeralKey: h(3), encCiphertext: H0, outCiphertext: H0, proof: H0 }],
        valueBalanceZat: -1_000,
      },
    ],
    finalsaplingroot: h(0x7000),
    trees: { sapling: { size: 501 }, orchard: { size: 900 }, ironwood: { size: 0 } },
    valuePools: [
      { id: "sprout", chainValue: 0, chainValueZat: 10n, valueDelta: 0, valueDeltaZat: 0n },
      { id: "sapling", chainValue: 0, chainValueZat: 2_000n, valueDelta: 0, valueDeltaZat: 1_000n },
      { id: "orchard", chainValue: 0, chainValueZat: 30n, valueDelta: 0, valueDeltaZat: 0n },
      { id: "ironwood", chainValue: 0, chainValueZat: 0n, valueDelta: 0, valueDeltaZat: 0n },
    ],
  };
}

function rpc(calls: string[]): BootstrapRpc {
  return {
    getBlock: (id) => {
      calls.push(`getblock:${id.height}`);
      return Promise.resolve(startBlock());
    },
    getBlockHeader: (hash) => {
      calls.push(`getblockheader:${hash.slice(-4)}`);
      return Promise.resolve({ height: START - 1, time: 1_599_999_925 });
    },
  };
}

describe("bootstrapChain", () => {
  it("cold: fetches the start block and its predecessor's header, writes the base, opens the state at the start height minus one", async () => {
    const store = new MemoryChainStore();
    const calls: string[] = [];
    const chain = await bootstrapChain({ rpc: rpc(calls), store, startHeight: START, network: "mainnet", log: SILENT });
    expect(calls).toEqual([`getblock:${START}`, "getblockheader:4fff"]);
    expect(chain.height).toBe(START - 1);
    expect(chain.hash).toBe(h(0x4fff));
    // The base is the node's figures BEFORE the start block: 501 - 1 outputs, 2,000 - 1,000 delta.
    expect(chain.pools.sapling.commitments.size()).toBe(500n);
    expect(chain.pools.sapling.value.balance()).toBe(1_000n);
    expect(chain.pools.orchard.commitments.size()).toBe(900n);
    const base = await store.readLowestBlock();
    expect(base).toEqual({ height: START - 1, timeS: 1_599_999_925, hash: h(0x4fff) });
    expect((await store.readSnapshots("sapling", START - 1, START - 1))[0]).toMatchObject({ balanceZat: 1_000n, commitmentCount: 500n });

    // And the start block then applies as the first block, cross-checked against its own figures.
    await applyConfirmedBlock(chain, startBlock(), store, { treestate: () => Promise.resolve(null), log: SILENT });
    expect(chain.height).toBe(START);
    expect(chain.pools.sapling.value.balance()).toBe(2_000n);
  });

  it("warm: a store with a base and blocks is replayed with no RPC call, to the highest block it holds", async () => {
    const store = new MemoryChainStore();
    const calls: string[] = [];
    const first = await bootstrapChain({ rpc: rpc(calls), store, startHeight: START, network: "mainnet", log: SILENT });
    await applyConfirmedBlock(first, startBlock(), store, { treestate: () => Promise.resolve(null), log: SILENT });
    calls.length = 0;

    const again = await bootstrapChain({ rpc: rpc(calls), store, startHeight: 999, network: "mainnet", log: SILENT });
    expect(calls).toEqual([]);
    expect(again.height).toBe(START);
    expect(again.hash).toBe(h(0x5000));
    expect(again.pools.sapling.commitments.size()).toBe(501n);
    expect(again.pools.sapling.commitments.atPosition(500n)?.cmId).toBe(h(2));
    expect(again.pools.sapling.value.balance()).toBe(2_000n);
    expect(again.pools.sapling.anchors.maxPositionFor(h(0x7000))).toBe(500n);
  });

  it("corrupt: a lowest block with no snapshot for a pool is refused, not replayed as a base of zero", async () => {
    const store = new MemoryChainStore();
    const base: ChainBase = createChainState({
      height: START - 1,
      hash: h(0x4fff),
      pools: {
        sprout: { commitmentBase: 0n, openingBalanceZat: 0n },
        sapling: { commitmentBase: 0n, openingBalanceZat: 0n },
        orchard: { commitmentBase: 0n, openingBalanceZat: 0n },
        ironwood: { commitmentBase: 0n, openingBalanceZat: 0n },
      },
    }).base;
    await store.writeBase(base, 1);
    store.snapshots.splice(store.snapshots.findIndex((s) => s.pool === "orchard"), 1);
    await expect(
      bootstrapChain({ rpc: rpc([]), store, startHeight: START, network: "mainnet", log: SILENT }),
    ).rejects.toThrow(ChainRuntimeError);
  });
});
