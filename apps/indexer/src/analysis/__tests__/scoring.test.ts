import { describe, it, expect } from "vitest";
import {
  asHex,
  type Anchor,
  type CandidateRange,
  type FilterApplication,
} from "@zcashreveal/types";
import { PoolState } from "../../state/pool-state.js";
import {
  amountMatchFilter,
  applyFilters,
  timeWindowFilter,
  type Filter,
  type FilterInput,
  type FilterResult,
} from "../scoring.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/**
 * Helper: build a sapling PoolState with N commitments at consecutive
 * heights starting from `startHeight`. Records an anchor at heightCreated
 * with maxPosition = anchorMaxPosition.
 */
function buildState(opts: {
  commitmentCount: number;
  startHeight: number;
  anchorRoot: ReturnType<typeof h>;
  anchorHeightCreated: number;
  anchorMaxPosition: bigint;
}) {
  const state = new PoolState<"sapling">("sapling");
  for (let i = 0; i < opts.commitmentCount; i++) {
    state.commitments.append({
      pool: "sapling",
      cmId: h(i + 1),
      txid: h(i + 1000),
      height: opts.startHeight + i,
    });
  }
  state.anchors.record({
    pool: "sapling",
    root: opts.anchorRoot,
    heightCreated: opts.anchorHeightCreated,
    maxPosition: opts.anchorMaxPosition,
  });
  return state;
}

describe("timeWindowFilter — algorithm", () => {
  it("K === 0n produces degenerate empty range with countOut: 0n", () => {
    // Anchor at height 100, single commitment far back at height 50.
    // Window (100-10, 100] = (90, 100] excludes height 50.
    const state = buildState({
      commitmentCount: 0,
      startHeight: 0,
      anchorRoot: h(1),
      anchorHeightCreated: 100,
      anchorMaxPosition: 0n,
    });
    state.commitments.append({
      pool: "sapling",
      cmId: h(50),
      txid: h(150),
      height: 50,
    });

    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(1),
      minPosition: 0n,
      maxPosition: 0n,
      rawCount: 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      heightCreated: 100,
      maxPosition: 0n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 10 });
    const result = filter({ range, anchor, state });

    expect(result.range.rawCount).toBe(0n);
    expect(result.range.maxPosition).toBe(0n);
    expect(result.range.minPosition).toBe(1n); // maxPosition + 1n for empty
    expect(result.application.countOut).toBe(0n);
  });

  it("K within range: newMinPosition = maxPosition - K + 1n", () => {
    // 10 commitments at heights 91..100. Anchor at heightCreated=100,
    // maxPosition=9n. Window 5 blocks: (95, 100] includes heights 96..100
    // → 5 commitments survive.
    const state = buildState({
      commitmentCount: 10,
      startHeight: 91,
      anchorRoot: h(2),
      anchorHeightCreated: 100,
      anchorMaxPosition: 9n,
    });

    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(2),
      minPosition: 0n,
      maxPosition: 9n,
      rawCount: 10n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(2),
      heightCreated: 100,
      maxPosition: 9n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 5 });
    const result = filter({ range, anchor, state });

    expect(result.range.rawCount).toBe(5n);
    expect(result.range.minPosition).toBe(5n); // 9 - 5 + 1
    expect(result.range.maxPosition).toBe(9n);
    expect(result.application.countIn).toBe(10n);
    expect(result.application.countOut).toBe(5n);
  });

  it("K > range.rawCount: clamps to range.rawCount and records clamp in countOut", () => {
    // 10 commitments at heights 95..104. Anchor only sees positions 0..2
    // (maxPosition=2n, rawCount=3). Window 20 blocks: (80, 100] includes
    // 6 commitments (heights 95..100). Filter must clamp 6 → 3.
    const state = buildState({
      commitmentCount: 10,
      startHeight: 95,
      anchorRoot: h(3),
      anchorHeightCreated: 100,
      anchorMaxPosition: 2n,
    });

    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(3),
      minPosition: 0n,
      maxPosition: 2n,
      rawCount: 3n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(3),
      heightCreated: 100,
      maxPosition: 2n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 20 });
    const result = filter({ range, anchor, state });

    expect(result.range.rawCount).toBe(3n);
    expect(result.application.countIn).toBe(3n);
    expect(result.application.countOut).toBe(3n); // clamped from 6
  });

  it("FilterApplication fields are populated correctly for time_window", () => {
    // Commitments at heights 101..105 (5 of them); anchor at heightCreated=105.
    // Window 3 blocks → (102, 105] includes commitments at heights 103, 104, 105.
    const state = buildState({
      commitmentCount: 5,
      startHeight: 101,
      anchorRoot: h(4),
      anchorHeightCreated: 105,
      anchorMaxPosition: 4n,
    });

    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(4),
      minPosition: 0n,
      maxPosition: 4n,
      rawCount: 5n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(4),
      heightCreated: 105,
      maxPosition: 4n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 3 });
    const { application } = filter({ range, anchor, state });

    expect(application.filter).toBe("time_window");
    expect(application.params).toEqual({
      windowBlocks: 3,
      lowHeight: 102,
      highHeight: 105,
    });
    // (102, 105] includes commitments at heights 103, 104, 105 → 3 commitments
    expect(application.countIn).toBe(5n);
    expect(application.countOut).toBe(3n);
  });
});

