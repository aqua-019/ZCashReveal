/**
 * Module 8A - the amount echo (TRACKING-MATH section 3.4).
 *
 * The Kappos round-trip, with the four tolerances section 3.4 names, as pure
 * functions over a window of boundary events. Nothing here does I/O, reads a
 * clock it was not given, or names an owner: an echo is a statement that two
 * PUBLIC amounts are close, and every stronger reading of it belongs to the
 * reader, not to this module.
 *
 * WHY THIS IS A SEPARATE MODULE FROM `round-trip.ts`. `RoundTripIndex` is a
 * stateful sliding window that emits `LinkRecord`s on the live path; it answers
 * two tolerances (exact, fee-tolerant) and it has to keep answering them in the
 * shape the gateway and the UI already parse. This module is the estimator: it
 * is pure, it answers four tolerances, and it emits the `FilterApplication`
 * audit record the inference chain renders. They share a definition of a
 * boundary event and nothing else, and the audit record is the seam - HANDOFF-12
 * is where `RoundTripIndex` starts consulting this rather than duplicating it.
 *
 * THE FOUR TOLERANCES, AND WHY THE FOURTH ONE EXISTS. Exact and fee-tolerant
 * are v0.2's. The relative one is calibrated and it is the reason this handoff
 * exists at all: on 2 Jan 2026 `t1XKfb...` shielded 50,000.960 ZEC and
 * 50,000.5541 ZEC was unshielded 52 minutes later - a residual of 0.4059 ZEC,
 * which is 8.1e-6 RELATIVE and 254 times the absolute fee tolerance. The v0.2
 * rule missed it, and the shape of the miss is instructive: an absolute
 * tolerance is a statement about fees, and the residual it was missing is not a
 * fee, it is change left in the pool. Subset-sum is the fourth because one
 * shield can leave as several deshields, which the 2 Jan case also shows -
 * 50,000.5541 + 24,000.9781 consolidates to 74,001.9317 on the transparent side.
 *
 * WHAT AN ECHO IS NOT. It is not a link, and this module deliberately returns
 * no `LinkRecord`. TRACKING-MATH's closing paragraph governs: "None of this
 * identifies a person. It produces bounded, reproducible estimates from public
 * data." A grade of HIGH here means "one candidate, exact amount", not "this is
 * the same money" - the whole point of the claim-level ladder downstream is that
 * even a HIGH echo over a large candidate set is `aggregate_only`.
 */

import type { FilterApplication, Hex, ShieldedPool, Zatoshi } from "@zcashreveal/types";
import { FEE_TOLERANCE_ZAT, MAX_LINK_WINDOW_MS } from "./constants.js";

/* ============================================================================
   Calibrated constants
   ========================================================================== */

/**
 * The relative tolerance, `epsilon`. TRACKING-MATH section 3.4 gives 1e-4 as
 * the default, calibrated on the 2 Jan 2026 round-trip.
 *
 * IT IS TWELVE TIMES LOOSER THAN THE CASE IT WAS CALIBRATED ON, which is worth
 * stating rather than leaving for someone to discover: the 2 Jan residual is
 * 8.1e-6 and this admits anything up to 1e-4. That is deliberate - a tolerance
 * fitted exactly to its calibration case is a tolerance that matches one
 * transaction - but it means the rule's discriminating power comes mostly from
 * the WINDOW and the candidate count, not from the tolerance. The claim level is
 * what carries that honesty to the reader.
 */
export const RELATIVE_EPSILON = 1e-4;

/**
 * The grade-LOW band: `10 * epsilon`. Section 3.4 grades a relative match `LOW`
 * rather than `MEDIUM` once the residual exceeds `epsilon` but stays inside
 * `10 * epsilon`, so the boundary is a downgrade and never a rejection.
 */
export const RELATIVE_EPSILON_LOW_MULTIPLE = 10;

/** Section 3.4's `k <= 3`: at most three deshields may sum to one shield. */
export const MAX_SPLIT_COUNT = 3;

