/**
 * Assessments on the LIVE path (HANDOFF-12, A3): `analyze()` handed a chain
 * state assesses every spend whose anchor the state has recorded and names
 * every anchor it has not; `RoundTripIndex` handed the same state assesses
 * every link it makes; and the report the real producer builds crosses the
 * real wire and comes back bigint for bigint.
 *
 * THE THIRD OF THOSE IS THE HALF OF A3 THAT `wire-seam.test.ts` COULD NOT
 * CLOSE. That file states the round trip as a property over generated trees
 * and runs a hand-built report through it as the worked case - but a
 * hand-built report is the seam rule's own counter-example: two suites can be
 * exhaustive about a TYPE and both wrong about the WIRE because each builds
 * its own input (CLAUDE.md, LEDGER-11). Here the input is what `analyze()`
 * actually returns, assessment and all, and the only fixture is the
 * transaction and the tree it is assessed against.
 *
 * Every fail side is a DATA mutation drawn from the assertion's stated
 * exclusion set: a spend citing an anchor the state has not recorded; a link
 * whose deposit is not yet in the tree; the untagged wire form; and, for the
 * amount-match height, the mempool clock the filter must NOT be given.
 */
import { describe, expect, it } from "vitest";
import {
  asHex,
  reviveWire,
  serializeWire,
  type Hex,
  type LeakReport,
  type LinkRecord,
  type RpcOrchardAction,
  type RpcSaplingSpend,
  type RpcTransaction,
  type RpcVout,
  type ShieldedPool,
  type SpendAnnotation,
  type Zatoshi,
} from "@zcashreveal/types";

import type { AnchorRegistry } from "../../decoder/anchor-depth.js";
import { analyze, type AnalyzeContext } from "../../decoder/leak-analyzer.js";
import { PoolState, type PoolStates } from "../../state/pool-state.js";
import { RoundTripIndex } from "../round-trip.js";
import { amountMatchFilter } from "../scoring.js";
import { rawCandidateRange } from "../candidate-set.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hexOf = (bytes: number): Hex => asHex("ab".repeat(bytes));

/** The same 32 bytes in the opposite order - the spelling Zebra #10461 gives an Orchard-shaped anchor. */
function reverseHex(hex: Hex): Hex {
  return asHex(Buffer.from(hex, "hex").reverse().toString("hex"));
}

/* ----------------------------------------------------------------------------
   The chain state: four pools, populated by hand at known heights.
   ------------------------------------------------------------------------- */

function emptyStates(): PoolStates {
  return {
    sprout: new PoolState("sprout"),
    sapling: new PoolState("sapling"),
    orchard: new PoolState("orchard"),
    ironwood: new PoolState("ironwood"),
  };
}

/**
 * Append `count` commitments to `pool` at `height`, ids `first`, `first+1`, ...
 * Returns the position of the first one.
 */
function appendAt<P extends ShieldedPool>(states: PoolStates, pool: P, height: number, first: number, count: number): bigint {
  let position = -1n;
  for (let i = 0; i < count; i += 1) {
    const p = states[pool].commitments.append({ pool, cmId: h(first + i), txid: h(0xc000 + first + i), height });
    if (i === 0) position = p;
  }
  return position;
}

/** Record `root` over everything appended so far, created at `height`. */
function anchorAt<P extends ShieldedPool>(states: PoolStates, pool: P, root: Hex, height: number): void {
  states[pool].recordAnchor({ pool, root, heightCreated: height, maxPosition: states[pool].commitments.size() - 1n });
}

/* ----------------------------------------------------------------------------
   The transaction, in the shape a node serialises.
   ------------------------------------------------------------------------- */

function offlineRegistry(): AnchorRegistry {
  return { getHeightForAnchor: () => Promise.resolve(null) } as unknown as AnchorRegistry;
}

function context(chainState?: PoolStates): AnalyzeContext {
  return {
    tipHeight: 3_500_000,
    seenAt: 1_755_900_000,
    anchorRegistry: offlineRegistry(),
    recentAnchorThreshold: 100,
    ...(chainState === undefined ? {} : { chainState }),
  };
}


