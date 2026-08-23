/**
 * Whether this node told us about Sprout at all.
 *
 * THE PROBLEM THIS FILE EXISTS FOR. `sproutValueBalanceZat` in the indexer reads
 * `tx.vjoinsplit` and sums `vpub_new - vpub_old` across it. A transaction with
 * no JoinSplits and a transaction from a node that does not serialise the field
 * both arrive here as "no `vjoinsplit` key", and both currently produce `0n` -
 * the first correctly, the second as a fabrication. That is the exact shape of
 * the `expiryheight` defect (HANDOFF-05) and of `tx.feeZat` (HANDOFF-06): a
 * value that reads as measured and was never measured, with every test green.
 *
 * WHY THE AMBIGUITY IS REAL. Zebra's `getrawtransaction` gained `vjoinsplit`
 * only in ZcashFoundation/zebra PR #9805, merged 22 Aug 2025. A node older than
 * that omits the field on every transaction, including ones that do carry
 * JoinSplits. `docker-compose.yml` in this repository still pins
 * `zfnd/zebra:4.4.1`. So the ambiguity is not hypothetical for anyone who
 * deploys what the compose file currently says.
 *
 * WHAT CAN AND CANNOT BE DECIDED FROM ONE TRANSACTION. Presence is decisive:
 * a node that emits the key, even as `[]`, speaks the field. Absence is
 * decisive ONLY when the transaction's version forbids JoinSplits, and that is
 * most of them:
 *
 *   v1        no JoinSplit fields (`vJoinSplit` is present only when
 *             `nVersion >= 2`), so absence is a fact
 *   v2 v3 v4  JoinSplits are permitted, so absence is INDETERMINATE - either
 *             the transaction has none, or the node cannot say
 *   v5 v6     the v5 format removed JoinSplits entirely (ZIP 225; v6 inherits
 *             the structure per ZIP 229), so absence is a fact again
 *
 * The window is therefore versions 2 to 4, which is narrower than "v2 and
 * later". That matters: reporting every v5 and v6 transaction as indeterminate
 * would put a finding on nearly every transaction on the chain today, and it
 * would be a FALSE finding - there is nothing indeterminate about a format that
 * cannot express a JoinSplit.
 *
 * A FINDING, NOT A THROW. An old node is an operator problem, not a malformed
 * response, and this project's rule is that a decoder never crashes on a shape
 * it did not expect. The caller records the indeterminacy beside the value
 * instead of choosing between a false zero and a refusal to parse.
 *
 * The wire spelling is settled: the official zcash RPC documentation for
 * `getrawtransaction` prints `vjoinsplit` all-lowercase in the same result
 * object where the Sapling arrays are `vShieldedSpend` and `vShieldedOutput` -
 * the inconsistency is real, which is why doubting it was correct - and PR
 * #9805 adds that same spelling to Zebra. Both citations are in the LEDGER
 * (L2 RESOLUTION - HANDOFF-06).
 */

import type { RpcTransaction } from "@zcashreveal/types";

/**
 * What a transaction's `vjoinsplit` field lets a caller conclude.
 *
 * `OBSERVED` - the node serialised the field. Its contents are the answer,
 * including when it is an empty array.
 *
 * `ABSENT_DEFINITIVE` - the field is missing and the transaction version cannot
 * carry JoinSplits, so the Sprout contribution is genuinely zero.
 *
 * `ABSENT_INDETERMINATE` - the field is missing on a version that COULD carry
 * JoinSplits. The Sprout contribution is unknown; treating it as zero is a
 * claim the response does not support.
 */
export type JoinSplitObservability =
  | "OBSERVED"
  | "ABSENT_DEFINITIVE"
  | "ABSENT_INDETERMINATE";

/**
 * The lowest transaction version whose format includes JoinSplit descriptions.
 * `vJoinSplit` is serialised only when `nVersion >= 2`.
 */
export const JOINSPLIT_MIN_TX_VERSION = 2;

/**
 * The highest transaction version whose format includes JoinSplit descriptions.
 * v5 (ZIP 225) removed them, and v6 (ZIP 229) did not bring them back.
 */
export const JOINSPLIT_MAX_TX_VERSION = 4;

/**
 * Classify what this response says about the transaction's JoinSplits.
 *
 * Reads presence of the key rather than truthiness of its contents, because
 * `[]` and absent are the two states this whole file exists to keep apart.
 * `version` is read as-is: a negative version (Overwinter and later set the
 * high bit in the serialised form, though Zebra reports the unmasked number)
 * or an unrecognised one falls outside the window and is reported definitive,
 * which is the conservative answer - it declines to raise an indeterminacy
 * about a format this project does not model.
 */
export function joinSplitObservability(tx: RpcTransaction): JoinSplitObservability {
  if (tx.vjoinsplit !== undefined) return "OBSERVED";
  const canCarry =
    tx.version >= JOINSPLIT_MIN_TX_VERSION && tx.version <= JOINSPLIT_MAX_TX_VERSION;
  return canCarry ? "ABSENT_INDETERMINATE" : "ABSENT_DEFINITIVE";
}

/**
 * Whether the Sprout value balance derived from this transaction is a
 * measurement rather than an assumption.
 *
 * The one-line form callers use when they need a boolean beside a number; the
 * three-state function above is what they use when they need to say why.
 */
export function sproutBalanceIsObserved(tx: RpcTransaction): boolean {
  return joinSplitObservability(tx) !== "ABSENT_INDETERMINATE";
}
