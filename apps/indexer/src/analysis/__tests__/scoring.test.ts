import { describe, it, expect } from "vitest";
import {
  asHex,
  type Anchor,
  type CandidateRange,
  type FilterApplication,
} from "@zcashreveal/types";
import { PoolState } from "../../state/pool-state.js";
import {
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
  it("Filter<\"sapling\"> not assignable to Filter<\"orchard\">", () => {
    const saplingFilter = timeWindowFilter<"sapling">({ windowBlocks: 576 });
    // @ts-expect-error - cross-pool Filter assignment must be rejected
    const orchardFilter: Filter<"orchard"> = saplingFilter;
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