function transparentOutput(valueZat: number): RpcVout {
  return {
    value: valueZat / 100_000_000,
    valueZat,
    n: 0,
    scriptPubKey: { asm: "", hex: hexOf(25), type: "pubkeyhash", addresses: ["t1probe"] },
  };
}

function saplingSpend(anchor: Hex, nullifier: Hex): RpcSaplingSpend {
  return { cv: hexOf(32), anchor, nullifier, rk: hexOf(32), proof: hexOf(192), spendAuthSig: hexOf(64) };
}

function orchardAction(nullifier: Hex): RpcOrchardAction {
  return {
    cv: hexOf(32),
    nullifier,
    rk: hexOf(32),
    cmx: hexOf(32),
    ephemeralKey: hexOf(32),
    encCiphertext: hexOf(580),
    outCiphertext: hexOf(80),
    spendAuthSig: hexOf(64),
  };
}

/** A Sapling unshield: one spend citing `anchor`, value leaving the pool to a transparent output. */
function saplingUnshield(spends: RpcSaplingSpend[], valueZat = 250_000_000): RpcTransaction {
  return {
    txid: h(0xf1),
    version: 5,
    locktime: 0,
    vin: [],
    vout: [transparentOutput(valueZat - 10_000)],
    vShieldedSpend: spends,
    valueBalanceZat: valueZat,
  };
}

const ROOT_S = h(0x5001);
const ROOT_O = h(0x6001);
const UNKNOWN = h(0x7001);

/** Sapling: 12 commitments at 1_000, anchored by ROOT_S. Orchard: 2_000 commitments at 2_000, anchored by ROOT_O. */
function populatedStates(): PoolStates {
  const states = emptyStates();
  appendAt(states, "sapling", 1_000, 0x100, 12);
  anchorAt(states, "sapling", ROOT_S, 1_000);
  appendAt(states, "orchard", 2_000, 0x300, 2_000);
  anchorAt(states, "orchard", ROOT_O, 2_000);
  return states;
}

function unknownAnchorFindings(report: LeakReport) {
  return report.findings.filter((f) => f.code === "UNKNOWN_ANCHOR");
}

/* ----------------------------------------------------------------------------
   analyze() with a chain state.
   ------------------------------------------------------------------------- */

