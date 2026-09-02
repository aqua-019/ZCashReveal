import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex, type Anchor } from "@zcashreveal/types";
import { PoolState } from "../pool-state.js";
import { AnchorOutOfBoundsError } from "../errors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

describe("PoolState (happy path)", () => {
  it("wires all four indexes with the same pool", () => {
    const s = new PoolState<"sapling">("sapling");
    expect(s.pool).toBe("sapling");
    expect(s.commitments.pool).toBe("sapling");
    expect(s.anchors.pool).toBe("sapling");
    expect(s.nullifiers.pool).toBe("sapling");
    expect(s.value.pool).toBe("sapling");
  });

  it("recordAnchor succeeds when maxPosition < commitments.size()", () => {
    const s = new PoolState<"sapling">("sapling");
    s.commitments.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    s.commitments.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 1 });
    s.recordAnchor({
      pool: "sapling",
      root: h(99),
      maxPosition: 1n,
      heightCreated: 1,
    });
    expect(s.anchors.maxPositionFor(h(99))).toBe(1n);
  });

  it("recordAnchor throws when maxPosition equals commitments.size()", () => {
    const s = new PoolState<"sapling">("sapling");
    s.commitments.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    expect(() =>
      s.recordAnchor({
        pool: "sapling",
        root: h(99),
        maxPosition: 1n,
        heightCreated: 1,
      }),
    ).toThrow(AnchorOutOfBoundsError);
  });

  it("recordAnchor throws when maxPosition exceeds commitments.size()", () => {
    const s = new PoolState<"sapling">("sapling");
    s.commitments.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    expect(() =>
      s.recordAnchor({
        pool: "sapling",
        root: h(99),
        maxPosition: 5n,
        heightCreated: 1,
      }),
    ).toThrow(AnchorOutOfBoundsError);
  });

  it("recordAnchor against empty commitments always throws", () => {
    const s = new PoolState<"orchard">("orchard");
    expect(() =>
      s.recordAnchor({
        pool: "orchard",
        root: h(99),
        maxPosition: 0n,
        heightCreated: 1,
      }),
    ).toThrow(AnchorOutOfBoundsError);
  });

  it("snapshot composes all four index summaries", () => {
    const s = new PoolState<"sapling">("sapling");
    s.commitments.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    s.commitments.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 1 });
    s.recordAnchor({
      pool: "sapling",
      root: h(99),
      maxPosition: 1n,
      heightCreated: 1,
    });
    s.nullifiers.record({
      pool: "sapling",
      nfId: h(7),
      spentTxid: h(70),
      spentHeight: 1,
    });
    s.value.apply({
      pool: "sapling",
      txid: h(11),
      height: 1,
      deltaZat: -1000n,
    });
    expect(s.snapshot(42)).toEqual({
      pool: "sapling",
      height: 42,
      commitmentCount: 2n,
      anchorCount: 1,
      nullifierCount: 1,
      balanceZat: 1000n,
    });
  });

  it("rejects cross-pool Commitment at compile time", () => {
    const s = new PoolState<"sapling">("sapling");
    // Pool separation is a *compile-time* guarantee. The directive below
    // proves TypeScript rejects an orchard Commitment passed to a
    // sapling-typed index; if pool separation regresses, the directive
    // becomes unused and the test file fails to compile.
    // The fresh PoolState is discarded after this test, so the
    // type-violating runtime write is isolated.
    // @ts-expect-error - Commitment<"orchard"> must be rejected by CommitmentIndex<"sapling">.append
    s.commitments.append({ pool: "orchard", cmId: h(1), txid: h(2), height: 1 });
    expect(s.pool).toBe("sapling");
  });
});

describe("PoolState (properties)", () => {
  it("recordAnchor succeeds iff maxPosition < commitments.size()", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.bigInt({ min: 0n, max: 100n }),
        (commitmentCount, maxPosition) => {
          const s = new PoolState<"sapling">("sapling");
          for (let i = 0; i < commitmentCount; i++) {
            s.commitments.append({
              pool: "sapling",
              cmId: h(i + 1),
              txid: h(i + 1000),
              height: 1,
            });
          }
          const a: Anchor<"sapling"> = {
            pool: "sapling",
            root: h(9999),
            maxPosition,
            heightCreated: 1,
          };
          const shouldSucceed = maxPosition < BigInt(commitmentCount);
          let threw: unknown = null;
          try {
            s.recordAnchor(a);
          } catch (e) {
            threw = e;
          }
          if (shouldSucceed) {
            return threw === null && s.anchors.hasRoot(h(9999));
          }
          return threw instanceof AnchorOutOfBoundsError && !s.anchors.hasRoot(h(9999));
        },
      ),
    );
  });
});

describe("PoolState opened at a base (HANDOFF-12)", () => {
  it("hands the tree size to the commitment index and the balance to the value pool, and nothing to the other two", () => {
    const s = new PoolState<"ironwood">("ironwood", "mainnet", {
      commitmentBase: 48_467n,
      openingBalanceZat: 262_193_768_735_254n,
    });
    expect(s.commitments.size()).toBe(48_467n);
    expect(s.value.balance()).toBe(262_193_768_735_254n);
    expect(s.anchors.snapshot().anchorCount).toBe(0);
    expect(s.nullifiers.snapshot().nullifierCount).toBe(0);
    // recordAnchor's invariant is against the TREE size: an anchor at the
    // last position before the base is valid the moment the state opens,
    // which is how a Sapling anchor recorded from a treestate at the start
    // height can be recorded at all.
    s.recordAnchor({ pool: "ironwood", root: h(1), maxPosition: 48_466n, heightCreated: 3_444_836 });
    expect(() =>
      s.recordAnchor({ pool: "ironwood", root: h(2), maxPosition: 48_467n, heightCreated: 3_444_836 }),
    ).toThrow(AnchorOutOfBoundsError);
    expect(s.snapshot(3_444_836)).toEqual({
      pool: "ironwood",
      height: 3_444_836,
      commitmentCount: 48_467n,
      anchorCount: 1,
      nullifierCount: 0,
      balanceZat: 262_193_768_735_254n,
    });
  });
});
