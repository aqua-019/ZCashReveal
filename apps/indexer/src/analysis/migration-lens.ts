/**
 * Module 9B - the ZIP 318 migration lens (plan section 3.4, TRACKING-MATH section 3.9).
 *
 *   "Migration lens (ZIP 318, hard amounts / soft sessions). Each Orchard->Ironwood
 *    migration spends one Orchard note into one Ironwood output with the net amount
 *    public and quantised to `n x 10^k, n in {1,2,5}`, dust < 0.01 ZEC stranded.
 *    [...] A crossing over that bound is a finding, never a rejection: the chain is
 *    the authority on what happened, and a rule that refuses to record something
 *    the chain did destroys the evidence instead of raising it. A wallet's balance
 *    `B` decomposes canonically, so a migration session (a burst of canonical
 *    denominations within a scheduling window) bounds the number of notes
 *    (`>= ceil(B/10,000)`) and the set of wallets (`<= number of denomination
 *    runs`). Reported as distributions and counts per window - never as 'wallet W
 *    migrated B'."
 *
 * DISTRIBUTIONS ONLY, AND THE RETURN TYPE IS WHERE THAT RULE IS ENFORCED RATHER
 * THAN PROMISED. There is nowhere in {@link MigrationLens} to put a wallet, an
 * address, or a per-txid attribution: every field is a count, a sum, a bound or a
 * bucket, and `Crossing.txid` is consumed to order the input and is never carried
 * out. That is deliberate and it is the whole design constraint of this module.
 * Section 3.9's closing sentence - "never as 'wallet W migrated B'" - is a rule
 * about a SHAPE, and a shape is kept by a type rather than by a reviewer: a later
 * handoff that wants to publish an attribution has to widen this interface in a
 * diff someone reads, instead of adding a field to a bag that already carries
 * txids. `zip318.ts` states the same rule for the same reason: "a canonical
 * denomination is an observation about an amount, never a statement about who
 * sent it".
 *
 * THE DENOMINATION LADDER IS `zip318.ts`'s AND IS NOT REIMPLEMENTED HERE. That
 * module owns `canonicalDenomination`, the two-exponent rule (0.5 ZEC is
 * `{ n: 5, kZatoshi: 7, kZec: -1 }`), the crossing bound and the residual floor.
 * This file decides only what to COUNT and how to BOUND it. A second copy of the
 * ladder is how the "which exponent is `k`?" defect that module's docblock
 * records would come back.
 *
 * A NON-CANONICAL AMOUNT IS COUNTED AND NEVER BUCKETED. `canonicalDenomination`
 * returns `null` for it, and `null` is a measurement: ZIP 318's bucketing is a
 * heuristic privacy defence, so an amount that missed the ladder is exactly the
 * observation this lens exists to make. Rounding it into a neighbouring bucket
 * would manufacture the regularity being measured, so {@link MigrationLens}
 * carries `nonCanonicalCount` as a first-class number beside the histogram and
 * the two never merge.
 *
 * A CROSSING OVER `ZIP318_MAX_CROSSING_ZAT` IS A FINDING, NEVER A REJECTION. It
 * is counted, summed, dusted, run-grouped and bucketed (if its amount is
 * canonical) exactly like any other crossing, and it is ADDITIONALLY reported in
 * `overCapCount`. Migration 003 declined to write a database CHECK against the
 * same bound for the same reason, and its sentence governs here: a rule that
 * refuses to record something the chain did destroys the evidence instead of
 * raising it. `overCapCount` is therefore a second reading of the same crossings,
 * never a filter on them - `canonicalCount + nonCanonicalCount` is the whole
 * window whatever `overCapCount` says.
 *
 * A NON-POSITIVE AMOUNT THROWS, AND THE ASYMMETRY WITH THE CAP IS THE POINT. An
 * over-cap crossing is something the CHAIN may have done and this module has no
 * standing to refuse. A zero or negative crossing is not: a crossing's magnitude
 * is positive by definition - out of Orchard, into Ironwood - so a non-positive
 * value is a sign error on THIS side of the boundary, which is the reading
 * `zip318.ts` already fixed for `canonicalDenomination`. Averaging a sign error
 * into `sumZat` would corrupt every derived bound silently, and `minNotes` in
 * particular would be understated by a defect in our own decoder while looking
 * like a measurement of the chain.
 *
 * THE WINDOW IS INCLUSIVE AT BOTH ENDS AND FILTERS BEFORE `countIn`. A crossing
 * outside `[lowHeight, highHeight]` contributes to nothing - not `sumZat`, not
 * the buckets, not the runs, not the audit record's `countIn`, which
 * `analysis.ts` defines as "every crossing IN THE WINDOW". So the audit record
 * does not say how many crossings the caller offered; it says how many the window
 * held. That is the contract the union already fixed and it is restated here
 * because the two readings differ whenever a caller hands over a longer history
 * than the window it asked about.
 */

