/**
 * A4 - a reorg leaves the chain state equal to a fresh replay of the new
 * branch - as a property over the follower against a scripted node, beside
 * the named worked case and a fail side drawn from A4's own exclusion set.
 *
 * WHY THROUGH THE FOLLOWER AND NOT THROUGH `resolveReorg` ALONE. The follower
 * is what notices a reorg (a fetched block whose `previousblockhash` is not
 * our tip), what walks the headers to the split, what rolls back and replays,
 * and what then applies the competing branch block by block. A test that
 * called the pieces in the order it believed correct would be testing its own
 * belief; this one hands a scripted node to the shipped loop and asks whether
 * the state it converges to is the state the new chain implies.
 *
 * WHY SYNTHETIC BLOCKS. A reorg needs two branches from one height, and no
 * captured pair of competing mainnet blocks exists. The blocks here are built
 * to satisfy exactly what the driver checks - each carries the node-side
 * `valuePools` and `trees` its own transactions imply, cumulatively from the
 * base - so every one of the driver's cross-checks runs on every synthetic
 * block, and a generator that got its own arithmetic wrong would fail here
 * before it could certify anything.
 *
 * IN MEMORY, DELIBERATELY. `replayInto`'s only callers were two Postgres-gated
 * files, and a property placed behind that gate passes vacuously on a runner
 * without a database (section 5's note on A2). `MemoryChainStore` implements
 * the same contract as the Postgres store - the same per-table height column
 * on rollback - and it is that contract A4's fail side mutates.
 */
import fc from "fast-check";
import pino, { type Logger } from "pino";
import { describe, expect, it } from "vitest";
import { asHex, type Hex, type Pool, type RpcTransaction } from "@zcashreveal/types";
import type { GetTreestate, RpcBlock } from "@zcashreveal/zebra-rpc";

import { ChainFollower, type FollowerRpc } from "../chain-follower.js";
import { createChainState, POOLS, type ChainBase, type ChainState } from "../chain-state.js";
import { MemoryChainStore, type RollbackCounts } from "../chain-store.js";
import { replayChainState } from "../chain-replay.js";
import { applyConfirmedBlock, type TreestateSource } from "../confirmed-block.js";
import { findSplitHeight } from "../reorg.js";
import { ChainRuntimeError, ValueAccountingMismatchError } from "../errors.js";

const SILENT = pino({ level: "silent" });
/** Branded hex for the byte fields the decoder never reads. */
const H0 = asHex("00");
/** A sleep that YIELDS. A sleep resolving as a microtask starves the event loop and no test can stop the follower. */
const YIELD_SLEEP = () => new Promise<void>((resolve) => setImmediate(resolve));

/* ----------------------------------------------------------------------------
   Synthetic chain: every block consistent with what the driver checks
   ------------------------------------------------------------------------- */

/** What one synthetic transaction does. Deltas are in the BoundaryDelta convention: positive means value LEFT the pool. */
interface TxSpec {
  readonly saplingOutputs: number;
  readonly saplingSpends: number;
  readonly saplingDelta: bigint;
  readonly orchardActions: number;
  readonly orchardDelta: bigint;
  readonly ironwoodActions: number;
  readonly ironwoodDelta: bigint;
}
type BlockSpec = ReadonlyArray<TxSpec>;

/** A bundle that is not there moves no value: a spec whose pool has no activity carries a zero delta for it. */
function normalize(t: TxSpec): TxSpec {
  return {
    ...t,
    saplingDelta: t.saplingOutputs + t.saplingSpends > 0 ? t.saplingDelta : 0n,
    orchardDelta: t.orchardActions > 0 ? t.orchardDelta : 0n,
    ironwoodDelta: t.ironwoodActions > 0 ? t.ironwoodDelta : 0n,
  };
}

/** Pre-NU6.3, so Orchard's exit-only rule does not constrain the generator; large openings, so no balance goes negative. */
const BASE_HEIGHT = 1_700_000;
const OPENING = 10n ** 15n;
const BASE: ChainBase = {
  height: BASE_HEIGHT,
  hash: asHex(H0.repeat(31) + "b0"),
  pools: {
    sprout: { commitmentBase: 0n, openingBalanceZat: OPENING },
    sapling: { commitmentBase: 1_000n, openingBalanceZat: OPENING },
    orchard: { commitmentBase: 2_000n, openingBalanceZat: OPENING },
    ironwood: { commitmentBase: 3_000n, openingBalanceZat: OPENING },
  },
};

