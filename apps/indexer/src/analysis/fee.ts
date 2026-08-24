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
   * The identity produced a NEGATIVE fee, which consensus forbids.
   *
   * A block that reached consensus cannot contain one, so a negative result
   * means a term is missing on our side - most likely a pool this build cannot
   * decode - and the honest answer is that the fee is unknown. Publishing the
   * number would be worse than refusing it: `fee_zat` is `NUMERIC(20,0)` and
   * accepts negatives, and a renderer would print "-1.00000000 ZEC" as this
   * transaction's fee. That is the same class of statement as `0n`, with a
   * minus sign to make it look deliberate.
   */
  | "negative-fee"
  /**
   * A v6 transaction carried no `ironwood` key, so this build cannot tell
   * whether an Ironwood term belongs in the conservation identity.
   *
   * NARROWED IN HANDOFF-07, AND THE OLD FORM WOULD HAVE BEEN PERMANENT. Through
   * HANDOFF-06 this fired on `tx.version >= 6 || "ironwood" in tx` - true for
   * EVERY v6 transaction, forever, decoder or no decoder. Landing the Ironwood
   * decoder without narrowing it would have left every transaction on the
   * post-NU6.3 chain with `feeZat: null` and a reason saying the pool was not
   * decoded, while the pool was being decoded three files away. A refusal that
   * outlives its reason is the mirror image of a false zero: it publishes
   * "unknown" about something known, and nothing fails.
   *
   * It now fires only where the ambiguity is real: a v6 transaction with no
   * `ironwood` key at all. Under this build's belief about the wire that is the
   * shape of a wrong field name, in which case the Ironwood balance really is
   * unknown and a fee computed without it really would be confidently wrong.
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
 * ALL FOUR POOLS SINCE HANDOFF-07. Sapling, Orchard and Ironwood each publish a
 * signed `valueBalance`; Sprout is the JoinSplit sum, because it has no such
 * field. The Ironwood term was absent while the bundle was undecoded, and the
 * guard that made that safe - refusing every v6 transaction outright - is
 * narrowed in the same commit that adds the term. Narrowing the guard WITHOUT
 * adding the term would have made every v6 fee wrong by the Ironwood balance,
 * as a confident number rather than a null, which is precisely what this file's
 * header spends three paragraphs refusing to do.
 *
 * The gateway's parallel term (`apps/gateway/src/views/context.ts`,
 * `poolValueBalanceZat`) already included Ironwood, so until this commit the
 * two apps priced a real Orchard-to-Ironwood transaction differently: /tx
 * computed a fee and /track said it could not be priced. They agree now.
 */
export function poolContributionZat(tx: RpcTransaction): Zatoshi {
  return (
    BigInt(tx.valueBalanceZat ?? 0) +
    BigInt(tx.orchard?.valueBalanceZat ?? 0) +
    BigInt(tx.ironwood?.valueBalanceZat ?? 0) +
    sproutValueBalanceZat(tx)
  );
}

/**
 * Whether this transaction carries value in a pool this build cannot read.
 *
 * NARROWED IN HANDOFF-07 FROM `tx.version >= 6 || "ironwood" in tx`, WHICH WAS
 * TRUE OF EVERY v6 TRANSACTION AND WOULD HAVE STAYED TRUE FOREVER. That form
 * was right while nothing decoded the bundle. Left alone after the decoder
 * landed it would have refused a fee for the whole post-NU6.3 chain, with a
 * reason string naming a gap that no longer existed - a permanent "unknown"
 * about something known, which no test can catch because a refusal looks the
 * same whether or not it is warranted.
 *
 * WHAT REMAINS AMBIGUOUS, AND IT IS A REAL AMBIGUITY. The `ironwood` field name
 * is inferred rather than observed (see `packages/zebra-rpc/src/schemas.ts`).
 * If it is wrong, a v6 transaction arrives with no such key and its Ironwood
 * balance is genuinely unknown rather than zero - so a fee computed without the
 * term would be confidently wrong. That is the one case left: v6, no `ironwood`
 * key. Under the belief about the wire it never fires, because Zebra emits pool
 * bundles unconditionally on the versions that have them; if the belief is
 * wrong it fires on every v6 transaction and the fee coverage of the
 * post-NU6.3 chain goes to zero, which is a loud failure rather than a silent
 * wrong number. `leak-analyzer.ts` raises a finding on the same condition.
 */
export function hasUndecodedIronwood(tx: RpcTransaction): boolean {
  return tx.version >= 6 && tx.ironwood === undefined;
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
  const feeZat = spentZat + pools - transparentOut;

  // Consensus forbids a negative fee, so a negative result is a statement about
  // this decoder rather than about the transaction. Refused for the same reason
  // `0n` was: a wrong number that types as an answer outlives a null.
  if (feeZat < 0n) {
    return {
      feeZat: null,
      reason: "negative-fee",
      isCoinbase: false,
      inputsResolved: resolved,
      inputsUnresolved: 0,
      ...REFUSED,
    };
  }

  return {
    feeZat,
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