describe("applyFilters — composition", () => {
  it("runs multiple filters in order and accumulates applications", () => {
    // Build a state where two time_window filters with different windows
    // chain visibly. First filter trims 10 → 5; second trims 5 → 2.
    const state = buildState({
      commitmentCount: 10,
      startHeight: 91,
      anchorRoot: h(5),
      anchorHeightCreated: 100,
      anchorMaxPosition: 9n,
    });

    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(5),
      minPosition: 0n,
      maxPosition: 9n,
      rawCount: 10n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(5),
      heightCreated: 100,
      maxPosition: 9n,
    };

    const wide = timeWindowFilter<"sapling">({ windowBlocks: 5 });
    const tight = timeWindowFilter<"sapling">({ windowBlocks: 2 });
    const { range: out, applications } = applyFilters(
      range,
      anchor,
      state,
      [wide, tight],
    );

    expect(applications).toHaveLength(2);
    expect(applications[0]?.countIn).toBe(10n);
    expect(applications[0]?.countOut).toBe(5n);
    expect(applications[1]?.countIn).toBe(5n); // second sees first's output as input
    expect(applications[1]?.countOut).toBe(2n);
    expect(out.rawCount).toBe(2n);
  });

  it("empty filter list returns the range unchanged with empty applications", () => {
    const state = buildState({
      commitmentCount: 3,
      startHeight: 100,
      anchorRoot: h(6),
      anchorHeightCreated: 102,
      anchorMaxPosition: 2n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(6),
      minPosition: 0n,
      maxPosition: 2n,
      rawCount: 3n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(6),
      heightCreated: 102,
      maxPosition: 2n,
    };
    const { range: out, applications } = applyFilters(range, anchor, state, []);
    expect(out).toEqual(range);
    expect(applications).toEqual([]);
  });
});

