import { describe, it, expect } from "vitest";
import { asHex, type CandidateRange } from "@zcashreveal/types";
import { assessRaw } from "../assessment.js";

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
});
