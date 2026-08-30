/**
 * Module 9A - turnstile accounting (plan sections 3.1-3.3).
 *
 *   "3.2 The Unprovable Residual. Define `U_h = Bal^sprout_h + Bal^orchard_h` -
 *    value still inside pools whose circuits were unsound during their lifetime
 *    and which can only be cleared by emptying. Publish `U_h`, `U_h / Supply_h`,
 *    and the verified share `V_h = 1 - U_h / Supply_h`. Today: `U approx 22.6k +
 *    708.8k approx 731k ZEC approx 4.3%` of supply (CipherScan, 22 Aug). This is
 *    the site's headline instrument number and it is strictly a public
 *    aggregate."
 *
 *   "3.3 Orchard drain. `D_h = 1 - Bal^orchard_h / Bal^orchard_{3,428,143}`.
 *    Velocity `dD/dt` from block timestamps (ZEC/hour, 24h and 7d windows).
 *    Expected completion is undefined (no deadline; dust < 0.01 ZEC is stranded
 *    by ZIP 318's `MAX_RESIDUAL_VALUE`) - show the asymptote, do not forecast a
 *    date."
 *
 * THE PLAN'S UNICODE OPERATORS ARE TRANSLITERATED IN THOSE QUOTATIONS - minus
 * sign, >=, approximately-equal, subscripts - and nothing else in them is
 * changed. This repository forbids non-ASCII in source, so a quotation that
 * calls itself verbatim has to say which liberty it took.
 *
 * WHAT THIS MODULE IS AND IS NOT. It is the arithmetic of four public
 * aggregates: the residual `U`, the verified share `V`, the Orchard drain `D`
 * and a signed drain velocity. Every input is a number the chain publishes and
 * every output is a number about the whole pool. Nothing here narrows a
 * candidate set, names an address or touches a note, so nothing here can make a
 * claim about a person - which is why plan section 3.2 can call `U` the site's
 * headline number without the claim-level machinery that guards every estimate
 * in `echo.ts` and `posterior.ts`.
 *
 * WHY `turnstileResidual` EMITS NO `FilterApplication` AND THE OTHER TWO DO.
 * `U_h` and `V_h` are aggregates AT ONE HEIGHT: there is no candidate set, no
 * `countIn`, nothing narrowed, and a filter record for them would be a record of
 * a filter that did not happen - an audit trail padded with a step the code did
 * not take, which is worse than no record at all because a reader trusts it.
 * `selectWindow` and `orchardDrain` DO narrow: a velocity is computed from the
 * samples the window ADMITTED, and "two samples out of 1,150" and "1,150 out of
 * 1,150" are different claims that look identical in the resulting number. That
 * difference is exactly what an audit record exists to carry, so both emit a
 * `turnstile_window` record with `countIn` = samples supplied and `countOut` =
 * samples admitted.
 *
 * TIME COMES FROM THE CHAIN, NEVER FROM A CLOCK. Every timestamp this module
 * reads arrives on a `PoolBalanceSample`, which the caller fills from the block
 * header. There is no `Date.now()` here and there must not be: a velocity that
 * depended on when the process happened to run could not be replayed, and a
 * replayed number that differs from the published one is indistinguishable from
 * a wrong one.
 *
 * Precision: bigint inputs cross into float64 at exactly two places, and both
 * crossings are deliberate.
 *
 *   The RATIOS - `U/Supply` and `Bal_orchard/Bal_baseline` - are formed in
 *   bigint at a fixed scale of 10^12 and converted once, so the division never
 *   happens in float and neither operand is ever cast on its own. Casting a
 *   zatoshi count first would lose low bits above 2^53 (a supply of 16.9M ZEC is
 *   1.7 x 10^15 zatoshi, which is already past it), and the loss would land in
 *   the numerator and denominator independently. The scaled form is exact to
 *   1e-12 of the ratio, which is seven decimal orders below the tightest
 *   tolerance any assertion in this project states (1e-5 on `V`).
 *
 *   The VELOCITY converts a signed zatoshi delta to ZEC in float, because a rate
 *   is a real number and hours are already one. A window's delta is bounded by
 *   the pool balance - order 10^14 zatoshi for Orchard - which is inside 2^53,
 *   so the cast is exact for any input the chain can produce.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */

