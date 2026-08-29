import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  asHex,
  type Hex,
  type RpcTransaction,
  type RpcSaplingSpend,
  type RpcSaplingOutput,
  type RpcOrchardAction,
  type RpcOrchardBundle,
} from "@zcashreveal/types";
import { decodeBlock } from "../block-decoder.js";
import type { RpcBlock } from "@zcashreveal/zebra-rpc";

// ── Fixtures-as-code ────────────────────────────────────────────────────────
// 64-hex-char value from a seed; uniqueness is per-test and irrelevant to the
// decoder (it copies bytes through verbatim), so a counter is enough.
const hx = (seed: number): Hex => asHex(seed.toString(16).padStart(64, "0"));

function saplingSpend(seed: number): RpcSaplingSpend {
  return {
    cv: hx(seed),
    anchor: hx(seed + 1),
    nullifier: hx(seed + 2),
    rk: hx(seed + 3),
    proof: hx(seed + 4),
    spendAuthSig: hx(seed + 5),
  };
}

function saplingOutput(seed: number): RpcSaplingOutput {
  return {
    cv: hx(seed),
    cmu: hx(seed + 1),
    ephemeralKey: hx(seed + 2),
    encCiphertext: hx(seed + 3),
    outCiphertext: hx(seed + 4),
    proof: hx(seed + 5),
  };
}

function orchardAction(seed: number): RpcOrchardAction {
  return {
    cv: hx(seed),
    nullifier: hx(seed + 1),
    rk: hx(seed + 2),
    cmx: hx(seed + 3),
    ephemeralKey: hx(seed + 4),
    encCiphertext: hx(seed + 5),
    outCiphertext: hx(seed + 6),
    spendAuthSig: hx(seed + 7),
  };
}

function orchardBundle(opts: {
  actions: RpcOrchardAction[];
  valueBalanceZat?: number;
  anchor?: Hex;
  enableSpends?: boolean;
  enableOutputs?: boolean;
}): RpcOrchardBundle {
  return {
    actions: opts.actions,
    flags: {
      enableSpends: opts.enableSpends ?? true,
      enableOutputs: opts.enableOutputs ?? true,
    },
    valueBalanceZat: opts.valueBalanceZat ?? 0,
    anchor: opts.anchor ?? hx(0xa0),
    proof: hx(0xb0),
    bindingSig: hx(0xb1),
  };
}

// `exactOptionalPropertyTypes` is on, so optional fields are spread in only
// when present rather than ever assigned `undefined`.
function makeTx(opts: {
  txid: Hex;
  vShieldedSpend?: RpcSaplingSpend[];
  vShieldedOutput?: RpcSaplingOutput[];
  valueBalanceZat?: number;
  orchard?: RpcOrchardBundle;
  coinbase?: boolean;
}): RpcTransaction {
  return {
    txid: opts.txid,
    version: 5,
    locktime: 0,
    size: 0,
    vin: opts.coinbase ? [{ sequence: 0xffffffff, coinbase: hx(0xc0de) }] : [],
    vout: [],
    ...(opts.vShieldedSpend ? { vShieldedSpend: opts.vShieldedSpend } : {}),
    ...(opts.vShieldedOutput ? { vShieldedOutput: opts.vShieldedOutput } : {}),
    ...(opts.valueBalanceZat !== undefined
      ? { valueBalanceZat: opts.valueBalanceZat }
      : {}),
    ...(opts.orchard ? { orchard: opts.orchard } : {}),
  };
}

function makeBlock(opts: {
  height?: number;
  hash?: Hex;
  time?: number;
  finalsaplingroot?: Hex;
  finalorchardroot?: Hex;
  tx: RpcTransaction[];
}): RpcBlock {
  return {
    height: opts.height ?? 1_700_000,
    hash: opts.hash ?? hx(0xdead),
    time: opts.time ?? 1_600_000_000,
    tx: opts.tx,
    ...(opts.finalsaplingroot
      ? { finalsaplingroot: opts.finalsaplingroot }
      : {}),
    ...(opts.finalorchardroot
      ? { finalorchardroot: opts.finalorchardroot }
      : {}),
  };
}

// ── Real-fixture guard (skipped until the fixture JSON lands in a follow-up) ──
// Resolves apps/indexer/test/fixtures/blocks/ relative to this test file, so it
// works regardless of the cwd vitest is launched from. The suite is skipped
// when no `mainnet-*.json` capture is present (Docker/zebrad currently down);
// it activates automatically once the fixture is committed.
const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "test",
  "fixtures",
  "blocks",
);