describe("analyze() with a chain state (A3): every spend whose anchor the state has is assessed", () => {
  it("PASS STATE: a Sapling spend citing a recorded anchor carries a raw assessment over Cand_0", async () => {
    const report = await analyze(saplingUnshield([saplingSpend(ROOT_S, h(0x11))]), context(populatedStates()));
    const spend = report.spends[0];
    expect(spend?.pool).toBe("sapling");
    expect(spend?.assessment).toBeDefined();
    // Cand_0 is every position the anchor commits to: maxPosition + 1.
    expect(spend?.assessment?.rawCount).toBe(12n);
    expect(spend?.assessment?.effectiveSetSize).toBe(12n);
    expect(spend?.assessment?.anchorRoot).toBe(ROOT_S);
    expect(spend?.assessment?.pool).toBe("sapling");
    expect(spend?.assessment?.appliedFilters).toEqual([]);
    expect(spend?.assessment?.claimLevel).toBe("small_heuristic_set");
    expect(unknownAnchorFindings(report)).toEqual([]);
  });

  it("PASS STATE: an Orchard action citing the bundle's recorded anchor is assessed in the Orchard pool", async () => {
    const tx: RpcTransaction = {
      txid: h(0xf2),
      version: 5,
      locktime: 0,
      vin: [],
      vout: [transparentOutput(99_990_000)],
      orchard: { actions: [orchardAction(h(0x21)), orchardAction(h(0x22))], valueBalanceZat: 100_000_000, anchor: ROOT_O },
    };
    const report = await analyze(tx, context(populatedStates()));
    expect(report.spends.map((s) => s.pool)).toEqual(["orchard", "orchard"]);
    for (const s of report.spends) {
      expect(s.assessment?.rawCount).toBe(2_000n);
      expect(s.assessment?.claimLevel).toBe("aggregate_only");
    }
    expect(unknownAnchorFindings(report)).toEqual([]);
  });

  it("FAIL STATE, BY DATA: a spend citing an anchor the state has NOT recorded gets no assessment and one UNKNOWN_ANCHOR finding", async () => {
    // The member of the exclusion set: an anchor drawn from outside the
    // state's recorded roots. No assessment is fabricated for it.
    const report = await analyze(saplingUnshield([saplingSpend(UNKNOWN, h(0x11))]), context(populatedStates()));
    expect(report.spends[0]?.assessment).toBeUndefined();
    expect("assessment" in (report.spends[0] as SpendAnnotation)).toBe(false);
    const findings = unknownAnchorFindings(report);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      code: "UNKNOWN_ANCHOR",
      severity: "INFO",
      field: "anchor",
      message:
        `Sapling: 1 spend cites anchor ${UNKNOWN.slice(0, 16)}..., which this indexer's chain state has not recorded, ` +
        "so no candidate set is claimed",
    });
  });

  it("names a distinct unknown anchor ONCE, with the count of spends citing it", async () => {
    const report = await analyze(
      saplingUnshield([saplingSpend(UNKNOWN, h(0x11)), saplingSpend(UNKNOWN, h(0x12)), saplingSpend(ROOT_S, h(0x13))]),
      context(populatedStates()),
    );
    expect(report.spends.map((s) => s.assessment !== undefined)).toEqual([false, false, true]);
    const findings = unknownAnchorFindings(report);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/^Sapling: 2 spends cite anchor /);
  });

  it("pool separation: an anchor recorded in ORCHARD does not assess a SAPLING spend that cites it", async () => {
    const report = await analyze(saplingUnshield([saplingSpend(ROOT_O, h(0x11))]), context(populatedStates()));
    expect(report.spends[0]?.assessment).toBeUndefined();
    expect(unknownAnchorFindings(report)).toHaveLength(1);
  });

  it("says so when the anchor's BYTE-REVERSED spelling is the one recorded (Zebra #10461's shape)", async () => {
    // The state recorded the root as this build spells it; the node cites the
    // same 32 bytes the other way round. That is a node past #10461 talking to
    // a build before it, and the finding is the one place it shows.
    const states = populatedStates();
    const report = await analyze(
      saplingUnshield([saplingSpend(reverseHex(ROOT_S), h(0x11))]),
      context(states),
    );
    expect(report.spends[0]?.assessment).toBeUndefined();
    const [finding] = unknownAnchorFindings(report);
    expect(finding?.message).toContain("its BYTE-REVERSED spelling IS recorded");
    expect(finding?.message).toContain("ZcashFoundation/zebra #10461");
    // And the unreversed unknown anchor from the fail state above does NOT
    // carry the clause - the diagnostic discriminates.
    const plain = await analyze(saplingUnshield([saplingSpend(UNKNOWN, h(0x11))]), context(states));
    expect(unknownAnchorFindings(plain)[0]?.message).not.toContain("BYTE-REVERSED");
  });

  it("COUNTER-CASE: with no chain state nothing is assessed and nothing is found - the absence of a state is not an unknown anchor", async () => {
    const report = await analyze(saplingUnshield([saplingSpend(UNKNOWN, h(0x11))]), context());
    expect(report.spends[0]?.assessment).toBeUndefined();
    expect(unknownAnchorFindings(report)).toEqual([]);
  });
});

/* ----------------------------------------------------------------------------
   The real producer's report, across the real wire.
   ------------------------------------------------------------------------- */