import { ZATOSHI_PER_ZEC, type FilterApplication, type Pool } from "@zcashreveal/types";

import { orchardExitOnlyFrom, type Network } from "../decoder/activation-heights.js";

/** Milliseconds in one hour. The only unit conversion the window arithmetic needs. */
const MS_PER_HOUR = 3_600_000;

/**
 * Fixed-point scale for the bigint ratios. See the Precision paragraph above.
 *
 * 10^12 rather than 10^15 because `Number(scaled)` must be exact: at 10^12 a
 * ratio stays exactly representable up to 9,007, so a caller who hands this
 * module contradictory inputs still gets an honest number out rather than a
 * silently rounded one.
 */
const RATIO_SCALE = 10n ** 12n;

/**
 * One pool's balance at one height, with the block's own timestamp.
 *
 * The three fields are the whole input contract of this module: a series is an
 * array of these, and nothing else about a block is read.
 */
export interface PoolBalanceSample {
  readonly height: number;
  /** Block timestamp, milliseconds since epoch. From the chain, never from a clock. */
  readonly timeMs: number;
  readonly balanceZat: bigint;
}

/** Plan section 3.2's four published figures, at one height. */
export interface TurnstileResidual {
  /** `U_h` - the sprout and orchard balances summed. */
  readonly unprovableZat: bigint;
  /** `Supply_h`, as supplied. Echoed so a consumer cannot render a share without its base. */
  readonly supplyZat: bigint;
  /** `U_h / Supply_h`, in [0, 1]. */
  readonly unprovableShare: number;
  /** `V_h = 1 - U_h / Supply_h`, in [0, 1]. */
  readonly verifiedShare: number;
}

