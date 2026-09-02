/**
 * The confirmed-block driver over the four committed captures (A1, and
 * deliverable 2's assertion), through the REAL client.
 *
 * Each capture is pushed through `ZebraRpc.getBlock` with a transport that
 * answers with the file's bytes, so the block the driver sees is the block the
 * client produces - the seam rule, again - and then applied to a chain state
 * opened at the base the block's own figures imply. The driver compares its
 * per-pool delta, its running balance and its commitment count with the
 * node's on every block and throws on a disagreement; this suite asserts the
 * same equalities explicitly, so a green run is not only "it did not throw".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { asHex, type Hex } from "@zcashreveal/types";
import { ZebraRpc, type FetchLike, type GetTreestate, type RpcBlock } from "@zcashreveal/zebra-rpc";

import { chainBaseFromBlock, createChainState, valuePoolEntry, POOLS } from "../chain-state.js";
import { MemoryChainStore } from "../chain-store.js";
import { applyConfirmedBlock, type TreestateSource } from "../confirmed-block.js";
import { ChainContinuityError, TreeSizeMismatchError, ValueAccountingMismatchError } from "../errors.js";

const FIXTURES = join(import.meta.dirname, "../../../test/fixtures/blocks");
const CAPTURES = {
  first: "mainnet-3432130-9eb351.json",
  second: "mainnet-3441955-54b709.json",
  predecessor: "mainnet-3444836-1e5057.json",
  conforming: "mainnet-3444837-274151.json",
} as const;

const SILENT = pino({ level: "silent" });

/** The capture, as `rpc.getBlock()` hands it to the indexer - never as `JSON.parse` would. */
async function load(name: string, mutate?: (raw: Record<string, unknown>) => void): Promise<RpcBlock> {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, unknown>;
  if (mutate !== undefined) mutate(raw);
  const fetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ result: raw, error: null, id: 1 }),
    text: () => Promise.resolve(JSON.stringify({ result: raw, error: null, id: 1 })),
  });
  const rpc = new ZebraRpc({ url: "http://127.0.0.1:8232", fetch, sleep: () => Promise.resolve() });
  return rpc.getBlock({ height: raw["height"] as number });
}

const withheld: TreestateSource = () => Promise.resolve(null);

/** A treestate that answers for exactly the block asked for, with the given Ironwood root. */
function treestateFor(block: RpcBlock, ironwoodRoot: Hex | null): TreestateSource {
  return (hash) => {
    if (hash !== block.hash) return Promise.resolve(null);
    const t: GetTreestate = {
      hash: block.hash,
      height: block.height,
      time: block.time,
      sapling: { commitments: {} },
      orchard: { commitments: {} },
      ...(ironwoodRoot === null ? {} : { ironwood: { commitments: { finalRoot: ironwoodRoot } } }),
    };
    return Promise.resolve(t);
  };
}

