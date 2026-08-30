import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { asHex, type ClaimLevel } from "@zcashreveal/types";

import { NU6_3_ACTIVATION_MAINNET } from "../../decoder/activation-heights.js";
import { classifyByEffectiveSet } from "../claim-classifier.js";
import { effectiveSetSize, entropyBitsUniform } from "../entropy.js";
import {
  ironwoodBirth,
  violatesBirthBound,
  type IronwoodBirth,
  type IronwoodSpend,
  type NeffPoint,
} from "../ironwood-birth.js";

/**
 * THE BIRTH HEIGHT IS IMPORTED, NEVER TYPED. 3,428,143 appears nowhere in this
 * file: `activation-heights.ts` owns it with its citation attached, and
 * `IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP` in the same file records that ZIP 258
 * is status Draft and the number can still move. A fixture carrying its own copy
 * would keep passing after the constant changed, which is the one failure a
 * suite anchored to a draft document must not have.
 */
const BIRTH = NU6_3_ACTIVATION_MAINNET;

const WINDOW = { birthHeight: BIRTH, lowHeight: BIRTH, highHeight: BIRTH + 4_000 } as const;

const LEVELS: ReadonlyArray<ClaimLevel> = [
  "requires_disclosure",
  "small_heuristic_set",
  "broad_candidate_set",
  "aggregate_only",
];

const hx = (n: number) => asHex(n.toString(16).padStart(64, "0"));

function spend(
  index: number,
  candidateCount: bigint,
  overrides: Partial<IronwoodSpend> = {},
): IronwoodSpend {
  return {
    txid: hx(index + 1),
    height: BIRTH + index + 1,
    pool: "ironwood",
    candidateCount,
    ...overrides,
  };
}

/* ==========================================================================
   A4 - a fixture of spends with N_eff {5, 50, 500, 5000} spreads one to a
   claim level.

   THE FIXTURE'S OWN CLASSIFICATION IS ASSERTED BEFORE THE SHARES ARE, because
   "25/25/25/25" is only the right answer if those four counts really do land in
   four different levels. A fixture whose four values shared a level would give
   100/0/0/0 and the failure would look like a defect in the module.
   ========================================================================== */

const A4_COUNTS = [5n, 50n, 500n, 5000n] as const;
const A4_SPENDS: ReadonlyArray<IronwoodSpend> = A4_COUNTS.map((c, i) => spend(i, c));
const QUARTERS: Record<ClaimLevel, number> = {
  requires_disclosure: 0.25,
  small_heuristic_set: 0.25,
  broad_candidate_set: 0.25,
  aggregate_only: 0.25,
};

describe("A4 - the Ironwood birth series over a four-level fixture", () => {
  it("the fixture itself spans all four claim levels, one spend each", () => {
    const levels = A4_COUNTS.map((c) => classifyByEffectiveSet(effectiveSetSize(entropyBitsUniform(c))));
    expect(levels).toEqual([
      "requires_disclosure",
      "small_heuristic_set",
      "broad_candidate_set",
      "aggregate_only",
    ]);
    expect(new Set(levels).size).toBe(4);
  });

  it("A4 PASS STATE: N_eff {5, 50, 500, 5000} produces shares 25/25/25/25", () => {
    const result = ironwoodBirth(A4_SPENDS, WINDOW);

    expect(result.spendCount).toBe(4);
    expect(result.shares).toEqual(QUARTERS);
    // The shares sum to exactly 1 here: 0.25 is a power of two and four of them
    // add without rounding. The general bound is asserted by the property test.
    expect(LEVELS.reduce((a, l) => a + result.shares[l], 0)).toBe(1);

    expect(result.series.map((p) => p.nEff)).toEqual([5, 50, 500, 5000]);
    expect(result.series.map((p) => p.claimLevel)).toEqual([
      "requires_disclosure",
      "small_heuristic_set",
      "broad_candidate_set",
      "aggregate_only",
    ]);
    expect(result.minNEff).toBe(5);
    expect(result.audit.countIn).toBe(4n);
    expect(result.audit.countOut).toBe(4n);
  });

  it("A4 FAIL STATE: 5000 becomes 500 and the shares become 25/25/50/0", () => {
    // THE FIXTURE IS MUTATED, NOT THE MODULE. One spend crosses the 1000
    // threshold downward, so `aggregate_only` empties into
    // `broad_candidate_set` and the assertion's own answer changes. If
    // 25/25/25/25 survived this it would be measuring nothing.
    const crossed = A4_SPENDS.map((s, i) => (i === 3 ? { ...s, candidateCount: 500n } : s));
    const result = ironwoodBirth(crossed, WINDOW);

    expect(result.shares).toEqual({
      requires_disclosure: 0.25,
      small_heuristic_set: 0.25,
      broad_candidate_set: 0.5,
      aggregate_only: 0,
    });
    expect(result.shares).not.toEqual(QUARTERS);
    expect(result.spendCount).toBe(4);
    expect(result.series.map((p) => p.nEff)).toEqual([5, 50, 500, 500]);
  });
});