/**
 * `U_h = Bal^sprout + Bal^orchard` and `V_h = 1 - U_h/Supply_h`, per plan
 * section 3.2.
 *
 * Emits NO audit record. `U` and `V` are aggregates at a single height with no
 * candidate set and nothing narrowed, so a `FilterApplication` for them would
 * record a filter that did not happen. The module docblock argues this at
 * length; it is repeated here because this is the function a reader will check
 * it against.
 *
 * THE PARAMETER TYPE IS `Partial` AND THIS FUNCTION IS NOT. `sapling` and
 * `ironwood` may be absent - they are not in `U`, and their circuits are not the
 * ones section 3.2 is about - but `sprout` and `orchard` may not, and a missing
 * one throws rather than counting as zero. The reason is the direction of the
 * error: treating an unsupplied Sprout balance as 0 publishes a HIGHER verified
 * share than the truth, which is an unearned reassurance about the one number
 * this site leads with. This project has made the missing-is-zero conflation
 * once already, in HANDOFF-06's `UNKNOWN_NONSTANDARD` fee, and the ledger
 * records it as the expensive kind of defect precisely because the output looked
 * like a measurement.
 *
 * WHAT IT REFUSES AND WHAT IT MERELY ALLOWS. It throws when the inputs CONTRADICT
 * one another - a negative pool balance (ZIP 209 says `Bal^p >= 0`, and plan
 * section 3.1 says a violation in our replay means our decoder is wrong, so
 * throw), a non-positive supply, or a residual larger than the money supply. It
 * does not throw for inputs that are merely an odd question, because the line
 * between the two is whether both readings could be true at once. A residual
 * above supply cannot be true, and the alternative to throwing is publishing a
 * negative verified share - a statement about unprovability that the site would
 * be wrong to make, in a signature with no field to record a refusal in.
 *
 * @throws TypeError if `sprout` or `orchard` is absent.
 * @throws RangeError if either balance is negative, if `supplyZat <= 0n`, or if
 * `U` exceeds `supplyZat`.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function turnstileResidual(
  balances: Readonly<Partial<Record<Pool, bigint>>>,
  supplyZat: bigint,
): TurnstileResidual {
  const sprout = balances.sprout;
  const orchard = balances.orchard;
  if (sprout === undefined || orchard === undefined) {
    const missing = [sprout === undefined ? "sprout" : null, orchard === undefined ? "orchard" : null]
      .filter((p): p is string => p !== null)
      .join(" and ");
    throw new TypeError(
      `turnstileResidual: ${missing} balance is absent. U = Bal^sprout + Bal^orchard needs both; ` +
        "an absent balance is not a zero balance, and treating it as one would overstate the verified share.",
    );
  }
  if (sprout < 0n || orchard < 0n) {
    throw new RangeError(
      `turnstileResidual: a pool balance is negative (sprout=${sprout}, orchard=${orchard}). ` +
        "ZIP 209 requires Bal^p >= 0, so this is our replay being wrong, never the chain.",
    );
  }
  if (supplyZat <= 0n) {
    throw new RangeError(
      `turnstileResidual: supplyZat must be positive, got ${supplyZat}. ` +
        "U/Supply is undefined at zero supply, and returning Infinity would publish it as a share.",
    );
  }
  const unprovableZat = sprout + orchard;
  if (unprovableZat > supplyZat) {
    throw new RangeError(
      `turnstileResidual: U (${unprovableZat} zat) exceeds the supply (${supplyZat} zat). ` +
        "The two inputs contradict each other; the alternative to throwing is a negative verified share.",
    );
  }
  const unprovableShare = ratioToNumber(unprovableZat, supplyZat);
  return {
    unprovableZat,
    supplyZat,
    // FROM `unprovableShare`, NOT FROM A SECOND DIVISION, so the pair can never
    // disagree by a float ULP. Section 3.2 defines V as 1 - U/Supply and this is
    // that sentence rather than an independent computation of (Supply - U)/Supply.
    verifiedShare: 1 - unprovableShare,
    unprovableShare,
  };
}

/** The samples a window admitted, the change across them, and the rate that implies. */
export interface WindowSelection {
  /** The admitted samples, ascending by timestamp then height. Never mutated from the input. */
  readonly samples: ReadonlyArray<PoolBalanceSample>;
  /** `newest.balanceZat - oldest.balanceZat`, signed. Negative while a pool drains. */
  readonly deltaZat: bigint;
  /** From the admitted samples' own timestamps, never from `windowHours`. */
  readonly elapsedHours: number;
  /** Signed ZEC per hour, or null when the window admitted fewer than two samples. */
  readonly zecPerHour: number | null;
  readonly audit: FilterApplication;
}

