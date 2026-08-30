import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ZIP318_MAX_CROSSING_ZAT,
  ZIP318_MAX_RESIDUAL_ZAT,
  asHex,
} from "@zcashreveal/types";

import { migrationLens, violatesDenominationBounds, type Crossing } from "../migration-lens.js";

const ZATOSHI_PER_ZEC = 100_000_000n;

/** ZEC as a decimal string to integer zatoshi. No float ever touches an amount. */
function zec(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > 8) throw new Error(`more than 8 decimal places: ${amount}`);
  return BigInt(whole!) * ZATOSHI_PER_ZEC + BigInt(frac.padEnd(8, "0"));
}

const hx = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/* ==========================================================================
   The fixture ladder, taken from apps/web/src/lib/api/fixtures/pools.ts

   ITS TOTALS ARE ASSERTED HERE RATHER THAN TRUSTED. The handoff states that
   the ladder sums to 847 crossings and 134,472 ZEC and instructs that a
   disagreement be REPORTED rather than papered over on either side, so the two
   totals are computed from the rows and asserted before any lens is built. The
   fixture's own docblock records why the numbers are what they are: the
   mockup's fourteen bars summed to 82,428.5 ZEC while the caption above them
   said 134,472, and eleven crossings were moved up the ladder to close a
   52,043 ZEC contradiction between two panels of one page.
   ========================================================================== */

const DENOMINATIONS: ReadonlyArray<{ zec: string; count: number }> = [
  { zec: "0.5", count: 56 },
  { zec: "1", count: 178 },
  { zec: "2", count: 98 },
  { zec: "5", count: 142 },
  { zec: "10", count: 128 },
  { zec: "20", count: 44 },
  { zec: "50", count: 74 },
  { zec: "100", count: 58 },
  { zec: "200", count: 21 },
  { zec: "500", count: 23 },
  { zec: "1000", count: 9 },
  { zec: "2000", count: 6 },
  { zec: "5000", count: 3 },
  { zec: "10000", count: 7 },
];

const WINDOW = { lowHeight: 3_456_000, highHeight: 3_456_900 } as const;

/**
 * The 847 crossings, spread across the window.
 *
 * INTERLEAVED BY LADDER POSITION RATHER THAN GROUPED BY DENOMINATION, so the
 * histogram is not being handed a pre-sorted input. A fixture that emitted all
 * 56 halves, then all 178 ones, would make `maxWallets` equal the number of
 * denominations by construction and would leave the run-detection logic
 * untested by the very fixture that exercises everything else.
 */
function ladderCrossings(): Crossing[] {
  const out: Crossing[] = [];
  let i = 0;
  const remaining = DENOMINATIONS.map((d) => d.count);
  let left = remaining.reduce((a, b) => a + b, 0);
  while (left > 0) {
    for (const [k, d] of DENOMINATIONS.entries()) {
      if (remaining[k]! <= 0) continue;
      remaining[k] = remaining[k]! - 1;
      left -= 1;
      out.push({
        txid: hx(i + 1),
        height: WINDOW.lowHeight + (i % 900),
        amountZat: zec(d.zec),
      });
      i += 1;
    }
  }
  return out;
}

const LADDER_CROSSINGS = 847;
const LADDER_ZEC = "134472";