describe("Filter type — pool separation at compile time", () => {
  it("Filter<\"sapling\"> not assignable to Filter<\"orchard\"> (timeWindowFilter)", () => {
    const saplingFilter = timeWindowFilter<"sapling">({ windowBlocks: 576 });
    // @ts-expect-error - cross-pool Filter assignment must be rejected
    const orchardFilter: Filter<"orchard"> = saplingFilter;
    void orchardFilter;
    expect(true).toBe(true);
  });

  it("Filter<\"sapling\"> not assignable to Filter<\"orchard\"> (amountMatchFilter)", () => {
    const saplingAmt = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(1),
      matchedDepositHeight: 100,
      matchedDepositAmountZat: 1_000n,
      withdrawalAmountZat: 1_000n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    // @ts-expect-error - cross-pool Filter assignment must be rejected
    const orchardFilter: Filter<"orchard"> = saplingAmt;
    void orchardFilter;
    expect(true).toBe(true);
  });

  it("FilterInput<\"sapling\"> not assignable to FilterInput<\"orchard\">", () => {
    // Type-level only — no runtime fixture needed.
    type _SapInput = FilterInput<"sapling">;
    type _OrcInput = FilterInput<"orchard">;
    // @ts-expect-error - Range/Anchor/PoolState parameter pools must agree
    const _check: _OrcInput = {} as _SapInput;
    void _check;
    expect(true).toBe(true);
  });

  it("FilterApplication discriminator narrows params on time_window", () => {
    // Build a minimal FilterApplication, then confirm narrowing works.
    const app: FilterApplication = {
      filter: "time_window",
      params: { windowBlocks: 1, lowHeight: 0, highHeight: 1 },
      countIn: 0n,
      countOut: 0n,
    };
    if (app.filter === "time_window") {
      // After narrowing, params.windowBlocks must be a number, not any.
      const n: number = app.params.windowBlocks;
      expect(typeof n).toBe("number");
    }
  });

  it("FilterApplication discriminator narrows params on amount_match", () => {
    const app: FilterApplication = {
      filter: "amount_match",
      params: {
        matchedDepositTxid: h(1),
        matchedDepositHeight: 100,
        matchedDepositAmountZat: 1_000n,
        withdrawalAmountZat: 1_000n,
        toleranceZat: 0n,
        matchKind: "EXACT",
      },
      countIn: 1n,
      countOut: 1n,
    };
    if (app.filter === "amount_match") {
      // After narrowing, params.matchKind must be the EXACT|FEE_TOLERANT union.
      const kind: "EXACT" | "FEE_TOLERANT" = app.params.matchKind;
      expect(kind).toBe("EXACT");
    }
  });
});