/**
 * Select the samples inside a window and measure the rate across them
 * (plan section 3.3, "velocity `dD/dt` from block timestamps").
 *
 * SELECTED BY HEIGHT AT THE TOP AND BY TIME FOR THE SPAN, which is not a
 * compromise but the only pair of bounds that answers the question. The upper
 * bound is a HEIGHT because the caller is asking about the chain as of a tip -
 * a window that admitted a sample above the tip would be reporting the future.
 * The span is TIME because "ZEC per hour" is a rate over hours, and blocks are
 * not hours: Zcash targets 75 seconds and misses, so 1,152 blocks is only
 * approximately a day and the approximation is exactly the error that would
 * land in the published rate.
 *
 * NEWEST AND OLDEST ARE BY TIMESTAMP, NOT BY HEIGHT, AND THE TWO CAN DISAGREE.
 * A block's timestamp must exceed the median of the previous eleven, which
 * permits a later block to carry an earlier timestamp than its immediate
 * predecessor. The admission rule is stated in time - "within `windowHours` of
 * the newest admitted sample" - so the endpoints are read in time too, and
 * `elapsedHours` is non-negative by construction. The alternative (endpoints by
 * height) is defensible and differs only for an inverted pair at a window edge,
 * where it would produce a NEGATIVE elapsed time and therefore a rate with the
 * wrong sign. That is the trade this took, recorded rather than left for a
 * reader to rediscover: for a monotone series - every fixture here and the real
 * chain over any span of hours - the two agree exactly.
 *
 * THE `pool` ARGUMENT IS A LABEL, NOT A FILTER. `PoolBalanceSample` carries no
 * pool, so nothing in this signature can check that the series is the pool the
 * caller named; it is written onto the audit record and used for nothing else.
 * The caller partitions the input. `conservation.ts` states the same contract
 * for the same reason, and it is written where a caller will read it rather than
 * in a ledger nobody imports.
 *
 * A RATE OVER ZERO ELAPSED TIME IS NOT A LARGE RATE, IT IS NOT A RATE.
 * `zecPerHour` is null when the window admitted fewer than two samples, and also
 * when the admitted samples share one timestamp - the second case is a superset
 * of the specified rule and it is here because the arithmetic is the same
 * division by zero, which in float is `Infinity` and would render as a number.
 *
 * @throws RangeError if `windowHours` is not a positive finite number.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function selectWindow(
  pool: Pool,
  series: ReadonlyArray<PoolBalanceSample>,
  opts: { readonly windowHours: number; readonly highHeight: number },
): WindowSelection {
  const { windowHours, highHeight } = opts;
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new RangeError(
      `selectWindow: windowHours must be a positive finite number, got ${windowHours}. ` +
        "A window of zero or negative hours is not a window.",
    );
  }

  // COPY BEFORE SORT. `Array.prototype.sort` mutates in place, and this module
  // promises it does not touch the caller's array. `filter` already returns a
  // new array, so the sort below runs on this module's own copy.
  const underCeiling = series.filter((s) => s.height <= highHeight);
  // THE ANCHOR IS COMPUTED ONCE, OUTSIDE THE PREDICATE. Inside it, the same scan
  // would run per element - quadratic over a week of blocks, and worse, it would
  // read as if the anchor could change while the window was being selected.
  const anchorMs = newestTimeMs(underCeiling);
  const admitted = underCeiling
    .filter((s) => anchorMs !== null && s.timeMs >= anchorMs - windowHours * MS_PER_HOUR)
    .sort((a, b) => a.timeMs - b.timeMs || a.height - b.height);

  const oldest = admitted[0];
  const newest = admitted[admitted.length - 1];
  const deltaZat = oldest && newest ? newest.balanceZat - oldest.balanceZat : 0n;
  const elapsedMs = oldest && newest ? newest.timeMs - oldest.timeMs : 0;
  const elapsedHours = elapsedMs / MS_PER_HOUR;
  const zecPerHour =
    admitted.length >= 2 && elapsedHours > 0 ? zecOf(deltaZat) / elapsedHours : null;

  // THE TWO HEIGHTS ON THE RECORD SAY DIFFERENT THINGS AND BOTH ARE NEEDED.
  // `highHeight` is the ceiling the CALLER set: it is a parameter of the filter
  // and cannot be recovered from the output, since the newest admitted sample
  // may sit well below it. `lowHeight` is where the TIME rule cut in, which
  // cannot be recovered from the parameters. Together they read as "the caller
  // capped at H and the window opened at L". When nothing was admitted there is
  // no low edge to report and both carry the ceiling - `countOut: 0n` is the
  // field that says so, and a reader must read it first.
  const audit: FilterApplication = {
    filter: "turnstile_window",
    params: {
      pool,
      lowHeight: lowestHeight(admitted) ?? highHeight,
      highHeight,
      windowHours,
      deltaZat,
    },
    countIn: BigInt(series.length),
    countOut: BigInt(admitted.length),
  };

  return { samples: admitted, deltaZat, elapsedHours, zecPerHour, audit };
}

/** Plan section 3.3's drain, with both velocities and the audit trail of the two windows. */
export interface OrchardDrain {
  readonly pool: "orchard";
  readonly baselineHeight: number;
  readonly baselineZat: bigint;
  readonly currentZat: bigint;
  /** `D = 1 - current/baseline`. 0 at the baseline, 1 at an empty pool. */
  readonly drained: number;
  readonly velocity24hZecPerHour: number | null;
  readonly velocity7dZecPerHour: number | null;
  /** How many of the supplied samples lie at or below `atHeight` - what this call could read. */
  readonly sampleCount: number;
  readonly audits: ReadonlyArray<FilterApplication>;
}