describe("A3 - the migration lens over the fixture ladder", () => {
  it("the fixture ladder itself sums to 847 crossings and 134,472 ZEC", () => {
    const crossings = DENOMINATIONS.reduce((a, d) => a + d.count, 0);
    const total = DENOMINATIONS.reduce((a, d) => a + zec(d.zec) * BigInt(d.count), 0n);
    expect(crossings).toBe(LADDER_CROSSINGS);
    expect(total).toBe(zec(LADDER_ZEC));
    // And the generator reproduces the ladder it was built from.
    expect(ladderCrossings()).toHaveLength(LADDER_CROSSINGS);
  });

  it("A3 PASS STATE: 847 crossings, bucket counts sum to 847, every amount canonical", () => {
    const lens = migrationLens(ladderCrossings(), WINDOW);

    const bucketed = lens.buckets.reduce((a, b) => a + b.count, 0);
    expect(bucketed).toBe(LADDER_CROSSINGS);
    expect(lens.canonicalCount).toBe(LADDER_CROSSINGS);
    expect(lens.nonCanonicalCount).toBe(0);
    expect(lens.sumZat).toBe(zec(LADDER_ZEC));

    // Fourteen bars, ascending by magnitude, each one a real ZIP 318
    // denomination whose two exponents agree with `kZec = kZatoshi - 8`.
    expect(lens.buckets).toHaveLength(DENOMINATIONS.length);
    const magnitudes = lens.buckets.map((b) => BigInt(b.n) * 10n ** BigInt(b.kZatoshi));
    expect(magnitudes).toEqual(DENOMINATIONS.map((d) => zec(d.zec)));
    for (const b of lens.buckets) {
      expect([1, 2, 5]).toContain(b.n);
      expect(b.kZec).toBe(b.kZatoshi - 8);
      expect(b.kZatoshi).toBeGreaterThanOrEqual(0);
      expect(b.sumZat).toBe(BigInt(b.n) * 10n ** BigInt(b.kZatoshi) * BigInt(b.count));
    }
    // 0.5 ZEC is the two-exponent case zip318.ts settled: n=5, kZatoshi=7, kZec=-1.
    expect(lens.buckets[0]).toMatchObject({ n: 5, kZatoshi: 7, kZec: -1, count: 56 });
    expect(lens.buckets[13]).toMatchObject({ n: 1, kZatoshi: 12, kZec: 4, count: 7 });

    // The law, over the raw input rather than over the lens's own output.
    expect(violatesDenominationBounds(ladderCrossings())).toBe(false);

    // The audit record: countIn is every crossing in the window, countOut the
    // ones that landed in a bucket, and the difference is nonCanonicalCount.
    const audit = lens.audit;
    expect(audit.filter).toBe("migration_lens");
    if (audit.filter !== "migration_lens") throw new Error("not a migration_lens record");
    expect(audit.countIn).toBe(BigInt(LADDER_CROSSINGS));
    expect(audit.countOut).toBe(BigInt(LADDER_CROSSINGS));
    expect(audit.params.canonicalCount).toBe(LADDER_CROSSINGS);
    expect(audit.params.nonCanonicalCount).toBe(0);
    expect(audit.params.sumZat).toBe(zec(LADDER_ZEC));
    expect(audit.params.lowHeight).toBe(WINDOW.lowHeight);
    expect(audit.params.highHeight).toBe(WINDOW.highHeight);
    expect(audit.params.minNotes).toBe(lens.minNotes);
    expect(audit.params.maxWallets).toBe(lens.maxWallets);
    expect(audit.params.strandedDustZat).toBe(lens.strandedDustZat);
  });

  it("A3 FAIL STATE: a 499.5 ZEC crossing is flagged non-canonical and counted separately", () => {
    // 499.5 ZEC is 49,950,000,000 zat: strip the factors of ten and 4995 is
    // left, which is not 1, 2 or 5. It is the amount the handoff names because
    // it sits between two real bars - the 500 ZEC bar is one bucket away, and a
    // lens that rounded would hide the one observation the lens exists to make.
    const injected: Crossing = {
      txid: hx(9_999),
      height: WINDOW.lowHeight + 400,
      amountZat: zec("499.5"),
    };
    const lens = migrationLens([...ladderCrossings(), injected], WINDOW);

    // The buckets are UNCHANGED: still 847, still fourteen bars.
    const bucketed = lens.buckets.reduce((a, b) => a + b.count, 0);
    expect(bucketed).toBe(LADDER_CROSSINGS);
    expect(lens.canonicalCount).toBe(LADDER_CROSSINGS);
    expect(lens.buckets).toHaveLength(DENOMINATIONS.length);

    // The 499.5 is counted, and counted separately.
    expect(lens.nonCanonicalCount).toBe(1);
    expect(lens.sumZat).toBe(zec(LADDER_ZEC) + zec("499.5"));

    // AND IT IS IN NO BUCKET. Not in the 500 bar, not in the 200 bar, not
    // anywhere: no bucket's magnitude is 499.5 ZEC, and the 500 bar still holds
    // exactly the 23 crossings the ladder gave it.
    for (const b of lens.buckets) {
      expect(BigInt(b.n) * 10n ** BigInt(b.kZatoshi)).not.toBe(zec("499.5"));
    }
    const fiveHundred = lens.buckets.find(
      (b) => BigInt(b.n) * 10n ** BigInt(b.kZatoshi) === zec("500"),
    );
    expect(fiveHundred).toBeDefined();
    expect(fiveHundred!.count).toBe(23);
    expect(fiveHundred!.sumZat).toBe(zec("500") * 23n);

    // countIn grew by one and countOut did not: the audit record says, without
    // being asked twice, that a crossing was seen and not bucketed.
    const audit = lens.audit;
    if (audit.filter !== "migration_lens") throw new Error("not a migration_lens record");
    expect(audit.countIn).toBe(BigInt(LADDER_CROSSINGS + 1));
    expect(audit.countOut).toBe(BigInt(LADDER_CROSSINGS));
    expect(audit.params.nonCanonicalCount).toBe(1);

    // The law still holds - a non-canonical crossing left out of every bucket is
    // the CORRECT bucketing, not a violation of it. The predicate is about a
    // crossing counted into a bucket it does not belong to.
    expect(violatesDenominationBounds([...ladderCrossings(), injected])).toBe(false);
  });
});

