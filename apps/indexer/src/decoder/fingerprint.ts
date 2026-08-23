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

  if (
    i.hasOrchardBundle &&
    !i.hasSaplingBundle &&
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