/** Unique 32-byte hex from a namespace and a counter - never random, never colliding. */
function idHex(ns: number, n: number): Hex {
  return asHex((ns.toString(16).padStart(6, "0") + n.toString(16).padStart(58, "0")).slice(0, 64));
}

/** The Ironwood root the scripted node reports for a block: derived from its hash, so distinct per block. */
function ironwoodRootOf(block: RpcBlock): Hex {
  return asHex("ee" + block.hash.slice(2));
}

interface Cursor {
  readonly ids: { n: number };
  balances: Record<Pool, bigint>;
  sizes: Record<"sapling" | "orchard" | "ironwood", bigint>;
  prevHash: Hex;
}

function cursorAt(base: ChainBase): Cursor {
  return {
    ids: { n: 0 },
    balances: {
      sprout: base.pools.sprout.openingBalanceZat,
      sapling: base.pools.sapling.openingBalanceZat,
      orchard: base.pools.orchard.openingBalanceZat,
      ironwood: base.pools.ironwood.openingBalanceZat,
    },
    sizes: {
      sapling: base.pools.sapling.commitmentBase,
      orchard: base.pools.orchard.commitmentBase,
      ironwood: base.pools.ironwood.commitmentBase,
    },
    prevHash: base.hash!,
  };
}

/**
 * Build one block at `height` from its spec, advancing the cursor's node-side
 * figures. Every identifier is namespaced by BRANCH as well as by kind, so a
 * competing branch built from the same counter values never shares a nullifier
 * or a commitment with the branch it replaces.
 */
function buildBlock(spec: BlockSpec, height: number, branch: number, cur: Cursor): RpcBlock {
  const next = () => (cur.ids.n += 1);
  const id = (ns: number) => idHex(ns + (branch << 12), next());
  const moved: Record<Pool, bigint> = { sprout: 0n, sapling: 0n, orchard: 0n, ironwood: 0n };
  const tx: RpcTransaction[] = spec.map(normalize).map((t) => {
    const txid = id(0x100);
    moved.sapling += t.saplingDelta;
    moved.orchard += t.orchardDelta;
    moved.ironwood += t.ironwoodDelta;
    cur.sizes.sapling += BigInt(t.saplingOutputs);
    cur.sizes.orchard += BigInt(t.orchardActions);
    cur.sizes.ironwood += BigInt(t.ironwoodActions);
    // Zebra emits the Orchard-shaped object unconditionally; an absent bundle
    // is `actions: []` with no anchor, flags, proof or binding signature.
    const shaped = (count: number, ns: number, valueBalanceZat: bigint) =>
      count === 0
        ? { actions: [], valueBalanceZat: 0 }
        : {
            actions: Array.from({ length: count }, () => ({
              cv: id(ns), nullifier: id(ns + 1), rk: id(ns), cmx: id(ns + 2),
              ephemeralKey: id(ns), encCiphertext: H0, outCiphertext: H0, spendAuthSig: H0,
            })),
            flags: { enableSpends: true, enableOutputs: true },
            valueBalanceZat: Number(valueBalanceZat),
            anchor: id(ns + 3),
            proof: H0,
            bindingSig: H0,
          };
    return {
      txid,
      version: t.ironwoodActions > 0 ? 6 : 5,
      locktime: 0,
      size: 0,
      vin: [],
      vout: [],
      vShieldedSpend: Array.from({ length: t.saplingSpends }, () => ({
        cv: id(0x200), anchor: id(0x201), nullifier: id(0x202), rk: id(0x200), proof: H0, spendAuthSig: H0,
      })),
      vShieldedOutput: Array.from({ length: t.saplingOutputs }, () => ({
        cv: id(0x300), cmu: id(0x301), ephemeralKey: id(0x300), encCiphertext: H0, outCiphertext: H0, proof: H0,
      })),
      valueBalanceZat: Number(t.saplingDelta),
      orchard: shaped(t.orchardActions, 0x400, t.orchardDelta),
      ...(t.ironwoodActions > 0 ? { ironwood: shaped(t.ironwoodActions, 0x500, t.ironwoodDelta) } : {}),
    } as RpcTransaction;
  });
  for (const pool of POOLS) cur.balances[pool] -= moved[pool];
  const hash = idHex(0xb00 + branch, height);
  const block: RpcBlock = {
    hash,
    height,
    time: 1_600_000_000 + height * 75,
    tx,
    previousblockhash: cur.prevHash,
    ...(spec.some((t) => t.saplingOutputs > 0) ? { finalsaplingroot: idHex(0x600 + branch, height) } : {}),
    ...(spec.some((t) => t.orchardActions > 0) ? { finalorchardroot: idHex(0x700 + branch, height) } : {}),
    trees: {
      sapling: { size: Number(cur.sizes.sapling) },
      orchard: { size: Number(cur.sizes.orchard) },
      ironwood: { size: Number(cur.sizes.ironwood) },
    },
    valuePools: POOLS.map((pool) => ({
      id: pool,
      chainValue: 0,
      chainValueZat: cur.balances[pool],
      valueDelta: 0,
      valueDeltaZat: -moved[pool],
    })),
  };
  cur.prevHash = hash;
  return block;
}

