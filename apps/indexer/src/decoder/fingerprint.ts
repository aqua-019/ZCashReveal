/**
 * Wallet fingerprint heuristics.
 * Distinguishable patterns: padding strategy, fee selection (ZIP-317),
 * expiry delta, pool preference.
 */

import type { Zatoshi, WalletGuess } from "@zcashreveal/types";

export interface FingerprintInputs {
  txVersion: number;
  vinCount: number;
  voutCount: number;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActionCount: number;
  feeZat: Zatoshi;
  expiryDelta: number | null;
  hasOrchardBundle: boolean;
  hasSaplingBundle: boolean;
}

const ZIP317_MARGINAL_FEE = 5_000n;
const ZIP317_GRACE_ACTIONS = 2n;

export function computeConventionalFee(actionCount: bigint): Zatoshi {
  const logical = actionCount > ZIP317_GRACE_ACTIONS ? actionCount : ZIP317_GRACE_ACTIONS;
  return logical * ZIP317_MARGINAL_FEE;
}

export function isZip317Conventional(feeZat: Zatoshi, totalActions: bigint): boolean {
  const expected = computeConventionalFee(totalActions);
  return feeZat === expected;
}

export function guessWallet(i: FingerprintInputs): WalletGuess {
  const totalActions = BigInt(
    i.saplingSpendCount + i.saplingOutputCount + i.orchardActionCount + i.vinCount + i.voutCount,
  );
  const conventionalFee = isZip317Conventional(i.feeZat, totalActions);

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
  return "UNKNOWN_NONSTANDARD";
}
