import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { asHex, type Anchor } from "@zcashreveal/types";
import { AnchorIndex } from "../anchor-index.js";
import { ConflictingAnchorError } from "../errors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
const hex32 = () =>
  fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .map((b) => asHex(Buffer.from(b).toString("hex")));

describe("AnchorIndex (happy path)", () => {
  it("records and looks up by root", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    const a: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      maxPosition: 10n,
      heightCreated: 100,
    };
    idx.record(a);
    expect(idx.hasRoot(h(1))).toBe(true);
    expect(idx.maxPositionFor(h(1))).toBe(10n);
  });

  it("returns undefined for unknown roots", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    expect(idx.hasRoot(h(9))).toBe(false);
    expect(idx.maxPositionFor(h(9))).toBeUndefined();
  });

  it("is idempotent on identical record", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    const a: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      maxPosition: 10n,
      heightCreated: 100,
    };
    idx.record(a);
    expect(() => idx.record({ ...a })).not.toThrow();
    expect(idx.snapshot().anchorCount).toBe(1);
  });

  it("throws ConflictingAnchorError on differing maxPosition", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    idx.record({ pool: "sapling", root: h(1), maxPosition: 10n, heightCreated: 100 });
    expect(() =>
      idx.record({ pool: "sapling", root: h(1), maxPosition: 11n, heightCreated: 100 }),
    ).toThrow(ConflictingAnchorError);
  });

  it("throws ConflictingAnchorError on differing heightCreated", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    idx.record({ pool: "sapling", root: h(1), maxPosition: 10n, heightCreated: 100 });
    expect(() =>
      idx.record({ pool: "sapling", root: h(1), maxPosition: 10n, heightCreated: 101 }),
    ).toThrow(ConflictingAnchorError);
  });

  it("snapshot reports pool and count", () => {
    const idx = new AnchorIndex<"orchard">("orchard");
    idx.record({ pool: "orchard", root: h(1), maxPosition: 1n, heightCreated: 1 });
    idx.record({ pool: "orchard", root: h(2), maxPosition: 2n, heightCreated: 2 });
    expect(idx.snapshot()).toEqual({ pool: "orchard", anchorCount: 2 });
  });
});

describe("AnchorIndex.getByRoot", () => {
  it("returns the full Anchor for a recorded root", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    const a: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(42),
      maxPosition: 7n,
      heightCreated: 500,
    };
    idx.record(a);
    const got = idx.getByRoot(h(42));
    expect(got).not.toBeNull();
    expect(got).toEqual(a);
  });

  it("returns null for an unrecorded root", () => {
    const idx = new AnchorIndex<"sapling">("sapling");
    expect(idx.getByRoot(h(99))).toBeNull();
  });

  it("returned anchor's pool matches the index's generic at compile time", () => {
    const sap = new AnchorIndex<"sapling">("sapling");
    sap.record({ pool: "sapling", root: h(1), maxPosition: 0n, heightCreated: 1 });
    const a = sap.getByRoot(h(1));
    if (a) {
      // @ts-expect-error - Anchor<"sapling"> must not be assignable to Anchor<"orchard">
      const crossPool: Anchor<"orchard"> = a;
      void crossPool;
    }
    expect(a).not.toBeNull();
  });
});

describe("AnchorIndex (properties)", () => {
  it("re-recording an identical anchor is a no-op", () => {
    fc.assert(
      fc.property(
        hex32(),
        fc.bigInt({ min: 0n, max: 2n ** 40n }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (root, maxPosition, heightCreated) => {
          const idx = new AnchorIndex<"sapling">("sapling");
          const a: Anchor<"sapling"> = {
            pool: "sapling",
            root,
            maxPosition,
            heightCreated,
          };
          idx.record(a);
          idx.record({ ...a });
          return idx.snapshot().anchorCount === 1;
        },
      ),
    );
  });

  it("re-recording a known root with different data always throws", () => {
    fc.assert(
      fc.property(
        hex32(),
        fc.bigInt({ min: 0n, max: 2n ** 40n }),
        fc.bigInt({ min: 0n, max: 2n ** 40n }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (root, mp1, mp2, hc1, hc2) => {
          fc.pre(mp1 !== mp2 || hc1 !== hc2);
          const idx = new AnchorIndex<"sapling">("sapling");
          idx.record({ pool: "sapling", root, maxPosition: mp1, heightCreated: hc1 });
          try {
            idx.record({ pool: "sapling", root, maxPosition: mp2, heightCreated: hc2 });
            return false;
          } catch (e) {
            return e instanceof ConflictingAnchorError;
          }
        },
      ),
    );
  });
});