/**
 * EVERY capture in the directory, not the lexicographically first one.
 *
 * It was `.sort()[0]`, and heights sort as STRINGS: a pre-NU6.3
 * `mainnet-1700512-*.json` sorts before a post-NU6.3 `mainnet-3428200-*.json`.
 * So committing an Ironwood capture beside any other one would have dropped
 * the Ironwood one silently, left the suite green, and let a report truthfully
 * say "the real-fixture suite passes" about a file nobody opened. The README
 * already promised the opposite - "the test discovers any file matching
 * `mainnet-*.json`" - so the code was the half that was wrong.
 *
 * `synthetic-*.json` is deliberately outside this glob: a fixture a session
 * wrote must never be mistaken for evidence a node produced.
 */
function findMainnetFixtures(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f) => /^mainnet-.*\.json$/.test(f))
    .sort()
    .map((f) => join(FIXTURES_DIR, f));
}

const fixturePaths = findMainnetFixtures();

describe.skipIf(fixturePaths.length === 0)(
  "decodeBlock — real mainnet fixture",
  () => {
    it("decodes a captured post-NU5 mainnet block end-to-end", () => {
      // The title is pinned: `scripts/assert-no-skipped-integration.mjs` keys
      // its one ALLOWED_SKIPS entry on this exact string, so renaming it turns
      // the sanctioned skip into a CI failure. The loop is inside the `it` for
      // that reason - every capture is asserted, under one title.
      expect(fixturePaths.length).toBeGreaterThan(0);

      for (const path of fixturePaths) {
        const raw = JSON.parse(readFileSync(path, "utf8")) as RpcBlock;
        const decoded = decodeBlock(raw);

        expect(decoded.hash, path).toBe(raw.hash);
        expect(decoded.height, path).toBe(raw.height);
        expect(decoded.time, path).toBe(raw.time);
        expect(decoded.txs, path).toHaveLength(raw.tx.length);

        // §2 selection criteria guarantee every pool sees activity in a
        // capture. Ironwood joined them in HANDOFF-07, and with it the floor
        // moved to post-NU6.3: a capture that satisfied the old post-NU5 floor
        // can contain no Ironwood at all, and this suite would then report as
        // coverage of a four-pool decoder while exercising three.
        const sawSapling = decoded.txs.some(
          (t) => t.saplingSpends.length > 0 || t.saplingOutputs.length > 0,
        );
        const sawOrchard = decoded.txs.some((t) => t.orchardActions.length > 0);
        const sawIronwood = decoded.txs.some((t) => t.ironwoodActions.length > 0);
        expect(sawSapling, path).toBe(true);
        expect(sawOrchard, path).toBe(true);
        expect(sawIronwood, path).toBe(true);

        // Every pool that advanced and HAS a block-level root → the anchor
        // mirrors the header root. That is two pools, not three.
        expect(decoded.saplingAnchor?.root, path).toBe(raw.finalsaplingroot);
        expect(decoded.orchardAnchor?.root, path).toBe(raw.finalorchardroot);

        // IRONWOOD IS THE LOAD-BEARING ASSERTION OF THIS SUITE AND IT ASKS A
        // DIFFERENT QUESTION SINCE HANDOFF-08. It used to assert that the
        // capture confirmed an inferred `finalironwoodroot`; L2 read Zebra's
        // source and there is no such field (LEDGER-07 Q5). What a real capture
        // now settles is the OTHER half - that `trees.ironwood.size` is really
        // sent, and really equals the tree size, on a block that moved the pool.
        // A capture failing here means PR #10888's shape is not what this build
        // parses, which is exactly the outcome wanted.
        expect(decoded.ironwoodAnchorPendingTreestate, `${path}: block moved Ironwood`).toBe(true);
        expect(
          decoded.ironwoodTreeSize,
          `${path}: trees.ironwood.size absent on a block that moved Ironwood`,
        ).not.toBeNull();
        expect(decoded.ironwoodTreeSize, path).toBe(
          raw.trees?.ironwood?.size === undefined ? null : BigInt(raw.trees.ironwood.size),
        );
      }
    });
  },
);

// ── Synthetic suite (full validation surface for this PR) ────────────────────
describe("decodeBlock — boundary delta sign convention (synthetic)", () => {
  it("preserves Sapling valueBalanceZat sign: shielding < 0, unshielding > 0, intra-pool = 0", () => {
    // Sign convention mirrors RPC valueBalanceZat and the BoundaryDelta type:
    // shielding (t→z) enters the pool (negative); unshielding (z→t) leaves it
    // (positive); a pure intra-pool transfer moves nothing across the boundary.
    const shielding = makeTx({ txid: hx(1), valueBalanceZat: -100_000 });
    const unshielding = makeTx({ txid: hx(2), valueBalanceZat: 100_000 });
    const intra = makeTx({ txid: hx(3), valueBalanceZat: 0 });

    const decoded = decodeBlock(
      makeBlock({ tx: [shielding, unshielding, intra] }),
    );

    expect(decoded.txs[0]?.saplingValueBalanceZat).toBe(-100_000n);
    expect(decoded.txs[1]?.saplingValueBalanceZat).toBe(100_000n);
    expect(decoded.txs[2]?.saplingValueBalanceZat).toBe(0n);
    expect(typeof decoded.txs[0]?.saplingValueBalanceZat).toBe("bigint");
  });
});

