/**
 * Module 8D - combining the estimators (TRACKING-MATH section 4).
 *
 *   w_j  proportional to  L_amount(Y | X_j) . L_time(h - h_j) . L_fp(T, T_j) . L_struct(T_j)
 *   p_j = w_j / sum(w)
 *   H   = -sum_j p_j log2 p_j
 *   N_eff = 2^H
 *
 * and the claim level from `N_eff` through the existing classifier.
 *
 * WHAT THIS MODULE IS FOR, WHICH IS NOT WHAT IT LOOKS LIKE. A posterior over
 * candidate origins looks like a machine for picking the most likely one. It is
 * the opposite: its output is `N_eff` and a claim level, and the claim level is
 * a CAP on what may be said. A three-candidate posterior at 0.8/0.1/0.1 is
 * `requires_disclosure`, which in this project means the site may not publish it
 * as a link at all without a disclosure-backed signal. The top-k list exists so
 * a reader can see the shape of the distribution the cap was computed from, not
 * so anyone can read the first row as an answer.
 *
 * WHY N_eff RATHER THAN "THE MOST LIKELY CANDIDATE". `N_eff` is the perplexity
 * of the posterior - the size of the uniform distribution with the same entropy
 * - so it answers "how many candidates is this really down to" rather than
 * "which one". A distribution at 0.34/0.33/0.33 and one at 0.98/0.01/0.01 both
 * have three candidates and they are not the same evidence, and only the second
 * is worth a reader's attention. `N_eff` distinguishes them (2.9997 against
 * 1.1184); a candidate count cannot.
 *
 * THE ABSENCE OF CANDIDATES IS ALSO AN ANSWER, and it is the common one. When
 * no shield in the window echoes a withdrawal, the honest posterior is not empty
 * - it is uniform over the whole anchor-bounded candidate set, which is enormous.
 * `unresolvedCount` carries that, and section 6's golden case 4 is exactly it:
 * a 202,076.207 ZEC unshielding with no in-window shield anywhere near it, whose
 * correct answer is `aggregate_only` and an `N_eff` in the thousands. A module
 * that returned "no candidates" there would be reporting certainty about
 * ignorance.
 */

import type { ClaimLevel, Hex, Zatoshi } from "@zcashreveal/types";
import { classifyByEffectiveSet } from "@zcashreveal/instruments";

/* ============================================================================
   Calibrated priors
   ========================================================================== */

/**
 * Section 3.3's half-life for the time prior, in milliseconds. Default 2 days.
 *
 * PRINTED RATHER THAN ASSUMED. Section 3.3 ends "The prior is printed", and this
 * module honours that literally: `tau` appears in the assumption sentences every
 * posterior carries, so a reader who rejects the prior can discount the number
 * instead of having to guess what produced it.
 */
export const TIME_HALF_LIFE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Section 4's `L_fp` when the two transactions' wallet fingerprints DISAGREE.
 * 1.0 when they agree, and section 4 marks the value tunable.
 *
 * IT IS DELIBERATELY NOT ZERO. A disagreement between two wallet guesses is weak
 * evidence at the best of times and this project has just withdrawn one of the
 * five signatures for want of a source (LEDGER-07 fold 1). A factor of 0.5
 * down-weights; a factor of 0 would let a fingerprint table nobody can fully
 * source eliminate a candidate outright.
 */
export const FINGERPRINT_DISAGREEMENT_FACTOR = 0.5;

/**
 * Section 4's `L_struct` for a candidate already consumed by a `HIGH` link.
 *
 * ONE-TO-ONE ASSIGNMENT, GREEDY BY WEIGHT, as section 4 specifies. A note spent
 * into one withdrawal is not available to another, so a candidate already
 * claimed at HIGH confidence is down-weighted rather than removed - removed
 * would assert that the earlier HIGH link is correct, and a HIGH grade in this
 * project is a statement about candidate counts, not a proof.
 */
export const CONSUMED_CANDIDATE_FACTOR = 0.25;

/* ============================================================================
   Shapes
   ========================================================================== */

/** The four likelihood terms of section 4, kept separate so each is auditable. */
export interface Likelihoods {
  readonly amount: number;
  readonly time: number;
  readonly fingerprint: number;
  readonly structure: number;
}

/** One candidate origin, with the evidence that gives it its weight. */
export interface PosteriorCandidate {
  readonly txid: Hex;
  /** The reader-facing description. Never an address, never a name. */
  readonly what: string;
  readonly likelihoods: Likelihoods;
}