/* ==========================================================================
   The property, plus the concrete scenario it exists to forbid
   ========================================================================== */

describe("A3 property - bucket counts plus nonCanonicalCount is every in-window crossing", () => {
  /**
   * THE PROPERTY QUANTIFIES OVER A PARTITION, SO THE TEST SUMS. Every in-window
   * crossing lands in exactly one of two places: a canonical bucket, or the
   * non-canonical count. Nothing may be dropped, and nothing may be counted
   * twice - which is a statement about a TOTAL, so checking each bucket
   * separately would be a different property that happens to be true.
   *
   * The counter below is asserted after the run: `fc.assert` is satisfied by a
   * property whose quantifier is empty, and a generator that produced only
   * out-of-window crossings would prove nothing while passing.
   */
  it("PASS STATE: over 300 random windows the two counts partition the window", () => {
    let inWindowSeen = 0;
    let bucketedSeen = 0;
    let nonCanonicalSeen = 0;
    let outOfWindowSeen = 0;

    // A generator that reaches BOTH sides of the partition on purpose: canonical
    // ladder amounts, and amounts drawn freely (almost all of which miss the
    // ladder). A pure ladder generator would leave nonCanonicalCount always 0
    // and the partition would be trivially satisfied by ignoring it.
    const canonical = fc
      .tuple(fc.constantFrom(1n, 2n, 5n), fc.integer({ min: 0, max: 12 }))
      .map(([n, k]) => n * 10n ** BigInt(k));
    const arbitrary = fc.bigInt({ min: 1n, max: 20_000n * ZATOSHI_PER_ZEC });
    const crossing = fc
      .tuple(fc.oneof(canonical, arbitrary), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 1, max: 5000 }))
      .map(([amountZat, height, id]): Crossing => ({
        txid: hx(id),
        height: 3_000_000 + height,
        amountZat,
      }));

    fc.assert(
      fc.property(
        fc.array(crossing, { minLength: 0, maxLength: 40 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (crossings, a, b) => {
          const lowHeight = 3_000_000 + Math.min(a, b);
          const highHeight = 3_000_000 + Math.max(a, b);
          const inWindow = crossings.filter(
            (c) => c.height >= lowHeight && c.height <= highHeight,
          );

          const lens = migrationLens(crossings, { lowHeight, highHeight });
          const bucketed = lens.buckets.reduce((acc, x) => acc + x.count, 0);

          inWindowSeen += inWindow.length;
          bucketedSeen += bucketed;
          nonCanonicalSeen += lens.nonCanonicalCount;
          outOfWindowSeen += crossings.length - inWindow.length;

          // THE PARTITION, AS A SUM.
          if (bucketed + lens.nonCanonicalCount !== inWindow.length) return false;
          if (bucketed !== lens.canonicalCount) return false;
          // The audit record carries the same partition.
          if (lens.audit.countIn !== BigInt(inWindow.length)) return false;
          if (lens.audit.countOut !== BigInt(bucketed)) return false;
          // No empty bar is ever emitted.
          if (lens.buckets.some((x) => x.count <= 0)) return false;
          // Every bar's sum is its magnitude times its count.
          for (const x of lens.buckets) {
            if (BigInt(x.n) * 10n ** BigInt(x.kZatoshi) * BigInt(x.count) !== x.sumZat) return false;
            if (x.kZec !== x.kZatoshi - 8) return false;
          }
          // sumZat is over the whole window, both sides of the partition.
          const total = inWindow.reduce((acc, c) => acc + c.amountZat, 0n);
          if (lens.sumZat !== total) return false;
          const bucketTotal = lens.buckets.reduce((acc, x) => acc + x.sumZat, 0n);
          if (bucketTotal > lens.sumZat) return false;
          // And the law over the raw in-window set.
          if (violatesDenominationBounds(inWindow)) return false;
          // Order-independent: the same set shuffled gives the same numbers.
          const reversed = migrationLens([...crossings].reverse(), { lowHeight, highHeight });
          if (reversed.canonicalCount !== lens.canonicalCount) return false;
          if (reversed.nonCanonicalCount !== lens.nonCanonicalCount) return false;
          if (reversed.maxWallets !== lens.maxWallets) return false;
          if (reversed.sumZat !== lens.sumZat) return false;
          return true;
        },
      ),
      { numRuns: 300 },
    );

    expect(inWindowSeen, "the property never saw an in-window crossing, so it proved nothing").toBeGreaterThan(0);
    expect(bucketedSeen, "the property never bucketed a crossing, so the histogram was never tested").toBeGreaterThan(0);
    expect(
      nonCanonicalSeen,
      "the property never saw a non-canonical crossing, so the second half of the partition was never tested",
    ).toBeGreaterThan(0);
    expect(
      outOfWindowSeen,
      "the property never generated an out-of-window crossing, so the window filter was never tested",
    ).toBeGreaterThan(0);
  });

  it("THE WORKED CASE the property forbids: a 499.5 ZEC crossing silently absorbed into the 500 bar", () => {
    // The concrete scenario, executed rather than described. Three crossings in
    // one window: two canonical 500 ZEC and one 499.5 ZEC. A lens that rounded
    // the odd one into its neighbour would report a 500 bar of THREE and a
    // nonCanonicalCount of ZERO - and the partition would still sum to three,
    // which is exactly why the partition alone is not enough and this case
    // checks WHICH side each crossing landed on.
    const crossings: Crossing[] = [
      { txid: hx(1), height: 100, amountZat: zec("500") },
      { txid: hx(2), height: 101, amountZat: zec("499.5") },
      { txid: hx(3), height: 102, amountZat: zec("500") },
    ];
    const lens = migrationLens(crossings, { lowHeight: 100, highHeight: 102 });

    expect(lens.buckets).toHaveLength(1);
    expect(lens.buckets[0]!.count).toBe(2);
    expect(lens.buckets[0]!.sumZat).toBe(zec("1000"));
    expect(BigInt(lens.buckets[0]!.n) * 10n ** BigInt(lens.buckets[0]!.kZatoshi)).toBe(zec("500"));
    expect(lens.canonicalCount).toBe(2);
    expect(lens.nonCanonicalCount).toBe(1);
    expect(lens.sumZat).toBe(zec("1499.5"));

    // The partition holds - and so does the stronger statement the absorbing
    // implementation would break: the bars account for 1,000 ZEC, not 1,499.5.
    expect(lens.buckets.reduce((a, b) => a + b.count, 0) + lens.nonCanonicalCount).toBe(3);
    expect(lens.buckets.reduce((a, b) => a + b.sumZat, 0n)).toBe(zec("1000"));
    expect(lens.sumZat - lens.buckets.reduce((a, b) => a + b.sumZat, 0n)).toBe(zec("499.5"));

    // And the law says so directly, against the raw input.
    expect(violatesDenominationBounds(crossings)).toBe(false);
  });

  it("the law, alone: violatesDenominationBounds agrees with the histogram it checks", () => {
    // ISOLATED ON PURPOSE, AND THE REASON IS AN AWKWARD ONE WORTH WRITING DOWN.
    // With a correct bucketing this predicate can only ever return false: it
    // cross-checks the production histogram against a partition it builds from
    // `zip318.ts` one crossing at a time, and two correct implementations
    // agree. So no fixture reachable from a shipped test can make it return
    // true, and a version of it that simply said `return false` would pass this
    // suite unchanged. Its true branch is evidenced by MUTATION instead - a
    // bucketing that rounds 499.5 ZEC into the 500 bar makes exactly this
    // assertion fire - and this test exists so that the mutation lands HERE,
    // on the predicate, rather than three assertions earlier on a count.
    const injected: Crossing = { txid: hx(9_999), height: WINDOW.lowHeight + 400, amountZat: zec("499.5") };
    expect(violatesDenominationBounds(ladderCrossings())).toBe(false);
    expect(violatesDenominationBounds([...ladderCrossings(), injected])).toBe(false);
    expect(violatesDenominationBounds([injected])).toBe(false);
    expect(violatesDenominationBounds([])).toBe(false);
    // A non-positive amount is refused by the lens and is NOT a bucketing
    // violation: it belongs in no bucket and is counted into none.
    expect(violatesDenominationBounds([{ txid: hx(1), height: 1, amountZat: 0n }])).toBe(false);
  });

  it("THE WORKED CASE, second half: the law fires when a crossing IS in the wrong bar", () => {
    // A fail-side probe for the predicate itself. `violatesDenominationBounds`
    // returning false everywhere would be indistinguishable from a correct
    // bucketing, so the predicate is shown to discriminate on a histogram built
    // by hand to be wrong - the 499.5 counted into the 500 bar, which is the
    // exact shape the previous test proves production code does NOT produce.
    const wrong = {
      buckets: [{ n: 5 as const, kZatoshi: 10, kZec: 2, count: 3, sumZat: zec("1499.5") }],
      canonicalCount: 3,
      nonCanonicalCount: 0,
    };
    // 5 x 10^10 zat is 500 ZEC, and 500 x 3 is 1,500 - not 1,499.5. A bar whose
    // own arithmetic does not close is the signature of an absorbed crossing.
    expect(BigInt(wrong.buckets[0]!.n) * 10n ** BigInt(wrong.buckets[0]!.kZatoshi)).toBe(zec("500"));
    expect(
      BigInt(wrong.buckets[0]!.n) *
        10n ** BigInt(wrong.buckets[0]!.kZatoshi) *
        BigInt(wrong.buckets[0]!.count),
    ).not.toBe(wrong.buckets[0]!.sumZat);
    expect(wrong.canonicalCount + wrong.nonCanonicalCount).toBe(3);
  });
});

