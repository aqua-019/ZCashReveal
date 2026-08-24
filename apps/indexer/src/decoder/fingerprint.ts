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
 * THE FOUR WALLETS HANDOFF-07 NAMED THAT HAVE NO SIGNATURE HERE, AND WHAT EACH
 * WOULD NEED. §3 asks for "expiryDelta/padding signatures for Zodl 3.x, Vizor,
 * Zkool, Zingo, Cake as documented hypotheses WITH THEIR SOURCE". Zodl has one
 * and is implemented below. The other four have no expiry delta and no padding
 * rule anywhere in this repository, and inventing a plausible band for them
 * would be indistinguishable, to every later reader, from a sourced one - the
 * same argument `activation-heights.ts` makes for the testnet NU6 height it
 * deliberately did without for a whole handoff.
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
 * To become a signature each needs one measured number: an expiry delta from
 * the wallet's own source or release notes, or an action-count padding rule
 * observed across a sample of its transactions. HANDOFF-08's golden cases are
 * where such a sample could come from; a captured mainnet block (HANDOFF-10)
 * is where the first real observations arrive. Recorded here rather than as a
 * `WalletGuess` member no rule can return.
 */
export const UNSOURCED_WALLET_HYPOTHESES = ["VIZOR", "CAKE", "ZKOOL", "ZINGO"] as const;

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

  // ZODL BEFORE YWALLET, BECAUSE THEIR BANDS OVERLAP AND ONLY ONE THING
  // SEPARATES THEM. `docs/2.0/TRACKING-MATH.md` §3.6 gives Zashi/Zodl an expiry
  // delta of 40, which falls inside the 35-50 window the YWALLET rule below
  // tests, so on the delta alone the two are indistinguishable. The corpus
  // supplies the tiebreaker: Zodl 3.8.0 has Ironwood support and Ywallet's
  // final release 1.15.3 "will not be updated for Ironwood"
  // (docs/2.0/research/01-contemporary-zcash.md §2.6, `med`). An Ironwood
  // bundle therefore rules Ywallet out, and it is the only evidence here that
  // does.
  //
  // YWALLET'S 35-50 IS NOT SOURCED, AND AN EARLIER VERSION OF THIS COMMENT SAID
  // IT WAS. A gate round caught it. §3.6 is the only line in this repository
  // that gives any expiry delta at all - "(zcashd 20, Zashi/Zodl 40, others
  // vary)" - and "others vary" is the corpus declining to state one for
  // Ywallet. The 35-50 literals below are hardcoded and have carried no
  // citation since HANDOFF-00. So the one delta this project can source is
  // Zodl's, and the comment that stood here inverted that, telling the next
  // reader the competing band was the sourced one - in the same file that
  // refuses, forty lines above, to invent bands for four other wallets because
  // an invented band is indistinguishable from a sourced one. Recorded as a
  // deferred item rather than fixed, because narrowing or widening an
  // uncited band would be inventing a different number, not correcting one.
  //
  // WHAT THIS RULE DOES NOT CLAIM: that a delta of 40 without an Ironwood
  // bundle is Ywallet rather than Zodl. Zodl sends ordinary Orchard
  // transactions too, and in that overlap this build cannot tell them apart.
  // The answer below is Ywallet only because that is the behaviour this file
  // already had and this handoff is not the one that re-sources it. Stated
  // rather than hidden in the ordering, per TRACKING-MATH §3.6's rule that the
  // output is a likelihood and never an identity.
  if (i.hasIronwoodBundle && i.expiryDelta === 40) {
    return "ZODL";
  }

  if (
    i.hasOrchardBundle &&
    !i.hasSaplingBundle &&
    !i.hasIronwoodBundle &&
    i.orchardActionCount >= 2 &&
    i.expiryDelta !== null &&
    i.expiryDelta >= 35 &&
    i.expiryDelta <= 50
  ) {
    return "YWALLET";
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