/**
 * Section 3.4's quantisation for subset-sum: amounts are rounded to 1e4 zat
 * (0.0001 ZEC) before they are summed.
 *
 * IT IS A COST BOUND, NOT A TOLERANCE, and conflating the two would be a real
 * error. Quantising collapses amounts that differ by less than a quantum into
 * one bucket, which is what keeps the search space finite; whether a SUM is
 * close enough is then decided by {@link subsetSumTolerance} on the UNQUANTISED
 * values, so no match is ever admitted because rounding made it fit.
 */
export const SUBSET_SUM_QUANTUM_ZAT: Zatoshi = 10_000n;

/**
 * The tight-timing threshold that lifts a two-way split from `LOW` to `MEDIUM`.
 * Section 3.4: "Split matches are graded LOW unless timing is tight (< 1 h) and
 * the split count is 2."
 */
export const TIGHT_SPLIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * How many in-window deposits the subset-sum search will consider, most recent
 * first.
 *
 * A STATED BOUND RATHER THAN AN UNBOUNDED SEARCH. Enumerating subsets of size
 * up to 3 is O(n^3); at this cap the worst case is C(48,3) = 17,296 additions,
 * which is nothing, and at a few hundred events it would not be. The bound is
 * reported in the audit record's `countIn` so a reader can see that the search
 * was truncated rather than exhaustive - an estimate that quietly stopped
 * looking is the failure mode section 3's audit contract exists to prevent.
 */
export const SUBSET_SUM_MAX_CANDIDATES = 48;

/* ============================================================================
   The event and match shapes
   ========================================================================== */

/**
 * One side of a boundary crossing, as section 2 defines it: a public amount, a
 * public time, a pool, and the transparent address at the public end when there
 * is one.
 *
 * `address` IS NULLABLE AND ITS NULL IS NOT A GAP IN THE DATA. A transparent
 * output whose script this build cannot parse has a transparent side and no
 * address, and that is different from having no transparent side at all. The
 * partial-echo rule below is the only one that requires an address, and it says
 * so at its own definition rather than treating a null as a non-match.
 */
export interface BoundaryEvent {
  readonly txid: Hex;
  /** Positive magnitude. Direction is carried by which list the event is in. */
  readonly amountZat: Zatoshi;
  readonly seenAt: number;
  readonly height: number;
  readonly pool: ShieldedPool;
  readonly address: string | null;
}

/**
 * Which of section 3.4's tolerances admitted a match.
 *
 * `PARTIAL` is not one of section 3.4's four, and it is here because section 6
 * requires it: the lockbox golden case (7,875 in, 7,438.2295 back 20 minutes
 * later to the same address) is 5.5e-2 relative, which is 554 times `epsilon`
 * and outside every tolerance above. Section 6 calls it "a *partial* echo that
 * must grade LOW", so it is a named kind with a fixed grade rather than a
 * tolerance stretched until it fits. Stretching a tolerance to admit one case is
 * how a calibrated number becomes a fitted one.
 */
export type EchoMatchKind = "EXACT" | "FEE_TOLERANT" | "RELATIVE" | "SUBSET_SUM" | "PARTIAL";

/** Section 3.4's three grades. */
export type EchoGrade = "HIGH" | "MEDIUM" | "LOW";

/**
 * One withdrawal matched against one or more deposits.
 *
 * `depositTxids` is a list because a subset-sum match has up to three of them;
 * every other kind has exactly one. `residualZat` is signed - positive when the
 * deposits exceeded the withdrawal, which is the ordinary direction because a
 * round trip pays fees - so a reader can tell a plausible echo from an
 * arithmetically impossible one rather than only seeing a magnitude.
 */
export interface EchoMatch {
  readonly kind: EchoMatchKind;
  readonly grade: EchoGrade;
  readonly withdrawalTxid: Hex;
  readonly depositTxids: ReadonlyArray<Hex>;
  readonly withdrawalAmountZat: Zatoshi;
  readonly depositAmountZat: Zatoshi;
  /** `depositAmountZat - withdrawalAmountZat`. Positive in the ordinary case. */
  readonly residualZat: Zatoshi;
  /** `|residual| / depositAmount`, as a float. Exactly 0 for an exact match. */
  readonly relativeError: number;
  /** From the LATEST deposit in the match to the withdrawal. */
  readonly timeDeltaMs: number;
  /** True only for `PARTIAL`: the withdrawal is a fraction of the deposit. */
  readonly partial: boolean;
  /** 1 for every kind but `SUBSET_SUM`, where it is the size of the subset. */
  readonly splitCount: number;
  /** How many in-window deposits satisfied the same rule at the same grade. */
  readonly candidateCount: number;
  readonly audit: FilterApplication;
}