describe("FilterResult shape", () => {
  it("a filter returns both range and application", () => {
    const state = buildState({
      commitmentCount: 1,
      startHeight: 99,
      anchorRoot: h(7),
      anchorHeightCreated: 100,
      anchorMaxPosition: 0n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(7),
      minPosition: 0n,
      maxPosition: 0n,
      rawCount: 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(7),
      heightCreated: 100,
      maxPosition: 0n,
    };
    const filter = timeWindowFilter<"sapling">({ windowBlocks: 5 });
    const result: FilterResult<"sapling"> = filter({ range, anchor, state });
    expect(result.range).toBeDefined();
    expect(result.application).toBeDefined();
  });
});

describe("amountMatchFilter — algorithm", () => {
  /**
   * Helper for amount-match tests. Builds a state with commitments at
   * specified heights (one per slot), records an anchor, and returns the
   * usual range + anchor + state triple ready for filter invocation.
   */
  function buildMidSliceState(opts: {
    heights: number[];           // height for each commitment, in append order
    anchorHeightCreated: number;
    anchorRoot: ReturnType<typeof h>;
  }) {
    const state = new PoolState<"sapling">("sapling");
    for (let i = 0; i < opts.heights.length; i++) {
      state.commitments.append({
        pool: "sapling",
        cmId: h(i + 1),
        txid: h(i + 1000),
        height: opts.heights[i]!,
      });
    }
    const maxPos = BigInt(opts.heights.length - 1);
    state.anchors.record({
      pool: "sapling",
      root: opts.anchorRoot,
      heightCreated: opts.anchorHeightCreated,
      maxPosition: maxPos,
    });
    return { state, maxPos };
  }

  it("K=1 at deposit height in middle of range → minPosition = firstPos_H, maxPosition = firstPos_H, rawCount = 1n", () => {
    // 3 commitments at heights 100, 200, 300 → positions 0, 1, 2.
    // Matched deposit at height 200: slice = { firstPosition: 1n, count: 1n }.
    const { state, maxPos } = buildMidSliceState({
      heights: [100, 200, 300],
      anchorHeightCreated: 300,
      anchorRoot: h(10),
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(10),
      minPosition: 0n,
      maxPosition: maxPos,
      rawCount: maxPos + 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(10),
      heightCreated: 300,
      maxPosition: maxPos,
    };

    const filter = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(1000 + 1),
      matchedDepositHeight: 200,
      matchedDepositAmountZat: 5_000_000n,
      withdrawalAmountZat: 5_000_000n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    const { range: out, application } = filter({ range, anchor, state });

    expect(out.minPosition).toBe(1n);
    expect(out.maxPosition).toBe(1n);
    expect(out.rawCount).toBe(1n);
    expect(application.countIn).toBe(3n);
    expect(application.countOut).toBe(1n);
  });

  it("K=5 at deposit height in middle of range → minPosition = firstPos_H, maxPosition = firstPos_H + 4n, rawCount = 5n", () => {
    // 3 commitments at h=100 (positions 0..2), 5 at h=200 (positions 3..7),
    // 2 at h=300 (positions 8..9). Total 10 commitments.
    const heights: number[] = [
      100, 100, 100,
      200, 200, 200, 200, 200,
      300, 300,
    ];
    const { state, maxPos } = buildMidSliceState({
      heights,
      anchorHeightCreated: 300,
      anchorRoot: h(20),
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(20),
      minPosition: 0n,
      maxPosition: maxPos,
      rawCount: maxPos + 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(20),
      heightCreated: 300,
      maxPosition: maxPos,
    };

    const filter = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(2000),
      matchedDepositHeight: 200,
      matchedDepositAmountZat: 1n,
      withdrawalAmountZat: 1n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    const { range: out } = filter({ range, anchor, state });

    expect(out.minPosition).toBe(3n);   // firstPos_H
    expect(out.maxPosition).toBe(7n);   // firstPos_H + 4
    expect(out.rawCount).toBe(5n);
  });

  it("no commitment at deposit height → degenerate empty range, countOut = 0n", () => {
    // Commitments only at heights 100 and 300; matched deposit claims h=200.
    const { state, maxPos } = buildMidSliceState({
      heights: [100, 300],
      anchorHeightCreated: 300,
      anchorRoot: h(30),
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(30),
      minPosition: 0n,
      maxPosition: maxPos,
      rawCount: maxPos + 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(30),
      heightCreated: 300,
      maxPosition: maxPos,
    };

    const filter = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(3000),
      matchedDepositHeight: 200,
      matchedDepositAmountZat: 0n,
      withdrawalAmountZat: 0n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    const { range: out, application } = filter({ range, anchor, state });

    expect(out.rawCount).toBe(0n);
    expect(out.maxPosition).toBe(maxPos);
    expect(out.minPosition).toBe(maxPos + 1n); // degenerate: min > max
    expect(application.countOut).toBe(0n);
  });

  it("slice extends past anchor's maxPosition → above-clamp, countOut < slice.count", () => {
    // 3 commitments at h=100 (positions 0..2), then 2 more at h=200 (positions 3..4).
    // Anchor only sees up to position 1 (maxPosition = 1n). Matched deposit at h=100:
    // slice = { firstPosition: 0n, count: 3n } but the anchor caps at position 1.
    // Intersection: [max(0,0), min(2,1)] = [0, 1] → countOut = 2 (clamped from 3).
    const { state } = buildMidSliceState({
      heights: [100, 100, 100, 200, 200],
      anchorHeightCreated: 100,
      anchorRoot: h(40),
    });
    // Override the recorded anchor with the narrower view we want.
    // (The buildMidSliceState helper records maxPosition = heights.length - 1.)
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(40),
      minPosition: 0n,
      maxPosition: 1n,
      rawCount: 2n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(40),
      heightCreated: 100,
      maxPosition: 1n,
    };

    const filter = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(4000),
      matchedDepositHeight: 100,
      matchedDepositAmountZat: 100n,
      withdrawalAmountZat: 100n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    const { range: out, application } = filter({ range, anchor, state });

    expect(out.minPosition).toBe(0n);
    expect(out.maxPosition).toBe(1n);  // clamped from sliceLast=2 down to range.maxPosition=1
    expect(out.rawCount).toBe(2n);     // clamped from slice.count=3 down to 2
    expect(application.countIn).toBe(2n);
    expect(application.countOut).toBe(2n);
  });

  it("slice falls entirely below already-narrowed input range → degenerate empty range", () => {
    // Construct a state where positionRangeAtHeight(500) = { firstPosition: 287n, count: 5n }:
    // 287 commitments at height 1 (positions 0..286), then 5 at height 500 (positions 287..291).
    // Then call amountMatchFilter on a range that's been narrowed to minPosition = 995n
    // (simulating a prior filter). The slice at [287, 291] falls entirely below 995 — no overlap.
    const state = new PoolState<"sapling">("sapling");
    for (let i = 0; i < 287; i++) {
      state.commitments.append({
        pool: "sapling",
        cmId: h(i + 1),
        txid: h(i + 10_000),
        height: 1,
      });
    }
    for (let i = 0; i < 5; i++) {
      state.commitments.append({
        pool: "sapling",
        cmId: h(i + 1_000),
        txid: h(i + 20_000),
        height: 500,
      });
    }
    // Sanity-check the slice we're about to filter against.
    expect(state.commitments.positionRangeAtHeight(500)).toEqual({
      firstPosition: 287n,
      count: 5n,
    });

    // Anchor records a wide view; the range below is what a prior filter would have produced.
    state.anchors.record({
      pool: "sapling",
      root: h(50),
      heightCreated: 1000,
      maxPosition: 999n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(50),
      minPosition: 995n, // narrowed by a (hypothetical) prior filter
      maxPosition: 999n,
      rawCount: 5n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(50),
      heightCreated: 1000,
      maxPosition: 999n,
    };

    const filter = amountMatchFilter<"sapling">({
      matchedDepositTxid: h(50_000),
      matchedDepositHeight: 500,
      matchedDepositAmountZat: 42n,
      withdrawalAmountZat: 42n,
      toleranceZat: 0n,
      matchKind: "EXACT",
    });
    const { range: out, application } = filter({ range, anchor, state });

    expect(out.rawCount).toBe(0n);
    expect(out.maxPosition).toBe(999n);
    expect(out.minPosition).toBe(1000n); // maxPosition + 1n — degenerate
    expect(application.countOut).toBe(0n);
    expect(application.countIn).toBe(5n);
  });

  it("FilterApplication.amount_match field-by-field assertion", () => {
    const { state, maxPos } = buildMidSliceState({
      heights: [100, 200, 200, 300],
      anchorHeightCreated: 300,
      anchorRoot: h(60),
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(60),
      minPosition: 0n,
      maxPosition: maxPos,
      rawCount: maxPos + 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(60),
      heightCreated: 300,
      maxPosition: maxPos,
    };

    const opts = {
      matchedDepositTxid: h(123),
      matchedDepositHeight: 200,
      matchedDepositAmountZat: 1_000_000n,
      withdrawalAmountZat: 999_900n,
      toleranceZat: 160_000n,
      matchKind: "FEE_TOLERANT" as const,
    };
    const { application } = amountMatchFilter<"sapling">(opts)({
      range,
      anchor,
      state,
    });

    expect(application.filter).toBe("amount_match");
    expect(application.params).toEqual({
      matchedDepositTxid: h(123),
      matchedDepositHeight: 200,
      matchedDepositAmountZat: 1_000_000n,
      withdrawalAmountZat: 999_900n,
      toleranceZat: 160_000n,
      matchKind: "FEE_TOLERANT",
    });
    expect(application.countIn).toBe(4n);    // total commitments
    expect(application.countOut).toBe(2n);   // 2 commitments at height 200
  });
});