import type { FilterApplication, Hex, Zip318Denomination } from "@zcashreveal/types";
// The residual floor is reached through `isBelowMaxResidual` rather than by
// importing `ZIP318_MAX_RESIDUAL_ZAT` and comparing here, so there is one place
// in the repository that decides what "strictly below" means.
import {
  ZIP318_MAX_CROSSING_ZAT,
  canonicalDenomination,
  isBelowMaxResidual,
  isOverMaxCrossing,
} from "@zcashreveal/types";

/**
 * One Orchard -> Ironwood pool crossing, as the chain published it.
 *
 * `txid` and `height` are here to ORDER the window, not to report it. Section
 * 3.9's reporting rule forbids a per-txid attribution, and neither field appears
 * in {@link MigrationLens}; the txid exists so that two crossings in one block
 * have a deterministic order, which an audit record needs and a caller's array
 * order cannot supply.
 */
export interface Crossing {
  readonly txid: Hex;
  readonly height: number;
  /** The public net amount that crossed Orchard -> Ironwood. Positive. */
  readonly amountZat: bigint;
}

/**
 * One bar of the histogram: a canonical denomination and what the window held of
 * it.
 *
 * BOTH EXPONENTS TRAVEL TOGETHER because they are different numbers for one
 * denomination and `zip318.ts` settled that a name must say which it is.
 * `kZatoshi` is what `migrations_zip318.denom_k` stores and is never negative;
 * `kZec` is `kZatoshi - 8` and IS negative below 1 ZEC. Dropping either one here
 * would push the conversion into every consumer, which is the shape of the
 * defect that rename exists to prevent.
 *
 * `n` is spelled as the literal union rather than imported as `Zip318Mantissa` so
 * that this interface reads as the handoff states it; the two are the same type.
 */
export interface DenomBucket {
  readonly n: 1 | 2 | 5;
  readonly kZatoshi: number;
  readonly kZec: number;
  readonly count: number;
  readonly sumZat: bigint;
}

/**
 * What one window of migration looks like, as distributions and bounds.
 *
 * Every field is a count, a sum or a bound. See this module's header for why the
 * absence of a wallet field is the design rather than an omission.
 */
export interface MigrationLens {
  readonly lowHeight: number;
  readonly highHeight: number;
  /** Ascending by magnitude. Only buckets with count > 0 appear. */
  readonly buckets: ReadonlyArray<DenomBucket>;
  readonly canonicalCount: number;
  readonly nonCanonicalCount: number;
  /** Every crossing in the window, canonical or not. */
  readonly sumZat: bigint;
  readonly strandedDustZat: bigint;
  readonly minNotes: number;
  /**
   * Upper bound on distinct migrating wallets: the number of crossings the
   * window held. Plan section 3.4's `<= Sigma counts`. See the header of
   * {@link migrationLens} for why this is the published bound and
   * {@link MigrationLens.denominationRuns} is not.
   */
  readonly maxWallets: number;
  /**
   * Maximal runs of one denomination key in `(height, txid, amount)` order. A
   * SHAPE OBSERVATION ABOUT THE WINDOW AND NOT A BOUND ON ANYTHING. It is not
   * an upper bound on wallets - two wallets each crossing one 100 ZEC note in
   * adjacent blocks form one run - and it is not a lower bound either, so no
   * consumer may render it as a wallet count. It is here because section 3.9
   * names the quantity and because the run structure is the distributional
   * evidence of a scheduling window.
   */
  readonly denominationRuns: number;
  /** Crossings over ZIP318_MAX_CROSSING_ZAT. A finding, never a rejection. */
  readonly overCapCount: number;
  readonly audit: FilterApplication;
}

