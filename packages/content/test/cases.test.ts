/**
 * Assertion A6 and the rest of the case file.
 *
 * The nine amounts of the 2 January 2026 event are the most load-bearing
 * numbers in the package: the whole round-trip inference rests on them agreeing
 * to four decimal places. They are pinned here so a later edit that "tidies" a
 * figure fails the build instead of quietly changing a claim.
 */
import { describe, expect, it } from "vitest";

import { getCase, getCases } from "../src/loaders.js";

/** research 04 section 2.1, in the order the reconstruction prints them. */
const JANUARY_AMOUNTS = [
  "29999.99",
  "1999.99",
  "17999.99",
  "202076.207",
  "50000.96",
  "50000.5541",
  "24000.9781",
  "74001.9317",
  "1293.9321",
] as const;

describe("A6 -- the 2 January 2026 case", () => {
  it("has exactly nine steps", () => {
    const januaryCase = getCase("K-2026-01-02");
    expect(januaryCase).toBeDefined();
    expect(januaryCase?.steps).toHaveLength(9);
  });

  it("carries exactly the nine amounts of research 04 section 2.1, in order", () => {
    const januaryCase = getCase("K-2026-01-02");
    expect(januaryCase?.steps.map((s) => s.amount)).toEqual([...JANUARY_AMOUNTS]);
  });

  it("gives every step a 64-character lowercase txid", () => {
    const januaryCase = getCase("K-2026-01-02");
    for (const step of januaryCase?.steps ?? []) {
      expect(step.txid, `step ${step.time} has no txid`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("never names an owner in its verdict", () => {
    const verdict = getCase("K-2026-01-02")?.verdict ?? "";
    // The corpus label is an analyst's, not a fact, so the verdict must not
    // assert the exchange's identity. It may say what it does not prove.
    expect(verdict).toMatch(/does not prove|cannot be proven|nothing here establishes/i);
  });
});

describe("the case file", () => {
  it("holds exactly the three cases the handoff names", () => {
    expect(new Set(getCases().map((c) => c.id))).toEqual(
      new Set(["K-2026-01-02", "K-202076-unshield", "K-zip271-lockbox"]),
    );
  });

  it("returns undefined for an id that does not exist", () => {
    expect(getCase("K-nope")).toBeUndefined();
  });

  it("keeps the lockbox arithmetic the chain shows", () => {
    const lockbox = getCase("K-zip271-lockbox");
    const [disbursed] = lockbox?.steps ?? [];
    expect(disbursed?.amount).toBe("78750.00");
    expect(disbursed?.height).toBe(3146400);
    // The verdict is prose, so it groups its digits. Compare the values, not the commas:
    // 7,875.00 out, 7,438.2295 back, 129.8202 out = 566.5907 net removed, 78,183.4093 left.
    const figures = (lockbox?.verdict ?? "").replace(/,/g, "");
    expect(figures).toContain("566.5907");
    expect(figures).toContain("78183.4093");
  });
});