/** Tuning, all defaulted from the calibrated constants above. */
export interface EchoOptions {
  readonly windowMs?: number;
  readonly feeToleranceZat?: bigint;
  readonly relativeEpsilon?: number;
  readonly maxSplitCount?: number;
  readonly subsetSumMaxCandidates?: number;
  /**
   * Whether to look for a partial echo when nothing else matched. Off by
   * default: a partial echo requires a shared address and produces the weakest
   * claim this module makes, so a caller asks for it rather than receiving it.
   */
  readonly includePartial?: boolean;
}

/* ============================================================================
   The estimator
   ========================================================================== */

/**
 * Every match for one withdrawal against a window of deposits, best kind first.
 *
 * THE ORDER OF THE TOLERANCES IS THE ALGORITHM. Section 3.4 lists them from
 * strongest to weakest, and a stronger match must suppress a weaker one for the
 * same deposit, or one round trip would be reported two or three times at
 * descending grades and a reader counting "links" would count it three times.
 * So: exact wins outright; fee-tolerant and relative are tried against the
 * deposits exact did not claim; subset-sum runs only when no single deposit
 * matched at all, because a split match that contains an already-matched deposit
 * is a re-description of the single match rather than new evidence; partial runs
 * last and only when asked.
 *
 * Returns `[]` when nothing matched, which is the common and correct answer.
 */
