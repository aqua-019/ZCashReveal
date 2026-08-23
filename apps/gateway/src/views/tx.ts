/**
 * `TxView` from `getrawtransaction`, plus the indexer's own record where it has
 * one.
 *
 * TWO SOURCES, NEVER MIXED SILENTLY. The public fields - version, height,
 * inputs, outputs, pool value balances - come from the node. The leak class and
 * the severity come from `leak_reports`, which the indexer wrote when it saw
 * the transaction in the mempool. A transaction the indexer never saw has no
 * row there, and this says "not classified" rather than computing a class from
 * a different code path than the one that classified everything else.
 *
 * THE FEE IS COMPUTED, AND THAT IS NOT AN IMPLEMENTATION DETAIL. No node sends
 * a fee on `getrawtransaction`: Zebra's `TransactionObject` has no such field
 * and neither does zcashd's, because a fee is the difference between the value
 * a transaction consumes and the value it produces, and the value it consumes
 * lives in the outputs it spends. So the fee here costs one lookup per distinct
 * funding transaction, and when those cannot be resolved the view says the fee
 * is a lower bound rather than reporting a number computed from a subset.
 */
import type { LedgerLane, TxView } from "@zcashreveal/types";
import { claimLevelFor } from "@zcashreveal/types";

import {
  lanesTouched,
  poolValueBalanceZat,
  resolveInputs,
  shieldedActionCount,
  versionText,
  type ReadContext,
} from "./context.js";
import { countText, stampAtHeight, stampFromUnix, zecText } from "./units.js";

/** What the indexer recorded about this transaction, if anything. */
export interface IndexedLeak {
  readonly leakClass: string;
  readonly severity: "INFO" | "LOW" | "MED" | "HIGH";
  readonly feeZat: bigint | null;
  readonly likelyWallet: string | null;
}

const ZIP317_MARGINAL_FEE = 5_000n;
const ZIP317_GRACE_ACTIONS = 2n;

/** ZIP 317's conventional fee for a transaction with this many logical actions. */
export function conventionalFeeZat(logicalActions: number): bigint {
  const actions = BigInt(logicalActions);
  return (actions > ZIP317_GRACE_ACTIONS ? actions : ZIP317_GRACE_ACTIONS) * ZIP317_MARGINAL_FEE;
}