/**
 * Measure a window of Orchard -> Ironwood crossings.
 *
 * THE TWO SPECS GIVE TWO DIFFERENT WALLET BOUNDS AND ONLY ONE OF THEM IS SOUND.
 * TRACKING-MATH section 3.9 says a session "bounds [...] the set of wallets
 * (`<= number of denomination runs`)"; plan section 3.4 says "an upper bound on
 * distinct migrating wallets per window `<= Sigma counts` (no lower bound is
 * claimable)". They are not two phrasings of one rule. `Sigma counts` holds by
 * construction - a wallet that crossed contributed at least one crossing, so the
 * crossings cannot be fewer than the wallets. The run count does not hold, and
 * the counterexample needs two wallets and no coordination: wallet A crosses one
 * 100 ZEC note at height h, wallet B crosses one 100 ZEC note at height h+1.
 * Same denomination key, adjacent in the order, so one run - and the record
 * would have said "at most 1 wallet" about 2. It gets worse with evidence rather
 * than better: 847 such crossings are still one run, so the more the window
 * holds the TIGHTER and the more identity-shaped the published claim becomes.
 * That is the exact direction section 3.9's own closing rule - "never as 'wallet
 * W migrated B'" - exists to refuse.
 *
 * SO `maxWallets` IS `Sigma counts` AND THE RUN COUNT SHIPS BESIDE IT UNDER ITS
 * OWN NAME. `denominationRuns` is a shape observation about the window; it is
 * not a bound in either direction and no consumer may render it as a wallet
 * count. This is a divergence from HANDOFF-09 section 3, which repeats section
 * 3.9's form, and it is recorded as SPEC-WAS-AMBIGUOUS rather than taken
 * silently: the conservative reading is the one that ships, because the other
 * one publishes a falsifiable claim about how few wallets were involved.
 *
 * WHAT A DENOMINATION RUN IS. Neither spec says, so this module defines it, and
 * the definition is stated here rather than left to a reader of the loop:
 *
 *   Order the in-window crossings ascending by height, breaking ties by txid and
 *   then by amount. Walk that order. A run begins at the first crossing, and at
 *   every crossing whose DENOMINATION KEY differs from its predecessor's.
 *   `denominationRuns` is the number of runs.
 *
 * The key of a canonical crossing is its denomination `n x 10^kZatoshi`; the key
 * of a non-canonical one is its own amount, so a non-canonical crossing forms a
 * singleton run of one and never joins a canonical run. That extension is not
 * decoration: without it a stretch of DIFFERENT non-canonical amounts would
 * collapse into one run, and a run count that merges observably different
 * amounts is not describing the window's shape at all.
 *
 * A denomination key and an amount are in bijection on the canonical ladder -
 * `n x 10^k` determines the amount and the amount determines `(n, k)` - so for
 * canonical crossings "denomination run" and "maximal run of equal amounts" are
 * the same thing, and the implementation compares keys because that is the
 * phrase section 3.9 uses.
 *
 * WHY THE ORDER IS `(height, txid, amount)` AND WHAT IT COSTS. `Crossing`
 * carries no position within a block, so this is the only total order available.
 * Within one block it is NOT chain order, and a different order gives a
 * different run count: `100, 50, 100` is three runs and `100, 100, 50` is two.
 * The alternative - a per-block index on `Crossing` - is the change that would
 * remove the ambiguity and it is not taken here, because it widens the type this
 * handoff publishes for the publisher to consume. What the fixed order does buy
 * is REPRODUCIBILITY: the same set of crossings yields the same
 * `denominationRuns` in any array order, which an audit record has to have. That
 * an order-dependent quantity needed this paragraph is a second reason it is not
 * the published wallet bound; `maxWallets` needs none of it, because a count of
 * crossings does not depend on how they are sorted.
 *
 * THE CEILING IS TAKEN ON BIGINTS. `minNotes = ceil(sumZat / ZIP318_MAX_CROSSING_ZAT)`
 * is computed as `(sum + cap - 1) / cap` in bigint arithmetic and converted only
 * at the end. Routing it through `Number` would round 10,000.000000005 ZEC of
 * crossings down to one note by a float rounding, which is a claim about the
 * chain manufactured by a cast.
 *
 * @throws RangeError if the heights are not safe integers, if `lowHeight >
 * highHeight` (an inverted window can hold nothing, so a zero result would be a
 * lie by construction rather than a measurement), or if an IN-WINDOW crossing
 * carries a non-positive amount. Crossings outside the window are not inspected:
 * they contribute to nothing, so refusing the call for one would make an
 * unrelated row of a caller's history fatal to a window that excludes it.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function migrationLens(
  crossings: ReadonlyArray<Crossing>,
  opts: { readonly lowHeight: number; readonly highHeight: number },
): MigrationLens {
  const { lowHeight, highHeight } = opts;
  if (!Number.isSafeInteger(lowHeight) || !Number.isSafeInteger(highHeight)) {
    throw new RangeError(
      `migrationLens: heights must be safe integers, got [${lowHeight}, ${highHeight}]`,
    );
  }
  if (lowHeight > highHeight) {
    throw new RangeError(
      `migrationLens: inverted window [${lowHeight}, ${highHeight}] can hold no crossing`,
    );
  }

  const inWindow = crossings.filter((c) => c.height >= lowHeight && c.height <= highHeight);
  for (const c of inWindow) {
    if (c.amountZat <= 0n) {
      throw new RangeError(
        `migrationLens: a crossing's magnitude is positive by definition, got ${c.amountZat} at height ${c.height}`,
      );
    }
  }

  const { buckets, canonicalCount, nonCanonicalCount } = bucketize(inWindow);

  let sumZat = 0n;
  let strandedDustZat = 0n;
  let overCapCount = 0;
  for (const c of inWindow) {
    sumZat += c.amountZat;
    // BOTH READINGS OF THE SAME CROSSING, neither of them a filter on the other.
    if (isBelowMaxResidual(c.amountZat)) strandedDustZat += c.amountZat;
    if (isOverMaxCrossing(c.amountZat)) overCapCount += 1;
  }

  const minNotes = Number(ceilDiv(sumZat, ZIP318_MAX_CROSSING_ZAT));
  // PLAN SECTION 3.4's BOUND, NOT SECTION 3.9's. Each wallet that crossed
  // contributes at least one crossing, so the crossing count is an upper bound
  // on the wallets; the run count is not one. See the header.
  const maxWallets = inWindow.length;
  const denominationRuns = countDenominationRuns(inWindow);

  const audit: FilterApplication = {
    filter: "migration_lens",
    params: {
      lowHeight,
      highHeight,
      canonicalCount,
      nonCanonicalCount,
      sumZat,
      strandedDustZat,
      minNotes,
      maxWallets,
      denominationRuns,
    },
    // `analysis.ts`: countIn is every crossing in the window, countOut the
    // crossings that landed in a canonical bucket. The difference is
    // `nonCanonicalCount`, which is the measurement and not the error.
    countIn: BigInt(inWindow.length),
    countOut: BigInt(canonicalCount),
  };

  return {
    lowHeight,
    highHeight,
    buckets,
    canonicalCount,
    nonCanonicalCount,
    sumZat,
    strandedDustZat,
    minNotes,
    maxWallets,
    denominationRuns,
    overCapCount,
    audit,
  };
}

/**
 * `kZec = kZatoshi - 8`, written out here rather than imported from `zip318.ts`.
 *
 * The rule is that module's and is not being redefined; what this line buys is
 * that {@link violatesDenominationBounds} checks a bucket's two exponents against
 * the ARITHMETIC the rule implies rather than against the same constant the
 * bucket was built from. A check that borrows its subject's own input can only
 * catch a copying mistake; this one also catches a redefinition.
 */