export function matchEcho(
  withdrawal: BoundaryEvent,
  deposits: ReadonlyArray<BoundaryEvent>,
  options?: EchoOptions,
): ReadonlyArray<EchoMatch> {
  const windowMs = options?.windowMs ?? MAX_LINK_WINDOW_MS;
  const feeToleranceZat = options?.feeToleranceZat ?? FEE_TOLERANCE_ZAT;
  const epsilon = options?.relativeEpsilon ?? RELATIVE_EPSILON;
  const maxSplit = options?.maxSplitCount ?? MAX_SPLIT_COUNT;
  const maxCandidates = options?.subsetSumMaxCandidates ?? SUBSET_SUM_MAX_CANDIDATES;

  // A NON-POSITIVE MAGNITUDE IS NOT A BOUNDARY EVENT, AND EXCLUDING IT HERE IS
  // NOT DEFENSIVE PROGRAMMING. A deposit of 0n sits within the ABSOLUTE fee
  // tolerance of any withdrawal under 160,000 zat, so without this line the
  // estimator answers `FEE_TOLERANT` for "nothing entered the pool and 0.001 ZEC
  // left it" - a match between an event and a non-event, graded MEDIUM. The
  // first draft of this module did exactly that and its own test caught it.
  // `relativeErrorOf` returning Infinity for a zero deposit is not enough on its
  // own, because the absolute rule is tried first and never divides.
  if (withdrawal.amountZat <= 0n) return [];
  const inWindow = deposits.filter(
    (d) =>
      d.amountZat > 0n &&
      d.seenAt < withdrawal.seenAt &&
      withdrawal.seenAt - d.seenAt <= windowMs,
  );
  const countIn = BigInt(inWindow.length);

  const exact = inWindow.filter((d) => d.amountZat === withdrawal.amountZat);
  const rest = inWindow.filter((d) => d.amountZat !== withdrawal.amountZat);

  const feeTolerant: BoundaryEvent[] = [];
  const relative: BoundaryEvent[] = [];
  for (const d of rest) {
    const diff = absDiff(d.amountZat, withdrawal.amountZat);
    if (diff <= feeToleranceZat) {
      feeTolerant.push(d);
      continue;
    }
    // The relative rule is tried only where the absolute one failed, so a
    // deposit is never counted under both. `relativeErrorOf` divides by the
    // DEPOSIT, matching section 3.4's `|X - Y| / X` where X is the shield.
    if (relativeErrorOf(d.amountZat, withdrawal.amountZat) <= epsilon * RELATIVE_EPSILON_LOW_MULTIPLE) {
      relative.push(d);
    }
  }

  const matches: EchoMatch[] = [];

  for (const d of exact) {
    matches.push(
      build({
        kind: "EXACT",
        grade: exact.length === 1 ? "HIGH" : "MEDIUM",
        withdrawal,
        deposits: [d],
        candidateCount: exact.length,
        countIn,
        epsilon,
        feeToleranceZat,
      }),
    );
  }

  for (const d of feeTolerant) {
    matches.push(
      build({
        kind: "FEE_TOLERANT",
        grade: feeTolerant.length === 1 ? "MEDIUM" : "LOW",
        withdrawal,
        deposits: [d],
        candidateCount: feeTolerant.length,
        countIn,
        epsilon,
        feeToleranceZat,
      }),
    );
  }

  for (const d of relative) {
    // Inside epsilon is MEDIUM when it is the only candidate; between epsilon
    // and 10*epsilon is LOW however few candidates there are, because section
    // 3.4 puts that band in the LOW clause by itself.
    const err = relativeErrorOf(d.amountZat, withdrawal.amountZat);
    const insideEpsilon = err <= epsilon;
    matches.push(
      build({
        kind: "RELATIVE",
        grade: insideEpsilon && relative.length === 1 ? "MEDIUM" : "LOW",
        withdrawal,
        deposits: [d],
        candidateCount: relative.length,
        countIn,
        epsilon,
        feeToleranceZat,
      }),
    );
  }

  if (matches.length === 0 && maxSplit >= 2) {
    const split = findSubsetSum(withdrawal, inWindow, {
      maxSplitCount: maxSplit,
      maxCandidates,
      epsilon,
      feeToleranceZat,
    });
    if (split !== null) {
      const tight = withdrawal.seenAt - latestSeenAt(split) < TIGHT_SPLIT_WINDOW_MS;
      matches.push(
        build({
          kind: "SUBSET_SUM",
          grade: tight && split.length === 2 ? "MEDIUM" : "LOW",
          withdrawal,
          deposits: split,
          candidateCount: 1,
          countIn,
          epsilon,
          feeToleranceZat,
        }),
      );
    }
  }

  if (matches.length === 0 && options?.includePartial === true) {
    for (const d of partialCandidates(withdrawal, inWindow)) {
      matches.push(
        build({
          kind: "PARTIAL",
          // ALWAYS LOW, WITH NO CANDIDATE-COUNT CLAUSE. Section 6 requires the
          // lockbox case to grade LOW and "never MEDIUM or HIGH"; a single
          // candidate does not promote it, because what makes a partial echo
          // weak is the size of the residual, not how many other deposits
          // happen to be in the window.
          grade: "LOW",
          withdrawal,
          deposits: [d],
          candidateCount: 1,
          countIn,
          epsilon,
          feeToleranceZat,
        }),
      );
    }
  }

  return matches;
}

/* ============================================================================
   Subset-sum
   ========================================================================== */

/**
 * The tolerance a subset sum must land inside.
 *
 * TWO RULES, THE LOOSER OF WHICH WINS, and the reason is arithmetic rather than
 * generosity. Each leg of a split pays its own fee, so the absolute term scales
 * with `k`; but at 50,000 ZEC a residual of 0.02 ZEC is 4e-7 relative and 12
 * times the absolute allowance, which is the shape of section 3.4's own worked
 * case. Using only the absolute rule would miss every large split and using only
 * the relative rule would admit implausibly large residuals on small ones.
 */
export function subsetSumTolerance(
  totalZat: Zatoshi,
  splitCount: number,
  feeToleranceZat: bigint,
  epsilon: number,
): Zatoshi {
  const absolute = feeToleranceZat * BigInt(splitCount);
  const relative = scaleByEpsilon(totalZat, epsilon);
  return absolute > relative ? absolute : relative;
}

