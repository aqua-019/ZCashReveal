/**
 * Transaction fee computation — HANDOFF-06 deliverable 4, LEDGER-05 Q4.
 *
 * THE FEE IS NOT ON THE WIRE. Zebra's `TransactionObject` has no fee field
 * (6.3.0, `zebra-rpc/src/methods/types/transaction.rs`, scanned in full) and
 * neither does zcashd's `getrawtransaction`. That is not an oversight in either
 * node: a fee is the difference between the value a transaction SPENDS and the
 * value it pays out, and the outputs it spends belong to earlier transactions
 * that are not in the response. Computing it therefore means fetching those
 * earlier outputs, which is indexing work, which is why it lands here and not
 * at the RPC boundary.
 *
 * WHAT THIS REPLACES, AND WHY IT MATTERED MORE THAN IT LOOKED. `leak-analyzer`
 * read `BigInt(tx.feeZat ?? 0)`. No node sends `feeZat`, so that expression was
 * `0n` for every transaction this project has ever analysed. ZIP 317's
 * conventional fee has a floor of 10,000 zatoshi, so `isZip317Conventional(0n,
 * actions)` was false for every real transaction, and the two wallet signatures
 * that gate on a conventional fee - NIGHTHAWK and ZCASHD_RUST - could never
 * fire. They were not degraded, they were INERT, and every test over them
 * passed because the fixtures agreed with the same wrong assumption. This is
 * the second instance of that exact shape in two handoffs; the first was
 * `expiryheight`.
 *
 * THE FORMULA. In the sign convention this project shares with Zcash's own
 * `valueBalance` - positive means value LEFT the shielded pools for the
 * transparent side - value is conserved as
 *
 *   sum(spent outputs) + sum(pool contributions) = sum(transparent outputs) + fee
 *
 * so
 *
 *   fee = sum(spent outputs) + sum(pool contributions) - sum(transparent outputs)
 *
 * Worked, for each shape:
 *   transparent    100,000 spent, 90,000 paid out, no pools -> 100,000 + 0 - 90,000
 *   shielding      100,000 spent, nothing paid out, sapling -90,000 -> 10,000
 *   deshielding    nothing spent, 90,000 paid out, sapling +100,000 -> 10,000
 *   pure shielded  nothing spent or paid out, sapling +10,000 -> 10,000
 *
 * PURITY. The previous-output lookup is injected rather than performed here, so
 * this module has no ambient I/O and its tests need no node: the resolver is
 * the only thing a caller has to supply, and a Map-backed one is three lines.
 */

import type { Hex, RpcTransaction, Zatoshi } from "@zcashreveal/types";
import { sproutValueBalanceZat } from "../decoder/sprout.js";

/**
 * Looks up the value of the output a transaction input spends.
 *
 * Returns `null` when the previous output cannot be found - an unsynced node, a
 * pruned transaction, a parent still in the mempool that the caller does not
 * hold. `null` is a real answer and callers must not coerce it to zero.
 */
export type PrevOutResolver = (txid: Hex, vout: number) => Promise<Zatoshi | null>;

/** Why a fee could not be computed. `null` reason means it was. */
export type FeeUnavailableReason =
  /** At least one input's previous output could not be resolved. */
  | "unresolved-inputs"
  /**
   * A v6 transaction may carry an Ironwood bundle whose value balance is a term
   * in the conservation identity above, and decoding v6 is HANDOFF-07's
   * deliverable. Omitting a term would not produce an approximate fee, it would
   * produce a confidently wrong one, so the fee is refused instead.
   */
  | "ironwood-not-decoded"
  /** An input carries neither a `txid`/`vout` pair nor a coinbase script. */
  | "malformed-input";

export interface FeeComputation {
  /** The fee in zatoshi, or `null` when it could not be computed. Never a partial sum. */
  readonly feeZat: Zatoshi | null;
  /** `null` when `feeZat` is non-null. */
  readonly reason: FeeUnavailableReason | null;
  /** True for a coinbase transaction, which pays no fee - it collects them. */
  readonly isCoinbase: boolean;
  /** How many inputs were resolved, and how many were not. Audit trail for a refusal. */
  readonly inputsResolved: number;
  readonly inputsUnresolved: number;
  /**
   * The three terms, for a caller that wants to show its working.
   *
   * All zero when the fee was refused. For a COINBASE they do not reconcile to
   * `feeZat` and are not meant to: a coinbase spends no outputs, so `spentZat`
   * is zero while its real inputs are the block subsidy and the fees of every
   * other transaction in the block, neither of which is a property of this
   * transaction.
   */
  readonly spentZat: Zatoshi;
  readonly poolContributionZat: Zatoshi;
  readonly transparentOutZat: Zatoshi;
}

