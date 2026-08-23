/**
 * ZIP 318 denominations, in both units.
 *
 * WHY THIS SUITE LIVES IN THE INDEXER AND NOT BESIDE THE CODE IT TESTS.
 * `packages/zec-types` has no test script - it is a types-and-arithmetic
 * package whose suites have always lived in whichever app consumes them, which
 * is why `zip317.test.ts` is in this directory too. Following that rather than
 * adding a second test runner to the workspace.
 *
 * THE THING THIS FILE EXISTS TO KEEP STRAIGHT is that one denomination has two
 * correct exponents. HANDOFF-07's assertion A4 states a 500 ZEC crossing as
 * `(n,k) = (5, 2)`; migration 003's `denom_k` column is declared
 * `CHECK (denom_k >= 0)` because it is an exponent over ZATOSHI, where the same
 * denomination is `5 x 10^10`. Both are right. Two names for one quantity is
 * how `summary.conventionalFeeZat` came to mean two things in HANDOFF-05, so
 * `Zip318Denomination` carries `kZec` and `kZatoshi` and calls neither of them
 * `k`, and both are asserted on every case below.
 */

import { describe, expect, it } from "vitest";
import {
  ZATOSHI_PER_ZEC,
  ZIP318_DENOM_CAP_ZAT,
  ZIP318_MANTISSAS,
  ZIP318_MAX_RESIDUAL_ZAT,
  canonicalDenomination,
  isBelowMaxResidual,
  isCanonicalDenomination,
  isOverDenomCap,
} from "@zcashreveal/types";

const zec = (n: number | bigint): bigint => BigInt(n) * ZATOSHI_PER_ZEC;

describe("canonicalDenomination - the ladder the corpus states", () => {
  it("recognises the ladder the research names, in ZEC exponents", () => {
    // docs/2.0/research/01-contemporary-zcash.md §2.7: "Denominations follow
    // n x 10^k with n in {1, 2, 5} (0.5, 1, 2, 5, 10, 20, 50, 100...)".
    const rungs: ReadonlyArray<readonly [bigint, number, number]> = [
      [50_000_000n, 5, -1], // 0.5 ZEC
      [zec(1), 1, 0],
      [zec(2), 2, 0],
      [zec(5), 5, 0],
      [zec(10), 1, 1],
      [zec(20), 2, 1],
      [zec(50), 5, 1],
      [zec(100), 1, 2],
      [zec(500), 5, 2], // A4's case
    ];
    for (const [amountZat, n, kZec] of rungs) {
      const d = canonicalDenomination(amountZat);
      expect(d, `${amountZat} zat`).not.toBeNull();
      expect(d?.n).toBe(n);
      expect(d?.kZec).toBe(kZec);
      // And the zatoshi exponent, which is what the database stores and what
      // its `CHECK (denom_k >= 0)` requires.
      expect(d?.kZatoshi).toBe(kZec + 8);
      expect(d?.kZatoshi).toBeGreaterThanOrEqual(0);
    }
  });

  it("A4's pair, spelled out: 500 ZEC is (5, 2) over ZEC and (5, 10) over zatoshi", () => {
    const d = canonicalDenomination(zec(500));
    expect(d).toEqual({ n: 5, kZec: 2, kZatoshi: 10 });
    // The two numbers that must never be written into the same column.
    expect(d?.kZec).not.toBe(d?.kZatoshi);
  });

  it("FAIL SIDE: an amount off the ladder has no denomination at all", () => {
    // 499.5 ZEC strips to 4995, which is not 1, 2 or 5. `null` is the
    // MEASUREMENT here and not a failure to measure: an unquantised crossing is
    // a real observation the migration lens counts, and rounding it into the
    // nearest rung would manufacture the regularity the lens exists to detect.
    for (const off of [49_950_000_000n, zec(3), zec(7), zec(499), 12_345n]) {
      expect(canonicalDenomination(off), `${off} zat`).toBeNull();
      expect(isCanonicalDenomination(off)).toBe(false);
    }
  });

  it("a non-positive amount is never a denomination", () => {
    // A crossing's magnitude is positive by definition - out of Orchard, into
    // Ironwood - so a non-positive value is a sign error on this side of the
    // boundary and must not be dressed up as a denomination.
    expect(canonicalDenomination(0n)).toBeNull();
    expect(canonicalDenomination(-zec(500))).toBeNull();
  });

  it("the mantissa set is exactly {1, 2, 5} and nothing else passes", () => {
    expect([...ZIP318_MANTISSAS]).toEqual([1, 2, 5]);
    // Every other single-digit mantissa at the same exponent is rejected, which
    // is what makes the set load-bearing rather than decorative.
    for (const n of [3, 4, 6, 7, 8, 9]) {
      expect(canonicalDenomination(BigInt(n) * zec(1))).toBeNull();
    }
  });

  it("structural canonicality is not ladder membership, and the two are reported separately", () => {
    // 1 zatoshi is structurally `1 x 10^0` and this function says so, while the
    // corpus's ladder starts at 0.5 ZEC. Rejecting it would be wrong - it IS
    // n x 10^k - and reporting it alone would put a rung on a histogram the
    // ladder does not have. So the size facts are separate predicates and a
    // caller reports them together; `leak-analyzer.ts` raises
    // MIGRATION_DENOMINATION when either fires.
    expect(canonicalDenomination(1n)).toEqual({ n: 1, kZec: -8, kZatoshi: 0 });
    expect(isBelowMaxResidual(1n)).toBe(true);
    expect(isBelowMaxResidual(ZIP318_MAX_RESIDUAL_ZAT)).toBe(false);
    expect(ZIP318_MAX_RESIDUAL_ZAT).toBe(1_000_000n); // 0.01 ZEC
  });
});

describe("DENOM_CAP - a threshold for a finding, never a validity test", () => {
  it("is 10,000 ZEC on the flat reading, and the flat reading is the strict one", () => {
    // The corpus states the cap twice and not identically: "10,000 ZEC plus
    // canonical fee" in the research, a flat 10,000 in TRACKING-MATH §3.9. A
    // crossing between the two is legal under the first and over-cap under the
    // second, so the strict form is answered here - it flags the ambiguous band
    // rather than passing it silently.
    expect(ZIP318_DENOM_CAP_ZAT).toBe(zec(10_000));
    expect(isOverDenomCap(zec(10_000))).toBe(false);
    expect(isOverDenomCap(zec(10_000) + 1n)).toBe(true);
    // The band the two statements disagree about: 10,000 ZEC plus a
    // conventional fee is over-cap on this reading and legal on the other.
    expect(isOverDenomCap(zec(10_000) + 10_000n)).toBe(true);
  });

  it("an over-cap amount still gets its denomination, because the chain is the authority", () => {
    // Migration 003 declined to write a CHECK against either reading, on the
    // grounds that "a database constraint that refuses to record something the
    // chain did... destroys the evidence instead of raising it". The same rule
    // governs here: over-cap is a finding, not a rejection.
    const d = canonicalDenomination(zec(20_000));
    expect(d).toEqual({ n: 2, kZec: 4, kZatoshi: 12 });
    expect(isOverDenomCap(zec(20_000))).toBe(true);
  });
});
