/**
 * A3, A4 and A5 - the confirmed-block driver against a THIRD-PARTY endpoint:
 * one that is missing a method, and one that refuses mid-block (HANDOFF-16).
 *
 * THE FIRST TEST HERE IS A REPRODUCTION, NOT A REGRESSION GUARD. Section 1 of
 * this handoff said that an endpoint without `z_gettreestate` costs "the
 * Ironwood anchor never forms - the driver writes the block, logs the notice and
 * records no anchor". Driven against the shipped classes on merged `main`, that
 * is false: the `RpcError` for `-32601` propagates out of `applyConfirmedBlock`,
 * `isFatal` reads false because an `RpcError` is neither a `ChainRuntimeError`
 * nor a `ZCashRevealStateError`, and the loop re-fetches the SAME block forever.
 * `stalls without a tolerant source` below is that measurement, kept as a test
 * so the claim cannot quietly become true again in the other direction.
 *
 * THE BLOCKS ARE SYNTHETIC AND EVERY FIGURE THE DRIVER CHECKS IS CONSISTENT.
 * `applyConfirmedBlock` cross-checks its own per-pool delta, running balance and
 * commitment count against the node's `valuePools` and `trees` on the same
 * block, and throws on a disagreement. So a generator that got its arithmetic
 * wrong would fail here before it could certify anything - which is the same
 * argument `reorg-follower.test.ts` makes for its own builder.
 */
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { asHex, type Hex } from "@zcashreveal/types";
import type { GetTreestate, RpcBlock } from "@zcashreveal/zebra-rpc";
import { RpcError, RpcRateLimitError } from "@zcashreveal/zebra-rpc";

import { ChainFollower, isFatal, type FollowerRpc } from "../chain-follower.js";
import { ChainPersistenceError } from "../errors.js";
import { createChainState, type ChainBase } from "../chain-state.js";
import { MemoryChainStore } from "../chain-store.js";
import { absentTreestateSource, treestateSource } from "../treestate-source.js";

const SILENT = pino({ level: "silent" });
const H0 = asHex("00");
const BASE_HEIGHT = 1_700_000;
const OPENING = 10n ** 15n;
const BASE: ChainBase = {
  height: BASE_HEIGHT,
  hash: asHex(H0.repeat(31) + "b0"),
  pools: {
    sprout: { commitmentBase: 0n, openingBalanceZat: OPENING },
    sapling: { commitmentBase: 0n, openingBalanceZat: OPENING },
    orchard: { commitmentBase: 0n, openingBalanceZat: OPENING },
    ironwood: { commitmentBase: 0n, openingBalanceZat: OPENING },
  },
};
const idHex = (ns: number, n: number): Hex =>
  asHex((ns.toString(16).padStart(6, "0") + n.toString(16).padStart(58, "0")).slice(0, 64));

/** One block that appends `actions` Ironwood commitments, so the driver must fetch a treestate for it. */
function ironwoodBlock(height: number, prev: Hex, cumulativeSize: number, actions = 1): RpcBlock {
  const seq = height * 100;
  return {
    hash: idHex(0xb00, height),
    height,
    time: 1_600_000_000 + height * 75,
    previousblockhash: prev,
    tx: [
      {
        txid: idHex(0x100, seq),
        version: 6,
        locktime: 0,
        size: 0,
        vin: [],
        vout: [],
        vShieldedSpend: [],
        vShieldedOutput: [],
        valueBalanceZat: 0,
        orchard: { actions: [], valueBalanceZat: 0 },
        ironwood: {
          actions: Array.from({ length: actions }, (_unused, i) => ({
            cv: idHex(0x500, seq + i),
            nullifier: idHex(0x501, seq + i),
            rk: idHex(0x502, seq + i),
            cmx: idHex(0x503, seq + i),
            ephemeralKey: idHex(0x504, seq + i),
            encCiphertext: H0,
            outCiphertext: H0,
            spendAuthSig: H0,
          })),
          flags: { enableSpends: true, enableOutputs: true },
          valueBalanceZat: 0,
          anchor: idHex(0x505, seq),
          proof: H0,
          bindingSig: H0,
        },
      },
    ] as never,
    trees: { sapling: { size: 0 }, orchard: { size: 0 }, ironwood: { size: cumulativeSize } },
    valuePools: (["sprout", "sapling", "orchard", "ironwood"] as const).map((id) => ({
      id,
      chainValue: 0,
      chainValueZat: OPENING,
      valueDelta: 0,
      valueDeltaZat: 0n,
    })),
  } as RpcBlock;
}

/** The root a serving node reports for a block. Derived from its hash, so distinct per block. */
const rootOf = (b: RpcBlock): Hex => asHex("ee" + b.hash.slice(2));