const ZEC_DECIMAL_PLACES = 8;

/**
 * True when any crossing in the window would be counted into a bucket it does not
 * belong to.
 *
 * THE FALSIFIABLE FORM OF THIS MODULE'S ONE HARD LAW, and it exists for the
 * reason `conservation.ts`'s `violatesConservation` exists: a test that only ever
 * inspects a lens's output cannot tell a correct bucketing from a rounding one
 * behind a plausible-looking histogram. Section 3.9's amounts are the HARD half
 * of the lens - the sessions are the soft half - so this is the half a property
 * test can quantify over.
 *
 * IT CROSS-CHECKS THE HISTOGRAM AGAINST A PARTITION BUILT ONE CROSSING AT A TIME,
 * rather than restating the bucketing loop. For every crossing it asks
 * `zip318.ts` directly what that crossing's denomination is, accumulates the
 * partition that answer implies, and then requires the production histogram to
 * agree with it bucket for bucket, count for count and zatoshi for zatoshi - plus
 * the internal consistency of each bar: `kZec = kZatoshi - 8`, and
 * `n x 10^kZatoshi x count = sumZat`. A bucketing that rounded 499.5 ZEC into the
 * 500 ZEC bar is caught by the `nonCanonicalCount` comparison; one that dropped a
 * crossing is caught by the counts; one that mislabelled a bar is caught by the
 * arithmetic.
 *
 * NO WINDOW ARGUMENT, ON PURPOSE. The predicate is about the BUCKETING, which is
 * a property of a set of crossings and not of a height range, so it takes the set
 * it is asked about and inspects all of it. A caller that wants the question
 * asked of one window filters first, exactly as {@link migrationLens} does.
 *
 * A non-positive amount does not throw here and is not a violation: it has no
 * canonical denomination, so it belongs in no bucket, and it is counted into
 * none. `migrationLens` is where a sign error is refused; this predicate answers
 * only the question in its name.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function violatesDenominationBounds(crossings: ReadonlyArray<Crossing>): boolean {
  const produced = bucketize(crossings);

  const expected = new Map<string, { count: number; sumZat: bigint }>();
  let expectedNonCanonical = 0;
  for (const c of crossings) {
    const d = canonicalDenomination(c.amountZat);
    if (d === null) {
      expectedNonCanonical += 1;
      continue;
    }
    // The denomination must reproduce the amount it claims to describe.
    if (denominationAmountZat(d) !== c.amountZat) return true;
    const key = bucketKey(d);
    const seen = expected.get(key) ?? { count: 0, sumZat: 0n };
    expected.set(key, { count: seen.count + 1, sumZat: seen.sumZat + c.amountZat });
  }

  if (produced.nonCanonicalCount !== expectedNonCanonical) return true;
  if (produced.buckets.length !== expected.size) return true;

  let bucketed = 0;
  for (const b of produced.buckets) {
    if (b.kZatoshi < 0 || !Number.isSafeInteger(b.kZatoshi)) return true;
    if (b.kZec !== b.kZatoshi - ZEC_DECIMAL_PLACES) return true;
    const match = expected.get(bucketKey(b));
    if (match === undefined) return true;
    if (match.count !== b.count) return true;
    if (match.sumZat !== b.sumZat) return true;
    if (denominationAmountZat(b) * BigInt(b.count) !== b.sumZat) return true;
    bucketed += b.count;
  }
  if (bucketed !== produced.canonicalCount) return true;
  if (produced.canonicalCount + produced.nonCanonicalCount !== crossings.length) return true;

  return false;
}

/** The histogram plus its two counts, shared by the lens and the law. */
function bucketize(crossings: ReadonlyArray<Crossing>): {
  buckets: ReadonlyArray<DenomBucket>;
  canonicalCount: number;
  nonCanonicalCount: number;
} {
  const bars = new Map<string, { denom: Zip318Denomination; count: number; sumZat: bigint }>();
  let canonicalCount = 0;
  let nonCanonicalCount = 0;

  for (const c of crossings) {
    const denom = canonicalDenomination(c.amountZat);
    if (denom === null) {
      nonCanonicalCount += 1;
      continue;
    }
    canonicalCount += 1;
    const key = bucketKey(denom);
    const bar = bars.get(key);
    if (bar === undefined) {
      bars.set(key, { denom, count: 1, sumZat: c.amountZat });
    } else {
      bar.count += 1;
      bar.sumZat += c.amountZat;
    }
  }

  const buckets: DenomBucket[] = [...bars.values()]
    .map((bar) => ({
      n: bar.denom.n,
      kZatoshi: bar.denom.kZatoshi,
      kZec: bar.denom.kZec,
      count: bar.count,
      sumZat: bar.sumZat,
    }))
    // ASCENDING BY MAGNITUDE, compared as bigints. Sorting on `kZatoshi` then `n`
    // would give the same order for this ladder and would be a coincidence of it;
    // comparing the denominations themselves is the property the field promises.
    .sort((a, b) => compareBigint(denominationAmountZat(a), denominationAmountZat(b)));

  return { buckets, canonicalCount, nonCanonicalCount };
}

