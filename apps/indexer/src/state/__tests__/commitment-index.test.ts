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
