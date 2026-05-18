import { describe, it, expect } from "vitest";
import type { ClaimLevel } from "@zcashreveal/types";
import { classifyByEffectiveSet } from "../claim-classifier.js";

describe("classifyByEffectiveSet", () => {
  const cases: ReadonlyArray<readonly [bigint, ClaimLevel]> = [
    // <= 10 → requires_disclosure
    [1n, "requires_disclosure"],
    [10n, "requires_disclosure"],
    // 11..100 → small_heuristic_set
    [11n, "small_heuristic_set"],
    [100n, "small_heuristic_set"],
    // 101..1000 → broad_candidate_set
    [101n, "broad_candidate_set"],
    [1000n, "broad_candidate_set"],
    // > 1000 → aggregate_only
    [1001n, "aggregate_only"],
    [10_000n, "aggregate_only"],
  ];

  for (const [N, expected] of cases) {
    it(`N_eff=${N} → ${expected}`, () => {
      expect(classifyByEffectiveSet(N)).toBe(expected);
    });
  }

  it("0n maps to requires_disclosure (degenerate but defined)", () => {
    expect(classifyByEffectiveSet(0n)).toBe("requires_disclosure");
  });

  it("very large N_eff stays aggregate_only", () => {
    expect(classifyByEffectiveSet(2n ** 40n)).toBe("aggregate_only");
  });
});
