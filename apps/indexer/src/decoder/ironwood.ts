/**
 * Ironwood pool decoder — the fourth pool, and the one NU6.3 exists to fill.
 *
 * MIRRORS `orchard.ts` DELIBERATELY AND ALMOST EXACTLY. Ironwood reuses
 * Orchard's Halo 2 circuit on the same Pallas curve with the soundness bug
 * fixed (docs/2.0/research/01-contemporary-zcash.md §2.2, `high`), so an action
 * is simultaneously a spend and an output, the bundle carries a single anchor
 * across all of them, and Zebra serialises the same struct for both. The
 * duplication below is therefore the wire's, not this file's: a shared generic
 * would have to be parameterised on the `pool` literal alone, and reading the
 * two decoders side by side is worth more than saving twenty lines.
 *
 * WHAT IS ACTUALLY DIFFERENT IS INVISIBLE HERE, and that is worth stating so
 * nobody goes looking for it. ZIP 2005 gives every Ironwood output note the
 * quantum-recoverable note plaintext format - lead byte `0x03` where Orchard's
 * is `0x02` - and re-derives the note randomness commitment over all note
 * fields so the commitment binds even against a discrete-log-breaking
 * adversary. All of that lives inside `encCiphertext`, which this project never
 * decrypts without a viewing key (Mode A, client-side only). At this layer the
 * two pools differ in exactly one thing: which one value is allowed to enter.
 *
 * THE DIRECTION IS THE POINT. From NU6.3 Orchard is exit-only under ZIP 2006 -
 * no new value may enter it - and Ironwood is where the value goes. So the sign
 * of `valueBalanceZat` on an Ironwood bundle is nearly always negative (value
 * entering), which is the mirror image of the Orchard bundles it is paired
 * with in a ZIP 318 migration. `ValuePool` enforces the direction; this file
 * only reads it.
 */

import type {
  Hex,
  RpcIronwoodBundle,
  DecodedIronwoodAction,
} from "@zcashreveal/types";

export interface DecodedIronwood {
  actions: DecodedIronwoodAction[];
  anchor: Hex | null;
  valueBalanceZat: bigint;
  flags: { enableSpends: boolean; enableOutputs: boolean } | null;
}

/**
 * Decode an Ironwood bundle, or an absent one.
 *
 * `undefined` IS THE ORDINARY CASE AND IS NOT AN ERROR. The bundle exists only
 * on v6 transactions and only from NU6.3, so it is absent on nearly every
 * transaction ever made and on every pre-v6 transaction by construction. It
 * returns an empty decode with a zero balance, exactly as `decodeOrchardBundle`
 * does - and that zero IS a measurement here, because the decoder looked and
 * there was no bundle. What HANDOFF-06 refused to ship was a zero produced
 * without looking.
 *
 * `anchor` and `flags` coalesce to `null` because Zebra marks them
 * `skip_serializing_if = "Option::is_none"` on the struct it serialises for
 * both pools, and emits the bundle key itself unconditionally on versions that
 * have one. So the presence of the key says nothing; `actions.length` does.
 */
export function decodeIronwoodBundle(
  bundle: RpcIronwoodBundle | undefined,
): DecodedIronwood {
  if (!bundle) {
    return { actions: [], anchor: null, valueBalanceZat: 0n, flags: null };
  }
  const actions: DecodedIronwoodAction[] = bundle.actions.map((a, i) => ({
    pool: "ironwood" as const,
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
    anchor: bundle.anchor ?? null,
    valueBalanceZat: BigInt(bundle.valueBalanceZat),
    flags: bundle.flags ?? null,
  };
}

/**
 * Whether a decoded bundle's action indices run 0, 1, 2, ... with no gap.
 *
 * ASSERTION A2 CALLS THESE "CONTIGUOUS POSITIONS" AND THIS IS WHAT MAKES THAT
 * CHECKABLE. The indices are assigned by this file from the array's own order,
 * so on the decode path the property holds by construction and this function
 * cannot fail - which is precisely why it is worth having. It is a regression
 * guard on the construction, not a validation of the node: the day anyone
 * filters, sorts, merges or de-duplicates an action list between the decoder
 * and the commitment index, the positions stop meaning "position in this
 * bundle" and every commitment after the gap is recorded at the wrong place in
 * the note commitment tree. A wrong tree position is not a cosmetic error; it
 * is an anchor that will never match.
 */
export function hasContiguousPositions(
  actions: ReadonlyArray<{ index: number }>,
): boolean {
  return actions.every((a, i) => a.index === i);
}

function hexByteLen(hex: string): number {
  return hex.length >>> 1;
}
