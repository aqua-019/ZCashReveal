/**
 * ZIP 317 — logical actions and the conventional fee. The canonical implementation.
 *
 * THIS PROJECT COMPUTED L THREE DIFFERENT WAYS BEFORE HANDOFF-06, and the three
 * disagreed on ordinary transactions rather than on edge cases:
 *
 *   `apps/gateway/src/views/context.ts` followed the protocol.
 *   `apps/indexer/src/decoder/fingerprint.ts` SUMMED the transparent input and
 *     output counts and SUMMED Sapling's spends and outputs, where the protocol
 *     takes the maximum of each pair. Its figure differed from the gateway's
 *     for any transaction with more than one input, so `/track`'s rows and
 *     `/tx`'s rows could state two different action counts for one transaction.
 *   `docs/2.0/TRACKING-MATH.md` section 3.5 and the `/method` page gave a
 *     count-based transparent term, which is the protocol's rule only while
 *     every input and output is a standard P2PKH.
 *
 * HANDOFF-05's ledger recorded the indexer's version as deferred to HANDOFF-08.
 * It is corrected here instead, for two reasons: CLAUDE.md's sweep rule
 * requires every restatement of a corrected fact to move in the same commit as
 * the correction, and `isZip317ConventionalFee` is computed from L, so leaving a
 * wrong L would publish a wrong answer through a newly-fixed field.
 *
 * THE RULE, taken from the canonical implementation rather than from a summary
 * of it: Zebra 6.3.0, `zebra-chain/src/transaction/unmined/zip317.rs:160-173`,
 * at commit 1c9b245.
 *
 *   logical = max(ceil(inSize / 150), ceil(outSize / 34))
 *           + 2 * joinsplits
 *           + max(saplingSpends, saplingOutputs)
 *           + orchardActions
 *           + ironwoodActions
 *
 *   conventional fee = 5,000 zatoshi * max(2, logical)
 *
 * THREE THINGS ARE EASY TO GET WRONG AND THIS PROJECT GOT ALL THREE WRONG in
 * its first pass. Sapling contributes the MAXIMUM of its spends and outputs,
 * not their sum. JoinSplits count double. And the transparent side is measured
 * in BYTES against a standard size, not in inputs and outputs.
 *
 * WHY THE BYTE FORM MATTERS HERE SPECIFICALLY, rather than being pedantry. The
 * count form and the protocol agree exactly while every input and output is a
 * standard P2PKH, and diverge for anything larger. The largest script this site
 * discusses is the ZIP 271 lockbox, a 2-of-3 P2SH multisig whose inputs run
 * well past 150 bytes: two such inputs give the protocol L = 4 and a 20,000
 * zatoshi conventional fee, against the count form's L = 2 and 10,000. A page
 * saying a lockbox disbursement did not pay the conventional fee, when by the
 * protocol it did, is a false statement about the one address this project
 * exists to track.
 */

import type { RpcTransaction, Zatoshi } from "./transactions.js";

/** ZIP 317's standard transparent input size, in bytes. */
export const P2PKH_STANDARD_INPUT_SIZE = 150;

/** ZIP 317's standard transparent output size, in bytes. */
export const P2PKH_STANDARD_OUTPUT_SIZE = 34;

/** ZIP 317's marginal fee per logical action, in zatoshi. */
export const ZIP317_MARGINAL_FEE: Zatoshi = 5_000n;

/** ZIP 317's grace: a transaction is never charged for fewer than this many actions. */
export const ZIP317_GRACE_ACTIONS = 2n;

/**
 * The number of logical actions ZIP 317 assigns to a transaction.
 *
 * Ironwood actions are counted when present. The bundle is read through a
 * narrow structural type rather than a declared field on `RpcTransaction`,
 * because this build has not verified Ironwood's serialised shape against a
 * node - HANDOFF-07 owns v6 decoding. Counting a list is safe in a way that
 * reading a value out of it would not be: a wrong count is visible in a
 * logical-action figure, a wrong value balance is money.
 */
