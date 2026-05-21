import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex } from "@zcashreveal/types";
import { CommitmentIndex } from "../commitment-index.js";
import { CommitmentAlreadyExistsError } from "../errors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hex32 = () =>
  fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .map((b) => asHex(Buffer.from(b).toString("hex")));

describe("CommitmentIndex (happy path)", () => {
  it("assigns positions 0n, 1n, 2n in append order", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    const p0 = idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    const p1 = idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 100 });
    const p2 = idx.append({ pool: "sapling", cmId: h(3), txid: h(13), height: 101 });
    expect(p0).toBe(0n);
    expect(p1).toBe(1n);
    expect(p2).toBe(2n);
    expect(idx.size()).toBe(3n);
  });

  it("atPosition returns stored records", () => {
    const idx = new CommitmentIndex<"orchard">("orchard");
    idx.append({ pool: "orchard", cmId: h(7), txid: h(77), height: 500 });
    const got = idx.atPosition(0n);
    expect(got?.cmId).toBe(h(7));
    expect(got?.position).toBe(0n);
    expect(got?.height).toBe(500);
    expect(got?.pool).toBe("orchard");
  });

  it("atPosition returns undefined for out-of-range positions", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    expect(idx.atPosition(0n)).toBeUndefined();
    expect(idx.atPosition(-1n)).toBeUndefined();
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    expect(idx.atPosition(1n)).toBeUndefined();
    expect(idx.atPosition(0n)).toBeDefined();
  });

  it("byCmId looks up by id", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(5), txid: h(55), height: 1 });
    expect(idx.byCmId(h(5))?.position).toBe(0n);
    expect(idx.byCmId(h(999))).toBeUndefined();
  });

  it("throws CommitmentAlreadyExistsError on duplicate cmId", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    expect(() =>
      idx.append({ pool: "sapling", cmId: h(1), txid: h(22), height: 2 }),
    ).toThrow(CommitmentAlreadyExistsError);
  });

  it("snapshot reports pool and count", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 1 });
    idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 1 });
    expect(idx.snapshot()).toEqual({ pool: "sapling", commitmentCount: 2n });
  });
});

describe("CommitmentIndex.countBetweenHeights", () => {
  it("returns 0n for empty index", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    expect(idx.countBetweenHeights(0, 1_000_000)).toBe(0n);
  });

  it("counts commitments in (lo, hi] half-open range", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 200 });
    idx.append({ pool: "sapling", cmId: h(3), txid: h(13), height: 300 });
    expect(idx.countBetweenHeights(50, 350)).toBe(3n);
    expect(idx.countBetweenHeights(100, 350)).toBe(2n); // 100 excluded
    expect(idx.countBetweenHeights(99, 300)).toBe(3n); // 300 included
    expect(idx.countBetweenHeights(200, 300)).toBe(1n); // 200 excluded, 300 included
  });

  it("lo === hi returns 0n (empty interval)", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    expect(idx.countBetweenHeights(100, 100)).toBe(0n);
    expect(idx.countBetweenHeights(50, 50)).toBe(0n);
  });

  it("lo > hi returns 0n (inverted interval)", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    expect(idx.countBetweenHeights(200, 50)).toBe(0n);
  });

  it("lo < 0 counts all commitments at height <= hi (no clamping)", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 0 });
    idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 50 });
    idx.append({ pool: "sapling", cmId: h(3), txid: h(13), height: 100 });
    // Negative lo: the half-open inequality height > lo holds for all
    // non-negative heights, so this counts every commitment at height <= hi.
    expect(idx.countBetweenHeights(-1, 100)).toBe(3n);
    expect(idx.countBetweenHeights(-1000, 50)).toBe(2n);
    expect(idx.countBetweenHeights(-1, 0)).toBe(1n); // height 0 included since 0 > -1
  });

  it("single-height commitment at hi is included, at lo is excluded", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 500 });
    expect(idx.countBetweenHeights(499, 500)).toBe(1n);
    expect(idx.countBetweenHeights(500, 501)).toBe(0n);
  });
});

describe("CommitmentIndex.positionRangeAtHeight", () => {
  it("returns null for empty index", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    expect(idx.positionRangeAtHeight(100)).toBeNull();
  });

  it("returns { firstPosition: 0n, count: 1n } for single commitment at height H", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    expect(idx.positionRangeAtHeight(100)).toEqual({
      firstPosition: 0n,
      count: 1n,
    });
  });

  it("returns correct slice for each of multiple heights", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    // 3 commitments at height 100 (positions 0..2)
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 100 });
    idx.append({ pool: "sapling", cmId: h(3), txid: h(13), height: 100 });
    // 5 commitments at height 200 (positions 3..7)
    idx.append({ pool: "sapling", cmId: h(4), txid: h(14), height: 200 });
    idx.append({ pool: "sapling", cmId: h(5), txid: h(15), height: 200 });
    idx.append({ pool: "sapling", cmId: h(6), txid: h(16), height: 200 });
    idx.append({ pool: "sapling", cmId: h(7), txid: h(17), height: 200 });
    idx.append({ pool: "sapling", cmId: h(8), txid: h(18), height: 200 });

    expect(idx.positionRangeAtHeight(100)).toEqual({
      firstPosition: 0n,
      count: 3n,
    });
    expect(idx.positionRangeAtHeight(200)).toEqual({
      firstPosition: 3n,
      count: 5n,
    });
  });

  it("returns null for a height with no commitment", () => {
    const idx = new CommitmentIndex<"sapling">("sapling");
    idx.append({ pool: "sapling", cmId: h(1), txid: h(11), height: 100 });
    idx.append({ pool: "sapling", cmId: h(2), txid: h(12), height: 300 });
    expect(idx.positionRangeAtHeight(200)).toBeNull();
    expect(idx.positionRangeAtHeight(50)).toBeNull();
    expect(idx.positionRangeAtHeight(999)).toBeNull();
  });
});

describe("CommitmentIndex (properties)", () => {
  it("appended cmIds get positions 0n..n-1 in order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(hex32(), { minLength: 0, maxLength: 200 }),
        (cmIds) => {
          const idx = new CommitmentIndex<"sapling">("sapling");
          for (let i = 0; i < cmIds.length; i++) {
            const cmId = cmIds[i];
            if (cmId === undefined) return false;
            const got = idx.append({ pool: "sapling", cmId, txid: h(i), height: i });
            if (got !== BigInt(i)) return false;
          }
          return idx.size() === BigInt(cmIds.length);
        },
      ),
    );
  });

  it("double-append of the same cmId always throws", () => {
    fc.assert(
      fc.property(hex32(), (cmId) => {
        const idx = new CommitmentIndex<"sapling">("sapling");
        idx.append({ pool: "sapling", cmId, txid: h(0), height: 0 });
        try {
          idx.append({ pool: "sapling", cmId, txid: h(1), height: 1 });
          return false;
        } catch (e) {
          return e instanceof CommitmentAlreadyExistsError;
        }
      }),
    );
  });
});