/* ==========================================================================
   Admission - every exclusion is visible as countIn - countOut
   ========================================================================== */

describe("A4 - admission to the series", () => {
  it("A4 PASS STATE: a spend below the birth height is excluded and shows in countIn - countOut", () => {
    const early: IronwoodSpend = {
      txid: hx(99),
      height: BIRTH - 1,
      pool: "ironwood",
      candidateCount: 7n,
    };
    const result = ironwoodBirth([...A4_SPENDS, early], {
      ...WINDOW,
      // The window is widened below the birth height so that the BIRTH BOUND is
      // what excludes this spend rather than the window. Two rules that both
      // reject an input prove nothing about either.
      lowHeight: BIRTH - 100,
    });

    expect(result.audit.countIn).toBe(5n);
    expect(result.audit.countOut).toBe(4n);
    expect(result.spendCount).toBe(4);
    expect(result.series.some((p) => p.height < BIRTH)).toBe(false);
    // And the excluded spend did not move the shares: still one per level.
    expect(result.shares).toEqual(QUARTERS);
  });

  it("A4 PASS STATE: a non-Ironwood spend is excluded, whatever its height and count", () => {
    const orchard: IronwoodSpend = {
      txid: hx(98),
      height: BIRTH + 2,
      pool: "orchard",
      candidateCount: 3n,
    };
    const result = ironwoodBirth([...A4_SPENDS, orchard], WINDOW);

    expect(result.audit.countIn).toBe(5n);
    expect(result.audit.countOut).toBe(4n);
    // The Orchard spend would have been a second `requires_disclosure` point.
    // Its absence is what keeps the shares at a quarter each.
    expect(result.shares).toEqual(QUARTERS);
    expect(result.series).toHaveLength(4);
  });

  it("A4 PASS STATE: a zero or negative candidate count is excluded rather than thrown", () => {
    // A zero count is a real chain fact - an anchor that bounds an empty tree,
    // which is the condition plan section 3.5 opens by naming - and a negative
    // one is a decoder defect. Both are excluded by the same `> 0n` rule, and
    // neither is fatal to the window around it.
    const empty = spend(10, 0n);
    const negative = spend(11, -4n);
    const result = ironwoodBirth([...A4_SPENDS, empty, negative], WINDOW);

    expect(result.audit.countIn).toBe(6n);
    expect(result.audit.countOut).toBe(4n);
    expect(result.series.some((p) => p.candidateCount <= 0)).toBe(false);
  });

  it("A4 PASS STATE: the window is inclusive at both ends and excludes outside it", () => {
    const window = { birthHeight: BIRTH, lowHeight: BIRTH + 2, highHeight: BIRTH + 3 } as const;
    const result = ironwoodBirth(A4_SPENDS, window);

    // A4_SPENDS sit at BIRTH+1..BIRTH+4; the window admits the middle two.
    expect(result.series.map((p) => p.height)).toEqual([BIRTH + 2, BIRTH + 3]);
    expect(result.audit.countIn).toBe(4n);
    expect(result.audit.countOut).toBe(2n);
    expect(result.shares).toEqual({
      requires_disclosure: 0,
      small_heuristic_set: 0.5,
      broad_candidate_set: 0.5,
      aggregate_only: 0,
    });
  });

  it("A4 FAIL STATE: an inverted window throws rather than returning an empty series", () => {
    expect(() =>
      ironwoodBirth(A4_SPENDS, { birthHeight: BIRTH, lowHeight: BIRTH + 9, highHeight: BIRTH }),
    ).toThrow(RangeError);
    expect(() =>
      ironwoodBirth(A4_SPENDS, { birthHeight: 1.5, lowHeight: BIRTH, highHeight: BIRTH + 1 }),
    ).toThrow(RangeError);
  });
});

/* ==========================================================================
   The empty series - 0/0 is undefined, and this shape says so
   ========================================================================== */