/** The two windows plan section 3.3 names, in hours. */
const DRAIN_WINDOW_HOURS = { day: 24, week: 168 } as const;

/**
 * `D_h = 1 - Bal^orchard_h / Bal^orchard_baseline`, with the 24 h and 7 d
 * velocities beside it (plan section 3.3).
 *
 * NO DATE IS FORECAST AND NONE CAN BE. Section 3.3 says expected completion is
 * undefined - there is no deadline, and dust below ZIP 318's
 * `MAX_RESIDUAL_VALUE` is stranded in the pool by the denomination rule itself,
 * so the asymptote is a balance that never reaches zero. A `completionEstimate`
 * field would be the whole instrument's one dishonest number, which is why this
 * return type does not have one and a later consumer must not derive one by
 * dividing the remaining balance by a velocity.
 *
 * THE BASELINE IS THE CALLER'S, NOT THIS MODULE'S. `baselineHeight` and
 * `baselineZat` are parameters rather than constants read from
 * `activation-heights.ts`, because the drain is well defined against any
 * baseline a caller can justify - testnet's NU6.3, or a chart re-based to a
 * later height - and because a module that read the mainnet activation height
 * itself would silently answer the wrong question on testnet. The one place
 * NU6.3 IS read here is `violatesExitOnly`, where it is a consensus rule rather
 * than a chart origin.
 *
 * WHY `audits` HOLDS TWO RECORDS AND NOT THREE. The two are the windows, which
 * really narrow. `D` itself is a ratio of two balances at two heights: the only
 * selection it performs is reading one sample out of the series, and a
 * `turnstile_window` record for it would have to invent a `windowHours` for a
 * span that is not a window. The lookup is reported instead by `sampleCount` and
 * by `currentZat` being on the result.
 *
 * @throws RangeError if `baselineZat <= 0n` (D is undefined), or if the series
 * holds no sample at or below `atHeight` (there is no current balance to divide).
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function orchardDrain(
  series: ReadonlyArray<PoolBalanceSample>,
  opts: { readonly baselineHeight: number; readonly baselineZat: bigint; readonly atHeight: number },
): OrchardDrain {
  const { baselineHeight, baselineZat, atHeight } = opts;
  if (baselineZat <= 0n) {
    throw new RangeError(
      `orchardDrain: baselineZat must be positive, got ${baselineZat}. ` +
        "D = 1 - current/baseline is undefined at a zero baseline, and a pool that held nothing cannot drain.",
    );
  }

  const readable = series.filter((s) => s.height <= atHeight);
  if (readable.length === 0) {
    throw new RangeError(
      `orchardDrain: the series holds no sample at or below atHeight ${atHeight}, ` +
        "so there is no current balance. A drain of 0 would be a reading this call never took.",
    );
  }
  // THE NEWEST SAMPLE BY HEIGHT, because a balance is a function of height and
  // this is a lookup rather than a rate. Ties on height are broken by timestamp
  // so the choice is deterministic for a caller who supplied two readings of one
  // block; the two balances disagreeing is the caller's defect, not this one's.
  const byHeight = readable.sort((a, b) => a.height - b.height || a.timeMs - b.timeMs);
  const current = byHeight[byHeight.length - 1]!;

  const day = selectWindow("orchard", series, {
    windowHours: DRAIN_WINDOW_HOURS.day,
    highHeight: atHeight,
  });
  const week = selectWindow("orchard", series, {
    windowHours: DRAIN_WINDOW_HOURS.week,
    highHeight: atHeight,
  });

  return {
    pool: "orchard",
    baselineHeight,
    baselineZat,
    currentZat: current.balanceZat,
    drained: 1 - ratioToNumber(current.balanceZat, baselineZat),
    velocity24hZecPerHour: day.zecPerHour,
    velocity7dZecPerHour: week.zecPerHour,
    sampleCount: readable.length,
    audits: [day.audit, week.audit],
  };
}

/**
 * Whether an Orchard balance series GROWS at or after the height Orchard becomes
 * exit-only - the falsifiable form of plan section 3.1's ZIP 2006 invariant.
 *
 * The question `ValuePool` answers per transaction, asked over a SERIES so a
 * caller - or a property test - can run it against RAW input rather than only
 * against a guarded pipeline. `conservation.ts`'s `violatesConservation` exists
 * for the same reason and is the shape this follows: a test that only ever
 * inspects a sieved output cannot tell a conserving estimator from a violating
 * one behind a working sieve.
 *
 * THE PAIR MUST BRACKET ONLY POST-ACTIVATION BLOCKS, WHICH IS STRICTER THAN
 * "THE LATER SAMPLE IS POST-ACTIVATION". Growth between a sample at `H - 10` and
 * one at `H` covers nine blocks in which value could legally enter Orchard, so
 * it is not evidence of anything and this returns false for it. The condition is
 * therefore `prev.height >= H - 1`: the interval `(prev.height, next.height]` -
 * the blocks the delta is actually attributable to - then lies entirely at or
 * above `H`. Activation is inclusive, matching the protocol's own "from block
 * height N onward" and `poolsActiveAt`.
 *
 * IT UNDER-REPORTS BY CONSTRUCTION AND THAT IS THE HONEST DIRECTION. A sparse
 * series that grew somewhere across a gap straddling activation returns false,
 * because this cannot say WHICH block admitted the value and a law that accuses
 * on an unattributable delta is a law that will be switched off. A caller that
 * wants completeness samples every block; the indexer does.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function violatesExitOnly(
  series: ReadonlyArray<PoolBalanceSample>,
  opts: { readonly network?: Network } = {},
): boolean {
  const from = orchardExitOnlyFrom(opts.network ?? "mainnet");
  const ordered = [...series].sort((a, b) => a.height - b.height || a.timeMs - b.timeMs);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]!;
    const next = ordered[i]!;
    // Two readings of one height are not an interval, so no block can be blamed
    // for the difference between them.
    if (next.height <= prev.height) continue;
    if (prev.height < from - 1) continue;
    if (next.balanceZat > prev.balanceZat) return true;
  }
  return false;
}

/**
 * The newest timestamp in a set of samples, or null when the set is empty.
 *
 * NOT `Math.max(...xs)`: a spread over a full day of blocks is ~1,150 arguments
 * and over a week ~8,000, which is fine, but the same helper on a longer series
 * would hit the argument limit and throw a RangeError that looked like this
 * module's own.
 */
