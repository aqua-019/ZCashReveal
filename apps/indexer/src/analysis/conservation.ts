/**
 * Module 8F - turnstile conservation (TRACKING-MATH section 3.11).
 *
 *   "For every pool and window, `Sigma estimated exits <= Bal^p` and `Bal^p >= 0`;
 *    post-NU6.3 `deltaV^orchard >= 0`. Any estimator output that violates
 *    conservation is rejected and logged - the conservation law is the sanity
 *    check for every heuristic above."
 *
 * THIS MODULE EXISTS BECAUSE HANDOFF-08's GATE FOUND THE LAW BEING BROKEN BY THE
 * ESTIMATOR SHIPPED BESIDE IT, and found the assertion that was supposed to catch
 * it unable to.
 *
 * The defect, reproduced: `matchEcho` answers one withdrawal at a time and is
 * pure, so it has no way to know that a deposit it just cited was cited by
 * another withdrawal a moment ago. One 100 ZEC deposit and three 100 ZEC
 * withdrawals in the same window produce three EXACT matches at grade HIGH, each
 * claiming the same 100 ZEC - 300 ZEC of "estimated exits" against a pool that
 * held 100. Nothing in the module was wrong locally; conservation is a property
 * of a SET of matches and there was no code that looked at a set.
 *
 * The assertion could not see it either. A9's first implementation checked
 * `match.depositAmountZat > balance` per match, and `depositAmountZat` is a sum
 * over a SUBSET of the deposits whose total IS the balance - so the condition
 * was a tautology no input could falsify. A test can restate a law and check
 * nothing, which is the shape this project keeps finding.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A GUARD INSIDE `matchEcho`. Section 3.11
 * is explicitly the check that runs OVER "every heuristic above", and its input
 * is a window rather than a transaction. Putting it inside the echo would make
 * the echo stateful - it would have to remember what it had already claimed -
 * and a stateful estimator cannot be replayed, cannot be tested from a literal,
 * and cannot be reused by the taint walk or the migration lens, which need the
 * same law over their own outputs. So the echo stays pure and per-withdrawal,
 * and this is the sieve its results pass through.
 *
 * REJECTION IS NOT CORRECTION. A rejected match is dropped and RECORDED; nothing
 * here rescales an amount, picks a "best" explanation to keep the arithmetic
 * tidy, or edits a grade. Section 3.11's own words are "rejected and logged", and
 * the reason matters: a violation means THIS BUILD'S heuristics are wrong, never
 * that the chain is, so the honest output is fewer claims plus a record of what
 * was discarded and why.
 */

import type { FilterApplication, Hex, Zatoshi } from "@zcashreveal/types";
import type { EchoGrade, EchoMatch } from "./echo.js";

/** Why a match was refused. Both are section 3.11 violations, of different kinds. */
export type ConservationRejection =
  /**
   * The deposit this match cites has already been claimed by an accepted match.
   *
   * ONE NOTE IS SPENT ONCE. Section 4's `L_struct` says the same thing as a soft
   * weight - "down-weights candidates already consumed by a HIGH link
   * (one-to-one assignment, greedy by weight)" - and this is the hard form of
   * it. The soft form belongs in the posterior, where a second explanation is
   * still worth carrying at a lower weight; the hard form belongs here, because
   * counting the same value out of the pool twice is not a weak claim, it is an
   * arithmetically impossible one.
   */
  | "deposit_already_claimed"
  /**
   * A match already accepted explains this same withdrawal.
   *
   * `deposit_already_claimed` WITH THE TWO SIDES OF THE ASSIGNMENT SWAPPED, and
   * it was missing from the first version of this module - which is worth
   * recording, because that version was written to fix exactly this shape and
   * fixed one half of it. Section 4 says "one-to-one assignment", and a
   * one-to-one assignment constrains BOTH vertex sets: one note is spent once,
   * and one withdrawal leaves the pool once.
   *
   * Three distinct 100 ZEC deposits and one 100 ZEC withdrawal produce three
   * EXACT matches, and the deposit-side guard passes every one of them because
   * they cite different deposits. The sieve then published that 300 ZEC exited
   * through a transaction that moved 100. Rival explanations of one event are
   * not additive, which is the same sentence as the deposit-side case and was
   * only written down for one direction.
   */
  | "withdrawal_already_explained"
  /** Accepting it would push the running total of claimed exits past the pool balance. */
  | "exceeds_pool_balance";

export interface RejectedMatch {
  readonly match: EchoMatch;
  readonly reason: ConservationRejection;
  /** The running claimed total at the moment it was refused. */
  readonly claimedBeforeZat: Zatoshi;
}

export interface ConservationResult {
  /** The matches that survive, in the order they were accepted. */
  readonly accepted: ReadonlyArray<EchoMatch>;
  readonly rejected: ReadonlyArray<RejectedMatch>;
  /** The summed `depositAmountZat` of the ACCEPTED matches. Never exceeds the balance. */
  readonly claimedZat: Zatoshi;
  /**
   * The summed `withdrawalAmountZat` of the ACCEPTED matches - `Sigma estimated
   * exits` in section 3.11's own words, and THE QUANTITY THE LAW ACTUALLY
   * BOUNDS.
   *
   * This module shipped with `claimedZat` alone, which is the DEPOSIT side, and
   * the two are equal only for an EXACT match. A 100 ZEC deposit matched to a
   * 100.009 ZEC withdrawal is a `RELATIVE` match at MEDIUM, and against a pool
   * holding exactly 100 ZEC the deposit-side sum passed while the exits the
   * estimate claimed were 100.009 - over the balance, in the one quantity
   * section 3.11 names. Bounding the wrong side of an inexact match is how a
   * law quoted at the head of a file goes unenforced by the code beneath it.
   */
  readonly exitZat: Zatoshi;
  readonly poolBalanceZat: Zatoshi;
  readonly audit: FilterApplication;
}

