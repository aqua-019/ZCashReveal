import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex } from "@zcashreveal/types";
import { NullifierIndex } from "../nullifier-index.js";
import { DoubleSpendError } from "../errors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hex32 = () =>
  fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .map((b) => asHex(Buffer.from(b).toString("hex")));

describe("NullifierIndex (happy path)", () => {
  it("records and reports spent", () => {
    const idx = new NullifierIndex<"sapling">("sapling");
    idx.record({ pool: "sapling", nfId: h(1), spentTxid: h(10), spentHeight: 100 });
    expect(idx.isSpent(h(1))).toBe(true);
    expect(idx.spendingTx(h(1))).toEqual({ txid: h(10), height: 100 });
  });

  it("reports false / undefined for unknown nullifiers", () => {
    const idx = new NullifierIndex<"sapling">("sapling");
    expect(idx.isSpent(h(99))).toBe(false);
    expect(idx.spendingTx(h(99))).toBeUndefined();
  });

  it("throws DoubleSpendError on duplicate nfId", () => {
    const idx = new NullifierIndex<"orchard">("orchard");
    idx.record({ pool: "orchard", nfId: h(1), spentTxid: h(10), spentHeight: 1 });
    expect(() =>
      idx.record({ pool: "orchard", nfId: h(1), spentTxid: h(11), spentHeight: 2 }),
    ).toThrow(DoubleSpendError);
  });

  it("snapshot reports pool and count", () => {
    const idx = new NullifierIndex<"sapling">("sapling");
    idx.record({ pool: "sapling", nfId: h(1), spentTxid: h(10), spentHeight: 1 });
    idx.record({ pool: "sapling", nfId: h(2), spentTxid: h(20), spentHeight: 2 });
    expect(idx.snapshot()).toEqual({ pool: "sapling", nullifierCount: 2 });
  });
});

describe("NullifierIndex (properties)", () => {
  it("each nfId can be recorded at most once across any sequence", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(hex32(), { minLength: 0, maxLength: 200 }),
        (nfs) => {
          const idx = new NullifierIndex<"sapling">("sapling");
          for (let i = 0; i < nfs.length; i++) {
            const nfId = nfs[i];
            if (nfId === undefined) return false;
            idx.record({
              pool: "sapling",
              nfId,
              spentTxid: h(i + 1000),
              spentHeight: i,
            });
          }
          if (idx.snapshot().nullifierCount !== nfs.length) return false;
          if (nfs.length === 0) return true;
          const first = nfs[0];
          if (first === undefined) return false;
          try {
            idx.record({
              pool: "sapling",
              nfId: first,
              spentTxid: h(9999),
              spentHeight: 9999,
            });
            return false;
          } catch (e) {
            return e instanceof DoubleSpendError;
          }
        },
      ),
    );
  });
});