describe("decodeBlock — block-level Sapling anchor (synthetic)", () => {
  it("copies finalsaplingroot into saplingAnchor when the block has Sapling outputs", () => {
    const root = hx(0x5a91);
    const tx = makeTx({ txid: hx(1), vShieldedOutput: [saplingOutput(0x10)] });
    const decoded = decodeBlock(
      makeBlock({ height: 1_700_500, finalsaplingroot: root, tx: [tx] }),
    );
    expect(decoded.saplingAnchor).not.toBeNull();
    expect(decoded.saplingAnchor?.pool).toBe("sapling");
    expect(decoded.saplingAnchor?.root).toBe(root);
    expect(decoded.saplingAnchor?.height).toBe(1_700_500);
  });

  it("emits no Sapling anchor unless BOTH finalsaplingroot and in-block outputs are present", () => {
    const root = hx(0x5a91);
    // Outputs but no header root → null.
    const outputsNoRoot = decodeBlock(
      makeBlock({
        tx: [makeTx({ txid: hx(1), vShieldedOutput: [saplingOutput(0x10)] })],
      }),
    );
    expect(outputsNoRoot.saplingAnchor).toBeNull();

    // Header root carried forward but no outputs in this block (root unchanged
    // from prior block) → null, so 7B records no duplicate anchor.
    const rootNoOutputs = decodeBlock(
      makeBlock({ finalsaplingroot: root, tx: [makeTx({ txid: hx(2) })] }),
    );
    expect(rootNoOutputs.saplingAnchor).toBeNull();
  });

  it("a Sapling SPEND does not advance the tree, so it does not produce an anchor either", () => {
    // THE ASSERTION THAT PUTS `saplingSpend` TO WORK. It has been the only
    // eslint warning in this repository since HANDOFF-00 - a fixture builder
    // declared for symmetry with the other three and never called - and every
    // handoff from 00 to 06 deferred it, because HANDOFF-00 forbade edits under
    // `apps/*/src` and this file is under it. HANDOFF-07 owns this directory,
    // so the deferral ends here.
    //
    // Deleting the builder was the other option. Using it is better, because
    // the rule it exercises is the one this block is ABOUT and was asserted
    // only from the negative side: the anchor gate is
    // `saplingHadOutputs && finalsaplingroot`, and OUTPUTS is the load-bearing
    // word. Spends consume commitments and append none, so a block full of them
    // does not advance the tree and its root carries no new information. Until
    // now nothing checked that a spend was not enough - the test above proves
    // an EMPTY transaction is not enough, which is a weaker statement.
    const root = hx(0x5a91);
    const spendOnly = decodeBlock(
      makeBlock({
        finalsaplingroot: root,
        tx: [makeTx({ txid: hx(3), vShieldedSpend: [saplingSpend(0x20)] })],
      }),
    );
    expect(spendOnly.txs[0]?.saplingSpends).toHaveLength(1);
    expect(spendOnly.saplingAnchor).toBeNull();

    // PASS SIDE, so the assertion is about spends rather than about anchors
    // never being emitted: add one output to the same block and the anchor
    // appears.
    const spendAndOutput = decodeBlock(
      makeBlock({
        finalsaplingroot: root,
        tx: [
          makeTx({
            txid: hx(4),
            vShieldedSpend: [saplingSpend(0x20)],
            vShieldedOutput: [saplingOutput(0x30)],
          }),
        ],
      }),
    );
    expect(spendAndOutput.saplingAnchor?.root).toBe(root);
  });
});