const REFUSED = {
  spentZat: 0n,
  poolContributionZat: 0n,
  transparentOutZat: 0n,
} as const;

/**
 * The net value the shielded bundles contribute to the transparent value pool.
 *
 * Sapling and Orchard publish a signed `valueBalance` each; Sprout is the
 * JoinSplit sum. Ironwood is absent by construction - see
 * `ironwood-not-decoded`, which is checked before this is called.
 */
export function poolContributionZat(tx: RpcTransaction): Zatoshi {
  return (
    BigInt(tx.valueBalanceZat ?? 0) +
    BigInt(tx.orchard?.valueBalanceZat ?? 0) +
    sproutValueBalanceZat(tx)
  );
}

/**
 * Whether this transaction carries value in a pool this build cannot read.
 *
 * Two independent signals, because either alone can be wrong: a v6 transaction
 * is the ZIP 229 format Ironwood needs, and the presence of an `ironwood` key
 * is what a node actually sends. The key is tested with `in` rather than read,
 * deliberately - this build has not verified Ironwood's serialised shape, and
 * asserting one through a cast is the defect that made `expiryheight` invisible
 * for the whole life of the project.
 */
export function hasUndecodedIronwood(tx: RpcTransaction): boolean {
  return tx.version >= 6 || "ironwood" in (tx as object);
}

/** Whether a transaction is a coinbase. Its single input carries a coinbase script. */
export function isCoinbaseTx(tx: RpcTransaction): boolean {
  return tx.vin.some((v) => v.coinbase !== undefined);
}

/**
 * Compute the fee a transaction paid, by summing the outputs it spends.
 *
 * Returns `feeZat: null` rather than a partial answer whenever any term is
 * missing. That refusal is the point of the function: `0n` was itself a partial
 * answer wearing a non-null type, and it silenced two wallet signatures for the
 * entire life of the project without a single failing test.
 *
 * A coinbase transaction returns `0n` and `isCoinbase: true`. It pays no fee -
 * it is where the fees go - and `0n` there is a fact rather than an absence.
 */
export async function computeFeeZat(
  tx: RpcTransaction,
  resolvePrevOut: PrevOutResolver,
): Promise<FeeComputation> {
  if (isCoinbaseTx(tx)) {
    return {
      feeZat: 0n,
      reason: null,
      isCoinbase: true,
      inputsResolved: 0,
      inputsUnresolved: 0,
      spentZat: 0n,
      poolContributionZat: poolContributionZat(tx),
      transparentOutZat: sumTransparentOut(tx),
    };
  }

  if (hasUndecodedIronwood(tx)) {
    return {
      feeZat: null,
      reason: "ironwood-not-decoded",
      isCoinbase: false,
      inputsResolved: 0,
      inputsUnresolved: tx.vin.length,
      ...REFUSED,
    };
  }

  let spentZat = 0n;
  let resolved = 0;
  let unresolved = 0;
  let malformed = false;

  for (const vin of tx.vin) {
    if (vin.txid === undefined || vin.vout === undefined) {
      malformed = true;
      unresolved += 1;
      continue;
    }
    const value = await resolvePrevOut(vin.txid, vin.vout);
    if (value === null) {
      unresolved += 1;
      continue;
    }
    spentZat += value;
    resolved += 1;
  }

  if (unresolved > 0) {
    return {
      feeZat: null,
      reason: malformed ? "malformed-input" : "unresolved-inputs",
      isCoinbase: false,
      inputsResolved: resolved,
      inputsUnresolved: unresolved,
      ...REFUSED,
    };
  }

  const pools = poolContributionZat(tx);
  const transparentOut = sumTransparentOut(tx);

  return {
    feeZat: spentZat + pools - transparentOut,
    reason: null,
    isCoinbase: false,
    inputsResolved: resolved,
    inputsUnresolved: 0,
    spentZat,
    poolContributionZat: pools,
    transparentOutZat: transparentOut,
  };
}

/** The total value a transaction pays to transparent outputs. */
export function sumTransparentOut(tx: RpcTransaction): Zatoshi {
  let sum = 0n;
  for (const o of tx.vout) sum += BigInt(o.valueZat);
  return sum;
}

/**
 * A resolver that knows nothing.
 *
 * The honest default for a caller with no node and no cache: every fee comes
 * back `null` with `unresolved-inputs`, which is what the analyser did in
 * effect before this existed, except that it said `0n` and meant `null`.
 */
export const noPrevOutResolver: PrevOutResolver = async () => null;
