/**
 * ZIP 318 — Orchard to Ironwood migration, and the denominations it quantises to.
 *
 * WHAT ZIP 318 ACTUALLY DOES, because the shape of it decides everything below.
 * Migration is two-phase: a wallet first quantises its balance into canonical
 * denominations by sending to ITSELF inside Orchard, then broadcasts pre-signed
 * pool-crossing transfers on a schedule. Only the second phase is visible as a
 * crossing. Each crossing spends exactly one Orchard note into exactly one
 * Ironwood output, and THE NET AMOUNT IS PUBLIC ON-CHAIN
 * (docs/2.0/research/01-contemporary-zcash.md §2.7, `high`).
 *
 * That last fact is the reason this file exists and the reason the site is
 * careful about it. The turnstile that restores supply auditability does so by
 * making every pool-crossing amount public; the wallet identity is not
 * revealed, and the privacy defence is the denomination bucketing plus the
 * schedule, both HEURISTIC rather than cryptographic. So a canonical
 * denomination is an observation about an amount, never a statement about who
 * sent it, and nothing in this module returns a wallet, a session or an
 * identity. TRACKING-MATH §3.9 fixes the reporting rule: distributions and
 * counts per window, "never as 'wallet W migrated B'".
 *
 * THE UNIT QUESTION, SETTLED IN ONE PLACE. The research states the
 * denominations in ZEC - 0.5, 1, 2, 5, 10, 20, 50, 100 - where 0.5 needs a
 * NEGATIVE exponent. CLAUDE.md fixes integer zatoshi as this project's unit,
 * and `migrations_zip318.denom_k` (migration 003) is declared `SMALLINT` with
 * `CHECK (denom_k >= 0)` precisely because it is an exponent over ZATOSHI: 0.5
 * ZEC is 5 x 10^7 zat and 1 ZEC is 1 x 10^8 zat, so no row ever carries a
 * negative exponent.
 *
 * HANDOFF-07's assertion A4 states the same denomination the other way: a 500
 * ZEC crossing is "(n,k) = (5, 2)", which is the exponent over ZEC. Both are
 * true and they are different numbers for one denomination, which is exactly
 * the shape of the defect HANDOFF-05 found when `summary.conventionalFeeZat`
 * came to mean two things. So {@link Zip318Denomination} carries BOTH, each
 * under a name that says which it is, and neither is called `k`. The zatoshi
 * exponent is the one the database stores; the ZEC exponent is the one a reader
 * and A4 recognise.
 */

import type { Zatoshi } from "./transactions.js";

/** 10^8. The only conversion between this project's unit and the research's. */
export const ZATOSHI_PER_ZEC: Zatoshi = 100_000_000n;

/** The decimal exponent that separates the two conventions: `kZec = kZatoshi - 8`. */
export const ZEC_DECIMAL_PLACES = 8;

/**
 * The mantissas ZIP 318 allows. An amount is canonical iff it is one of these
 * times a power of ten (docs/2.0/research/01-contemporary-zcash.md §2.7,
 * TRACKING-MATH §3.9, both `high`).
 */
export const ZIP318_MANTISSAS = [1, 2, 5] as const;

/** One of ZIP 318's three allowed mantissas. Mirrors `migrations_zip318.denom_n`'s CHECK. */
export type Zip318Mantissa = (typeof ZIP318_MANTISSAS)[number];

/**
 * Dust below this is stranded in Orchard permanently: `MAX_RESIDUAL_VALUE`,
 * 0.01 ZEC (docs/2.0/research/01-contemporary-zcash.md §2.7, `high`).
 *
 * It is a fact about what a wallet CANNOT migrate, not a validation rule. This
 * module never rejects an amount for being below it - a crossing that carried
 * less would be a real observation, and refusing to record it would destroy the
 * evidence rather than raise it.
 */
export const ZIP318_MAX_RESIDUAL_ZAT: Zatoshi = 1_000_000n;

/**
 * The largest pool-crossing denomination ZIP 318 permits: 10,000 ZEC.
 *
 * IT IS NOT `DENOM_CAP`, AND THE RENAME IS THE WHOLE POINT OF THIS DOCBLOCK.
 * This constant was called `ZIP318_DENOM_CAP_ZAT` through HANDOFF-07, and the
 * repository recorded the corpus as stating one quantity two irreconcilable
 * ways: `docs/2.0/research/01-contemporary-zcash.md` §2.7 giving "**DENOM_CAP**
 * = **10,000 ZEC** plus canonical fee", `docs/2.0/TRACKING-MATH.md` §3.9 giving
 * a flat "cap 10,000 ZEC". L2 went to ZIP 318 (LEDGER-07 Q3). They are not two
 * readings of one number, they are TWO DIFFERENT QUANTITIES, and both
 * statements are correct:
 *
 *   DENOM_CAP  = 10,000 ZEC PLUS THE CANONICAL FEE, and it bounds the FUNDING
 *                NOTE that note preparation produces - a note that has to carry
 *                the denomination and the fee that will be paid out of it.
 *   10,000 ZEC = the largest CROSSING, which is what is left of a funding note
 *                at the cap once its fee is spent.
 *
 * This project measures crossings, because the crossing is the public event and
 * the funding note is prepared inside Orchard where nothing is visible. So the
 * value never changed and the name was wrong: 10,000 ZEC is right for what
 * {@link isOverMaxCrossing} tests, and calling it `DENOM_CAP` invited exactly
 * the "which reading is this?" question two handoffs spent effort on.
 *
 * ZIP 318 IS STATUS DRAFT. Both quantities rest on a document that may still be
 * edited, the same standing exposure `IRONWOOD_HEIGHTS_REST_ON_A_DRAFT_ZIP`
 * records for ZIP 258's activation heights.
 *
 * Migration 003 declined to write a CHECK against either, and its reasoning
 * governs here too: "a database constraint that refuses to record something the
 * chain did inverts [the] rule: it destroys the evidence instead of raising it."
 * So this constant is a THRESHOLD FOR A FINDING and never a validity test.
 */
