/**
 * Orchard pool decoder.
 * Each action is simultaneously a spend and an output; the bundle carries
 * a single anchor across all actions.
 */

import type {
  Hex,
  RpcOrchardBundle,
  DecodedOrchardAction,
} from "@zcashreveal/types";

export interface DecodedOrchard {
  actions: DecodedOrchardAction[];
  anchor: Hex | null;
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
    // Zebra omits `anchor`, `flags`, `proof` and `bindingSig` when the
    // transaction has no Orchard bundle, and emits the `orchard` object itself
    // unconditionally - so this branch is reached for ordinary transparent
    // transactions, where the absent fields must read as null and not as
    // undefined. `RpcOrchardBundle` declared them required until HANDOFF-05,
    // which is what hid this; the stored value is unchanged, only its spelling.
    anchor: bundle.anchor ?? null,
    valueBalanceZat: BigInt(bundle.valueBalanceZat),
    flags: bundle.flags ?? null,
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