/**
 * The number of maximal consecutive-by-order runs of one denomination key.
 *
 * See {@link migrationLens}'s docblock for the definition, the order it depends
 * on, and why this quantity is NOT the published wallet bound: it is smaller
 * than the number of wallets whenever two wallets cross the same denomination
 * adjacently, which is the one direction an upper bound must never move.
 */
function countDenominationRuns(inWindow: ReadonlyArray<Crossing>): number {
  if (inWindow.length === 0) return 0;
  // A COPY. The caller's array is not this module's to reorder, and the purity
  // scan beside these files exists because that mistake is easy to make.
  // THE ORDER HAS TO BE TOTAL, NOT MERELY DEFINED. `conservation.ts` records
  // what a partial tie costs: its comparator agreed on every key for two
  // matches that differed elsewhere, returned 0, and `Array.prototype.sort`
  // fell back to input order - so a result that documented itself as
  // order-independent was not. Two crossings can share a height and a txid
  // (one transaction is one crossing, but nothing in this type enforces that),
  // and if they also differed in amount the run count would depend on the
  // caller's array order. The amount is the last tie-break, and after it a tie
  // means the two crossings are indistinguishable and interchangeable.
  const ordered = [...inWindow].sort(
    (a, b) =>
      a.height - b.height ||
      a.txid.localeCompare(b.txid) ||
      compareBigint(a.amountZat, b.amountZat),
  );

  let runs = 0;
  let previous: string | null = null;
  for (const c of ordered) {
    const denom = canonicalDenomination(c.amountZat);
    // A non-canonical crossing keys on its own amount, so it is a singleton
    // bucket and can never merge into a canonical run. Merging it would make an
    // upper bound smaller, which is the one direction it must not move.
    const key = denom === null ? `nc:${c.amountZat}` : bucketKey(denom);
    if (key !== previous) runs += 1;
    previous = key;
  }
  return runs;
}

/** `n x 10^kZatoshi`, the amount a bucket describes. */
function denominationAmountZat(d: { readonly n: number; readonly kZatoshi: number }): bigint {
  return BigInt(d.n) * 10n ** BigInt(d.kZatoshi);
}

/** Stable identity of a denomination. Never rendered; it exists to group and compare. */
function bucketKey(d: { readonly n: number; readonly kZatoshi: number }): string {
  return `${d.n}e${d.kZatoshi}`;
}

/**
 * `ceil(a / b)` for non-negative `a` and positive `b`, without leaving bigint.
 *
 * @throws RangeError if `b <= 0n`. A zero divisor here would mean the crossing
 * cap had been redefined to nothing, which is a defect worth stopping on rather
 * than an input worth tolerating.
 */
function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError(`ceilDiv: divisor must be positive, got ${b}`);
  if (a <= 0n) return 0n;
  return (a + b - 1n) / b;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