/** Strongest first, so the greedy assignment keeps the best-evidenced claim. */
const GRADE_ORDER: Readonly<Record<EchoGrade, number>> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Apply section 3.11 to a window's worth of echo matches.
 *
 * GREEDY BY GRADE, THEN BY TIGHTEST RESIDUAL, THEN BY TXID. Section 4 specifies
 * "one-to-one assignment, greedy by weight" and grade is this module's available
 * proxy for weight - a HIGH match is one the echo found on an exact amount with
 * a single candidate. The residual breaks grade ties on the evidence rather than
 * on arrival order, and the txid pair breaks the rest, so the result is
 * DETERMINISTIC: the same set of matches always yields the same accepted subset,
 * whatever order the caller collected them in. An assignment that depended on
 * input order would make the audit record unreproducible, which for an audit
 * record is the whole failure.
 *
 * NOT OPTIMAL, AND THAT IS DELIBERATE. Greedy assignment does not maximise the
 * number of accepted matches; a maximum-matching algorithm would accept more. It
 * is not used because "more links" is not the objective - this module exists to
 * REFUSE claims, and a rule a reader can follow in one sentence is worth more
 * here than one that finds two extra links by an argument nobody will check.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function enforceConservation(
  matches: ReadonlyArray<EchoMatch>,
  poolBalanceZat: Zatoshi,
): ConservationResult {
  const ordered = [...matches].sort(
    (a, b) =>
      GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
      compareBigint(absBig(a.residualZat), absBig(b.residualZat)) ||
      a.withdrawalTxid.localeCompare(b.withdrawalTxid) ||
      // EVERY deposit, not just the first, and then the kind. Two SUBSET_SUM
      // matches citing {d1,d2} and {d1,d3} for one withdrawal at the same
      // residual agreed on all four of the original keys, so the comparator
      // returned 0, `Array.prototype.sort` kept input order, and the accepted
      // subset depended on the order the caller happened to collect them in -
      // while this docblock claimed the opposite. A tie that is not total is
      // not a deterministic order, and the property test could not see it
      // because it compared withdrawal txids, which were identical.
      a.depositTxids.join(",").localeCompare(b.depositTxids.join(",")) ||
      a.kind.localeCompare(b.kind),
  );

  const claimedDeposits = new Set<Hex>();
  const explainedWithdrawals = new Set<Hex>();
  const accepted: EchoMatch[] = [];
  const rejected: RejectedMatch[] = [];
  let claimedZat = 0n;
  let exitZat = 0n;

  for (const m of ordered) {
    if (m.depositTxids.some((d) => claimedDeposits.has(d))) {
      rejected.push({ match: m, reason: "deposit_already_claimed", claimedBeforeZat: claimedZat });
      continue;
    }
    if (explainedWithdrawals.has(m.withdrawalTxid)) {
      rejected.push({
        match: m,
        reason: "withdrawal_already_explained",
        claimedBeforeZat: claimedZat,
      });
      continue;
    }
    // BOTH SIDES OF THE BALANCE, because they differ for every inexact match
    // and section 3.11 bounds the exit side.
    if (
      claimedZat + m.depositAmountZat > poolBalanceZat ||
      exitZat + m.withdrawalAmountZat > poolBalanceZat
    ) {
      rejected.push({ match: m, reason: "exceeds_pool_balance", claimedBeforeZat: claimedZat });
      continue;
    }
    for (const d of m.depositTxids) claimedDeposits.add(d);
    explainedWithdrawals.add(m.withdrawalTxid);
    accepted.push(m);
    claimedZat += m.depositAmountZat;
    exitZat += m.withdrawalAmountZat;
  }

  const audit: FilterApplication = {
    filter: "conservation",
    params: {
      poolBalanceZat,
      claimedZat,
      exitZat,
      rejectedForDoubleClaim: rejected.filter((r) => r.reason === "deposit_already_claimed").length,
      rejectedForRivalWithdrawal: rejected.filter(
        (r) => r.reason === "withdrawal_already_explained",
      ).length,
      rejectedForBalance: rejected.filter((r) => r.reason === "exceeds_pool_balance").length,
    },
    countIn: BigInt(matches.length),
    countOut: BigInt(accepted.length),
  };

  return { accepted, rejected, claimedZat, exitZat, poolBalanceZat, audit };
}

/**
 * Whether a set of matches already satisfies section 3.11, without filtering it.
 *
 * The question `enforceConservation` answers by construction, asked separately so
 * a caller - or a property test - can check an estimator's RAW output rather than
 * only the sieved result. This is what makes the law falsifiable: a test that
 * only ever inspects the filtered output cannot tell a conserving estimator from
 * a violating one behind a working sieve.
 */
export function violatesConservation(
  matches: ReadonlyArray<EchoMatch>,
  poolBalanceZat: Zatoshi,
): boolean {
  const seen = new Set<Hex>();
  const explained = new Set<Hex>();
  let claimed = 0n;
  let exits = 0n;
  for (const m of matches) {
    for (const d of m.depositTxids) {
      if (seen.has(d)) return true;
      seen.add(d);
    }
    if (explained.has(m.withdrawalTxid)) return true;
    explained.add(m.withdrawalTxid);
    claimed += m.depositAmountZat;
    exits += m.withdrawalAmountZat;
  }
  return claimed > poolBalanceZat || exits > poolBalanceZat;
}

function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