export async function buildTxView(
  ctx: ReadContext,
  txid: string,
  indexed: IndexedLeak | null,
): Promise<TxView | null> {
  const tx = await ctx.tx(txid);
  if (tx === null) return null;

  const funded = await resolveInputs(ctx, tx);
  const isCoinbase = tx.vin.some((v) => v.coinbase !== undefined);
  const unresolved = tx.vin.some((v, i) => v.coinbase === undefined && funded[i] === null);

  const inputZat = funded.reduce<bigint>((acc, f) => (f === null ? acc : acc + f.valueZat), 0n);
  const outputZat = tx.vout.reduce<bigint>((acc, o) => acc + BigInt(o.valueZat), 0n);
  const boundary = poolValueBalanceZat(tx);

  /**
   * fee = transparent in + what the pools contributed to the transparent side
   *       - transparent out
   *
   * `valueBalance` is signed the way the protocol signs it: positive is value
   * the shielded bundle released INTO the transparent pool. A coinbase creates
   * its outputs from issuance and pays no fee at all, which is why it is not
   * run through the identity - the identity would report the block subsidy as
   * a negative fee.
   */
  const feeZat = isCoinbase ? 0n : indexed?.feeZat ?? inputZat + boundary - outputZat;

  const logicalActions = Math.max(tx.vin.length, tx.vout.length) + shieldedActionCount(tx);
  const conventional = feeZat === conventionalFeeZat(logicalActions);

  const height = typeof tx.height === "number" && tx.height >= 0 ? tx.height : 0;
  const stamp =
    typeof tx.blocktime === "number"
      ? stampFromUnix(tx.blocktime)
      : typeof tx.time === "number"
        ? stampFromUnix(tx.time)
        : stampAtHeight(height);

  const lanes = lanesTouched(tx);
  const shieldedLanes = lanes.filter((l) => l !== "transparent");

  const deltas: { pool: LedgerLane; deltaZat: bigint }[] = [];
  if (tx.vin.length > 0 || tx.vout.length > 0) {
    deltas.push({ pool: "transparent", deltaZat: outputZat - inputZat });
  }
  if ((tx.vShieldedSpend?.length ?? 0) + (tx.vShieldedOutput?.length ?? 0) > 0) {
    deltas.push({ pool: "sapling", deltaZat: BigInt(tx.valueBalanceZat ?? 0) });
  }
  if ((tx.orchard?.actions.length ?? 0) > 0) {
    deltas.push({ pool: "orchard", deltaZat: BigInt(tx.orchard?.valueBalanceZat ?? 0) });
  }
  const ironwood = (tx as unknown as { ironwood?: { actions?: unknown[]; valueBalanceZat?: number } }).ironwood;
  if ((ironwood?.actions?.length ?? 0) > 0) {
    deltas.push({ pool: "ironwood", deltaZat: BigInt(ironwood?.valueBalanceZat ?? 0) });
  }

  const summary = isCoinbase
    ? `Coinbase at height ${countText(height)}. Protocol issuance and the ZIP 1014 and ZIP 271 splits, crossing no pool boundary.`
    : boundary === 0n
      ? shieldedLanes.length > 0
        ? `Fully shielded: ${countText(shieldedActionCount(tx))} shielded actions and no net value across the boundary.`
        : "Transparent throughout. Every input and output is public."
      : boundary > 0n
        ? `${zecText(boundary)} left ${shieldedLanes.join(" and ") || "the shielded pools"} for the transparent side.`
        : `${zecText(-boundary)} entered ${shieldedLanes.join(" and ") || "a shielded pool"}.`;

  return {
    txid: tx.txid,
    version: versionText(tx.version),
    height,
    stamp,
    leakClass: indexed?.leakClass ?? "NOT_CLASSIFIED",
    severity: indexed?.severity ?? "INFO",
    summary,
    deltas,
    metrics: [
      {
        label: "fee",
        value: zecText(feeZat, 8),
        note: isCoinbase
          ? "A coinbase pays no fee. Its outputs are created by issuance rather than by spending, so there is no input total to take a difference from."
          : unresolved
            ? "A lower bound: at least one input could not be resolved to the output it spends, so the input total is incomplete."
            : indexed?.feeZat != null
              ? "As the indexer recorded it when this transaction was in the mempool."
              : "Computed from the outputs this transaction spends. No node reports a fee on getrawtransaction.",
        accent: false,
      },
      {
        label: "logical actions",
        value: countText(logicalActions),
        note: "ZIP 317: the greater of the transparent input and output counts, plus every shielded action.",
        accent: false,
      },
      {
        label: "conventional fee",
        // "no" on a coinbase would read as "it underpaid". A coinbase is not a
        // fee-paying transaction at all, and ZIP 317 does not price one.
        value: isCoinbase ? "not priced" : conventional ? "yes" : "no",
        note: isCoinbase
          ? "ZIP 317 prices the transactions a wallet builds. A coinbase is built by the consensus rules and pays nothing."
          : `ZIP 317 would price this at ${zecText(conventionalFeeZat(logicalActions), 8)}.`,
        accent: false,
      },
      {
        label: "across the boundary",
        value: boundary === 0n ? "none" : zecText(boundary < 0n ? -boundary : boundary),
        note:
          boundary === 0n
            ? "No net value crossed between the transparent side and a pool."
            : boundary > 0n
              ? "Value left a shielded pool for the transparent side."
              : "Value entered a shielded pool.",
        // The one accented metric, and only when there IS a crossing: gold's
        // third licensed job is value crossing a pool boundary, and a magnitude
        // that crossed nothing is not it (LEDGER-04 Q1b).
        accent: boundary !== 0n,
      },
    ],
    publishes: [
      { k: "version", v: versionText(tx.version), muted: false },
      { k: "transparent inputs", v: countText(tx.vin.length), muted: false },
      { k: "transparent outputs", v: countText(tx.vout.length), muted: false },
      { k: "sapling spends", v: countText(tx.vShieldedSpend?.length ?? 0), muted: (tx.vShieldedSpend?.length ?? 0) === 0 },
      { k: "sapling outputs", v: countText(tx.vShieldedOutput?.length ?? 0), muted: (tx.vShieldedOutput?.length ?? 0) === 0 },
      { k: "orchard actions", v: countText(tx.orchard?.actions.length ?? 0), muted: (tx.orchard?.actions.length ?? 0) === 0 },
      {
        k: "expiry height",
        v: tx.expiryHeight === undefined ? "not set" : countText(tx.expiryHeight),
        muted: tx.expiryHeight === undefined,
      },
      { k: "locktime", v: countText(tx.locktime), muted: tx.locktime === 0 },
      {
        k: "wallet tell",
        v: indexed?.likelyWallet ?? "not classified",
        muted: indexed?.likelyWallet == null,
      },
    ],
    // Null for the same reason as on the address view: an estimate carries its
    // filters, its N_eff and its assumptions, the estimators are HANDOFF-08's,
    // and a required field is not a licence to invent an audit trail.
    estimate: null,
    roundTrip: [],
    roundTripNote:
      shieldedLanes.length === 0
        ? null
        : "A round trip needs the pool side, which needs the estimators HANDOFF-08 ships. This transaction's public half is above.",
    feeZat,
    logicalActions,
    conventionalFee: conventional,
  };
}

/**
 * The claim level a count of candidates would carry.
 *
 * Re-exported through this module so a route never writes a claim word by hand:
 * HANDOFF-04's gate found a hardcoded "broad" where the arithmetic said
 * `aggregate_only`, and the fix is that nothing computes a claim level except
 * `claimLevelFor`.
 */
export { claimLevelFor };
