/**
 * Sapling pool decoder.
 * Normalizes RPC spend/output arrays into typed leak-surface form.
 */

import type {
  RpcSaplingSpend,
  RpcSaplingOutput,
  DecodedSaplingSpend,
  DecodedSaplingOutput,
} from "@zcashreveal/types";

export function decodeSaplingSpends(
  spends: RpcSaplingSpend[] | undefined,
): DecodedSaplingSpend[] {
  if (!spends) return [];
  return spends.map((s, i) => ({
    pool: "sapling" as const,
    index: i,
    nullifier: s.nullifier,
    anchor: s.anchor,
    cv: s.cv,
    rk: s.rk,
  }));
}

export function decodeSaplingOutputs(
  outputs: RpcSaplingOutput[] | undefined,
): DecodedSaplingOutput[] {
  if (!outputs) return [];
  return outputs.map((o, i) => ({
    pool: "sapling" as const,
    index: i,
    cmu: o.cmu,
    cv: o.cv,
    ephemeralKey: o.ephemeralKey,
    encCiphertextSize: hexByteLen(o.encCiphertext),
    outCiphertextSize: hexByteLen(o.outCiphertext),
  }));
}

export function hasInferredMemo(_encCiphertext: string): boolean {
  // Sapling encCiphertext is always 580 bytes; memo presence cannot be
  // inferred from size alone. Future: statistical inference across outputs.
  return false;
}

function hexByteLen(hex: string): number {
  return hex.length >>> 1;
}
