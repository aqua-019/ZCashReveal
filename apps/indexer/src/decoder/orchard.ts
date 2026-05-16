/**
 * Orchard pool decoder.
 * Each action is simultaneously a spend and an output; the bundle carries
 * a single anchor across all actions.
 */

import type {
  RpcOrchardBundle,
  DecodedOrchardAction,
} from "@zcashreveal/types";

export interface DecodedOrchard {
  actions: DecodedOrchardAction[];
  anchor: string | null;
  valueBalanceZat: bigint;
  flags: { enableSpends: boolean; enableOutputs: boolean } | null;
}

export function decodeOrchardBundle(
  bundle: RpcOrchardBundle | undefined,
): DecodedOrchard {
  if (!bundle) {
    return { actions: [], anchor: null, valueBalanceZat: 0n, flags: null };
  }
  const actions: DecodedOrchardAction[] = bundle.actions.map((a, i) => ({
    pool: "orchard" as const,
    index: i,
    nullifier: a.nullifier,
    cmx: a.cmx,
    cv: a.cv,
    rk: a.rk,
    ephemeralKey: a.ephemeralKey,
    encCiphertextSize: hexByteLen(a.encCiphertext),
    outCiphertextSize: hexByteLen(a.outCiphertext),
  }));
  return {
    actions,
    anchor: bundle.anchor,
    valueBalanceZat: BigInt(bundle.valueBalanceZat),
    flags: bundle.flags,
  };
}

export function classifyActionCount(n: number): "MINIMAL" | "TYPICAL" | "PADDED" | "UNUSUAL" {
  if (n === 0) return "MINIMAL";
  if (n === 2) return "TYPICAL";
  if (n >= 3 && n <= 4) return "PADDED";
  if (n === 1 || n > 8) return "UNUSUAL";
  return "TYPICAL";
}

function hexByteLen(hex: string): number {
  return hex.length >>> 1;
}