interface NodeOptions {
  /** `-32601` for `z_gettreestate`, which is what the measured keyless gateway sends. */
  readonly treestateAbsent?: boolean;
  /** 1-based treestate call ordinals to answer with a 429. */
  readonly refuseTreestateAt?: ReadonlySet<number>;
}

class ThirdPartyNode implements FollowerRpc {
  treestateCalls = 0;
  blockCalls = 0;
  constructor(
    private readonly chain: readonly RpcBlock[],
    private readonly opts: NodeOptions = {},
  ) {}
  getBlockchainInfo(): Promise<{ blocks: number }> {
    return Promise.resolve({ blocks: this.chain[this.chain.length - 1]!.height });
  }
  getBlock(id: { height: number }): Promise<RpcBlock> {
    this.blockCalls += 1;
    const b = this.chain.find((x) => x.height === id.height);
    return b === undefined ? Promise.reject(new Error(`no block at ${id.height}`)) : Promise.resolve(b);
  }
  getBlockHeader(hash: Hex): Promise<{ height: number; hash: Hex }> {
    return Promise.resolve({ height: BASE_HEIGHT, hash });
  }
  getTreestate(id: { hash: Hex }): Promise<GetTreestate> {
    this.treestateCalls += 1;
    if (this.opts.treestateAbsent === true) {
      // THE DATA MUTATION. Not a deleted method on a double: the exact error the
      // shipped client raises for `{"error":{"code":-32601,...}}`, which is the
      // one the measured keyless endpoint answers for this method alone.
      return Promise.reject(new RpcError("Method not found", "z_gettreestate", [], -32601));
    }
    if (this.opts.refuseTreestateAt?.has(this.treestateCalls) === true) {
      return Promise.reject(new RpcRateLimitError("z_gettreestate", [], null));
    }
    const b = this.chain.find((x) => x.hash === id.hash);
    if (b === undefined) return Promise.reject(new RpcError("Block not found.", "z_gettreestate", [], -5));
    return Promise.resolve({
      hash: b.hash,
      height: b.height,
      time: b.time,
      sapling: { commitments: {} },
      orchard: { commitments: {} },
      ironwood: { commitments: { finalRoot: rootOf(b) } },
    });
  }
}

function followerOver(node: ThirdPartyNode, store: MemoryChainStore, treestate?: ReturnType<typeof treestateSource>) {
  return new ChainFollower(createChainState(BASE), {
    rpc: node,
    store,
    log: SILENT,
    pollIntervalMs: 0,
    sleep: () => new Promise<void>((r) => setImmediate(r)),
    ...(treestate === undefined ? {} : { treestate }),
    onFatal: (err) => {
      throw err;
    },
  });
}

const CHAIN = [
  ironwoodBlock(BASE_HEIGHT + 1, BASE.hash!, 1),
  ironwoodBlock(BASE_HEIGHT + 2, idHex(0xb00, BASE_HEIGHT + 1), 2),
];

describe("A3 - a missing z_gettreestate is a named absence, not a silent stall", () => {
  it("FAIL SIDE, BY DATA: the DEFAULT source against an endpoint answering -32601 STALLS - no block, no progress, forever", async () => {
    // The member of the exclusion set: an endpoint that serves every method and
    // answers -32601 for this one. This is the state `main` was in at f976477.
    const node = new ThirdPartyNode(CHAIN, { treestateAbsent: true });
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);

    const first = await follower.step().then(() => null, (e: unknown) => e);
    expect(first).toBeInstanceOf(RpcError);
    // NOT FATAL, which is what makes it a stall rather than a crash. A crash
    // would at least be visible in a restart loop.
    expect(isFatal(first)).toBe(false);
    expect(follower.chain.height).toBe(BASE_HEIGHT);
    expect((await store.readBlocks(0, 9_999_999)).map((b) => b.height)).toEqual([BASE_HEIGHT]);

    // The retry - which is what the loop does for a non-fatal error - is identical.
    const second = await follower.step().then(() => null, (e: unknown) => e);
    expect(second).toBeInstanceOf(RpcError);
    expect(follower.chain.height).toBe(BASE_HEIGHT);
    expect(node.treestateCalls).toBe(2);

    // AND THE STATE IS NOT DIRTY, which is the one thing that IS right here:
    // the treestate is fetched above every mutation (c53f2ba), so nothing was
    // appended and a working retry would succeed.
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(0n);
  });

  it("PASS SIDE: with the absence NAMED at startup, the same endpoint applies every block and records NO anchor", async () => {
    const node = new ThirdPartyNode(CHAIN, { treestateAbsent: true });
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const warn = vi.fn();
    const log = { ...SILENT, warn } as unknown as Parameters<typeof absentTreestateSource>[0];
    const follower = followerOver(node, store, absentTreestateSource(log));

    const a = await follower.step();
    const b = await follower.step();
    expect(a.kind).toBe("applied");
    expect(b.kind).toBe("applied");
    expect(follower.chain.height).toBe(BASE_HEIGHT + 2);
    expect((await store.readBlocks(0, 9_999_999)).map((x) => x.height)).toEqual([
      BASE_HEIGHT,
      BASE_HEIGHT + 1,
      BASE_HEIGHT + 2,
    ]);

    // NO ANCHOR, AND THE NOTICE NAMES WHY. Never a fabricated root.
    if (a.kind !== "applied" || b.kind !== "applied") throw new Error("unreachable");
    expect(a.block.anchors).toHaveLength(0);
    expect(a.block.notices.map((n) => n.code)).toContain("IRONWOOD_TREESTATE_ABSENT");
    expect(follower.chain.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    // NOT ONE REQUEST SPENT asking a method the endpoint has already refused.
    expect(node.treestateCalls).toBe(0);
    // And the permanence is stated rather than left to be discovered.
    expect(warn.mock.calls.map((c) => String(c[1])).join(" ")).toContain("NEVER");
  });
});