/** A whole branch: `specs[i]` becomes the block at `from + i`, extending `cur`. */
function buildBranch(specs: ReadonlyArray<BlockSpec>, from: number, branch: number, cur: Cursor): RpcBlock[] {
  return specs.map((spec, i) => buildBlock(spec, from + i, branch, cur));
}

/* ----------------------------------------------------------------------------
   The scripted node
   ------------------------------------------------------------------------- */

/** A node that serves one chain, remembers every block it has ever served a header for, and can switch chains. */
class ScriptedNode implements FollowerRpc {
  private chain: RpcBlock[];
  private readonly known = new Map<Hex, RpcBlock>();
  constructor(chain: RpcBlock[]) {
    this.chain = chain;
    for (const b of chain) this.known.set(b.hash, b);
  }
  switchTo(chain: RpcBlock[]): void {
    this.chain = chain;
    for (const b of chain) this.known.set(b.hash, b);
  }
  getBlockchainInfo(): Promise<{ blocks: number }> {
    return Promise.resolve({ blocks: this.chain[this.chain.length - 1]!.height });
  }
  getBlock(id: { height: number }): Promise<RpcBlock> {
    const b = this.chain.find((x) => x.height === id.height);
    if (b === undefined) return Promise.reject(new Error(`no block at ${id.height}`));
    return Promise.resolve(b);
  }
  getBlockHeader(hash: Hex): Promise<{ height: number; hash: Hex; previousblockhash?: Hex | undefined }> {
    const b = this.known.get(hash);
    if (b === undefined) return Promise.reject(new Error(`unknown header ${hash}`));
    return Promise.resolve({ height: b.height, hash: b.hash, ...(b.previousblockhash === undefined ? {} : { previousblockhash: b.previousblockhash }) });
  }
  getTreestate(id: { hash: Hex }): Promise<GetTreestate> {
    const b = this.known.get(id.hash);
    if (b === undefined) return Promise.reject(new Error(`unknown treestate ${id.hash}`));
    return Promise.resolve({
      hash: b.hash,
      height: b.height,
      time: b.time,
      sapling: { commitments: {} },
      orchard: { commitments: {} },
      ironwood: { commitments: { finalRoot: ironwoodRootOf(b) } },
    });
  }
  /** The same treestate the follower gets, for the fresh replay it is compared with. */
  treestate(): TreestateSource {
    return (hash) => this.getTreestate({ hash });
  }
}

/* ----------------------------------------------------------------------------
   Comparing two chain states
   ------------------------------------------------------------------------- */

/** Everything A4 quantifies over: commitment count, nullifier set, value balance, and the anchors, per pool. */
function fingerprint(chain: ChainState, nullifiers: ReadonlyArray<{ pool: Pool; nfId: Hex }>): Record<string, unknown> {
  const out: Record<string, unknown> = { height: chain.height, hash: chain.hash };
  for (const pool of POOLS) {
    const s = chain.pools[pool];
    out[pool] = {
      commitments: s.commitments.size(),
      balance: s.value.balance(),
      anchors: s.anchors.snapshot().anchorCount,
      spent: nullifiers.filter((n) => n.pool === pool).map((n) => [n.nfId, s.nullifiers.isSpent(n.nfId)]),
    };
  }
  return out;
}