/** One candidate with its normalised posterior probability. */
export interface WeightedCandidate {
  readonly txid: Hex;
  readonly what: string;
  readonly p: number;
  readonly weight: number;
}

export interface Posterior {
  /** Every candidate, sorted by descending `p`, truncated to `topK`. */
  readonly top: ReadonlyArray<WeightedCandidate>;
  /** How many candidates the claim level was computed over. */
  readonly candidateCount: bigint;
  readonly entropyBits: number;
  /** `2^H`. Real-valued, because rounding it to an integer loses the whole point. */
  readonly effectiveSetSize: number;
  readonly claimLevel: ClaimLevel;
  /**
   * The sentences a reader needs to discount this number. Never empty: an
   * estimate whose assumptions are not printed is the thing this site exists to
   * argue against.
   */
  readonly assumptions: ReadonlyArray<string>;
}

/*
 * THERE IS NO `audit: FilterApplication` ON THIS TYPE, AND THE FIRST DRAFT HAD
 * ONE. It was a `filter: "amount_echo"` record with zeros in every field the
 * posterior does not have - a withdrawal txid of all zeroes, a residual of 0n, a
 * relative error of 0 - and it would have rendered in the inference chain as a
 * step that measured those things and found them zero.
 *
 * That is the hardcoded-zero defect this project has now removed from `feeZat`,
 * from `ironwoodValueBalanceZat` and from `summary.bytes`, and manufacturing a
 * fourth one inside the module whose whole subject is honest uncertainty would
 * have been remarkable.
 *
 * A posterior is not a filter. A `FilterApplication` answers "how many
 * candidates went in and how many came out"; a posterior answers "given the
 * candidates that came out, how is the probability distributed". The audit trail
 * belongs to the filters that produced the candidates - `matchEcho`'s records,
 * `timeWindowFilter`'s, `amountMatchFilter`'s - and the caller passes those
 * through. What this module returns is the OTHER half of `views.ts`'s
 * `estimateSchema`: `top`, `nEff`, `entropyBits`, `claim` and `assumptions`.
 */

export interface PosteriorInput {
  readonly candidates: ReadonlyArray<PosteriorCandidate>;
  /**
   * The size of the anchor-bounded candidate set, used when no candidate carries
   * positive weight.
   *
   * THE CLAUSE THIS DOCBLOCK USED TO CARRY - "or when the weighted candidates do
   * not account for it" - WAS NOT IMPLEMENTED, and a gate lens caught the type
   * promising something the function does not do. Once any candidate has weight,
   * `N_eff` is the perplexity over the candidate list alone and this field is not
   * consulted. That is a real discontinuity: two candidates at weight 1e-300 give
   * `N_eff = 2`, and the same two at weight 0 give the whole anchor set.
   *
   * It is left as it is rather than smoothed, because the alternative is a
   * mixture whose mixing parameter nobody has calibrated, and an uncalibrated
   * knob inside a claim-level computation is worse than a stated edge. What the
   * field IS for stands: it is required so that a caller with no `Cand_0` cannot
   * reach a claim level at all, and it is the answer whenever the echo named
   * nobody - which is the common case.
   *
   * REQUIRED, NOT OPTIONAL, and that is the design decision this type exists to
   * enforce. A caller who has no `Cand_0` to hand cannot honestly compute a
   * claim level: "three candidates, N_eff 1.9" is a claim about the whole
   * anonymity set, and it is only true if the echo really did narrow the set to
   * those three. Making it optional would have let a caller silently publish
   * `requires_disclosure` for a transaction nobody had bounded.
   */
  readonly unresolvedCount: bigint;
  /** How many candidates to return in `top`. Default 3, per section 4's "top-3". */
  readonly topK?: number;
  /** Extra assumption sentences from the caller's own filters. */
  readonly assumptions?: ReadonlyArray<string>;
}

/* ============================================================================
   The likelihood terms
   ========================================================================== */

/**
 * Section 4's `L_amount`: 1 for an exact match, `exp(-(|X - Y| / X) / epsilon)`
 * for a relative one.
 *
 * THE EXPONENTIAL IS WHY A RELATIVE MATCH AT THE TOLERANCE IS NOT WORTH MUCH.
 * At a residual of exactly `epsilon` this returns `exp(-1)` = 0.368, and at
 * `10 * epsilon` it returns 4.5e-5. So the grade boundary in section 3.4 and the
 * weight here agree about the same thing from two directions: a match at the
 * edge of the tolerance is admitted and then weighted almost out of existence.
 */