describe("A4 - a 429 mid-block leaves the chain uncorrupted and the block applies on retry", () => {
  it("PASS SIDE: the refusal lands on the treestate call inside applyConfirmedBlock, and the retry succeeds", async () => {
    // The member of the exclusion set A4 names: a state in which a refused
    // external call has already mutated chain state. The refusal is placed on
    // treestate call 1, which is inside `applyConfirmedBlock` for block 1.
    const node = new ThirdPartyNode(CHAIN, { refuseTreestateAt: new Set([1]) });
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);

    const refused = await follower.step().then(() => null, (e: unknown) => e);
    expect(refused).toBeInstanceOf(RpcRateLimitError);
    expect(isFatal(refused)).toBe(false);
    // NOTHING MUTATED. This is the whole assertion: no commitment appended, no
    // tip advanced, no anchor recorded, nothing written.
    expect(follower.chain.height).toBe(BASE_HEIGHT);
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(0n);
    expect(follower.chain.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    expect((await store.readBlocks(0, 9_999_999)).map((x) => x.height)).toEqual([BASE_HEIGHT]);

    // THE RETRY, and it must not raise CommitmentAlreadyExistsError.
    const applied = await follower.step();
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") throw new Error("unreachable");
    expect(follower.chain.height).toBe(BASE_HEIGHT + 1);
    expect(applied.block.anchors.map((x) => x.root)).toEqual([rootOf(CHAIN[0]!)]);
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(1n);
  });

  it("FAIL SIDE, BY DATA: a refusal on EVERY treestate call never applies the block and never corrupts it either", async () => {
    const node = new ThirdPartyNode(CHAIN, { refuseTreestateAt: new Set([1, 2, 3, 4, 5]) });
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);
    for (let i = 0; i < 5; i += 1) {
      const err = await follower.step().then(() => null, (e: unknown) => e);
      expect(err, `attempt ${String(i)}`).toBeInstanceOf(RpcRateLimitError);
    }
    // Five refused attempts, and the state is byte-identical to the base.
    expect(follower.chain.height).toBe(BASE_HEIGHT);
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(0n);
    expect((await store.readBlocks(0, 9_999_999)).map((x) => x.height)).toEqual([BASE_HEIGHT]);
  });
});

describe("A5 - the anchor's maxPosition is the block's own reported tree size minus one", () => {
  it("PASS SIDE: two blocks, sizes 1 and 2, give maxPosition 0 and 1", async () => {
    const node = new ThirdPartyNode(CHAIN);
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);
    const a = await follower.step();
    const b = await follower.step();
    if (a.kind !== "applied" || b.kind !== "applied") throw new Error("unreachable");
    expect(a.block.anchors).toHaveLength(1);
    expect(a.block.anchors[0]!.maxPosition).toBe(0n);
    expect(a.block.anchors[0]!.root).toBe(rootOf(CHAIN[0]!));
    expect(b.block.anchors[0]!.maxPosition).toBe(1n);
    // The anchor's maxPosition equals the node's reported size minus one, per block.
    expect(a.block.anchors[0]!.maxPosition).toBe(BigInt(CHAIN[0]!.trees!.ironwood!.size!) - 1n);
    expect(b.block.anchors[0]!.maxPosition).toBe(BigInt(CHAIN[1]!.trees!.ironwood!.size!) - 1n);
  });

  it("FAIL SIDE, BY DATA: the treestate withheld gives NO anchor and a logged finding - never a fabricated root", async () => {
    // The member of A5's exclusion set is "an anchor root the node never sent".
    // Withholding the treestate is the way to reach for one: if any root appears
    // here it was manufactured, because nothing sent one.
    const node = new ThirdPartyNode(CHAIN);
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store, () => Promise.resolve(null));
    const a = await follower.step();
    if (a.kind !== "applied") throw new Error("unreachable");
    expect(a.block.anchors).toHaveLength(0);
    expect(a.block.notices.map((n) => n.code)).toEqual(["IRONWOOD_TREESTATE_ABSENT"]);
    expect(follower.chain.pools.ironwood.anchors.snapshot().anchorCount).toBe(0);
    // The commitments still land - the block is real and its tree still grew.
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(1n);
  });

  it("a treestate naming a DIFFERENT block is refused, because a root from another block is worse than no root", async () => {
    const node = new ThirdPartyNode(CHAIN);
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const wrong = CHAIN[1]!;
    const follower = followerOver(node, store, () =>
      Promise.resolve({
        hash: wrong.hash,
        height: wrong.height,
        time: wrong.time,
        sapling: { commitments: {} },
        orchard: { commitments: {} },
        ironwood: { commitments: { finalRoot: rootOf(wrong) } },
      }),
    );
    const a = await follower.step();
    if (a.kind !== "applied") throw new Error("unreachable");
    expect(a.block.anchors).toHaveLength(0);
    expect(a.block.notices.map((n) => n.code)).toEqual(["IRONWOOD_TREESTATE_MISMATCH"]);
  });
});

