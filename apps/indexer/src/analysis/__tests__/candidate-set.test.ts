import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex } from "@zcashreveal/types";
import { PoolState } from "../../state/pool-state.js";
import { rawCandidateRange } from "../candidate-set.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

describe("rawCandidateRange", () => {
  it("returns null for an unknown anchorRoot", () => {
    const state = new PoolState<"sapling">("sapling");
    expect(rawCandidateRange("sapling", h(999), state)).toBeNull();
  });

  it("returns rawCount = 1n when anchor.maxPosition = 0n", () => {
    const state = new PoolState<"sapling">("sapling");
    state.anchors.record({
      pool: "sapling",
      root: h(100),
      maxPosition: 0n,
      heightCreated: 1,
    });
    const range = rawCandidateRange("sapling", h(100), state);
    expect(range).not.toBeNull();
    expect(range!.minPosition).toBe(0n);
    expect(range!.maxPosition).toBe(0n);
    expect(range!.rawCount).toBe(1n);
    expect(range!.pool).toBe("sapling");
    expect(range!.anchorRoot).toBe(h(100));
  });

  it("returns rawCount = 101n when anchor.maxPosition = 100n", () => {
    const state = new PoolState<"orchard">("orchard");
    state.anchors.record({
      pool: "orchard",
      root: h(7),
      maxPosition: 100n,
      heightCreated: 1,
    });
    const range = rawCandidateRange("orchard", h(7), state);
    expect(range!.rawCount).toBe(101n);
    expect(range!.maxPosition).toBe(100n);
  });

  it("preserves bigint precision: maxPosition = 2n ** 40n → rawCount = 2n ** 40n + 1n", () => {
    // Use anchors.record directly to bypass the PoolState cross-index
    // check (which would require 2^40 commitments to exist); we're only
    // exercising the arithmetic, not the cross-index invariant.
    const state = new PoolState<"sapling">("sapling");
    state.anchors.record({
      pool: "sapling",
      root: h(42),
      maxPosition: 2n ** 40n,
      heightCreated: 1,
    });
    const range = rawCandidateRange("sapling", h(42), state);
    expect(range!.maxPosition).toBe(2n ** 40n);
    expect(range!.rawCount).toBe(2n ** 40n + 1n);
  });

  it("(property) rawCount === maxPosition + 1n for any M in [0, 2^40]", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 2n ** 40n }), (M) => {
        const state = new PoolState<"sapling">("sapling");
        state.anchors.record({
          pool: "sapling",
          root: h(1),
          maxPosition: M,
          heightCreated: 1,
        });
        const range = rawCandidateRange("sapling", h(1), state);
        return range !== null && range.rawCount === M + 1n;
      }),
    );
  });

  it("pool-separated: same root in sapling and orchard PoolStates resolve independently", () => {
    const sapling = new PoolState<"sapling">("sapling");
    const orchard = new PoolState<"orchard">("orchard");
    const sharedRoot = h(123);

    sapling.anchors.record({
      pool: "sapling",
      root: sharedRoot,
      maxPosition: 5n,
      heightCreated: 1,
    });
    orchard.anchors.record({
      pool: "orchard",
      root: sharedRoot,
      maxPosition: 10n,
      heightCreated: 1,
    });

    const sap = rawCandidateRange("sapling", sharedRoot, sapling);
    const orch = rawCandidateRange("orchard", sharedRoot, orchard);

    expect(sap?.pool).toBe("sapling");
    expect(sap?.maxPosition).toBe(5n);
    expect(sap?.rawCount).toBe(6n);

    expect(orch?.pool).toBe("orchard");
    expect(orch?.maxPosition).toBe(10n);
    expect(orch?.rawCount).toBe(11n);
  });
});