describe("A1 - the driver's per-pool accounting equals the node's, on every committed capture", () => {
  for (const [label, name] of Object.entries(CAPTURES)) {
    it(`${label} (${name}): deltas equal valueDeltaZat, balances equal chainValueZat, counts equal trees sizes`, async () => {
      const block = await load(name);
      const chain = createChainState(chainBaseFromBlock(block));
      const store = new MemoryChainStore();
      const applied = await applyConfirmedBlock(chain, block, store, { treestate: withheld, log: SILENT });

      for (const pool of POOLS) {
        const entry = valuePoolEntry(block, pool);
        expect(entry, `${pool} entry`).toBeDefined();
        expect(applied.accounting[pool].deltaZat, `${pool} delta`).toBe(entry!.valueDeltaZat);
        expect(applied.accounting[pool].balanceZat, `${pool} balance`).toBe(entry!.chainValueZat);
        expect(chain.pools[pool].value.balance(), `${pool} state balance`).toBe(entry!.chainValueZat);
      }
      for (const pool of ["sapling", "orchard", "ironwood"] as const) {
        expect(chain.pools[pool].commitments.size(), `${pool} tree size`).toBe(BigInt(block.trees![pool]!.size!));
      }
      // The chain advanced, the store holds the block, one snapshot per pool.
      expect(chain.height).toBe(block.height);
      expect(chain.hash).toBe(block.hash);
      expect((await store.readBlocks(block.height, block.height))[0]?.hash).toBe(block.hash);
      for (const pool of POOLS) {
        const snap = (await store.readSnapshots(pool, block.height, block.height))[0];
        expect(snap?.balanceZat, `${pool} snapshot`).toBe(valuePoolEntry(block, pool)!.chainValueZat);
      }
      // Nothing about the transparent pool or the lockbox is claimed: they are
      // not pools this state machine tracks, and the driver reads only the
      // four it does.
      expect(applied.notices.filter((n) => n.code === "VALUE_POOLS_ABSENT")).toEqual([]);
      expect(applied.notices.filter((n) => n.code === "TREES_ABSENT")).toEqual([]);
    });
  }

  it("the consecutive pair carries the balance across: 3,444,836's closing figures open 3,444,837", async () => {
    const a = await load(CAPTURES.predecessor);
    const b = await load(CAPTURES.conforming);
    const chain = createChainState(chainBaseFromBlock(a));
    const store = new MemoryChainStore();
    await applyConfirmedBlock(chain, a, store, { treestate: withheld, log: SILENT });
    const applied = await applyConfirmedBlock(chain, b, store, { treestate: withheld, log: SILENT });
    for (const pool of POOLS) {
      expect(applied.accounting[pool].balanceZat, pool).toBe(valuePoolEntry(b, pool)!.chainValueZat);
    }
    expect(chain.pools.ironwood.commitments.size()).toBe(48_470n);
    expect(chain.pools.ironwood.commitments.indexedCount()).toBe(3n);
    expect(chain.height).toBe(3_444_837);
    expect((await store.readBlocks(0, 9_999_999)).map((r) => r.height)).toEqual([3_444_836, 3_444_837]);
  });

  it("FAIL STATE, BY DATA (A1): one pool's valueDeltaZat altered by ONE zatoshi is refused, naming the pool", async () => {
    // The smallest member of A1's exclusion set. The mutation is applied to the
    // capture BEFORE it goes through the client, so the block the driver sees
    // is exactly what a node whose accounting disagreed with ours would send.
    const block = await load(CAPTURES.conforming, (raw) => {
      const pools = raw["valuePools"] as Array<{ id: string; valueDeltaZat: number }>;
      pools.find((p) => p.id === "sapling")!.valueDeltaZat += 1;
    });
    const chain = createChainState(chainBaseFromBlock(await load(CAPTURES.conforming)));
    await expect(
      applyConfirmedBlock(chain, block, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(ValueAccountingMismatchError);
    await expect(
      applyConfirmedBlock(createChainState(chainBaseFromBlock(await load(CAPTURES.conforming))), block, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(/sapling at 3444837: this build's delta is 875651408 zat and the node's valueDeltaZat is 875651409/);
  });

  it("FAIL STATE, BY DATA (A1): a chainValueZat one zatoshi off is refused on the balance", async () => {
    const block = await load(CAPTURES.conforming, (raw) => {
      const pools = raw["valuePools"] as Array<{ id: string; chainValueZat: number }>;
      pools.find((p) => p.id === "ironwood")!.chainValueZat += 1;
    });
    const chain = createChainState(chainBaseFromBlock(await load(CAPTURES.conforming)));
    await expect(
      applyConfirmedBlock(chain, block, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(/ironwood at 3444837: this build's balance is 262194764371577 zat and the node's chainValueZat is 262194764371578/);
  });

  it("FAIL STATE, BY DATA: a tree size one off is refused, naming the pool and both counts", async () => {
    const block = await load(CAPTURES.conforming, (raw) => {
      (raw["trees"] as { orchard: { size: number } }).orchard.size += 1;
    });
    const chain = createChainState(chainBaseFromBlock(await load(CAPTURES.conforming)));
    await expect(
      applyConfirmedBlock(chain, block, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(TreeSizeMismatchError);
  });

  it("a block that does not extend the chain is refused before anything is touched", async () => {
    const a = await load(CAPTURES.predecessor);
    const b = await load(CAPTURES.conforming);
    const chain = createChainState(chainBaseFromBlock(b));
    // The base names 3,444,836 as its predecessor hash; a block whose
    // previousblockhash is something else does not extend it.
    const forged = { ...b, previousblockhash: asHex("ff".repeat(32)) };
    const before = chain.pools.sapling.commitments.size();
    await expect(
      applyConfirmedBlock(chain, forged, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(ChainContinuityError);
    expect(chain.pools.sapling.commitments.size()).toBe(before);
    // And a height gap is refused the same way.
    await expect(
      applyConfirmedBlock(createChainState(chainBaseFromBlock(a)), b, new MemoryChainStore(), { treestate: withheld, log: SILENT }),
    ).rejects.toThrow(ChainContinuityError);
  });
});

describe("deliverable 2 - the Ironwood anchor, from z_gettreestate, at exactly the heights the decoder marks", () => {
  const ROOT = asHex("ae2935f1dfd8a24aed7c70df7de3a668eb7a49b1319880dde2bbd9031ae5d82f");

  it("PASS STATE: a block that appended Ironwood commitments records an anchor whose maxPosition is the block's tree size minus one", async () => {
    const block = await load(CAPTURES.conforming);
    const chain = createChainState(chainBaseFromBlock(block));
    const store = new MemoryChainStore();
    let calls = 0;
    const source: TreestateSource = (hash) => {
      calls += 1;
      return treestateFor(block, ROOT)(hash);
    };
    const applied = await applyConfirmedBlock(chain, block, store, { treestate: source, log: SILENT });

    expect(calls).toBe(1);
    const anchor = chain.pools.ironwood.anchors.getByRoot(ROOT);
    expect(anchor).toEqual({ pool: "ironwood", root: ROOT, heightCreated: 3_444_837, maxPosition: 48_469n });
    expect(anchor!.maxPosition).toBe(BigInt(block.trees!.ironwood!.size!) - 1n);
    // Cross-checked, not taken on trust: the tree-size check proved our count
    // equals the node's before the anchor was recorded against it.
    expect(chain.pools.ironwood.commitments.size()).toBe(anchor!.maxPosition + 1n);
    expect(applied.anchors.map((a) => a.pool).sort()).toEqual(["ironwood", "orchard", "sapling"]);
    expect((await store.readAllAnchors("ironwood")).map((a) => a.root)).toEqual([ROOT]);
    expect(applied.notices).toEqual([]);
  });

  it("FAIL STATE: with the treestate WITHHELD there is no anchor and a logged notice, never a fabricated root", async () => {
    const block = await load(CAPTURES.conforming);
    const chain = createChainState(chainBaseFromBlock(block));
    const store = new MemoryChainStore();
    const applied = await applyConfirmedBlock(chain, block, store, { treestate: withheld, log: SILENT });

    expect(chain.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    expect(applied.anchors.map((a) => a.pool).sort()).toEqual(["orchard", "sapling"]);
    expect(await store.readAllAnchors("ironwood")).toEqual([]);
    expect(applied.notices.map((n) => n.code)).toEqual(["IRONWOOD_TREESTATE_ABSENT"]);
    // The block itself is still applied: an anchor is one fact about it, and
    // withholding that fact does not withhold the block.
    expect(chain.height).toBe(3_444_837);
  });

  it("FAIL STATE: a treestate naming ANOTHER block is refused, and one with no Ironwood root records nothing", async () => {
    const block = await load(CAPTURES.conforming);
    const other = await load(CAPTURES.predecessor);

    const wrongBlock: TreestateSource = () => treestateFor(other, ROOT)(other.hash);
    const chainA = createChainState(chainBaseFromBlock(block));
    const a = await applyConfirmedBlock(chainA, block, new MemoryChainStore(), { treestate: wrongBlock, log: SILENT });
    expect(chainA.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    expect(a.notices.map((n) => n.code)).toEqual(["IRONWOOD_TREESTATE_MISMATCH"]);

    const chainB = createChainState(chainBaseFromBlock(block));
    const b = await applyConfirmedBlock(chainB, block, new MemoryChainStore(), { treestate: treestateFor(block, null), log: SILENT });
    expect(chainB.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    expect(b.notices.map((n) => n.code)).toEqual(["IRONWOOD_ROOT_ABSENT"]);
  });

  it("a block that did NOT move Ironwood never asks for a treestate", async () => {
    // 3,444,836 is the predecessor: two transactions, no Ironwood actions.
    // "At exactly the heights decodeBlock marks" has a fail side too - the
    // call must not happen where the flag is false, or a pool most blocks do
    // not move would cost a second RPC on every block.
    const block = await load(CAPTURES.predecessor);
    let calls = 0;
    const counting: TreestateSource = () => {
      calls += 1;
      return Promise.resolve(null);
    };
    const chain = createChainState(chainBaseFromBlock(block));
    await applyConfirmedBlock(chain, block, new MemoryChainStore(), { treestate: counting, log: SILENT });
    expect(calls).toBe(0);
    expect(chain.pools.ironwood.commitments.indexedCount()).toBe(0n);
  });

  it("a transport failure fetching the treestate propagates: the block is NOT applied, so the anchor is retried with it", async () => {
    const block = await load(CAPTURES.conforming);
    const chain = createChainState(chainBaseFromBlock(block));
    const failing: TreestateSource = () => Promise.reject(new Error("socket hang up"));
    await expect(
      applyConfirmedBlock(chain, block, new MemoryChainStore(), { treestate: failing, log: SILENT }),
    ).rejects.toThrow(/socket hang up/);
    expect(chain.height).toBe(3_444_836);
  });
});