export const ZIP318_MAX_CROSSING_ZAT: Zatoshi = 10_000n * ZATOSHI_PER_ZEC;

/**
 * A canonical ZIP 318 denomination: `n x 10^k` with `n` in {1, 2, 5}.
 *
 * Both exponents are carried because the project needs both and they are
 * different numbers. `kZatoshi` is what `migrations_zip318.denom_k` stores and
 * is never negative. `kZec` is what the research and HANDOFF-07's A4 state and
 * IS negative for sub-ZEC denominations - 0.5 ZEC is `{ n: 5, kZatoshi: 7,
 * kZec: -1 }`.
 */
export interface Zip318Denomination {
  n: Zip318Mantissa;
  /** Exponent over zatoshi. Non-negative for any amount expressible in zatoshi. */
  kZatoshi: number;
  /** Exponent over ZEC, `kZatoshi - 8`. Negative below 1 ZEC. */
  kZec: number;
}

/**
 * The canonical denomination of an amount, or `null` if it has none.
 *
 * `null` IS A MEASUREMENT AND NOT A FAILURE. ZIP 318's bucketing is a
 * heuristic privacy defence, so an amount that does not land on `n x 10^k` is a
 * real observation the migration lens exists to count - a wallet that did not
 * quantise, or a crossing this decoder has misread. Rounding it into the
 * nearest bucket would manufacture the very regularity the lens is supposed to
 * be measuring, which is the argument migration 003 already wrote against
 * storing a denomination on a non-canonical row.
 *
 * Zero and negative amounts return `null`: a crossing's magnitude is positive
 * by definition (out of Orchard, into Ironwood), so a non-positive value here
 * is a sign error on this side of the boundary and must not be dressed up as a
 * denomination.
 */
export function canonicalDenomination(amountZat: Zatoshi): Zip318Denomination | null {
  if (amountZat <= 0n) return null;

  // Strip factors of ten, counting them. Done on the bigint rather than on a
  // decimal string: a string walk would be equivalent here, and this cannot be
  // wrong about a leading digit.
  let rest = amountZat;
  let kZatoshi = 0;
  while (rest % 10n === 0n) {
    rest /= 10n;
    kZatoshi += 1;
  }

  const n = Number(rest);
  if (n !== 1 && n !== 2 && n !== 5) return null;

  return { n, kZatoshi, kZec: kZatoshi - ZEC_DECIMAL_PLACES };
}

/** Whether an amount is a canonical ZIP 318 denomination. The boolean form of the above. */
export function isCanonicalDenomination(amountZat: Zatoshi): boolean {
  return canonicalDenomination(amountZat) !== null;
}

/**
 * Whether a crossing exceeds the largest denomination ZIP 318 permits to cross.
 *
 * BEHAVIOUR IS UNCHANGED FROM `isOverDenomCap`, WHICH THIS RENAMES. The
 * predicate always compared against 10,000 ZEC and that comparison was always
 * the right one; what was wrong was the belief, recorded in its old docblock,
 * that it was answering "the stricter of two readings of DENOM_CAP". There is
 * one reading of DENOM_CAP, it is over a different quantity, and 10,000 ZEC is
 * simply the crossing bound. See {@link ZIP318_MAX_CROSSING_ZAT}.
 *
 * A caller must treat `true` as "worth a finding", never as "invalid" - the
 * chain is the authority on what happened, and this project's rule is that a
 * violated invariant means the decoder is wrong before it means the chain is.
 */
export function isOverMaxCrossing(amountZat: Zatoshi): boolean {
  return amountZat > ZIP318_MAX_CROSSING_ZAT;
}

/**
 * Whether an amount is below `MAX_RESIDUAL_VALUE` and therefore of the size ZIP
 * 318 leaves stranded in Orchard.
 *
 * Says nothing about whether it CAN cross - it is a size comparison, and dust
 * that somehow crossed would be a finding worth having rather than a
 * contradiction to suppress.
 */
export function isBelowMaxResidual(amountZat: Zatoshi): boolean {
  return amountZat < ZIP318_MAX_RESIDUAL_ZAT;
}
