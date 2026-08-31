/**
 * Module 9C - the Ironwood birth series (plan section 3.5, TRACKING-MATH
 * sections 3.1 and 4).
 *
 *   "Because |T^ironwood_h| started at 0 on 28 Jul 2026, Cand_0(nf) = {cm :
 *    pos(cm) <= maxPos(A)} for early anchors is small by construction. Track the
 *    time series of N_eff for Ironwood spends and the fraction below each claim
 *    threshold; expect the requires_disclosure/small_heuristic_set share to decay
 *    as the tree grows."
 *
 * WHAT THIS MODULE MEASURES IS THIS PROJECT'S OWN EXPOSURE, NOT THE CHAIN'S.
 * Every other estimator here narrows a candidate set and then reports how small
 * it got. This one reports how small the set was BEFORE anyone narrowed
 * anything: a new pool's commitment tree starts empty, so the anchor bound of
 * section 3.1 - the one filter section 3.1 calls "the only universally correct"
 * one - hands back a set of single digits for the first spends after NU6.3,
 * with no heuristic involved and nothing to switch off. The decay of the
 * `requires_disclosure` share is therefore the number that says when this site
 * may stop printing a disclosure warning beside an Ironwood spend, and it is a
 * number about the pool rather than about any spender in it.
 *
 * `N_eff` COMES FROM `entropy.ts` AND IS NOT `candidateCount` RETURNED UNDER
 * ANOTHER NAME. Under the uniform prior the two are equal - section 4 defines
 * `H = -Sigma p log2 p` and `N_eff = 2^H`, which collapses to `log2(N)` and `N`
 * when every candidate carries the same weight - so a version of this file that
 * assigned `nEff = Number(s.candidateCount)` would pass every test in the suite
 * beside it. It is still the wrong code, because the moment section 3.3's
 * time-window prior or section 4's `L_amount` weights are switched on, the
 * posterior stops being uniform and `N_eff < N`. Routing through
 * `entropyBitsUniform` then `effectiveSetSize` puts the whole change at ONE call
 * site: the bits become a weighted entropy and everything downstream - the
 * claim level, the shares, `minNEff` - follows without being touched. The
 * uniform prior is an ASSUMPTION this module buys, and it is bought where a
 * reader can see the purchase.
 *
 * Precision: `2^log2(N)` is not `N` in float64, and this module is the one that
 * has to say whether that can move a claim level. It cannot, and the reason is
 * arithmetic rather than luck. Executed, on this container's Node 22:
 * `Math.pow(2, Math.log2(n))` differs from `n` for many small `n` -
 * `n = 10` gives `9.999999999999998`, `n = 100` gives `99.99999999999997`,
 * `n = 1000` gives exactly `1000`, `n = 1001` gives `1000.9999999999994` - and
 * `effectiveSetSize`'s `Math.round` recovers every one of them. Recovery was
 * verified exhaustively for every `n` in 1..2,000,000 (zero failures) and in
 * dense 200,000-value bands at 10^9, 10^12, 10^13 and 10^14 (zero failures);
 * the first band in which it fails is 10^15, where 159,392 of 200,000 values do
 * not round-trip, and `2^52 - 1` is among them. So an inexact recovery needs
 * `N` around 10^15, and the largest claim threshold is 1,000: any `N` big
 * enough to be recovered inexactly is twelve orders of magnitude above every
 * threshold, and the relative error of the recovery is under 10^-14, so the
 * true value and the recovered value are both far above 1,000 and both classify
 * `aggregate_only`. A flip would need an `N` that is simultaneously within one
 * of a threshold and above 10^14, and no such integer exists. The claim
 * thresholds being decimal orders apart is what buys this, which is the reason
 * `entropy.ts`'s own header gives for them - restated here because THIS is the
 * module that would break if it were false.
 *
 * The rounding is not hiding anything either, and that distinction is worth
 * keeping separate from the one above. `nEff` and `claimLevel` are two readings
 * of ONE bigint - `effectiveSetSize`'s output is classified and then converted
 * for the wire - so the series can never render an `N_eff` beside a claim chip
 * that the `N_eff` does not imply. Publishing the raw `Math.pow` float instead
 * would put `9.999999999999998` on a page next to `requires_disclosure` and
 * invite a reader to check the boundary and conclude the site had rounded in its
 * own favour.
 *
 * THE BIRTH HEIGHT IS A PARAMETER AND NEVER A LITERAL IN THIS FILE. It is
 * `NU6_3_ACTIVATION_MAINNET` (3,428,143) or its testnet twin, both of which live
 * in this package's own `activation-heights.ts` with their citations attached, and the
 * caller passes whichever network it is replaying. The reason it is not imported
 * and defaulted here is {@link IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP}: ZIP 258 is
 * status **Draft**, so the height this module uses as the origin of its whole
 * x-axis rests on a document that may still be edited. A default would make that
 * dependency invisible at every call site; a required argument makes each caller
 * name the height it is asserting, and the audit record then carries it, so a
 * series computed against a height the ZIP later moves is identifiable after the
 * fact instead of silently wrong.
 *
 * THE EMPTY SERIES IS AN EXPLICIT CASE AND NOT A ZERO. With no admitted spend
 * every share is 0 and `minNEff` is `null`, because a share is a ratio over
 * `spendCount` and `0/0` is undefined rather than zero. A window before NU6.3,
 * or one in which nobody spent an Ironwood note, has NO distribution over claim
 * levels - which is a different statement from "no spend was at
 * requires_disclosure", and this shape is what keeps the two apart. `NaN` would
 * have carried the same information and would have propagated into every
 * consumer's arithmetic instead of stopping at a type check.
 *
 * WHAT THE AUDIT RECORD CANNOT SAY, RECORDED HERE BECAUSE IT IS A DEFECT IN A
 * TYPE THIS MODULE DOES NOT OWN. `FilterApplication`'s `ironwood_birth` variant
 * declares `params.minNEff: number`, not `number | null`, so the empty case that
 * {@link IronwoodBirth} makes explicit cannot be expressed on the record. This
 * module writes {@link EMPTY_SERIES_MIN_NEFF} there and the sentinel is safe to
 * READ only against `countOut`: an admitted spend has `candidateCount > 0n`,
 * hence `N_eff >= 1`, so 0 is not a value any non-empty series can produce.
 * `countOut === 0n` on the same record is the flag, and it is on the record
 * already. The honest fix is to widen the variant's field to `number | null`,
 * which is a change to `packages/zec-types/src/analysis.ts` and is reported to
 * the lead rather than made here.
 */