function nullifiersOf(blocks: ReadonlyArray<RpcBlock>): Array<{ pool: Pool; nfId: Hex }> {
  const out: Array<{ pool: Pool; nfId: Hex }> = [];
  for (const b of blocks) {
    for (const t of b.tx) {
      for (const s of t.vShieldedSpend ?? []) out.push({ pool: "sapling", nfId: s.nullifier });
      for (const a of t.orchard?.actions ?? []) out.push({ pool: "orchard", nfId: a.nullifier });
      for (const a of t.ironwood?.actions ?? []) out.push({ pool: "ironwood", nfId: a.nullifier });
    }
  }
  return out;
}

/** A fresh state from the base, applying `blocks` in order to a fresh store: the reference A4 names. */
async function freshReplay(blocks: ReadonlyArray<RpcBlock>, treestate: TreestateSource): Promise<ChainState> {
  const chain = createChainState(BASE);
  const store = new MemoryChainStore();
  await store.writeBase(BASE, 1);
  for (const b of blocks) await applyConfirmedBlock(chain, b, store, { treestate, log: SILENT });
  return chain;
}

/** Run the follower one decision at a time until it reports idle. Returns every step taken. */
async function followUntilIdle(follower: ChainFollower, maxSteps = 200): Promise<string[]> {
  const steps: string[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const r = await follower.step();
    steps.push(r.kind === "reorg" ? `reorg@${r.splitHeight}` : r.kind);
    if (r.kind === "idle") return steps;
  }
  throw new Error("the follower did not reach idle");
}

/* ----------------------------------------------------------------------------
   Arbitraries
   ------------------------------------------------------------------------- */

const txSpec: fc.Arbitrary<TxSpec> = fc
  .record({
    saplingOutputs: fc.integer({ min: 0, max: 2 }),
    saplingSpends: fc.integer({ min: 0, max: 2 }),
    saplingDelta: fc.bigInt({ min: -5_000n, max: 5_000n }),
    orchardActions: fc.integer({ min: 0, max: 2 }),
    orchardDelta: fc.bigInt({ min: -5_000n, max: 5_000n }),
    ironwoodActions: fc.integer({ min: 0, max: 2 }),
    ironwoodDelta: fc.bigInt({ min: -5_000n, max: 5_000n }),
  })
  .map(normalize);
const blockSpec: fc.Arbitrary<BlockSpec> = fc.array(txSpec, { minLength: 0, maxLength: 3 });

/** A chain of 4 to 8 blocks, a reorg 1 to 3 blocks deep, and a competing branch longer by 1 to 3. */
const scenario = fc
  .record({
    a: fc.array(blockSpec, { minLength: 4, maxLength: 8 }),
    depth: fc.integer({ min: 1, max: 3 }),
    extra: fc.integer({ min: 1, max: 3 }),
    b: fc.array(blockSpec, { minLength: 6, maxLength: 6 }),
  })
  .map(({ a, depth, extra, b }) => ({ a, depth, b: b.slice(0, depth + extra) }));

interface Built {
  readonly chainA: RpcBlock[];
  readonly chainB: RpcBlock[];
  readonly splitHeight: number;
}

/** Build both chains from their specs. B shares A's first `len(A) - depth` blocks byte for byte and then diverges. */
function build(s: { a: ReadonlyArray<BlockSpec>; depth: number; b: ReadonlyArray<BlockSpec> }): Built {
  const curA = cursorAt(BASE);
  const chainA = buildBranch(s.a, BASE_HEIGHT + 1, 0, curA);
  const splitHeight = BASE_HEIGHT + s.a.length - s.depth;
  const curB = cursorAt(BASE);
  const shared = buildBranch(s.a.slice(0, s.a.length - s.depth), BASE_HEIGHT + 1, 0, curB);
  const branch = buildBranch(s.b, splitHeight + 1, 1, curB);
  return { chainA, chainB: [...shared, ...branch], splitHeight };
}

/* ----------------------------------------------------------------------------
   The property, its worked case, and its fail side
   ------------------------------------------------------------------------- */