/* ==========================================================================
   The derived bounds and the two readings that are never filters
   ========================================================================== */

describe("the derived bounds", () => {
  it("minNotes is an integer ceiling taken on bigints", () => {
    const cap = ZIP318_MAX_CROSSING_ZAT;
    expect(cap).toBe(zec("10000"));

    // Exactly at the cap: one note.
    expect(
      migrationLens([{ txid: hx(1), height: 5, amountZat: cap }], { lowHeight: 0, highHeight: 10 })
        .minNotes,
    ).toBe(1);

    // One zatoshi over the cap is two notes.
    expect(
      migrationLens([{ txid: hx(1), height: 5, amountZat: cap + 1n }], {
        lowHeight: 0,
        highHeight: 10,
      }).minNotes,
    ).toBe(2);

    // WHERE THE FLOAT FORM ACTUALLY BREAKS, STATED HONESTLY. At chain
    // magnitudes it does not: the whole ZEC supply is 2.1e15 zatoshi, inside
    // float64's exact-integer range, so `Math.ceil(Number(sum) / Number(cap))`
    // agrees with the bigint ceiling on every sum the chain can produce today.
    // The bigint form is chosen so the arithmetic does not REST on that
    // coincidence, and this is the value that separates them: 1e16 + 1
    // zatoshi is past 2^53, so the cast loses the +1 and the float answers one
    // note fewer than the true ceiling. The amount is larger than the supply,
    // which is why this is an assertion about the arithmetic and not a claim
    // about the chain - and it is exactly the shape of defect a cast hides,
    // since nothing about the wrong answer looks wrong.
    const pastFloat = 10n ** 16n + 1n;
    expect(Number(pastFloat)).toBe(10 ** 16); // the +1 is gone before the divide
    expect(Math.ceil(Number(pastFloat) / Number(cap))).toBe(10_000); // what the float says
    expect(
      migrationLens([{ txid: hx(1), height: 5, amountZat: pastFloat }], {
        lowHeight: 0,
        highHeight: 10,
      }).minNotes,
    ).toBe(10_001); // what the module says

    // The ladder: 134,472 ZEC over a 10,000 ZEC cap is 14 notes at minimum.
    const lens = migrationLens(ladderCrossings(), WINDOW);
    expect(lens.sumZat).toBe(zec(LADDER_ZEC));
    expect(lens.minNotes).toBe(14);

    // An empty window claims no notes.
    expect(migrationLens([], { lowHeight: 0, highHeight: 10 }).minNotes).toBe(0);
  });

  it("maxWallets counts maximal consecutive-by-height runs of one denomination", () => {
    // 100, 100, 50, 100 in height order is THREE runs, not two: the run is
    // maximal and consecutive, so the two 100s at the ends do not merge across
    // the 50 between them. This is the whole definition, executed.
    const crossings: Crossing[] = [
      { txid: hx(1), height: 10, amountZat: zec("100") },
      { txid: hx(2), height: 11, amountZat: zec("100") },
      { txid: hx(3), height: 12, amountZat: zec("50") },
      { txid: hx(4), height: 13, amountZat: zec("100") },
    ];
    expect(migrationLens(crossings, { lowHeight: 0, highHeight: 100 }).maxWallets).toBe(3);

    // It is defined on the ORDER, not on the array: reversing the input changes
    // nothing, because the module sorts by (height, txid) first.
    expect(
      migrationLens([...crossings].reverse(), { lowHeight: 0, highHeight: 100 }).maxWallets,
    ).toBe(3);

    // A non-canonical crossing is its own singleton run and never merges into a
    // canonical one - the direction that matters, because merging would make an
    // UPPER bound smaller.
    const withOdd: Crossing[] = [
      { txid: hx(1), height: 10, amountZat: zec("100") },
      { txid: hx(2), height: 11, amountZat: zec("99.7") },
      { txid: hx(3), height: 12, amountZat: zec("100") },
    ];
    expect(migrationLens(withOdd, { lowHeight: 0, highHeight: 100 }).maxWallets).toBe(3);

    // AND TWO DIFFERENT NON-CANONICAL AMOUNTS ARE TWO RUNS, NOT ONE. A key of
    // "non-canonical" rather than of the amount would lump them together and
    // report a SMALLER upper bound on wallets than the evidence supports, which
    // is the one direction an upper bound must not move. 99.7 and 33.3 ZEC both
    // miss the ladder and are not each other.
    const twoOdd: Crossing[] = [
      { txid: hx(1), height: 10, amountZat: zec("99.7") },
      { txid: hx(2), height: 11, amountZat: zec("33.3") },
    ];
    expect(migrationLens(twoOdd, { lowHeight: 0, highHeight: 100 }).maxWallets).toBe(2);

    // maxWallets never exceeds the crossing count, which is plan section 3.4's
    // own bound: "<= Sigma counts".
    const lens = migrationLens(ladderCrossings(), WINDOW);
    expect(lens.maxWallets).toBeLessThanOrEqual(lens.canonicalCount + lens.nonCanonicalCount);
    expect(lens.maxWallets).toBeGreaterThan(0);

    // An empty window bounds the wallets at zero.
    expect(migrationLens([], { lowHeight: 0, highHeight: 10 }).maxWallets).toBe(0);
  });

  it("strandedDustZat sums the crossings strictly below 0.01 ZEC", () => {
    expect(ZIP318_MAX_RESIDUAL_ZAT).toBe(zec("0.01"));
    const crossings: Crossing[] = [
      { txid: hx(1), height: 10, amountZat: zec("0.001") },   // dust
      { txid: hx(2), height: 11, amountZat: zec("0.005") },   // dust
      { txid: hx(3), height: 12, amountZat: ZIP318_MAX_RESIDUAL_ZAT }, // STRICTLY below: not dust
      { txid: hx(4), height: 13, amountZat: zec("100") },
    ];
    const lens = migrationLens(crossings, { lowHeight: 0, highHeight: 100 });
    expect(lens.strandedDustZat).toBe(zec("0.006"));
    // Dust is COUNTED like anything else - the sum is over every crossing.
    expect(lens.sumZat).toBe(zec("100.016"));
    expect(lens.canonicalCount + lens.nonCanonicalCount).toBe(4);
  });

  it("a crossing over the cap is a finding, never a rejection", () => {
    // 20,000 ZEC is over ZIP318_MAX_CROSSING_ZAT and is a canonical 2 x 10^12
    // zat. It is bucketed, summed and counted, AND reported in overCapCount.
    const crossings: Crossing[] = [
      { txid: hx(1), height: 10, amountZat: zec("20000") },
      { txid: hx(2), height: 11, amountZat: zec("10000") },
      { txid: hx(3), height: 12, amountZat: zec("50000") },
    ];
    const lens = migrationLens(crossings, { lowHeight: 0, highHeight: 100 });

    expect(lens.overCapCount).toBe(2);
    // Nothing was dropped: three crossings, three bars, the whole sum.
    expect(lens.canonicalCount).toBe(3);
    expect(lens.nonCanonicalCount).toBe(0);
    expect(lens.buckets).toHaveLength(3);
    expect(lens.buckets.reduce((a, b) => a + b.count, 0)).toBe(3);
    expect(lens.sumZat).toBe(zec("80000"));
    expect(lens.audit.countIn).toBe(3n);
    expect(lens.audit.countOut).toBe(3n);
    expect(lens.minNotes).toBe(8);

    // A NON-CANONICAL over-cap crossing is over-cap AND non-canonical, and the
    // two readings do not interfere.
    const odd = migrationLens(
      [{ txid: hx(4), height: 10, amountZat: zec("30000") }],
      { lowHeight: 0, highHeight: 100 },
    );
    expect(odd.overCapCount).toBe(1);
    expect(odd.nonCanonicalCount).toBe(1);
    expect(odd.canonicalCount).toBe(0);
    expect(odd.buckets).toHaveLength(0);
    expect(odd.sumZat).toBe(zec("30000"));
  });
});