import type { ClaimLevel, FilterApplication, Hex, Pool } from "@zcashreveal/types";

import { classifyByEffectiveSet } from "./claim-classifier.js";
import { effectiveSetSize, entropyBitsUniform } from "./entropy.js";

/**
 * One shielded spend, as the series wants it: a height, a pool and the size of
 * the set the anchor bound leaves.
 *
 * IT CARRIES A POOL EVEN THOUGH THE MODULE IS NAMED FOR ONE. The caller replays
 * a block, not a pool, and a block after NU6.3 carries Sapling, Orchard and
 * Ironwood spends together; making the caller pre-filter would move the one rule
 * this series depends on into every call site, where it would be re-derived
 * differently each time. Filtering here also means a non-Ironwood spend is
 * COUNTED as excluded on the audit record rather than being invisible, which is
 * the difference between "four spends, all Ironwood" and "four hundred spends,
 * four of them Ironwood" - two very different claims behind one series.
 */
export interface IronwoodSpend {
  readonly txid: Hex;
  readonly height: number;
  readonly pool: Pool;
  /** Cand_0 - the anchor bound of TRACKING-MATH section 3.1, before any soft filter. */
  readonly candidateCount: bigint;
}

/**
 * One point of the series: what a single Ironwood spend published about itself.
 *
 * `candidateCount` NARROWS FROM `bigint` TO `number` HERE AND THAT IS THE
 * CONVENTION, NOT AN OVERSIGHT. CLAUDE.md reserves `bigint` for zatoshi and puts
 * heights and counts on `number`; {@link IronwoodSpend} carries a `bigint`
 * because Cand_0's bound is derived from a note commitment tree POSITION, which
 * is a bigint everywhere in this codebase, and this is where that bound stops
 * being a position and becomes a count. The narrowing is lossless below 2^53,
 * and an Ironwood tree reaching 9 x 10^15 notes is not a scenario this project
 * is bounded by - the whole Orchard tree, eight years of it, is five orders of
 * magnitude smaller.
 */
export interface NeffPoint {
  readonly height: number;
  readonly candidateCount: number;
  readonly nEff: number;
  readonly claimLevel: ClaimLevel;
}

/**
 * A window of the birth series: the points, the distribution over claim levels
 * and the worst case.
 *
 * The shares are over {@link IronwoodBirth.spendCount} - the ADMITTED series -
 * and not over the spends the caller offered. `audit.countIn` is what was
 * offered; the gap between the two counts is every spend the window, the pool
 * filter or the birth bound refused, and reading a share without reading that
 * gap is how "25% of spends require disclosure" comes to mean 25% of four.
 */
export interface IronwoodBirth {
  readonly birthHeight: number;
  readonly lowHeight: number;
  readonly highHeight: number;
  /** Ascending by height. */
  readonly series: ReadonlyArray<NeffPoint>;
  readonly spendCount: number;
  readonly shares: Readonly<Record<ClaimLevel, number>>;
  /** The series' worst case. Null when the series is empty. */
  readonly minNEff: number | null;
  readonly audit: FilterApplication;
}

