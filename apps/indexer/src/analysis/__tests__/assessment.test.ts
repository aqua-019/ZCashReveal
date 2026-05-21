import { describe, it, expect } from "vitest";
import { asHex, type Anchor, type CandidateRange } from "@zcashreveal/types";
import { PoolState } from "../../state/pool-state.js";
import { assessRaw, assessFiltered } from "../assessment.js";
import { timeWindowFilter } from "../scoring.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

describe("assessRaw", () => {
  it("rawCount = 1n → requires_disclosure, entropyBits = 0", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(1),
      minPosition: 0n,
      maxPosition: 0n,
      rawCount: 1n,
    };
    const a = assessRaw(range);
    expect(a.claimLevel).toBe("requires_disclosure");
    expect(a.entropyBits).toBe(0);
    expect(a.effectiveSetSize).toBe(1n);
    expect(a.pool).toBe("sapling");
    expect(a.anchorRoot).toBe(h(1));
    expect(a.rawCount).toBe(1n);
  });

  it("rawCount = 1024n → aggregate_only, entropyBits = 10", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(2),
      minPosition: 0n,
      maxPosition: 1023n,
      rawCount: 1024n,
    };
    const a = assessRaw(range);
    expect(a.claimLevel).toBe("aggregate_only");
    expect(a.entropyBits).toBe(10);
    expect(a.effectiveSetSize).toBe(1024n);
  });

  it("threshold boundary: rawCount = 10n → requires_disclosure", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(3),
      minPosition: 0n,
      maxPosition: 9n,
      rawCount: 10n,
    };
    expect(assessRaw(range).claimLevel).toBe("requires_disclosure");
  });

  it("threshold boundary: rawCount = 11n → small_heuristic_set", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(4),
      minPosition: 0n,
      maxPosition: 10n,
      rawCount: 11n,
    };
    expect(assessRaw(range).claimLevel).toBe("small_heuristic_set");
  });

  it("preserves the pool type through assessment (sapling)", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(5),
      minPosition: 0n,
      maxPosition: 5n,
      rawCount: 6n,
    };
    const a = assessRaw(range);
    // At compile time `a.pool` is narrowed to "sapling", not Pool. The
    // runtime check is an equality assertion against that narrowed literal.
    const _typed: "sapling" = a.pool;
    void _typed;
    expect(a.pool).toBe("sapling");
  });

  it("preserves the pool type through assessment (orchard)", () => {
    const range: CandidateRange<"orchard"> = {
      pool: "orchard",
      anchorRoot: h(6),
      minPosition: 0n,
      maxPosition: 99n,
      rawCount: 100n,
    };
    const a = assessRaw(range);
    const _typed: "orchard" = a.pool;
    void _typed;
    expect(a.pool).toBe("orchard");
    expect(a.claimLevel).toBe("small_heuristic_set");
  });

  it("supply-scale rawCount (2^40 + 1n) classifies as aggregate_only", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(7),
      minPosition: 0n,
      maxPosition: 2n ** 40n,
      rawCount: 2n ** 40n + 1n,
    };
    const a = assessRaw(range);
    expect(a.claimLevel).toBe("aggregate_only");
    expect(a.effectiveSetSize).toBe(2n ** 40n + 1n);
    expect(a.entropyBits).toBeGreaterThan(40);
  });

  it("assessRaw returns appliedFilters: []", () => {
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(8),
      minPosition: 0n,
      maxPosition: 9n,
      rawCount: 10n,
    };
    const a = assessRaw(range);
    expect(a.appliedFilters).toEqual([]);
  });
});

describe("assessFiltered", () => {
  function buildSapling(opts: {
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

  it("empty filter list: rawCount preserved, effectiveSetSize === rawCount, applications empty", () => {
    const state = buildSapling({
      commitmentCount: 3,
      startHeight: 100,
      anchorRoot: h(1),
      anchorHeightCreated: 102,
      anchorMaxPosition: 2n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(1),
      minPosition: 0n,
      maxPosition: 2n,
      rawCount: 3n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      heightCreated: 102,
      maxPosition: 2n,
    };

    const a = assessFiltered(range, anchor, state, []);
    expect(a.rawCount).toBe(3n);
    expect(a.effectiveSetSize).toBe(3n);
    expect(a.appliedFilters).toEqual([]);
    expect(a.claimLevel).toBe("requires_disclosure"); // 3 <= 10
  });

  it("with timeWindowFilter: rawCount preserved (un-filtered); effectiveSetSize reflects filtered K", () => {
    // 1000 commitments at heights 1..1000, anchor at heightCreated=1000,
    // maxPosition=999n, rawCount=1000n. windowBlocks=50 → (950, 1000]
    // includes 50 commitments → effectiveSetSize=50n → small_heuristic_set.
    const state = buildSapling({
      commitmentCount: 1000,
      startHeight: 1,
      anchorRoot: h(2),
      anchorHeightCreated: 1000,
      anchorMaxPosition: 999n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(2),
      minPosition: 0n,
      maxPosition: 999n,
      rawCount: 1000n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(2),
      heightCreated: 1000,
      maxPosition: 999n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 50 });
    const a = assessFiltered(range, anchor, state, [filter]);

    expect(a.rawCount).toBe(1000n);       // un-filtered rawCount preserved
    expect(a.effectiveSetSize).toBe(50n); // filtered count
    expect(a.claimLevel).toBe("small_heuristic_set"); // 10 < 50 <= 100
    expect(a.appliedFilters).toHaveLength(1);
    expect(a.appliedFilters[0]?.filter).toBe("time_window");
    expect(a.appliedFilters[0]?.countIn).toBe(1000n);
    expect(a.appliedFilters[0]?.countOut).toBe(50n);
  });

  it("filter reduces to 0n: claimLevel requires_disclosure, entropyBits 0, no throw", () => {
    // Anchor at height 1000, but all commitments are far back (heights 1..10).
    // windowBlocks=5 → (995, 1000] is empty → K=0n → effectiveSetSize=0n.
    const state = buildSapling({
      commitmentCount: 10,
      startHeight: 1,
      anchorRoot: h(3),
      anchorHeightCreated: 1000,
      anchorMaxPosition: 9n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(3),
      minPosition: 0n,
      maxPosition: 9n,
      rawCount: 10n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(3),
      heightCreated: 1000,
      maxPosition: 9n,
    };

    const filter = timeWindowFilter<"sapling">({ windowBlocks: 5 });
    // Must not throw despite effectiveSetSize === 0n.
    const a = assessFiltered(range, anchor, state, [filter]);

    expect(a.rawCount).toBe(10n);
    expect(a.effectiveSetSize).toBe(0n);
    expect(a.entropyBits).toBe(0); // short-circuit avoids entropyBitsUniform(0n) throw
    expect(a.claimLevel).toBe("requires_disclosure");
    expect(a.appliedFilters[0]?.countOut).toBe(0n);
  });

  it("preserves pool type (sapling)", () => {
    const state = buildSapling({
      commitmentCount: 1,
      startHeight: 100,
      anchorRoot: h(4),
      anchorHeightCreated: 100,
      anchorMaxPosition: 0n,
    });
    const range: CandidateRange<"sapling"> = {
      pool: "sapling",
      anchorRoot: h(4),
      minPosition: 0n,
      maxPosition: 0n,
      rawCount: 1n,
    };
    const anchor: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(4),
      heightCreated: 100,
      maxPosition: 0n,
    };
    const a = assessFiltered(range, anchor, state, []);
    const _typed: "sapling" = a.pool;
    void _typed;
    expect(a.pool).toBe("sapling");
  });
});