describe("A4 - the empty series", () => {
  it("A4 PASS STATE: an empty series gives all-zero shares and a null minNEff, never NaN", () => {
    const result = ironwoodBirth([], WINDOW);

    expect(result.spendCount).toBe(0);
    expect(result.minNEff).toBeNull();
    expect(result.series).toEqual([]);
    for (const level of LEVELS) {
      expect(result.shares[level]).toBe(0);
      expect(Number.isNaN(result.shares[level])).toBe(false);
    }
    expect(result.audit.countIn).toBe(0n);
    expect(result.audit.countOut).toBe(0n);
  });

  it("A4 PASS STATE: a window entirely before the birth height is empty, not an error", () => {
    // Not an inverted window and not a defect: the pool did not exist yet, and
    // the empty series is the correct answer to that question.
    const result = ironwoodBirth(A4_SPENDS, {
      birthHeight: BIRTH,
      lowHeight: BIRTH - 500,
      highHeight: BIRTH - 1,
    });
    expect(result.spendCount).toBe(0);
    expect(result.minNEff).toBeNull();
    expect(result.audit.countIn).toBe(4n);
    expect(result.audit.countOut).toBe(0n);
  });

  it("A4 FAIL STATE: the empty case is reachable, so a NaN share would be caught", () => {
    // The fail side of the shape above: 0/0 really is NaN, so the module's
    // `shareOf` guard is doing work rather than restating a division that was
    // already safe. Without it every field of `shares` would be NaN here.
    expect(Number.isNaN(0 / 0)).toBe(true);
    const result = ironwoodBirth([], WINDOW);
    expect(LEVELS.map((l) => result.shares[l])).toEqual([0, 0, 0, 0]);
  });
});

/* ==========================================================================
   Precision - 2^log2(N) is not N, and the claim level does not move
   ========================================================================== */