/**
 * What goes in `params.minNEff` when the series is empty, because that field is
 * `number` and the empty case is `null`.
 *
 * See this module's header for why the sentinel is unambiguous against
 * `countOut` and why the real repair belongs in the union rather than here. It
 * is a named constant so that a grep for the compromise finds it, and so that a
 * later widening of the variant has one line to delete.
 */
const EMPTY_SERIES_MIN_NEFF = 0;

/**
 * Build the `N_eff` series for one window of Ironwood spends.
 *
 * THE FOUR ADMISSION RULES, AND WHY EACH ONE EXCLUDES RATHER THAN THROWS. A
 * spend joins the series when it is in the Ironwood pool, at or after
 * `birthHeight`, inside `[lowHeight, highHeight]` inclusive, and carries
 * `candidateCount > 0n`. Everything else is excluded, and the exclusion is
 * visible as `countIn - countOut` on the audit record rather than as an
 * exception, because a caller hands this function a replayed block range: one
 * unusable row must not be fatal to the window around it.
 *
 * THAT IS DELIBERATELY UNLIKE `migrationLens`, WHICH THROWS ON A NON-POSITIVE
 * AMOUNT, and the asymmetry is the point rather than an inconsistency. A
 * crossing's magnitude is positive by definition, so a non-positive one is a
 * sign error on our side of the boundary that would corrupt `sumZat` silently.
 * A candidate count of zero is neither impossible nor a defect: an anchor
 * created before any Ironwood commitment existed really does bound an empty set,
 * which is precisely the condition plan section 3.5 opens by naming. Such a
 * spend has no entropy - `entropyBitsUniform` throws on it, correctly - so it
 * cannot be a point of the series, and it is excluded and counted. A NEGATIVE
 * count is a defect, and it is excluded on the same rule rather than separated
 * out, because `> 0n` is the admission rule the spec states and splitting it
 * would put a second, unstated rule in the code.
 *
 * ORDERING IS TOTAL, NOT MERELY DEFINED. `series` is ascending by height, ties
 * broken by txid and then by candidate count. `conservation.ts` records what a
 * partial tie costs: a comparator that returns 0 for two distinguishable rows
 * lets `Array.prototype.sort` fall back to input order, and a result documented
 * as order-independent then is not. Two Ironwood spends share a height whenever
 * they share a block, which is the common case rather than the exotic one.
 *
 * ONE WINDOW, ONE NETWORK: the caller must pass the birth height of the network
 * it is replaying, and nothing in this signature enforces that. Passing mainnet's
 * 3,428,143 while replaying testnet admits every testnet Ironwood spend below
 * 4,134,000 into a series whose x-axis then starts before the pool existed.
 * {@link violatesBirthBound} is the falsifiable form of that bound and is what a
 * caller or a test uses to check the pairing.
 *
 * @throws RangeError if any of the three heights is not a safe integer, or if
 * `lowHeight > highHeight` - an inverted window can hold nothing, so returning an
 * empty series for one would be a lie by construction rather than a measurement.
 * A `highHeight` below `birthHeight` is NOT an error: it is a window before the
 * pool existed, and the empty series is the correct answer to it.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function ironwoodBirth(
  spends: ReadonlyArray<IronwoodSpend>,
  opts: { readonly birthHeight: number; readonly lowHeight: number; readonly highHeight: number },
): IronwoodBirth {
  const { birthHeight, lowHeight, highHeight } = opts;
  if (
    !Number.isSafeInteger(birthHeight) ||
    !Number.isSafeInteger(lowHeight) ||
    !Number.isSafeInteger(highHeight)
  ) {
    throw new RangeError(
      `ironwoodBirth: heights must be safe integers, got birth ${birthHeight}, window [${lowHeight}, ${highHeight}]`,
    );
  }
  if (lowHeight > highHeight) {
    throw new RangeError(
      `ironwoodBirth: inverted window [${lowHeight}, ${highHeight}] can hold no spend`,
    );
  }

  const admitted = spends.filter(
    (s) =>
      s.pool === "ironwood" &&
      s.height >= birthHeight &&
      s.height >= lowHeight &&
      s.height <= highHeight &&
      s.candidateCount > 0n,
  );

  // A COPY. The caller's array is not this module's to reorder; the purity scan
  // beside these files exists because that mistake is easy to make.
  const ordered = [...admitted].sort(
    (a, b) =>
      a.height - b.height ||
      a.txid.localeCompare(b.txid) ||
      compareBigint(a.candidateCount, b.candidateCount),
  );

  const series: NeffPoint[] = ordered.map((s) => {
    // ONE BIGINT, READ TWICE. The claim level and the published `nEff` are both
    // taken from `effective`, so they cannot disagree with each other.
    const effective = effectiveSetSize(entropyBitsUniform(s.candidateCount));
    return {
      height: s.height,
      candidateCount: Number(s.candidateCount),
      nEff: Number(effective),
      claimLevel: classifyByEffectiveSet(effective),
    };
  });

  const spendCount = series.length;

  const counts: Record<ClaimLevel, number> = {
    requires_disclosure: 0,
    small_heuristic_set: 0,
    broad_candidate_set: 0,
    aggregate_only: 0,
  };
  for (const point of series) counts[point.claimLevel] += 1;

  const shares: Record<ClaimLevel, number> = {
    requires_disclosure: shareOf(counts.requires_disclosure, spendCount),
    small_heuristic_set: shareOf(counts.small_heuristic_set, spendCount),
    broad_candidate_set: shareOf(counts.broad_candidate_set, spendCount),
    aggregate_only: shareOf(counts.aggregate_only, spendCount),
  };

  let minNEff: number | null = null;
  for (const point of series) {
    if (minNEff === null || point.nEff < minNEff) minNEff = point.nEff;
  }

  const audit: FilterApplication = {
    filter: "ironwood_birth",
    params: {
      birthHeight,
      lowHeight,
      highHeight,
      requiresDisclosureShare: shares.requires_disclosure,
      // The variant's field is `number`; see EMPTY_SERIES_MIN_NEFF.
      minNEff: minNEff ?? EMPTY_SERIES_MIN_NEFF,
    },
    // `analysis.ts`: countIn is every spend the caller offered, countOut the
    // spends that belong to the series.
    countIn: BigInt(spends.length),
    countOut: BigInt(spendCount),
  };

  return { birthHeight, lowHeight, highHeight, series, spendCount, shares, minNEff, audit };
}

/**
 * True when the input contains an Ironwood spend below `birthHeight` - the event
 * the series' birth bound exists to refuse.
 *
 * THE PREDICATE IS OVER THE RAW INPUT, NOT OVER THE SERIES, and that is the
 * whole reason it can be false. Read literally as a question about spends
 * "admitted to the series" it is unfalsifiable: admission already requires
 * `height >= birthHeight`, so a predicate over the output restates the filter and
 * returns `false` for every input that has ever existed. `conservation.ts`
 * records the same shape from the other side - an assertion whose condition "was
 * a tautology no input could falsify" - and its `violatesConservation` is
 * answered here for the same reason: a test that only inspects a filtered result
 * cannot tell a correct filter from a broken one behind a plausible-looking
 * series.
 *
 * WHAT IT IS ACTUALLY FOR. An Ironwood spend below the birth height is
 * impossible on chain: `|T^ironwood_h|` is 0 until NU6.3 activates, so there is
 * no note to spend and no anchor to cite. Seeing one means the decoder mislabels
 * a pool, the replay crossed networks, or the birth height itself is wrong -
 * which is a live risk rather than a theoretical one, because
 * {@link IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP} records that ZIP 258 is status
 * Draft and its heights can still move. This is the check that turns that
 * standing exposure into a failing assertion instead of a silently shifted axis.
 *
 * `candidateCount` IS NOT PART OF IT, DELIBERATELY. A pre-birth Ironwood spend
 * with `candidateCount === 0n` would be excluded from the series by the fourth
 * admission rule and would therefore never reach the birth bound at all - and
 * an empty candidate set is exactly what a spend against a not-yet-existing tree
 * would report. Making the count part of the predicate would let the single
 * input that most looks like a decoder defect pass the law in silence.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function violatesBirthBound(
  spends: ReadonlyArray<IronwoodSpend>,
  birthHeight: number,
): boolean {
  return spends.some((s) => s.pool === "ironwood" && s.height < birthHeight);
}

/**
 * `count / total`, with the empty case stated rather than divided.
 *
 * `0 / 0` is `NaN` and this project's rule is that an undefined share is
 * undefined, so the caller decides what an empty series means once - see
 * {@link IronwoodBirth.shares} - instead of every consumer discovering it as a
 * `NaN` in a chart axis.
 *
 * THE FOUR SHARES NEED NOT SUM TO EXACTLY 1 IN FLOAT64, and the counterexample is
 * small enough to state: counts of 0, 1, 4 and 1 over 6 spends sum to
 * 0.9999999999999999, and 1, 4, 1, 1 over 7 to 0.9999999999999998. Each share is
 * the correctly-rounded double nearest its true rational, which is the number a
 * reader can reproduce with a calculator; the residual is the cost of that, and
 * it was measured at no more than one unit in the last place across every
 * four-part partition of every total up to 600 (executed). The alternative -
 * computing three shares and taking the fourth as the remainder, or pushing the
 * residual into the largest bar - would publish a share that is not
 * `count / spendCount`, which is worse: it makes the site's own number
 * irreproducible from the site's own counts to buy an exactness that nothing
 * downstream needs.
 */
function shareOf(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