describe("ROUND 4: a store failure is FATAL and named, not retried into a false consensus diagnosis", () => {
  /**
   * `applyConfirmedBlock` MUTATES `chain.pools.*` AND THEN WRITES. A transient
   * store failure therefore leaves the in-memory state holding a block the store
   * does not have, and the raw error is neither a `ChainRuntimeError` nor a
   * `ZCashRevealStateError` - so `isFatal` read false, the loop logged "retrying
   * after the poll interval", and the retry re-appended the same commitments and
   * raised `CommitmentAlreadyExistsError`, whose message says the build
   * disagrees with consensus. A dropped Postgres connection stopped the process
   * and blamed the decoder.
   *
   * This is `c53f2ba`'s shape one layer down, and the store write cannot be
   * hoisted above the mutations the way the treestate fetch was: the writes are
   * derived from the positions those mutations produce. So it stops on the FIRST
   * failure, under its own name, and a restart replays from the last block that
   * was actually written.
   */
  class RefusingStore extends MemoryChainStore {
    constructor(private readonly refuseFrom = 1) {
      super();
    }
    private writes = 0;
    override writeBlock(w: Parameters<MemoryChainStore["writeBlock"]>[0]): Promise<void> {
      this.writes += 1;
      if (this.writes >= this.refuseFrom) return Promise.reject(new Error("connection terminated unexpectedly"));
      return super.writeBlock(w);
    }
  }

  it("PASS SIDE: the failure is a ChainPersistenceError, isFatal is TRUE, and the tip did not advance", async () => {
    const node = new ThirdPartyNode(CHAIN);
    const store = new RefusingStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);

    const err = await follower.step().then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ChainPersistenceError);
    expect(isFatal(err)).toBe(true);
    expect(follower.chain.height).toBe(BASE_HEIGHT);
    // The message names the store and the remedy, not the decoder.
    expect((err as Error).message).toContain("the store refused block");
    expect((err as Error).message).toContain("replay");
    // And the underlying cause is carried rather than swallowed.
    expect(((err as ChainPersistenceError).cause as Error).message).toContain("connection terminated");
  });

  it("FAIL SIDE, BY DATA: the state IS dirty after the refusal, which is why retrying it was wrong", async () => {
    // The member of the exclusion set: an in-memory state holding a block the
    // store does not have. This is what the old code retried into.
    const node = new ThirdPartyNode(CHAIN);
    const store = new RefusingStore();
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);
    await follower.step().catch(() => undefined);

    // The commitments ARE appended - that is the dirty state, asserted rather
    // than assumed, because the whole argument for stopping rests on it.
    expect(follower.chain.pools.ironwood.commitments.size()).toBe(1n);
    expect((await store.readBlocks(0, 9_999_999)).map((b) => b.height)).toEqual([BASE_HEIGHT]);
    // And a retry - which the loop no longer performs - would raise the state
    // error that used to be reported as a consensus disagreement.
    const retry = await follower.step().then(() => null, (e: unknown) => e);
    expect(retry).not.toBeNull();
    expect(isFatal(retry)).toBe(true);
  });

  it("a store that ACCEPTS the block leaves nothing fatal, so the guard is not simply always-on", async () => {
    const node = new ThirdPartyNode(CHAIN);
    const store = new RefusingStore(99);
    await store.writeBase(BASE, 1);
    const follower = followerOver(node, store);
    const applied = await follower.step();
    expect(applied.kind).toBe("applied");
    expect(follower.chain.height).toBe(BASE_HEIGHT + 1);
  });
});