/** Round to {@link SUBSET_SUM_QUANTUM_ZAT}, half away from zero. */
export function quantise(amountZat: Zatoshi): Zatoshi {
  const q = SUBSET_SUM_QUANTUM_ZAT;
  const rem = amountZat % q;
  return rem * 2n >= q ? amountZat - rem + q : amountZat - rem;
}

/**
 * The first subset of size 2..k whose QUANTISED sum is within tolerance of the
 * withdrawal, checked again on the UNQUANTISED amounts before it is returned.
 *
 * Size 1 is deliberately excluded: a one-element "subset" is a single-deposit
 * match, which the three tolerances above already answered, and admitting it
 * here would report the same pair twice under two kinds.
 *
 * Exported for the tests that pin the quantisation and the cap.
 */
export function findSubsetSum(
  withdrawal: BoundaryEvent,
  deposits: ReadonlyArray<BoundaryEvent>,
  opts: {
    readonly maxSplitCount: number;
    readonly maxCandidates: number;
    readonly epsilon: number;
    readonly feeToleranceZat: bigint;
  },
): ReadonlyArray<BoundaryEvent> | null {
  // Most recent first, then truncated. Recency is the right truncation for the
  // same reason the time-window prior exists: a deposit nearer the withdrawal is
  // a better candidate, so a cap that drops the oldest drops the weakest.
  const pool = [...deposits].sort((a, b) => b.seenAt - a.seenAt).slice(0, opts.maxCandidates);
  const target = quantise(withdrawal.amountZat);
  const k = Math.min(opts.maxSplitCount, MAX_SPLIT_COUNT);

  let best: ReadonlyArray<BoundaryEvent> | null = null;
  let bestResidual: bigint | null = null;

  for (const combo of combinations(pool, 2, k)) {
    const quantisedSum = combo.reduce((acc, e) => acc + quantise(e.amountZat), 0n);
    const tol = subsetSumTolerance(
      withdrawal.amountZat,
      combo.length,
      opts.feeToleranceZat,
      opts.epsilon,
    );
    if (absDiff(quantisedSum, target) > tol) continue;

    // Re-checked on the real amounts. Quantisation is a search bound; it must
    // never be what makes a match fit.
    const trueSum = combo.reduce((acc, e) => acc + e.amountZat, 0n);
    const residual = absDiff(trueSum, withdrawal.amountZat);
    if (residual > tol) continue;

    // Prefer the tightest residual, then the smallest split - a two-way split is
    // a stronger claim than a three-way one at the same residual.
    if (
      bestResidual === null ||
      residual < bestResidual ||
      (residual === bestResidual && best !== null && combo.length < best.length)
    ) {
      best = combo;
      bestResidual = residual;
    }
  }

  return best;
}

/**
 * Every combination of `items` with size in `[minSize, maxSize]`, as arrays.
 *
 * A generator so the caller can stop early and so the whole cross-product is
 * never materialised; the caller's cap is what bounds it.
 */
function* combinations<T>(
  items: ReadonlyArray<T>,
  minSize: number,
  maxSize: number,
): Generator<T[]> {
  const n = items.length;
  const current: T[] = [];
  function* walk(start: number): Generator<T[]> {
    if (current.length >= minSize && current.length <= maxSize) yield [...current];
    if (current.length >= maxSize) return;
    for (let i = start; i < n; i += 1) {
      current.push(items[i]!);
      yield* walk(i + 1);
      current.pop();
    }
  }
  yield* walk(0);
}

/* ============================================================================
   Partial echo
   ========================================================================== */

/**
 * Deposits a withdrawal could be a partial return of.
 *
 * THREE CONJUNCTS, AND THE ADDRESS ONE IS WHAT MAKES IT PUBLISHABLE. The
 * withdrawal must be strictly smaller than the deposit (a partial return, not a
 * larger one), it must not already be inside the relative band (or it is a
 * RELATIVE match and not this), and the two must share a transparent address.
 * Without the shared address a "partial echo" is the statement that some smaller
 * amount left the pool after some larger one entered it, which is true of
 * essentially every pair of events on the chain and is therefore no evidence at
 * all. The lockbox golden case has the shared address, which is why section 6
 * treats it as a case rather than as noise.
 */