async function runReorg(built: Built, store: MemoryChainStore): Promise<{ follower: ChainFollower; node: ScriptedNode; steps: string[] }> {
  const node = new ScriptedNode(built.chainA);
  await store.writeBase(BASE, 1);
  const follower = new ChainFollower(createChainState(BASE), {
    rpc: node,
    store,
    log: SILENT,
    pollIntervalMs: 0,
    sleep: YIELD_SLEEP,
    onFatal: (err) => {
      throw err;
    },
  });
  await followUntilIdle(follower);
  node.switchTo(built.chainB);
  const steps = await followUntilIdle(follower);
  return { follower, node, steps };
}

describe("A4 - after a reorg the chain state equals a fresh replay of the new branch", () => {
  it("the property, over random chains and reorgs 1 to 3 deep (100 runs)", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const built = build(s);
        const { follower, node, steps } = await runReorg(built, new MemoryChainStore());
        expect(steps).toContain(`reorg@${built.splitHeight}`);
        const all = nullifiersOf([...built.chainA, ...built.chainB]);
        expect(fingerprint(follower.chain, all)).toEqual(fingerprint(await freshReplay(built.chainB, node.treestate()), all));
      }),
      { numRuns: 100 },
    );
  });

  it("the named worked case: a 3-block reorg from H to H-3, then a 4-block competing branch", async () => {
    // Every pool moves in every block, so each quantity A4 quantifies over is
    // non-trivial: commitments appended, nullifiers spent, value crossing,
    // anchors recorded - Ironwood's through the treestate.
    const busy: TxSpec = { saplingOutputs: 2, saplingSpends: 1, saplingDelta: -700n, orchardActions: 1, orchardDelta: 300n, ironwoodActions: 2, ironwoodDelta: -900n };
    const quiet: TxSpec = { saplingOutputs: 1, saplingSpends: 0, saplingDelta: 250n, orchardActions: 2, orchardDelta: -40n, ironwoodActions: 1, ironwoodDelta: 10n };
    const H = BASE_HEIGHT + 6;
    const built = build({ a: [[busy], [quiet], [busy, quiet], [quiet], [busy], [quiet, busy]], depth: 3, b: [[quiet], [busy, busy], [quiet], [busy]] });
    expect(built.chainA[built.chainA.length - 1]!.height).toBe(H);
    expect(built.splitHeight).toBe(H - 3);

    const store = new MemoryChainStore();
    const { follower, node, steps } = await runReorg(built, store);
    expect(steps).toEqual(["reorg@1700003", "applied", "applied", "applied", "applied", "idle"]);
    expect(follower.chain.height).toBe(H + 1);

    const all = nullifiersOf([...built.chainA, ...built.chainB]);
    const fresh = await freshReplay(built.chainB, node.treestate());
    expect(fingerprint(follower.chain, all)).toEqual(fingerprint(fresh, all));
    // The orphaned branch's nullifiers are UNSPENT again, and the new branch's are spent.
    const orphaned = nullifiersOf(built.chainA.slice(3));
    const adopted = nullifiersOf(built.chainB.slice(3));
    expect(orphaned.length).toBeGreaterThan(0);
    for (const n of orphaned) expect(follower.chain.pools[n.pool].nullifiers.isSpent(n.nfId), `orphaned ${n.nfId}`).toBe(false);
    for (const n of adopted) expect(follower.chain.pools[n.pool].nullifiers.isSpent(n.nfId), `adopted ${n.nfId}`).toBe(true);
    // The orphaned Ironwood anchors are gone and the adopted ones are present.
    for (const b of built.chainA.slice(3)) expect(follower.chain.pools.ironwood.anchors.hasRoot(ironwoodRootOf(b))).toBe(false);
    for (const b of built.chainB.slice(3)) expect(follower.chain.pools.ironwood.anchors.hasRoot(ironwoodRootOf(b))).toBe(true);
    // And the store agrees with the state it was replayed from.
    expect((await store.readBlocks(0, 9_999_999)).map((b) => b.height)).toEqual([BASE_HEIGHT, ...built.chainB.map((b) => b.height)]);
    expect((await store.readHighestBlock())?.hash).toBe(built.chainB[built.chainB.length - 1]!.hash);
  });

  it("FAIL STATE, BY DATA: a rollback that omits one pool's boundary flows leaves a balance from a rolled-back height, and the property fails on it", async () => {
    // The member A4's exclusion set names. Same scenario, a store whose
    // rollback keeps Orchard's flows above the split - which is what a rollback
    // missing one table did to pool_snapshots and blocks in HANDOFF-09b.
    class OrchardFlowsSurvive extends MemoryChainStore {
      override async rollbackToHeight(height: number): Promise<RollbackCounts> {
        const kept = this.boundaryFlows.filter((f) => f.record.pool === "orchard" && f.record.height > height);
        const counts = await super.rollbackToHeight(height);
        this.boundaryFlows.push(...kept);
        return counts;
      }
    }
    const busy: TxSpec = { saplingOutputs: 1, saplingSpends: 0, saplingDelta: -100n, orchardActions: 1, orchardDelta: 300n, ironwoodActions: 1, ironwoodDelta: -50n };
    const built = build({ a: [[busy], [busy], [busy], [busy], [busy], [busy]], depth: 3, b: [[busy], [busy], [busy], [busy]] });

    // The mutant either produces a state the property rejects, or the replay
    // itself trips over the surviving flows - the driver's own value check
    // fires on the first block of the new branch. Both are "not equal to a
    // fresh replay of the new branch"; neither is a green run.
    const stringify = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));
    let outcome: "unequal" | "threw" | "equal";
    try {
      const { follower, node } = await runReorg(built, new OrchardFlowsSurvive());
      const all = nullifiersOf([...built.chainA, ...built.chainB]);
      outcome = stringify(fingerprint(follower.chain, all)) === stringify(fingerprint(await freshReplay(built.chainB, node.treestate()), all)) ? "equal" : "unequal";
    } catch (err) {
      outcome = err instanceof ValueAccountingMismatchError || err instanceof ChainRuntimeError ? "threw" : "equal";
    }
    expect(outcome).not.toBe("equal");
  });

  it("FAIL STATE, BY DATA, WITH NO CODE CHANGED: one rolled-back flow row put back into the store makes the replay disagree", async () => {
    // THE SECOND FAIL SIDE, AND THE ONE THE RULE ACTUALLY ASKS FOR. The case
    // above sabotages `rollbackToHeight` - a CODE mutation, which proves the
    // comparison is wired and not that it discriminates over data
    // (CLAUDE.md, LEDGER-09a Q2). Here every line of shipped code runs
    // untouched and the mutation is a VALUE drawn from A4's exclusion set: a
    // boundary-flow row at a height above the split, taken from the branch the
    // rollback correctly deleted, written straight back into the store's rows.
    const busy: TxSpec = { saplingOutputs: 1, saplingSpends: 0, saplingDelta: -100n, orchardActions: 1, orchardDelta: 300n, ironwoodActions: 1, ironwoodDelta: -50n };
    const built = build({ a: [[busy], [busy], [busy], [busy], [busy], [busy]], depth: 3, b: [[busy], [busy], [busy], [busy]] });
    const store = new MemoryChainStore();

    // Keep one of branch A's flows before the reorg deletes it - a real row
    // this store really held, at a height above the split.
    const { follower, node } = await runReorg(built, store);
    const stale = { id: 10_000, record: { pool: "orchard" as const, txid: idHex(0, 999), height: built.splitHeight + 1, deltaZat: 300n }, txSeq: 0 };
    const all = nullifiersOf([...built.chainA, ...built.chainB]);
    const stringify = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));
    const expected = stringify(fingerprint(await freshReplay(built.chainB, node.treestate()), all));

    // PASS SIDE FIRST, so the comparison is known to be capable of equality on
    // this store: replaying the untouched store reproduces the follower's own
    // state, which is the new branch.
    expect(stringify(fingerprint(await replayChainState(BASE, store, "mainnet"), all))).toBe(expected);
    expect(stringify(fingerprint(follower.chain, all))).toBe(expected);

    // THE DATA MUTATION. One row back, nothing else touched.
    store.boundaryFlows.push(stale);
    expect(stringify(fingerprint(await replayChainState(BASE, store, "mainnet"), all))).not.toBe(expected);
  });
});