export function zip317LogicalActions(tx: RpcTransaction): number {
  const inSize = tx.vin.reduce((acc, v) => acc + transparentInputSize(v), 0);
  const outSize = tx.vout.reduce((acc, o) => acc + transparentOutputSize(o), 0);
  const transparent = Math.max(
    divCeil(inSize, P2PKH_STANDARD_INPUT_SIZE),
    divCeil(outSize, P2PKH_STANDARD_OUTPUT_SIZE),
  );

  const joinsplits = tx.vjoinsplit?.length ?? 0;
  const sapling = Math.max(tx.vShieldedSpend?.length ?? 0, tx.vShieldedOutput?.length ?? 0);
  const orchard = tx.orchard?.actions.length ?? 0;
  const ironwood = (tx as unknown as { ironwood?: { actions?: unknown[] } }).ironwood?.actions?.length ?? 0;

  return transparent + 2 * joinsplits + sapling + orchard + ironwood;
}

/**
 * ZIP 317's conventional fee for a transaction with this many logical actions.
 *
 * The grace floor means the answer is never below 10,000 zatoshi, which is why
 * a fee of `0n` - what this project recorded for every transaction before the
 * fee was computed rather than read off a field no node sends - could never
 * test as conventional.
 */
export function conventionalFeeZat(logicalActions: number | bigint): Zatoshi {
  const actions = BigInt(logicalActions);
  const charged = actions > ZIP317_GRACE_ACTIONS ? actions : ZIP317_GRACE_ACTIONS;
  return charged * ZIP317_MARGINAL_FEE;
}

/** Whether a fee is exactly ZIP 317's conventional fee for this action count. */
export function isConventionalFee(feeZat: Zatoshi, logicalActions: number | bigint): boolean {
  return feeZat === conventionalFeeZat(logicalActions);
}

/**
 * The count-based approximation of L, kept only so the site can SHOW the
 * difference on `/method` rather than quietly present it as the rule.
 *
 * `L = max(t_in, t_out) + 2*nJoinSplit + max(saplingSpends, saplingOutputs)
 *      + nActionsOrchard + nActionsIronwood`
 *
 * Correct if and only if every transparent input and output is a standard
 * P2PKH. Never use it to decide whether a fee was conventional.
 */
export function zip317LogicalActionsP2pkhApproximation(tx: RpcTransaction): number {
  const transparent = Math.max(tx.vin.length, tx.vout.length);
  const joinsplits = tx.vjoinsplit?.length ?? 0;
  const sapling = Math.max(tx.vShieldedSpend?.length ?? 0, tx.vShieldedOutput?.length ?? 0);
  const orchard = tx.orchard?.actions.length ?? 0;
  const ironwood = (tx as unknown as { ironwood?: { actions?: unknown[] } }).ironwood?.actions?.length ?? 0;

  return transparent + 2 * joinsplits + sapling + orchard + ironwood;
}

/**
 * The serialised size of one transparent input, from what the RPC gives.
 *
 * 32 bytes of previous txid, 4 of previous index, a compact-size script length,
 * the script itself, and 4 of sequence. A coinbase input carries its script in
 * `coinbase` rather than in `scriptSig`, and is the same size otherwise.
 */
export function transparentInputSize(vin: RpcTransaction["vin"][number]): number {
  const scriptHex = vin.scriptSig?.hex ?? vin.coinbase ?? "";
  const scriptLen = scriptHex.length >>> 1;
  return 32 + 4 + compactSize(scriptLen) + scriptLen + 4;
}

/** 8 bytes of value, a compact-size script length, and the script. */
export function transparentOutputSize(vout: RpcTransaction["vout"][number]): number {
  const scriptLen = vout.scriptPubKey.hex.length >>> 1;
  return 8 + compactSize(scriptLen) + scriptLen;
}

/** Bitcoin's compact-size encoding width for a length. */
export function compactSize(n: number): number {
  if (n < 253) return 1;
  if (n <= 0xffff) return 3;
  if (n <= 0xffff_ffff) return 5;
  return 9;
}

function divCeil(a: number, b: number): number {
  return Math.ceil(a / b);
}