function partialCandidates(
  withdrawal: BoundaryEvent,
  deposits: ReadonlyArray<BoundaryEvent>,
): ReadonlyArray<BoundaryEvent> {
  if (withdrawal.address === null) return [];
  return deposits.filter(
    (d) =>
      d.address !== null &&
      d.address === withdrawal.address &&
      withdrawal.amountZat < d.amountZat,
  );
}

/* ============================================================================
   Arithmetic
   ========================================================================== */

export function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

/**
 * `|X - Y| / X`, as a float, where X is the deposit.
 *
 * THE CAST TO FLOAT IS DELIBERATE AND BOUNDED. Zatoshi amounts run to 1e15 and
 * float64 is exact to 2^53 (9.0e15), so the numerator and denominator are both
 * exact here and only the division rounds - at 15 significant digits, against a
 * tolerance of 1e-4. Doing it in fixed point would be more precise than the
 * quantity being measured deserves. A deposit of zero returns `Infinity` rather
 * than throwing, so a malformed event is excluded by every comparison instead of
 * taking down the estimator.
 */
export function relativeErrorOf(depositZat: Zatoshi, withdrawalZat: Zatoshi): number {
  if (depositZat === 0n) return Number.POSITIVE_INFINITY;
  return Number(absDiff(depositZat, withdrawalZat)) / Number(depositZat);
}

/** `ceil(amount * epsilon)` in integer zatoshi, never below 1. */
function scaleByEpsilon(amountZat: Zatoshi, epsilon: number): Zatoshi {
  const scaled = BigInt(Math.ceil(Number(amountZat) * epsilon));
  return scaled < 1n ? 1n : scaled;
}

function latestSeenAt(events: ReadonlyArray<BoundaryEvent>): number {
  return events.reduce((acc, e) => (e.seenAt > acc ? e.seenAt : acc), Number.NEGATIVE_INFINITY);
}

/* ============================================================================
   The audit record
   ========================================================================== */

function build(args: {
  kind: EchoMatchKind;
  grade: EchoGrade;
  withdrawal: BoundaryEvent;
  deposits: ReadonlyArray<BoundaryEvent>;
  candidateCount: number;
  countIn: bigint;
  epsilon: number;
  feeToleranceZat: bigint;
}): EchoMatch {
  const depositAmountZat = args.deposits.reduce((acc, d) => acc + d.amountZat, 0n);
  const residualZat = depositAmountZat - args.withdrawal.amountZat;
  const relativeError = relativeErrorOf(depositAmountZat, args.withdrawal.amountZat);
  const timeDeltaMs = args.withdrawal.seenAt - latestSeenAt(args.deposits);

  const audit: FilterApplication = {
    filter: "amount_echo",
    params: {
      matchKind: args.kind,
      grade: args.grade,
      withdrawalTxid: args.withdrawal.txid,
      withdrawalAmountZat: args.withdrawal.amountZat,
      depositTxids: args.deposits.map((d) => d.txid),
      depositAmountZat,
      residualZat,
      relativeError,
      timeDeltaMs,
      splitCount: args.deposits.length,
      partial: args.kind === "PARTIAL",
      toleranceZat: args.feeToleranceZat,
      relativeEpsilon: args.epsilon,
    },
    countIn: args.countIn,
    // COUNT OUT IS THE CANDIDATE COUNT AT THIS GRADE, NOT ONE. A filter's
    // `countOut` is how many candidates SURVIVED it, and the whole reason a
    // single exact match grades HIGH and two grade MEDIUM is that the survivor
    // count differs. Writing 1n here - one match, one record - would have made
    // the audit trail disagree with the grade beside it.
    countOut: BigInt(args.candidateCount),
  };

  return {
    kind: args.kind,
    grade: args.grade,
    withdrawalTxid: args.withdrawal.txid,
    depositTxids: args.deposits.map((d) => d.txid),
    withdrawalAmountZat: args.withdrawal.amountZat,
    depositAmountZat,
    residualZat,
    relativeError,
    timeDeltaMs,
    partial: args.kind === "PARTIAL",
    splitCount: args.deposits.length,
    candidateCount: args.candidateCount,
    audit,
  };
}