function newestTimeMs(samples: ReadonlyArray<PoolBalanceSample>): number | null {
  let best: number | null = null;
  for (const s of samples) {
    if (best === null || s.timeMs > best) best = s.timeMs;
  }
  return best;
}

/**
 * The lowest height in a set of samples, or null when the set is empty.
 *
 * A scan rather than `Math.min(...xs)`, for the reason `newestTimeMs` gives, and
 * a scan rather than reading the first element because `admitted` is ordered by
 * TIMESTAMP - which is the same near-monotone-but-not-monotone ordering
 * `selectWindow`'s endpoint paragraph is about.
 */
function lowestHeight(samples: ReadonlyArray<PoolBalanceSample>): number | null {
  let best: number | null = null;
  for (const s of samples) {
    if (best === null || s.height < best) best = s.height;
  }
  return best;
}

/**
 * `numerator / denominator` as a float, with the division done in bigint at
 * `RATIO_SCALE` and rounded to nearest. See the module's Precision paragraph.
 *
 * Callers pass a non-negative numerator and a positive denominator; both are
 * checked by the exported functions before they get here, which is why this one
 * does not check again.
 */
function ratioToNumber(numerator: bigint, denominator: bigint): number {
  const scaled = (numerator * RATIO_SCALE + denominator / 2n) / denominator;
  return Number(scaled) / Number(RATIO_SCALE);
}

/** A signed zatoshi amount as ZEC. The velocity's one float crossing. */
function zecOf(zat: bigint): number {
  return Number(zat) / Number(ZATOSHI_PER_ZEC);
}
