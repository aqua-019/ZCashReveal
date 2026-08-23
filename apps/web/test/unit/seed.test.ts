/**
 * Determinism is a product requirement, not an implementation detail: CLAUDE.md
 * bans Math.random so that a given chain tip renders the same ambience for every
 * visitor, in every browser, forever. These tests are what makes that claim
 * checkable - if a refactor perturbs the stream, the site quietly stops being
 * reproducible and nothing else would notice.
 */
import { describe, expect, it } from "vitest";

import { FIXTURE_TIP } from "@/lib/chain";
import { fnv1a, mulberry32, seedLabel, seededRng } from "@/lib/seed";

/** A canonical 64-character lowercase block hash, independent of the fixture. */
const HASH_64 = "0000000000f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b";

function draw(rng: () => number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(rng());
  return out;
}

function isUint32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

describe("fnv1a", () => {
  it("returns an unsigned 32-bit integer for the empty string, a single char and a 64-char hash", () => {
    for (const input of ["", "a", HASH_64]) {
      const h = fnv1a(input);
      expect(isUint32(h), `fnv1a(${JSON.stringify(input.slice(0, 12))}) = ${h}`).toBe(true);
    }
  });

  it("pins the FNV-1a offset basis for the empty string", () => {
    // 2166136261 is the 32-bit offset basis. If this moves, the hash is not FNV-1a.
    expect(fnv1a("")).toBe(2166136261);
  });

  it("is deterministic across calls", () => {
    expect(fnv1a(HASH_64)).toBe(fnv1a(HASH_64));
    expect(fnv1a("a")).toBe(fnv1a("a"));
  });

  it("separates inputs that differ in one bit of one character", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("does not collide across a spread of realistic seeds", () => {
    const seeds = Array.from({ length: 512 }, (_, i) => `${HASH_64}:${i}`);
    expect(new Set(seeds.map(fnv1a)).size).toBe(seeds.length);
  });
});

describe("mulberry32", () => {
  it("yields the same first ten values for the same seed", () => {
    expect(draw(mulberry32(12345), 10)).toEqual(draw(mulberry32(12345), 10));
  });

  it("yields different values for a different seed", () => {
    expect(draw(mulberry32(12345), 10)).not.toEqual(draw(mulberry32(12346), 10));
  });

  it("keeps every value in [0, 1)", () => {
    for (const seed of [0, 1, 12345, 0xffffffff, fnv1a(HASH_64)]) {
      for (const v of draw(mulberry32(seed), 2000)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("does not stick on a constant, including from seed 0", () => {
    const values = draw(mulberry32(0), 32);
    expect(new Set(values).size).toBeGreaterThan(24);
  });
});

describe("seededRng", () => {
  it("puts each namespace on its own stream", () => {
    const fog = draw(seededRng(HASH_64, "fog"), 10);
    const grain = draw(seededRng(HASH_64, "grain"), 10);
    expect(fog).not.toEqual(grain);
    // No shared prefix either: correlated ambience is the failure being excluded.
    expect(fog[0]).not.toBe(grain[0]);
  });

  it("is mulberry32(fnv1a(seed)) when no namespace is given", () => {
    expect(draw(seededRng(HASH_64), 5)).toEqual(draw(mulberry32(fnv1a(HASH_64)), 5));
  });

  it("composes the namespace as seed:namespace", () => {
    expect(draw(seededRng(HASH_64, "fog"), 5)).toEqual(draw(mulberry32(fnv1a(`${HASH_64}:fog`)), 5));
  });

  it("is stable across independently constructed generators", () => {
    expect(draw(seededRng(HASH_64, "fog"), 10)).toEqual(draw(seededRng(HASH_64, "fog"), 10));
  });
});

describe("FIXTURE_TIP", () => {
  it("carries a well-formed 32-byte block hash", () => {
    // 64 lowercase hex characters, no 0x (CLAUDE.md conventions). The mockup
    // literal this was harvested from is 65 characters; the typo stops here.
    expect(FIXTURE_TIP.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ambience regression guard", () => {
  /**
   * Literal expectations, computed by running the shipped implementation. They
   * exist so a "harmless" refactor of seed.ts cannot silently redraw the fog.
   * If either fails, the correct response is to decide whether the change to the
   * rendered ambience was intended - not to paste in the new numbers.
   */
  it("pins the first three fog draws for a fixed 64-character hash", () => {
    const fog = seededRng(HASH_64, "fog");
    expect(draw(fog, 3).map((v) => v.toFixed(6))).toEqual(["0.766764", "0.521425", "0.664549"]);
  });

  it("pins the first three fog draws for FIXTURE_TIP.hash", () => {
    // Coupled to the fixture on purpose: FIXTURE_TIP.hash is the live ambience
    // seed. Editing that hash changes what every visitor sees, so it should have
    // to be recomputed here deliberately rather than drifting unobserved.
    const fog = seededRng(FIXTURE_TIP.hash, "fog");
    // Recomputed once, deliberately, when FIXTURE_TIP.hash was corrected from
    // 65 characters to the 64 a block hash actually has. The ambience changed
    // because the seed changed, which is the system working as designed.
    expect(draw(fog, 3).map((v) => v.toFixed(6))).toEqual(["0.142717", "0.149401", "0.632158"]);
  });
});

describe("seedLabel", () => {
  it("strips the proof-of-work zero run before eliding", () => {
    // Not "0000...2a3b". Every block hash starts with a run of zeros, so
    // eliding the raw string would render the same four leading characters for
    // every block that has ever existed and identify nothing.
    expect(seedLabel(HASH_64)).toBe("f1a2...2a3b");
  });

  it("renders the fixture tip the way the mockup renders it", () => {
    // docs/2.0/mockups/zecreveal-2.0-mockups-v2.html shows "seed 5f3a...c21e"
    // for this tip, and docs/2.0/mockups/reference/v2-00-splash.png with it.
    expect(seedLabel(FIXTURE_TIP.hash)).toBe("5f3a...c21e");
  });

  it("falls back to the original when a seed is all zeros", () => {
    expect(seedLabel("000")).toBe("000");
  });

  it("returns short input unchanged", () => {
    expect(seedLabel("")).toBe("");
    expect(seedLabel("abcd")).toBe("abcd");
    expect(seedLabel("123456789")).toBe("123456789");
  });

  it("elides at the first length above the passthrough boundary", () => {
    expect(seedLabel("1234567890")).toBe("1234...7890");
  });
});