export function amountLikelihood(
  depositZat: Zatoshi,
  withdrawalZat: Zatoshi,
  epsilon: number,
): number {
  // POSITIVITY BEFORE EQUALITY, AND THE ORDER IS THE WHOLE FIX. Testing equality
  // first gave `amountLikelihood(0n, 0n)` the MAXIMUM weight of 1 - a perfect
  // match between an event and a non-event, which then outranked a real
  // candidate in the normalised posterior. That is the same guard-ordering
  // defect `matchEcho` was found to have (its absolute tolerance was tried
  // before any positivity check), unfixed in the second module until a gate lens
  // found it here too. Two occurrences, one shape.
  if (depositZat <= 0n || withdrawalZat <= 0n) return 0;
  if (depositZat === withdrawalZat) return 1;
  if (epsilon <= 0) return 0;
  const diff = depositZat > withdrawalZat ? depositZat - withdrawalZat : withdrawalZat - depositZat;
  const relative = Number(diff) / Number(depositZat);
  return Math.exp(-relative / epsilon);
}

/**
 * Section 3.3's half-life kernel: `exp(-ln2 * age / tau)`.
 *
 * A negative age - a "candidate" after the withdrawal - returns 0 rather than a
 * weight above 1. Time runs one way, and an estimator that gave extra weight to
 * an impossible candidate would be worse than one that crashed.
 */
export function timeLikelihood(ageMs: number, halfLifeMs: number = TIME_HALF_LIFE_MS): number {
  if (ageMs < 0) return 0;
  if (halfLifeMs <= 0) return ageMs === 0 ? 1 : 0;
  return Math.exp((-Math.LN2 * ageMs) / halfLifeMs);
}

/**
 * Section 4's `L_fp`: 1.0 when the two wallet guesses agree, 0.5 when they
 * disagree.
 *
 * AN UNKNOWN GUESS IS NOT A DISAGREEMENT, and conflating the two would repeat
 * the exact defect HANDOFF-06 removed from `likelyWallet` - publishing ignorance
 * as a verdict. `null` on either side returns 1.0: no evidence, so no adjustment.
 * The `UNKNOWN_*` members are treated the same way for the same reason, since
 * they are statements about a FEE rather than about a wallet.
 */
export function fingerprintLikelihood(a: string | null, b: string | null): number {
  if (a === null || b === null) return 1;
  if (a.startsWith("UNKNOWN") || b.startsWith("UNKNOWN")) return 1;
  return a === b ? 1 : FINGERPRINT_DISAGREEMENT_FACTOR;
}

/** Section 4's `L_struct`: down-weight a candidate already consumed by a HIGH link. */
export function structureLikelihood(consumedByHighLink: boolean): number {
  return consumedByHighLink ? CONSUMED_CANDIDATE_FACTOR : 1;
}

/** The product of the four terms. */
export function combineLikelihoods(l: Likelihoods): number {
  return l.amount * l.time * l.fingerprint * l.structure;
}

/* ============================================================================
   The posterior
   ========================================================================== */

/**
 * Normalise the candidate weights, compute `H` and `N_eff`, and derive the
 * claim level.
 *
 * TWO REGIMES, AND WHICH ONE APPLIES IS THE MOST IMPORTANT THING THIS FUNCTION
 * DECIDES.
 *
 *   Candidates with positive weight  ->  `N_eff` is the perplexity of the
 *                                        normalised posterior over them.
 *   No candidate with positive weight -> `N_eff` is `unresolvedCount`, the whole
 *                                        anchor-bounded set, uniform.
 *
 * The second is not a fallback for an error case; it is the ordinary answer for
 * most withdrawals on the chain and it is what section 6's golden case 4 tests.
 * Reporting an empty candidate list with `N_eff = 0` would classify as
 * `requires_disclosure` - the STRONGEST claim level - for the transaction this
 * project knows least about, which is as close to backwards as this code could get.
 */