describe("the follower's two kinds of error", () => {
  it("a transport failure is retried after the poll interval; the loop keeps running and the state is untouched", async () => {
    const built = build({ a: [[], []], depth: 1, b: [[]] });
    let failOnce = true;
    const node = new ScriptedNode(built.chainA);
    const flaky: FollowerRpc = {
      getBlockchainInfo: () => node.getBlockchainInfo(),
      getBlock: (id) => {
        if (failOnce) {
          failOnce = false;
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return node.getBlock(id);
      },
      getBlockHeader: (h) => node.getBlockHeader(h),
      getTreestate: (id) => node.getTreestate(id),
    };
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const sleeps: number[] = [];
    let fatal: unknown = null;
    const follower = new ChainFollower(createChainState(BASE), {
      rpc: flaky,
      store,
      log: SILENT,
      pollIntervalMs: 7,
      sleep: (ms) => {
        sleeps.push(ms);
        return YIELD_SLEEP();
      },
      onFatal: (err) => {
        fatal = err;
      },
    });
    follower.start();
    for (let i = 0; i < 200 && follower.chain.height < BASE_HEIGHT + 2; i++) await YIELD_SLEEP();
    await follower.stop();
    expect(fatal).toBeNull();
    expect(follower.chain.height).toBe(BASE_HEIGHT + 2);
    expect(sleeps[0]).toBe(7);
  });

  it("a consensus disagreement stops the loop and hands the error to onFatal; nothing is written", async () => {
    const cur = cursorAt(BASE);
    const good = buildBlock([{ saplingOutputs: 1, saplingSpends: 0, saplingDelta: -10n, orchardActions: 0, orchardDelta: 0n, ironwoodActions: 0, ironwoodDelta: 0n }], BASE_HEIGHT + 1, 0, cur);
    // The node's own accounting, one zatoshi off ours.
    const bad: RpcBlock = { ...good, valuePools: good.valuePools!.map((p) => (p.id === "sapling" ? { ...p, valueDeltaZat: p.valueDeltaZat! + 1n } : p)) };
    const node = new ScriptedNode([bad]);
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    let fatal: unknown = null;
    const follower = new ChainFollower(createChainState(BASE), {
      rpc: node,
      store,
      log: SILENT,
      pollIntervalMs: 0,
      sleep: YIELD_SLEEP,
      onFatal: (err) => {
        fatal = err;
      },
    });
    follower.start();
    for (let i = 0; i < 200 && fatal === null; i++) await YIELD_SLEEP();
    await follower.stop();
    expect(fatal).toBeInstanceOf(ValueAccountingMismatchError);
    expect((await store.readHighestBlock())?.height).toBe(BASE_HEIGHT);
  });
});

/* ----------------------------------------------------------------------------
   The two edges a gate round found: a side effect that fails after the commit,
   and a rollback whose replay did not land.
   ------------------------------------------------------------------------- */

/** A logger that keeps what it was told, so a claim about a log line is checked by reading the line. */
function capturing(): { log: Logger; lines: Array<{ level: string; obj: Record<string, unknown>; msg: string }> } {
  const lines: Array<{ level: string; obj: Record<string, unknown>; msg: string }> = [];
  const at = (level: string) => (obj: unknown, msg?: string) => {
    lines.push({ level, obj: obj as Record<string, unknown>, msg: msg ?? "" });
  };
  const log = { info: at("info"), warn: at("warn"), error: at("error"), fatal: at("fatal"), debug: at("debug"), trace: at("trace") } as unknown as Logger;
  return { log, lines };
}

const ONE: TxSpec = { saplingOutputs: 1, saplingSpends: 0, saplingDelta: -100n, orchardActions: 1, orchardDelta: 300n, ironwoodActions: 1, ironwoodDelta: -50n };

describe("onApplied fails AFTER the block is committed", () => {
  it("does not re-apply the block, does not stop the loop, and says the anchors are lost rather than 'retrying'", async () => {
    // The block is written and the chain advanced before `onApplied` runs, so
    // a throw there is not a step to retry - the next step fetches the NEXT
    // block. Before the fix the throw escaped into the loop's generic handler,
    // which logged "retrying after the poll interval" and then moved on
    // anyway: the anchors were dropped silently while the log said they would
    // be retried. Found by a gate reviewer.
    const cur = cursorAt(BASE);
    const blocks = buildBranch([[ONE], [ONE], [ONE]], BASE_HEIGHT + 1, 0, cur);
    const node = new ScriptedNode(blocks);
    const store = new MemoryChainStore();
    await store.writeBase(BASE, 1);
    const { log, lines } = capturing();
    const seen: number[] = [];
    const follower = new ChainFollower(createChainState(BASE), {
      rpc: node,
      store,
      log,
      pollIntervalMs: 0,
      sleep: YIELD_SLEEP,
      onApplied: (applied) => {
        seen.push(applied.height);
        if (applied.height === BASE_HEIGHT + 1) throw new Error("redis: connection reset");
      },
      onFatal: (err) => {
        throw err;
      },
    });
    const steps = await followUntilIdle(follower);

    // Every block applied exactly once, in order, and the loop reached idle.
    expect(steps).toEqual(["applied", "applied", "applied", "idle"]);
    expect(seen).toEqual([BASE_HEIGHT + 1, BASE_HEIGHT + 2, BASE_HEIGHT + 3]);
    expect(follower.chain.height).toBe(BASE_HEIGHT + 3);

    // And the loss is named at the height it happened, as a loss.
    const errors = lines.filter((l) => l.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toMatch(/onApplied failed AFTER the block was committed/);
    expect(errors[0]?.obj["height"]).toBe(BASE_HEIGHT + 1);
    expect(String(errors[0]?.msg)).not.toMatch(/retry/i);
    // The block itself IS in the store - which is why it must not be retried.
    expect((await store.readBlocks(BASE_HEIGHT + 1, BASE_HEIGHT + 1))[0]?.height).toBe(BASE_HEIGHT + 1);
  });
});

describe("a rollback that committed and a replay that did not", () => {
  it("resumes on the next reorg instead of reporting a consensus disagreement", async () => {
    const built = build({ a: [[ONE], [ONE], [ONE], [ONE], [ONE], [ONE]], depth: 3, b: [[ONE], [ONE], [ONE], [ONE]] });
    const store = new MemoryChainStore();
    const node = new ScriptedNode(built.chainA);
    await store.writeBase(BASE, 1);
    const follower = new ChainFollower(createChainState(BASE), {
      rpc: node,
      store,
      log: SILENT,
      pollIntervalMs: 0,
      sleep: YIELD_SLEEP,
      onFatal: (err) => {
        throw err;
      },
    });
    await followUntilIdle(follower);

    // THE STATE THIS TEST IS ABOUT, PRODUCED BY DATA RATHER THAN BY A STUB:
    // the store is rolled back - committed, exactly as `resolveReorg` does -
    // and the follower's chain is left where it was, which is what happens
    // when the replay after that rollback fails transiently.
    await store.rollbackToHeight(built.splitHeight);
    expect(follower.chain.height).toBe(BASE_HEIGHT + 6);
    expect((await store.readHighestBlock())?.height).toBe(built.splitHeight);

    // FAIL SIDE: the walk as it was, bounded by the CALLER's tip, asks the
    // store for a height it has correctly deleted. `isFatal` reads that error
    // as a consensus disagreement and the process exits on it.
    const staleWalk = async (): Promise<number> => {
      const b = built.chainB[built.chainB.length - 1]!;
      let hash = b.previousblockhash;
      let height = b.height - 1;
      while (height >= BASE.height) {
        const ours = (await store.readBlocks(height, height))[0];
        if (ours === undefined) throw new ChainRuntimeError(`this store holds no block at ${height}`);
        if (ours.hash === hash) return height;
        hash = (await node.getBlockHeader(hash!)).previousblockhash;
        height -= 1;
      }
      throw new Error("below base");
    };
    await expect(staleWalk()).rejects.toThrow(ChainRuntimeError);

    // PASS SIDE: the shipped walk, bounded by the STORE's tip, finds the split
    // and the follower converges on the new branch.
    node.switchTo(built.chainB);
    const steps = await followUntilIdle(follower);
    expect(steps.some((s) => s.startsWith("reorg@"))).toBe(true);
    const all = nullifiersOf([...built.chainA, ...built.chainB]);
    const stringify = (v: unknown) => JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? x.toString() : x));
    expect(stringify(fingerprint(follower.chain, all))).toBe(stringify(fingerprint(await freshReplay(built.chainB, node.treestate()), all)));
    expect(await findSplitHeight(follower.chain, store, node, built.chainB[built.chainB.length - 1]!)).toBeGreaterThanOrEqual(built.splitHeight);
  });
});