describe("A4 - precision at the claim thresholds", () => {
  it("A4 PASS STATE: N_eff is recovered exactly at and around every threshold", () => {
    // Observed on this container's Node 22 and RECORDED rather than asserted,
    // because the raw float is a property of the platform's libm:
    //   2^log2(10)   = 9.999999999999998
    //   2^log2(100)  = 99.99999999999997
    //   2^log2(1000) = 1000
    //   2^log2(1001) = 1000.9999999999994
    // What IS asserted is the claim the module's Precision paragraph makes: the
    // rounded recovery is exact at every threshold and on either side of it, so
    // no claim level can flip.
    const probes = [1n, 2n, 9n, 10n, 11n, 99n, 100n, 101n, 999n, 1000n, 1001n, 1_000_000n];
    for (const n of probes) {
      expect(effectiveSetSize(entropyBitsUniform(n))).toBe(n);
    }

    const points = probes.map((c, i) => spend(i, c));
    const result = ironwoodBirth(points, { ...WINDOW, highHeight: BIRTH + 100 });
    expect(result.series.map((p) => p.nEff)).toEqual(probes.map((n) => Number(n)));
    // Lower-inclusive at every boundary: 10 is requires_disclosure, 100 is
    // small_heuristic_set, 1000 is broad_candidate_set.
    expect(result.series.map((p) => p.claimLevel)).toEqual([
      "requires_disclosure",
      "requires_disclosure",
      "requires_disclosure",
      "requires_disclosure",
      "small_heuristic_set",
      "small_heuristic_set",
      "small_heuristic_set",
      "broad_candidate_set",
      "broad_candidate_set",
      "broad_candidate_set",
      "aggregate_only",
      "aggregate_only",
    ]);
  });

  it("A4 PASS STATE: the recovery is exact for every N from 1 to 50,000", () => {
    // The sweep behind the module's Precision paragraph, run in the suite rather
    // than quoted from a scratch script. A single failure here would mean an
    // N_eff the site publishes is not the candidate count it was derived from.
    const failures: string[] = [];
    for (let n = 1n; n <= 50_000n; n++) {
      if (effectiveSetSize(entropyBitsUniform(n)) !== n) failures.push(String(n));
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  });
});

/* ==========================================================================
   The audit record
   ========================================================================== */

describe("A4 - the ironwood_birth audit record", () => {
  it("A4 PASS STATE: every field of params is emitted and agrees with the result", () => {
    const result = ironwoodBirth(A4_SPENDS, WINDOW);
    expect(result.audit).toEqual({
      filter: "ironwood_birth",
      params: {
        birthHeight: BIRTH,
        lowHeight: WINDOW.lowHeight,
        highHeight: WINDOW.highHeight,
        requiresDisclosureShare: 0.25,
        minNEff: 5,
      },
      countIn: 4n,
      countOut: 4n,
    });
  });

  it("A4 FAIL STATE: an empty series writes the sentinel, and countOut is what marks it", () => {
    // `params.minNEff` is typed `number`, so the null the result carries cannot
    // reach the record. The sentinel 0 is unambiguous - an admitted spend has
    // candidateCount > 0n, hence N_eff >= 1 - and `countOut === 0n` on the same
    // record is the flag a reader uses. Reported to the lead as a proposed
    // widening of the variant to `number | null`.
    const result = ironwoodBirth([], WINDOW);
    expect(result.minNEff).toBeNull();
    if (result.audit.filter !== "ironwood_birth") throw new Error("wrong variant");
    expect(result.audit.params.minNEff).toBe(0);
    expect(result.audit.countOut).toBe(0n);
    // And 0 is not reachable as a real minimum: the smallest admissible count
    // is 1, which gives N_eff 1.
    const one = ironwoodBirth([spend(0, 1n)], WINDOW);
    expect(one.minNEff).toBe(1);
  });
});

/* ==========================================================================
   violatesBirthBound - the falsifiable form of the birth bound
   ========================================================================== */

describe("A4 - violatesBirthBound", () => {
  it("A4 PASS STATE: a clean set does not violate the bound", () => {
    expect(violatesBirthBound(A4_SPENDS, BIRTH)).toBe(false);
    // A non-Ironwood spend below the birth height is not a violation: Sapling
    // notes existed for seven years before NU6.3.
    const sapling: IronwoodSpend = {
      txid: hx(50),
      height: BIRTH - 1_000_000,
      pool: "sapling",
      candidateCount: 900n,
    };
    expect(violatesBirthBound([...A4_SPENDS, sapling], BIRTH)).toBe(false);
  });

  it("A4 FAIL STATE: one Ironwood spend below the birth height flips it", () => {
    const impossible: IronwoodSpend = {
      txid: hx(51),
      height: BIRTH - 1,
      pool: "ironwood",
      candidateCount: 3n,
    };
    expect(violatesBirthBound([...A4_SPENDS, impossible], BIRTH)).toBe(true);

    // The predicate reads the HEIGHT and not merely the shape: the same spend
    // against an earlier birth height is legal.
    expect(violatesBirthBound([...A4_SPENDS, impossible], BIRTH - 10)).toBe(false);

    // AND IT IS NOT ANSWERED FROM THE SERIES, which is why it can be true at
    // all. `ironwoodBirth` excludes this spend, so a predicate over the OUTPUT
    // would restate the filter and return false for every input ever built.
    const result = ironwoodBirth([...A4_SPENDS, impossible], { ...WINDOW, lowHeight: BIRTH - 100 });
    expect(result.series.some((p) => p.height < BIRTH)).toBe(false);
    expect(violatesBirthBound([...A4_SPENDS, impossible], BIRTH)).toBe(true);
  });

  it("A4 PASS STATE: a zero-count pre-birth Ironwood spend still violates the bound", () => {
    // The single input that most looks like a decoder defect: a spend against a
    // tree that does not exist reports an EMPTY candidate set, so the admission
    // rule would drop it and a count-aware predicate would let it pass in
    // silence.
    const ghost: IronwoodSpend = {
      txid: hx(52),
      height: BIRTH - 5,
      pool: "ironwood",
      candidateCount: 0n,
    };
    expect(violatesBirthBound([ghost], BIRTH)).toBe(true);
    expect(ironwoodBirth([ghost], { ...WINDOW, lowHeight: BIRTH - 100 }).spendCount).toBe(0);
  });
});

/* ==========================================================================
   The property, its worked cases, and its non-vacuity counters
   ========================================================================== */

/** A point whose claim chip does not follow from the N_eff printed beside it. */
function pointDisagrees(p: NeffPoint): boolean {
  return classifyByEffectiveSet(BigInt(Math.round(p.nEff))) !== p.claimLevel;
}

/**
 * Shares that do not reproduce the series they claim to summarise.
 *
 * THIS QUANTIFIES OVER THE AGGREGATE, WHICH IS THE HALF A PER-ELEMENT CHECK
 * CANNOT SEE. LEDGER-08 fold 3's case was a property that "said sigma and the
 * test never summed"; the inverse trap is a check that only sums, because a
 * shares record can add to exactly 1 and still misdescribe every bar of the
 * series beneath it. So this recomputes the counts from the series and requires
 * each share to be that count over `spendCount` EXACTLY, and then also bounds
 * the sum.
 */
function sharesDisagree(result: IronwoodBirth): boolean {
  const counts: Record<ClaimLevel, number> = {
    requires_disclosure: 0,
    small_heuristic_set: 0,
    broad_candidate_set: 0,
    aggregate_only: 0,
  };
  for (const p of result.series) counts[p.claimLevel] += 1;

  for (const level of LEVELS) {
    const expected = result.spendCount === 0 ? 0 : counts[level] / result.spendCount;
    if (result.shares[level] !== expected) return true;
  }

  const sum = LEVELS.reduce((a, l) => a + result.shares[l], 0);
  if (result.spendCount === 0) return sum !== 0;
  // Eight ulps. Four correctly-rounded doubles and three additions; the worst
  // deviation measured over every four-part partition of every total up to 600
  // was one ulp, and the bound is loosened rather than pinned to the
  // measurement so the property tests the law and not the search that found it.
  return Math.abs(sum - 1) > 8 * Number.EPSILON;
}

describe("A4 - the property, with the scenarios it forbids executed by name", () => {
  it("WORKED CASE: an N_eff of 10 labelled small_heuristic_set is caught", () => {
    // THE CONCRETE SCENARIO `pointDisagrees` EXISTS TO FORBID, executed rather
    // than described. Ten is the lower-inclusive boundary - the one value where
    // an off-by-one in the classifier is invisible in every other test - and
    // this is the point the site would render as "N_eff 10, small heuristic
    // set", one level looser than the truth, next to a spend that a disclosure
    // would name.
    const forbidden: NeffPoint = {
      height: BIRTH + 1,
      candidateCount: 10,
      nEff: 10,
      claimLevel: "small_heuristic_set",
    };
    expect(pointDisagrees(forbidden)).toBe(true);

    // And the module does not produce it: candidateCount 10n classifies tighter.
    const real = ironwoodBirth([spend(0, 10n)], WINDOW);
    expect(real.series[0]?.claimLevel).toBe("requires_disclosure");
    expect(real.series.some(pointDisagrees)).toBe(false);
  });

  it("WORKED CASE: shares that sum to 1 and still misdescribe the series are caught", () => {
    // THE CONCRETE SCENARIO `sharesDisagree` EXISTS TO FORBID. Four points, all
    // at `requires_disclosure`, published under a 25/25/25/25 split: the sum is
    // exactly 1, so a check that only summed would pass it, and the page would
    // report that three quarters of Ironwood spends were safely aggregate when
    // none of them were.
    const real = ironwoodBirth([spend(0, 2n), spend(1, 3n), spend(2, 4n), spend(3, 5n)], WINDOW);
    expect(real.spendCount).toBe(4);
    expect(real.shares.requires_disclosure).toBe(1);
    expect(sharesDisagree(real)).toBe(false);

    const forged: IronwoodBirth = { ...real, shares: QUARTERS };
    expect(LEVELS.reduce((a, l) => a + forged.shares[l], 0)).toBe(1);
    expect(sharesDisagree(forged)).toBe(true);

    // And the float half of the same check, on the counterexample the module's
    // docblock names: 0, 1, 4, 1 over six spends sums to 0.9999999999999999.
    expect(0 / 6 + 1 / 6 + 4 / 6 + 1 / 6).not.toBe(1);
    expect(Math.abs(0 / 6 + 1 / 6 + 4 / 6 + 1 / 6 - 1)).toBeLessThanOrEqual(8 * Number.EPSILON);
  });

  it("A4 PROPERTY: no series ever disagrees with its own shares, points or bounds", () => {
    // Counters, not `numRuns`. A green run of a property that never reached the
    // interesting shape proves nothing, so each arm records that it was entered.
    let pointsSeen = 0;
    let nonEmptySeen = 0;
    let excludedSeen = 0;
    let belowBirthSeen = 0;
    let mixedPoolSeen = 0;
    const levelsSeen = new Set<ClaimLevel>();

    const candidateCountArb = fc.oneof(
      // Spans the exclusions and all four levels, so coverage is a property of
      // the generator rather than of luck over 300 runs.
      fc.bigInt({ min: -3n, max: 10n }),
      fc.bigInt({ min: 11n, max: 100n }),
      fc.bigInt({ min: 101n, max: 1_000n }),
      fc.bigInt({ min: 1_001n, max: 100_000n }),
    );

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            index: fc.integer({ min: 0, max: 200 }),
            offset: fc.integer({ min: -50, max: 500 }),
            pool: fc.constantFrom("ironwood" as const, "orchard" as const, "sapling" as const),
            candidateCount: candidateCountArb,
          }),
          { minLength: 0, maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 400 }),
        (rows, highOffset) => {
          const spends: IronwoodSpend[] = rows.map((r, i) => ({
            txid: hx(r.index * 1000 + i),
            height: BIRTH + r.offset,
            pool: r.pool,
            candidateCount: r.candidateCount,
          }));
          const opts = {
            birthHeight: BIRTH,
            lowHeight: BIRTH - 100,
            highHeight: BIRTH + highOffset,
          } as const;

          const before = spends.map((s) => ({ ...s }));
          const result = ironwoodBirth(spends, opts);

          // The caller's array is untouched, in order and in content.
          if (JSON.stringify(spends.map(stringifySpend)) !== JSON.stringify(before.map(stringifySpend))) {
            return false;
          }

          if (sharesDisagree(result)) return false;
          for (const p of result.series) {
            pointsSeen += 1;
            levelsSeen.add(p.claimLevel);
            if (pointDisagrees(p)) return false;
            // Every admission rule, restated as a property of the output.
            if (p.height < BIRTH) return false;
            if (p.height < opts.lowHeight || p.height > opts.highHeight) return false;
            if (p.candidateCount <= 0) return false;
          }

          // Ascending by height.
          for (let i = 1; i < result.series.length; i++) {
            const previous = result.series[i - 1];
            const current = result.series[i];
            if (previous === undefined || current === undefined) return false;
            if (current.height < previous.height) return false;
          }

          // THE POOL IS THE ONE ADMISSION RULE THE OUTPUT CANNOT SHOW, because
          // `NeffPoint` carries no pool. It is BOUNDED here rather than
          // restated: re-running the filter inside the property would only
          // prove the property agrees with its own copy of the code, while a
          // bound is a fact about the result that a broken filter breaks. A
          // series can never be longer than the Ironwood spends it was offered.
          const ironwoodOffered = spends.filter((s) => s.pool === "ironwood").length;
          if (result.spendCount > ironwoodOffered) return false;
          if (ironwoodOffered < spends.length) mixedPoolSeen += 1;

          // The two counts and the gap between them.
          if (result.audit.countIn !== BigInt(spends.length)) return false;
          if (result.audit.countOut !== BigInt(result.spendCount)) return false;
          if (result.audit.countIn < result.audit.countOut) return false;
          if (result.audit.countIn > result.audit.countOut) excludedSeen += 1;

          // minNEff is the series minimum, or null when there is no series.
          if (result.spendCount === 0) {
            if (result.minNEff !== null) return false;
          } else {
            nonEmptySeen += 1;
            const min = Math.min(...result.series.map((p) => p.nEff));
            if (result.minNEff !== min) return false;
          }

          // The birth bound, asked of the RAW input rather than the output.
          const anyEarly = spends.some((s) => s.pool === "ironwood" && s.height < BIRTH);
          if (violatesBirthBound(spends, BIRTH) !== anyEarly) return false;
          if (anyEarly) belowBirthSeen += 1;

          return true;
        },
      ),
      { numRuns: 300 },
    );

    expect(pointsSeen, "the property never saw a series point, so it proved nothing").toBeGreaterThan(0);
    expect(nonEmptySeen, "the property never saw a non-empty series, so the shares were never tested").toBeGreaterThan(0);
    expect(excludedSeen, "the property never saw an exclusion, so countIn - countOut was never tested").toBeGreaterThan(0);
    expect(belowBirthSeen, "the property never saw a pre-birth spend, so the birth bound was never tested").toBeGreaterThan(0);
    expect(mixedPoolSeen, "the property never saw a non-Ironwood spend, so the pool bound was never tested").toBeGreaterThan(0);
    expect(levelsSeen.size, "the property never saw more than one claim level").toBeGreaterThanOrEqual(3);
  });
});

/** JSON.stringify cannot serialise a bigint, so the copy check spells it out. */
function stringifySpend(s: IronwoodSpend): string {
  return `${s.txid}|${s.height}|${s.pool}|${s.candidateCount}`;
}