/** Every path at which a bigint lives. */
function bigintPaths(value: unknown, path = ""): string[] {
  if (typeof value === "bigint") return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => bigintPaths(v, `${path}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      bigintPaths(v, path === "" ? k : `${path}.${k}`),
    );
  }
  return [];
}

describe("the wire seam over the REAL producer (A3): analyze() -> serializeWire -> bytes -> reviveWire", () => {
  async function producedReport(): Promise<LeakReport> {
    const states = populatedStates();
    const report = await analyze(saplingUnshield([saplingSpend(ROOT_S, h(0x11))]), context(states));
    // And a link with a filtered assessment, made by the real index over the
    // same state, so the report carries countIn/countOut too.
    const index = new RoundTripIndex({ chainState: () => states, windowBlocks: 10, now: () => 3_000_000 });
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: h(0x105) }));
    const links = index.ingest({ ...report, seenAt: 2_000_000, tipHeightAtSeen: 3_500_000 });
    expect(links).toHaveLength(1);
    expect(links[0]?.assessment?.appliedFilters.length).toBeGreaterThanOrEqual(2);
    return { ...report, links };
  }

  it("PASS STATE: the produced report round-trips deep-equal, and its assessment counts are bigints on both sides", async () => {
    const original = await producedReport();
    const paths = bigintPaths(original);
    for (const name of ["rawCount", "effectiveSetSize", "countIn", "countOut"]) {
      expect(paths.filter((p) => p.endsWith(name)).length, name).toBeGreaterThanOrEqual(1);
    }
    const back = reviveWire<LeakReport>(JSON.parse(JSON.stringify(serializeWire(original))));
    expect(back).toEqual(original);
    expect(bigintPaths(back).sort()).toEqual(paths.sort());
    expect(typeof back.spends[0]?.assessment?.rawCount).toBe("bigint");
    expect(typeof back.links[0]?.assessment?.appliedFilters[0]?.countOut).toBe("bigint");
  });

  it("FAIL STATE, BY DATA: the untagged form leaves the produced report's counts as strings", async () => {
    const original = await producedReport();
    const legacy = reviveWire<LeakReport>(
      JSON.parse(JSON.stringify(original, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))),
    );
    expect(typeof legacy.spends[0]?.assessment?.rawCount).toBe("string");
    expect(typeof legacy.links[0]?.assessment?.appliedFilters[0]?.countOut).toBe("string");
    expect(legacy).not.toEqual(original);
  });
});

/* ----------------------------------------------------------------------------
   RoundTripIndex with a chain state.
   ------------------------------------------------------------------------- */

const AMOUNT = 250_000_000n as Zatoshi;

/** A Sapling shield seen from the mempool: value entering the pool from a transparent input, one output commitment. */
function depositReport(opts: { txid: Hex; seenAt: number; commitment: Hex; tipHeightAtSeen?: number }): LeakReport {
  return baseReport({
    txid: opts.txid,
    seenAt: opts.seenAt,
    tipHeightAtSeen: opts.tipHeightAtSeen ?? 999_999,
    deltaZat: -AMOUNT,
    vin: [{ index: 0, coinbase: false, address: "t1sender", sequence: 0xffff_ffff }],
    vout: [],
    spends: [],
    outputs: [{ pool: "sapling", index: 0, commitment: opts.commitment }],
    senderAddress: "t1sender",
  });
}

/** A Sapling unshield seen from the mempool: value leaving the pool to a transparent output, one spend citing `anchor`. */
function withdrawalReport(opts: { txid: Hex; seenAt: number; anchor: Hex }): LeakReport {
  return baseReport({
    txid: opts.txid,
    seenAt: opts.seenAt,
    tipHeightAtSeen: 1_000_010,
    deltaZat: AMOUNT,
    vin: [],
    vout: [{ index: 0, valueZat: (AMOUNT - 10_000n) as Zatoshi, addresses: ["t1recipient"], scriptType: "pubkeyhash" }],
    spends: [
      {
        pool: "sapling",
        index: 0,
        nullifier: h(0x11),
        anchor: opts.anchor,
        anchorHeight: null,
        anchorDepthBlocks: null,
        isRecentAnchor: false,
        severity: "LOW",
      },
    ],
    outputs: [],
    recipientAddress: "t1recipient",
  });
}

function baseReport(o: {
  txid: Hex;
  seenAt: number;
  tipHeightAtSeen: number;
  deltaZat: Zatoshi;
  vin: LeakReport["transparent"]["vin"];
  vout: LeakReport["transparent"]["vout"];
  spends: SpendAnnotation[];
  outputs: LeakReport["outputs"];
  senderAddress?: string;
  recipientAddress?: string;
}): LeakReport {
  return {
    txid: o.txid,
    seenAt: o.seenAt,
    tipHeightAtSeen: o.tipHeightAtSeen,
    txVersion: 5,
    leakClass: o.deltaZat < 0n ? "T_TO_Z" : "Z_TO_T",
    overallSeverity: "INFO",
    bundle: {
      saplingSpends: [],
      saplingOutputs: [],
      saplingValueBalanceZat: o.deltaZat,
      orchardActions: [],
      orchardValueBalanceZat: 0n,
      orchardAnchor: null,
      orchardFlags: null,
      ironwoodActions: [],
      ironwoodValueBalanceZat: 0n,
      ironwoodAnchor: null,
      ironwoodFlags: null,
    },
    transparent: { vin: o.vin, vout: o.vout },
    identity: {
      sender: { transparentAddresses: o.senderAddress ? [o.senderAddress] : [], nullifiers: [], commitments: [] },
      recipient: { transparentAddresses: o.recipientAddress ? [o.recipientAddress] : [], nullifiers: [], commitments: [] },
    },
    spends: o.spends,
    outputs: o.outputs,
    valueFlow: {
      sproutValueBalanceZat: 0n,
      saplingValueBalanceZat: o.deltaZat,
      orchardValueBalanceZat: 0n,
      ironwoodValueBalanceZat: 0n,
      perPoolZat: [{ pool: "sapling", deltaZat: o.deltaZat }],
      netTransparentInflowZat: 0n,
      isPureShielded: false,
      crossesPoolBoundary: true,
      direction: o.deltaZat < 0n ? "DEPOSIT" : "WITHDRAWAL",
    },
    fingerprint: {
      outputCount: 0,
      spendCount: 0,
      outputPadded: false,
      feeZat: 10_000n,
      isZip317ConventionalFee: true,
      logicalActions: 2,
      expiryDelta: 40,
      hasMemo: false,
      likelyWallet: "ZCASHD_RUST",
    },
    findings: [],
    links: [],
  };
}

/**
 * Sapling: 5 commitments at 995, then 3 at 1_000 (the deposit's block), one of
 * which is the deposit's, then 4 at 1_005, anchored by ROOT_S at 1_005.
 */
function linkStates(): { states: PoolStates; depositCommitment: Hex } {
  const states = emptyStates();
  appendAt(states, "sapling", 995, 0x100, 5);
  appendAt(states, "sapling", 1_000, 0x200, 3);
  appendAt(states, "sapling", 1_005, 0x300, 4);
  anchorAt(states, "sapling", ROOT_S, 1_005);
  return { states, depositCommitment: h(0x201) };
}

function linkOf(links: LinkRecord[]): LinkRecord {
  expect(links).toHaveLength(1);
  return links[0] as LinkRecord;
}

describe("RoundTripIndex with a chain state (A3): every link it makes is assessed", () => {
  it("PASS STATE: a link whose deposit is IN THE TREE carries time_window, amount_match at the TREE's height, and the echo's audit", () => {
    const { states, depositCommitment } = linkStates();
    const index = new RoundTripIndex({ chainState: () => states, windowBlocks: 10, now: () => 3_000_000 });
    // The deposit's tipHeightAtSeen is deliberately a height with NO
    // commitments (999_999): if the filter were given the mempool clock, the
    // amount match would find nothing there and narrow Cand_0 to zero.
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: depositCommitment, tipHeightAtSeen: 999_999 }));
    const link = linkOf(index.ingest(withdrawalReport({ txid: h(0xf1), seenAt: 2_000_000, anchor: ROOT_S })));

    expect(link.matchKind).toBe("EXACT");
    expect(link.assessment).toBeDefined();
    const a = link.assessment;
    expect(a?.rawCount).toBe(12n);
    expect(a?.appliedFilters.map((f) => f.filter)).toEqual(["time_window", "amount_match", "amount_echo"]);
    const amount = a?.appliedFilters[1];
    if (amount?.filter !== "amount_match") throw new Error("expected amount_match second");
    expect(amount.params.matchedDepositHeight).toBe(1_000);
    expect(amount.params.matchedDepositTxid).toBe(h(0xd1));
    expect(amount.params.matchKind).toBe("EXACT");
    // The deposit's block contributed 3 commitments, so the effective set is 3.
    expect(amount.countOut).toBe(3n);
    expect(a?.effectiveSetSize).toBe(3n);
    expect(a?.claimLevel).toBe("requires_disclosure");
  });

  it("FAIL STATE, BY DATA: the mempool clock, given to the same filter over the same tree, narrows Cand_0 to NOTHING", () => {
    // The member of the exclusion set for the height claim above: the
    // deposit's `tipHeightAtSeen`. Run the filter with it and the result is
    // the false disclosure claim the index refuses to make.
    const { states } = linkStates();
    const range = rawCandidateRange("sapling", ROOT_S, states.sapling);
    const anchor = states.sapling.anchors.getByRoot(ROOT_S);
    if (range === null || anchor === null) throw new Error("fixture: ROOT_S must be recorded");
    const wrongClock = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(0xd1),
      matchedDepositHeight: 999_999,
      matchedDepositAmountZat: AMOUNT,
      withdrawalAmountZat: AMOUNT,
      toleranceZat: 0n,
      matchKind: "EXACT",
    })({ range, anchor, state: states.sapling });
    expect(wrongClock.application.countOut).toBe(0n);
    expect(wrongClock.range.rawCount).toBe(0n);
  });

  it("a link whose deposit is NOT yet in the tree carries the time window alone - no amount match", () => {
    const { states } = linkStates();
    const index = new RoundTripIndex({ chainState: () => states, windowBlocks: 10, now: () => 3_000_000 });
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: h(0x9999) }));
    const link = linkOf(index.ingest(withdrawalReport({ txid: h(0xf1), seenAt: 2_000_000, anchor: ROOT_S })));
    const filters = link.assessment?.appliedFilters.map((f) => f.filter) ?? [];
    expect(filters).toContain("time_window");
    expect(filters).not.toContain("amount_match");
    // The window is the HALF-OPEN range (995, 1_005]: the 3 at 1_000 and the 4
    // at 1_005 are in it and the 5 at exactly 995 are not. This expectation
    // was first written as 12 and the run said 7 - the fixture had forgotten
    // the range's own documented shape, and the code had not.
    expect(link.assessment?.effectiveSetSize).toBe(7n);
  });

  it("FAIL STATE, BY DATA: a withdrawal citing an anchor the state has not recorded makes a link with NO assessment key", () => {
    const { states, depositCommitment } = linkStates();
    const index = new RoundTripIndex({ chainState: () => states, windowBlocks: 10, now: () => 3_000_000 });
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: depositCommitment }));
    const link = linkOf(index.ingest(withdrawalReport({ txid: h(0xf1), seenAt: 2_000_000, anchor: UNKNOWN })));
    expect("assessment" in link).toBe(false);
  });

  it("COUNTER-CASE: with no chain state the index makes the same link with no assessment key", () => {
    const { depositCommitment } = linkStates();
    const index = new RoundTripIndex({ windowBlocks: 10, now: () => 3_000_000 });
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: depositCommitment }));
    const link = linkOf(index.ingest(withdrawalReport({ txid: h(0xf1), seenAt: 2_000_000, anchor: ROOT_S })));
    expect(link.matchKind).toBe("EXACT");
    expect("assessment" in link).toBe(false);
  });

  it("reads the state through the getter on EVERY link, so a replaced state (a reorg) is the one assessed against", () => {
    let current = emptyStates();
    const index = new RoundTripIndex({ chainState: () => current, windowBlocks: 10, now: () => 3_000_000 });
    const { states, depositCommitment } = linkStates();
    index.ingest(depositReport({ txid: h(0xd1), seenAt: 1_000_000, commitment: depositCommitment }));
    const before = linkOf(index.ingest(withdrawalReport({ txid: h(0xf1), seenAt: 2_000_000, anchor: ROOT_S })));
    expect("assessment" in before).toBe(false);
    current = states;
    const after = linkOf(index.ingest(withdrawalReport({ txid: h(0xf2), seenAt: 2_000_001, anchor: ROOT_S })));
    expect(after.assessment?.rawCount).toBe(12n);
  });
});