export function computePosterior(input: PosteriorInput): Posterior {
  const topK = input.topK ?? 3;
  const weighted = input.candidates.map((c) => ({
    txid: c.txid,
    what: c.what,
    weight: combineLikelihoods(c.likelihoods),
  }));
  const total = weighted.reduce((acc, c) => acc + c.weight, 0);

  const resolved = total > 0;
  const normalised: WeightedCandidate[] = resolved
    ? weighted
        .map((c) => ({ ...c, p: c.weight / total }))
        .filter((c) => c.p > 0)
        .sort((a, b) => b.p - a.p)
    : [];

  const entropyBits = resolved
    ? shannonBits(normalised.map((c) => c.p))
    : entropyOfUniform(input.unresolvedCount);
  const effectiveSetSize = Math.pow(2, entropyBits);
  const candidateCount = resolved ? BigInt(normalised.length) : input.unresolvedCount;

  // THE CLAIM LEVEL IS COMPUTED FROM N_eff, NOT FROM THE CANDIDATE COUNT, and
  // the existing classifier takes a bigint. Rounding to nearest is right rather
  // than flooring: N_eff of 10.4 rounds to 10 and classifies
  // `requires_disclosure`, which is the CAUTIOUS direction - it caps what may be
  // said - whereas flooring 10.9 to 10 would do the same thing by accident and
  // ceiling would loosen the cap. Stated because the rounding mode of a
  // threshold is exactly the kind of detail that gets changed without noticing.
  const claimLevel: ClaimLevel = classifyByEffectiveSet(
    BigInt(Math.max(0, Math.round(effectiveSetSize))),
  );

  const assumptions = [
    ...(input.assumptions ?? []),
    resolved
      ? `Posterior over ${normalised.length} candidate origin${normalised.length === 1 ? "" : "s"}, weighted by amount closeness, elapsed time, wallet fingerprint agreement and one-to-one assignment.`
      : `No shielding deposit in the window echoes this amount, so the origin is taken as uniform over the whole anchor-bounded candidate set (${input.unresolvedCount.toString()} notes).`,
    // AN EMPTY ANCHOR SET MUST NOT PRINT THE MOST CONFIDENT FIGURE THE QUANTITY
    // CAN TAKE. With no candidates and no Cand_0, `2^0` is 1, and "N_eff = 1.00"
    // is what a certain identification looks like - printed for a transaction
    // about which nothing whatever is known. The claim level was already
    // `requires_disclosure` either way, so nothing downstream over-claimed; the
    // rendered sentence was the defect, and a gate lens caught it.
    !resolved && input.unresolvedCount === 0n
      ? "N_eff is not defined here: there are no candidates and no anchor-bounded set to be uniform over. Nothing about this spend's origin has been measured."
      : `Effective anonymity set N_eff = ${effectiveSetSize.toFixed(2)} from H = ${entropyBits.toFixed(3)} bits; the claim level is a CAP on what may be said, not a confidence in the top candidate.`,
  ];

  return {
    top: normalised.slice(0, topK),
    candidateCount,
    entropyBits,
    effectiveSetSize,
    claimLevel,
    assumptions,
  };
}

/** `-sum p log2 p`, skipping zero terms (which contribute nothing, and `log2 0` is not finite). */
export function shannonBits(ps: ReadonlyArray<number>): number {
  let h = 0;
  for (const p of ps) {
    if (p <= 0) continue;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * `log2(N)` for a uniform posterior over `N` outcomes, as a float over a bigint.
 *
 * `entropy.ts`'s `entropyBitsUniform` THROWS on `N <= 0n` and that is right for
 * its caller; here a zero is a real state - a withdrawal against a pool with no
 * commitments the anchor can see - and throwing would take down an estimator
 * over an empty set rather than reporting one. Zero bits over zero candidates is
 * the honest reading, and it classifies `requires_disclosure`, which caps the
 * claim to nothing.
 */
function entropyOfUniform(n: bigint): number {
  if (n <= 0n) return 0;
  // AN UNBOUNDED BIGINT REACHES `Infinity` THROUGH `Number()`, and `2^Infinity`
  // then reaches `BigInt(Infinity)`, which THROWS out of a pure estimator. Not
  // reachable from a real note-commitment tree, which tops out around 2^32, but
  // the input is a caller-supplied bigint with no stated bound and an estimator
  // should not be able to take down its caller on one. Clamped to the largest
  // exactly-representable integer instead, which is far past any real anchor set.
  const asNumber = Number(n);
  return Number.isFinite(asNumber) ? Math.log2(asNumber) : Math.log2(Number.MAX_SAFE_INTEGER);
}
