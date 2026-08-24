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
 * `DENOM_CAP`, 10,000 ZEC.
 *
 * THE CORPUS STATES THIS TWO DIFFERENT WAYS AND THE DIFFERENCE IS LOAD-BEARING.
 * `docs/2.0/research/01-contemporary-zcash.md` §2.7 gives "**DENOM_CAP** =
 * **10,000 ZEC** plus canonical fee"; `docs/2.0/TRACKING-MATH.md` §3.9 gives a
 * flat "cap 10,000 ZEC". A crossing between the two readings is legal under the
 * first and over-cap under the second.
 *
 * Migration 003 declined to write a CHECK against either, and its reasoning
 * governs here too: "a database constraint that refuses to record something the
 * chain did inverts [the] rule: it destroys the evidence instead of raising it."
 * So this constant is a THRESHOLD FOR A FINDING and never a validity test.
 * {@link isOverDenomCap} answers the flat form, which is the conservative one -
 * it flags the ambiguous band rather than silently accepting it - and its
 * docblock says so at the call site.
 */
export const ZIP318_DENOM_CAP_ZAT: Zatoshi = 10_000n * ZATOSHI_PER_ZEC;

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
 * Whether a crossing exceeds `DENOM_CAP` on the FLAT reading of it.
 *
 * The corpus gives the cap two ways (see {@link ZIP318_DENOM_CAP_ZAT}), and
 * this answers the stricter one deliberately: a crossing in the ambiguous band
 * between 10,000 ZEC and 10,000 ZEC plus a canonical fee is something to go and
 * look at, not something to pass silently. A caller must therefore treat `true`
 * as "worth a finding", never as "invalid" - the chain is the authority on what
 * happened, and this project's rule is that a violated invariant means the
 * decoder is wrong before it means the chain is.
 */
export function isOverDenomCap(amountZat: Zatoshi): boolean {
  return amountZat > ZIP318_DENOM_CAP_ZAT;
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
