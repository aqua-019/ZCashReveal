/**
 * Wallet fingerprint heuristics.
 * Distinguishable patterns: padding strategy, fee selection (ZIP-317),
 * expiry delta, pool preference.
 */

import type { Zatoshi, WalletGuess } from "@zcashreveal/types";
import { conventionalFeeZat, isConventionalFee } from "@zcashreveal/types";

export interface FingerprintInputs {
  txVersion: number;
  vinCount: number;
  voutCount: number;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActionCount: number;
  /**
   * ZIP 317 logical actions for this transaction, computed by
   * `zip317LogicalActions` in `@zcashreveal/types`.
   *
   * PASSED IN RATHER THAN DERIVED HERE SINCE HANDOFF-06. This file used to
   * compute its own: it SUMMED the transparent input and output counts and
   * SUMMED Sapling's spends and outputs, where ZIP 317 takes the maximum of
   * each pair and measures the transparent side in bytes. That made a third
   * answer to a question the gateway already answered a fourth way, and the
   * two differed for any transaction with more than one input.
   */
  logicalActions: number;
  /**
   * The fee, or `null` when it could not be computed.
   *
   * NULLABLE, AND THE NULL CHANGES THE ANSWER RATHER THAN DEFAULTING IT. A
   * signature that gates on a conventional fee cannot fire on an unknown fee,
   * and must not be ruled out by one either.
   */
  feeZat: Zatoshi | null;
  expiryDelta: number | null;
  hasOrchardBundle: boolean;
  hasSaplingBundle: boolean;
  /**
   * Whether this transaction carries Ironwood actions. Decoded since
   * HANDOFF-07; before that no caller could know.
   *
   * IT IS A NEGATIVE SIGNAL BEFORE IT IS A POSITIVE ONE. Ywallet's last release
   * is 1.15.3 and it "will not be updated for Ironwood"
   * (docs/2.0/research/01-contemporary-zcash.md §2.6, `med`), so a transaction
   * carrying an Ironwood bundle is not Ywallet whatever else it looks like.
   */
  hasIronwoodBundle: boolean;
  ironwoodActionCount: number;
}

/**
 * ZIP 317's conventional fee. Re-exported from the canonical implementation so
 * existing importers keep working and no second copy of the rule exists.
 */
export function computeConventionalFee(actionCount: bigint): Zatoshi {
  return conventionalFeeZat(actionCount);
}

/**
 * Whether a fee is ZIP 317 conventional. `false` for an unknown fee is a
 * claim, so callers holding `null` must not call this - they report `null`.
 */
export function isZip317Conventional(feeZat: Zatoshi, totalActions: bigint | number): boolean {
  return isConventionalFee(feeZat, totalActions);
}

/**
 * THE WALLETS THIS FILE NAMES AND DOES NOT CLASSIFY, AND WHAT EACH WOULD NEED.
 *
 * HANDOFF-07 §3 asked for "expiryDelta/padding signatures for Zodl 3.x, Vizor,
 * Zkool, Zingo, Cake as documented hypotheses WITH THEIR SOURCE". Zodl has one
 * and is implemented below. The other four have no expiry delta and no padding
 * rule anywhere in this repository, and inventing a plausible band for them
 * would be indistinguishable, to every later reader, from a sourced one - the
 * same argument `@zcashreveal/instruments`'s `activation-heights.ts` makes for
 * the testnet NU6 height it deliberately did without for a whole handoff. L2
 * searched for the four and found no public source stating any of their
 * deltas, so HANDOFF-07 §3 is
 * struck rather than owed: the requirement was satisfied by refusal
 * (LEDGER-07 Q4).
 *
 * YWALLET JOINED THEM IN HANDOFF-08, AND IT IS THE ENTRY THAT MAKES THIS LIST
 * PRINCIPLED RATHER THAN SELECTIVE. Finding F-07-1: `guessWallet` returned
 * `"YWALLET"` on an `expiryDelta` in 35-50, and that band was hardcoded at
 * HANDOFF-00 and has carried no citation since. `docs/2.0/TRACKING-MATH.md`
 * §3.6 is the only line in this repository that gives any expiry delta -
 * "zcashd 20, Zashi/Zodl 40, others vary" - and "others vary" is the corpus
 * DECLINING to state one for Ywallet. So this file was withholding four wallet
 * names for want of a source while publishing a fifth on nothing, forty lines
 * apart, and `likelyWallet` is rendered to users as a wallet guess beside a
 * txid (`apps/gateway/src/views/tx.ts`, `apps/web/.../MempoolPanel.tsx`).
 * Narrowing or widening the band would have invented a DIFFERENT number; the
 * third move, and the correct one, is not to publish it. `"YWALLET"` is
 * removed from `WalletGuess` in the same commit, because a member no rule can
 * return is exactly the branch that reads as covered and never runs.
 *
 * What the corpus DOES say about each (§2.6, `med`, a wallet-support table
 * dated 30 Jul - 1 Aug 2026) is a version number and a migration quality, and
 * neither is a transaction-level tell:
 *
 *   Vizor  0.0.20   "full ZIP 318"            - a migration-quality judgement,
 *                                               not a padding or expiry rule.
 *                                               Attributing the ZIP 318 SHAPE to
 *                                               Vizor would attribute it to
 *                                               every compliant wallet at once.
 *   Cake   6.4.0    "mostly ZIP 318 compliant"  same, and "mostly" is not a
 *                                               measurable deviation.
 *   Zkool  6.25.1   "private migration flow"    unquantified.
 *   Zingo  2.0.21   "basic"                     unquantified.
 *
 * Ywallet's own entry in that table is a version and a NEGATIVE fact - 1.15.3,
 * "will not be updated for Ironwood" - which is why the Ironwood tiebreaker in
 * `guessWallet` below is kept rather than deleted with the band. That half is
 * sourced, and it becomes useful again the day a delta is.
 *
 * To become a signature each needs one measured number: an expiry delta from
 * the wallet's own source or release notes, or an action-count padding rule
 * observed across a sample of its transactions. HANDOFF-08's golden cases are
 * where such a sample could come from; a captured mainnet block (HANDOFF-10)
 * is where the first real observations arrive. Recorded here rather than as a
 * `WalletGuess` member no rule can return.
 */