describe("decodeBlock — block-level Orchard anchor (synthetic)", () => {
  it("surfaces every action's nullifier and cmx, the bundle anchor, and finalorchardroot", () => {
    const root = hx(0x07c4);
    const bundleAnchor = hx(0xa11c);
    const tx = makeTx({
      txid: hx(1),
      orchard: orchardBundle({
        actions: [orchardAction(0x100), orchardAction(0x200)],
        valueBalanceZat: -250_000,
        anchor: bundleAnchor,
      }),
    });
    const decoded = decodeBlock(
      makeBlock({ height: 1_700_700, finalorchardroot: root, tx: [tx] }),
    );

    const dtx = decoded.txs[0];
    expect(dtx?.orchardActions).toHaveLength(2);
    // Every Orchard action publishes BOTH a nullifier and a cmx — confirm the
    // decoder carries both for each action rather than splitting them.
    for (const a of dtx?.orchardActions ?? []) {
      expect(a.nullifier).toBeTruthy();
      expect(a.cmx).toBeTruthy();
    }
    expect(dtx?.orchardAnchor).toBe(bundleAnchor);
    expect(dtx?.orchardValueBalanceZat).toBe(-250_000n);
    expect(typeof dtx?.orchardValueBalanceZat).toBe("bigint");
    expect(dtx?.orchardFlags).toEqual({
      enableSpends: true,
      enableOutputs: true,
    });

    // Actions advanced the Orchard tree → block-level anchor mirrors the root.
    expect(decoded.orchardAnchor?.pool).toBe("orchard");
    expect(decoded.orchardAnchor?.root).toBe(root);
    expect(decoded.orchardAnchor?.height).toBe(1_700_700);
  });

  it("emits no Orchard anchor unless BOTH finalorchardroot and in-block actions are present", () => {
    const root = hx(0x07c4);
    // Actions but no header root → null.
    const actionsNoRoot = decodeBlock(
      makeBlock({
        tx: [
          makeTx({
            txid: hx(1),
            orchard: orchardBundle({ actions: [orchardAction(0x100)] }),
          }),
        ],
      }),
    );
    expect(actionsNoRoot.orchardAnchor).toBeNull();

    // Header root but no actions in this block → null.
    const rootNoActions = decodeBlock(
      makeBlock({ finalorchardroot: root, tx: [makeTx({ txid: hx(2) })] }),
    );
    expect(rootNoActions.orchardAnchor).toBeNull();
  });
});

describe("decodeBlock — per-tx mapping (synthetic)", () => {
  it("assigns contiguous 0-based indexes and preserves txid order", () => {
    const txs = [
      makeTx({ txid: hx(0xaa), coinbase: true }),
      makeTx({ txid: hx(0xbb) }),
      makeTx({ txid: hx(0xcc) }),
    ];
    const decoded = decodeBlock(makeBlock({ tx: txs }));
    expect(decoded.txs.map((t) => t.index)).toEqual([0, 1, 2]);
    expect(decoded.txs.map((t) => t.txid)).toEqual([
      hx(0xaa),
      hx(0xbb),
      hx(0xcc),
    ]);
  });
});

describe("decodeBlock — degenerate / defaults (synthetic)", () => {
  it("returns an empty shielded surface and null anchors for a coinbase-only block", () => {
    const decoded = decodeBlock(
      makeBlock({
        // Header carries both roots, but no commitments advance in this block.
        finalsaplingroot: hx(0x5a91),
        finalorchardroot: hx(0x07c4),
        tx: [makeTx({ txid: hx(0xc0), coinbase: true })],
      }),
    );
    expect(decoded.txs).toHaveLength(1);
    const t = decoded.txs[0];
    expect(t?.saplingSpends).toEqual([]);
    expect(t?.saplingOutputs).toEqual([]);
    expect(t?.orchardActions).toEqual([]);
    expect(decoded.saplingAnchor).toBeNull();
    expect(decoded.orchardAnchor).toBeNull();
  });

  it("defaults a missing valueBalanceZat and an absent Orchard bundle to 0n / empty / null", () => {
    const decoded = decodeBlock(makeBlock({ tx: [makeTx({ txid: hx(1) })] }));
    const t = decoded.txs[0];
    expect(t?.saplingValueBalanceZat).toBe(0n);
    expect(t?.orchardValueBalanceZat).toBe(0n);
    expect(t?.orchardActions).toEqual([]);
    expect(t?.orchardAnchor).toBeNull();
    expect(t?.orchardFlags).toBeNull();
  });
});

describe("decodeBlock — purity (synthetic)", () => {
  it("is deterministic and does not mutate its input", () => {
    const block = makeBlock({
      height: 1_700_900,
      finalsaplingroot: hx(0x5a91),
      finalorchardroot: hx(0x07c4),
      tx: [
        makeTx({
          txid: hx(1),
          vShieldedOutput: [saplingOutput(0x10)],
          valueBalanceZat: -1,
        }),
        makeTx({
          txid: hx(2),
          orchard: orchardBundle({
            actions: [orchardAction(0x100)],
            valueBalanceZat: 5,
          }),
        }),
      ],
    });
    // RpcBlock holds only numbers/strings, so a plain JSON snapshot is a sound
    // mutation tripwire.
    const snapshot = JSON.stringify(block);

    const a = decodeBlock(block);
    const b = decodeBlock(block);

    expect(a).toEqual(b);
    expect(JSON.stringify(block)).toBe(snapshot);
  });
});
