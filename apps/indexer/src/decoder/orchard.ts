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

/**
 * ZIP 257's canonical `proofsOrchard` length: `2720 + 2272 x nActionsOrchard` bytes.
 *
 * NU6.2 replaced the Orchard Action verifying key and added this rule at the
 * same time (docs/2.0/research/01-contemporary-zcash.md §1.4, `high`, quoting
 * ZIP 257). The two halves are one event: the mitigation soft fork froze
 * Orchard activity for the 1,174 blocks between {@link
 * ORCHARD_MITIGATION_MAINNET} and {@link NU6_2_ACTIVATION_MAINNET}, and NU6.2
 * restarted it under a new key and a fixed proof length.
 *
 * THE RULE IS ORCHARD'S AND NOT IRONWOOD'S. Ironwood reuses the corrected
 * Orchard circuit, so it is tempting to apply the same arithmetic to its proof;
 * nothing in this repository states an Ironwood proof-length rule, and a
 * plausible constant is indistinguishable to every later reader from a sourced
 * one. So Ironwood proofs are not measured here at all, which is a smaller
 * claim than measuring them against a guessed length would be.
 */
export const ORCHARD_PROOF_BASE_BYTES = 2_720;

/** The per-action term of ZIP 257's canonical proof length, in bytes. */
export const ORCHARD_PROOF_PER_ACTION_BYTES = 2_272;

/** ZIP 257's canonical `proofsOrchard` length for a bundle with `nActions` actions. */
export function canonicalOrchardProofBytes(nActions: number): number {
  return ORCHARD_PROOF_BASE_BYTES + ORCHARD_PROOF_PER_ACTION_BYTES * nActions;
}

/**
 * Check a bundle's proof against ZIP 257's canonical length.
 *
 * Returns `null` when the rule does not apply or the check passes, and the two
 * lengths when it fails.
 *
 * WHY THIS IS A FINDING AND NEVER A THROW, AND WHY THAT IS THE INTERESTING
 * PART. A consensus-valid chain CANNOT carry a non-canonical proof after NU6.2:
 * nodes reject such a transaction. So if this check ever fires against mainnet,
 * the overwhelmingly likely explanation is that THIS DECODER is wrong - it
 * counted the actions incorrectly, or read a field that is not `proofsOrchard`,
 * or the hex it measured was truncated somewhere upstream. Throwing would
 * present the decoder's own error as a fault in the chain and take the indexer
 * down with it; silently passing would hide it. A finding is the only response
 * that says "something here does not add up" without deciding whose fault it is.
 *
 * THE HEIGHT GATE IS INCLUSIVE OF THE ACTIVATION BLOCK, matching the protocol's
 * "from block height N onward" and `poolsActiveAt`. Below it the rule did not
 * exist and a proof of any length was legal, so measuring one there would be an
 * anachronism rather than a finding.
 *
 * `proof` ABSENT MEANS THE RULE DOES NOT APPLY. Zebra marks it
 * `skip_serializing_if = "Option::is_none"` and emits the bundle key even for
 * transactions with no actions, so an absent proof is the ordinary case and not
 * a violation of a length rule.
 */
export function orchardProofSizeViolation(input: {
  proof: string | undefined;
  actionCount: number;
  height: number;
  nu6_2ActivationHeight: number;
}): { expectedBytes: number; actualBytes: number } | null {
  if (input.height < input.nu6_2ActivationHeight) return null;
  if (input.proof === undefined) return null;
  if (input.actionCount === 0) return null;

  const actualBytes = hexByteLen(input.proof);
  const expectedBytes = canonicalOrchardProofBytes(input.actionCount);
  return actualBytes === expectedBytes ? null : { expectedBytes, actualBytes };
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