export const UNSOURCED_WALLET_HYPOTHESES = [
  "VIZOR",
  "CAKE",
  "ZKOOL",
  "ZINGO",
  "YWALLET",
] as const;

export function guessWallet(i: FingerprintInputs): WalletGuess {
  // UNKNOWN, NOT FALSE - AND THE FALLTHROUGH HAS TO KNOW THE DIFFERENCE. With no
  // fee there is no evidence either way, so the two signatures that require a
  // conventional fee cannot fire and the two that do not require one are
  // unaffected. That much was right in the first version of this comment, and
  // it missed a third consumer: the fallthrough at the bottom of this function
  // chooses between UNKNOWN_BUT_STANDARD and UNKNOWN_NONSTANDARD on this
  // boolean, and both of those are claims ABOUT THE FEE. Collapsing null to
  // false therefore published "this transaction did not pay the conventional
  // fee" about every transaction whose fee could not be computed.
  const feeIsUnknown = i.feeZat === null;
  const conventionalFee = feeIsUnknown ? false : isConventionalFee(i.feeZat!, i.logicalActions);

  // ZODL IS THE ONLY EXPIRY-DELTA SIGNATURE THIS REPOSITORY CAN SOURCE.
  // `docs/2.0/TRACKING-MATH.md` §3.6 gives Zashi/Zodl a delta of 40 - it is one
  // of the two the corpus states, the other being zcashd's 20 - and the corpus
  // gives Zodl 3.8.0 Ironwood support
  // (docs/2.0/research/01-contemporary-zcash.md §2.6, `med`).
  //
  // BOTH CONJUNCTS ARE STILL REQUIRED, AND THE IRONWOOD ONE IS NOW DOING MORE
  // WORK THAN IT WAS. Until HANDOFF-08 this test read "Ironwood rules Ywallet
  // out", a tiebreaker between two overlapping bands. One of those bands has
  // gone: `guessWallet` no longer returns YWALLET at all, because its 35-50
  // window was hardcoded at HANDOFF-00 and never cited, and §3.6's "others
  // vary" is the corpus declining to state one (F-07-1, LEDGER-07 fold 1). The
  // conjunct stays because it is sourced in its own right and because it keeps
  // this rule narrow: a delta of 40 on a transaction with NO Ironwood bundle is
  // not claimed for Zodl either. Zodl sends ordinary Orchard transactions too,
  // and in that overlap this build cannot tell it from any other wallet whose
  // delta nobody has measured - which is now the honest description of every
  // wallet in `UNSOURCED_WALLET_HYPOTHESES` rather than of one competitor.
  // TRACKING-MATH §3.6's rule holds: the output is a likelihood, never an
  // identity.
  if (i.hasIronwoodBundle && i.expiryDelta === 40) {
    return "ZODL";
  }

  if (
    i.txVersion === 5 &&
    i.hasSaplingBundle &&
    i.saplingOutputCount >= 2 &&
    conventionalFee
  ) {
    return "ZCASHD_RUST";
  }

  if (
    i.txVersion === 5 &&
    i.hasOrchardBundle &&
    i.hasSaplingBundle &&
    i.expiryDelta !== null &&
    i.expiryDelta >= 15 &&
    i.expiryDelta <= 25
  ) {
    return "ZECWALLET_LITE";
  }

  if (
    i.hasOrchardBundle &&
    !i.hasSaplingBundle &&
    conventionalFee &&
    i.expiryDelta !== null &&
    i.expiryDelta >= 70
  ) {
    return "NIGHTHAWK";
  }

  if (conventionalFee) return "UNKNOWN_BUT_STANDARD";
  // Both remaining answers are claims about the fee, so neither is available
  // without one. See UNKNOWN_UNPRICED in packages/zec-types/src/leaks.ts.
  if (feeIsUnknown) return "UNKNOWN_UNPRICED";
  return "UNKNOWN_NONSTANDARD";
}