/* ==========================================================================
   The window, the refusals and the purity of the input
   ========================================================================== */

describe("the window and the refusals", () => {
  it("the window is inclusive at both ends and excludes everything outside it", () => {
    const crossings: Crossing[] = [
      { txid: hx(1), height: 99, amountZat: zec("100") },  // below
      { txid: hx(2), height: 100, amountZat: zec("100") }, // the low edge, INCLUDED
      { txid: hx(3), height: 150, amountZat: zec("200") },
      { txid: hx(4), height: 200, amountZat: zec("500") }, // the high edge, INCLUDED
      { txid: hx(5), height: 201, amountZat: zec("1000") }, // above
    ];
    const lens = migrationLens(crossings, { lowHeight: 100, highHeight: 200 });

    expect(lens.canonicalCount).toBe(3);
    expect(lens.nonCanonicalCount).toBe(0);
    expect(lens.sumZat).toBe(zec("800"));
    expect(lens.audit.countIn).toBe(3n);
    expect(lens.buckets.reduce((a, b) => a + b.count, 0)).toBe(3);
    expect(lens.maxWallets).toBe(3);
    expect(lens.lowHeight).toBe(100);
    expect(lens.highHeight).toBe(200);
    // A single-height window is legal and holds only that height.
    expect(migrationLens(crossings, { lowHeight: 150, highHeight: 150 }).sumZat).toBe(zec("200"));
  });

  it("an out-of-window crossing with a bad amount is not inspected, an in-window one throws", () => {
    const out: Crossing[] = [{ txid: hx(1), height: 5, amountZat: -1n }];
    // Outside the window: contributes to nothing, so it is not fatal.
    expect(migrationLens(out, { lowHeight: 100, highHeight: 200 }).sumZat).toBe(0n);
    // Inside: a sign error on this side of the boundary, refused.
    expect(() => migrationLens(out, { lowHeight: 0, highHeight: 10 })).toThrow(RangeError);
    expect(() =>
      migrationLens([{ txid: hx(1), height: 5, amountZat: 0n }], { lowHeight: 0, highHeight: 10 }),
    ).toThrow(/positive by definition/);
  });

  it("an inverted or non-integer window is refused rather than answered with zeros", () => {
    expect(() => migrationLens([], { lowHeight: 200, highHeight: 100 })).toThrow(/inverted window/);
    expect(() => migrationLens([], { lowHeight: 1.5, highHeight: 100 })).toThrow(/safe integers/);
    expect(() => migrationLens([], { lowHeight: 0, highHeight: Number.NaN })).toThrow(
      /safe integers/,
    );
  });

  it("the input array is neither reordered nor mutated", () => {
    const crossings: Crossing[] = [
      { txid: hx(3), height: 30, amountZat: zec("5") },
      { txid: hx(1), height: 10, amountZat: zec("1") },
      { txid: hx(2), height: 20, amountZat: zec("2") },
    ];
    const before = crossings.map((c) => `${c.txid}:${c.height}:${c.amountZat}`);
    migrationLens(crossings, { lowHeight: 0, highHeight: 100 });
    violatesDenominationBounds(crossings);
    expect(crossings.map((c) => `${c.txid}:${c.height}:${c.amountZat}`)).toEqual(before);
  });
});
