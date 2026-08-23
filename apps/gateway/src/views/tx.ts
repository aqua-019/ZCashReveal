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
import { claimLevelFor, conventionalFeeZat } from "@zcashreveal/types";

import {
  lanesTouched,
  poolValueBalanceZat,
  resolveInputs,
  shieldedActionCount,
  sproutValueBalanceZat,
  versionText,
  zip317LogicalActions,
  type ReadContext,
} from "./context.js";
import { countText, stampFromUnix, stampNoTime, zecText } from "./units.js";

/** What the indexer recorded about this transaction, if anything. */
export interface IndexedLeak {
  readonly leakClass: string;
  readonly severity: "INFO" | "LOW" | "MED" | "HIGH";
  readonly feeZat: bigint | null;
  readonly likelyWallet: string | null;
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
  /**
   * The fee, or `null` when it cannot be computed.
   *
   * THE `unresolved` GUARD IS LOAD-BEARING AND WAS NOT HERE. This read
   * `indexed?.feeZat ?? inputZat + boundary - outputZat`, and `inputZat` sums
   * only the inputs that RESOLVED - so an unresolved input was counted as an
   * input worth nothing, and the identity returned the negative of whatever the
   * transaction paid out. It was unreachable while `leak_reports.fee_zat` was
   * `NOT NULL DEFAULT 0`, because `indexed.feeZat` was then always `0n` and the
   * coalesce never fell through. Migration 003 made that column nullable, which
   * is correct and which opened this path: /tx would have rendered a fee of
   * MINUS one ZEC for an ordinary transaction whose parent this node had not
   * indexed.
   *
   * A partial sum is not a lower bound either, despite the note that used to
   * call it one: omitting an input makes the result too SMALL, and a fee
   * "bounded below" by a negative number bounds nothing.
   */
  const feeZat: bigint | null = isCoinbase
    ? 0n
    : (indexed?.feeZat ?? (unresolved ? null : inputZat + boundary - outputZat));

  // ZIP 317's own definition, from Zebra's implementation of it - not a count
  // of inputs and outputs. See `zip317LogicalActions` in
  // `packages/zec-types/src/zip317.ts`, which both apps now compute L through.
  const logicalActions = zip317LogicalActions(tx);
  /** `null` where there is no fee to judge. Unknown is not the same claim as false. */
  const conventional: boolean | null =
    feeZat === null ? null : feeZat === conventionalFeeZat(logicalActions);

  const height = typeof tx.height === "number" && tx.height >= 0 ? tx.height : 0;
  const stamp =
    typeof tx.blocktime === "number"
      ? stampFromUnix(tx.blocktime)
      : typeof tx.time === "number"
        ? stampFromUnix(tx.time)
        : stampNoTime(height);

  const lanes = lanesTouched(tx);
  const shieldedLanes = lanes.filter((l) => l !== "transparent");

  /**
   * Per-pool deltas, in the sign the DTO fixes: POSITIVE LEAVES THE POOL.
   *
   * The transparent lane's delta is the MIRROR IMAGE of what the pools did -
   * `-boundary` - and not `outputs - inputs`, which was the first version and
   * was wrong twice over. It had the sign inverted, so a shield rendered
   * transparent and orchard both NEGATIVE, saying two pools each received the
   * same 30,000 ZEC in a transaction that moved it from one to the other; and a
   * deshield rendered both POSITIVE, saying both lost it. It also measured a
   * different quantity from `views/block.ts`, which sums `-boundary` for the
   * same transactions, so one transaction had two different transparent deltas
   * depending on which page a reader was on.
   *
   * The fee is not in this figure and should not be: it leaves the transparent
   * lane for a miner without crossing any pool boundary, and it is reported as
   * its own metric below.
   */
  const deltas: { pool: LedgerLane; deltaZat: bigint }[] = [];
  if (tx.vin.length > 0 || tx.vout.length > 0) {
    deltas.push({ pool: "transparent", deltaZat: -boundary });
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
  // Sprout, which is a JoinSplit sum rather than a `valueBalance` field and was
  // therefore missing entirely from the first version of this list.
  if (((tx as unknown as { vjoinsplit?: unknown[] }).vjoinsplit?.length ?? 0) > 0) {
    deltas.push({ pool: "sprout", deltaZat: sproutValueBalanceZat(tx) });
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
        value: feeZat === null ? "not priced" : zecText(feeZat, 8),
        // ORDER MATTERS. The indexer's figure is exact and is checked FIRST: an
        // earlier version tested `unresolved` first, so a transaction whose fee
        // came straight from `leak_reports` was labelled "a lower bound"
        // whenever any input happened to be unresolvable - describing an exact
        // number as an estimate.
        note: isCoinbase
          ? "A coinbase pays no fee. Its outputs are created by issuance rather than by spending, so there is no input total to take a difference from."
          : indexed?.feeZat != null
            ? "As the indexer recorded it when this transaction was in the mempool."
            : unresolved
              ? "Not priced: at least one input could not be resolved to the output it spends, so the difference this fee is computed from is unavailable. An incomplete input total does not give a lower bound - it gives a number that is too small by an unknown amount."
              : "Computed from the outputs this transaction spends. No node reports a fee on getrawtransaction.",
        accent: false,
      },
      {
        label: "logical actions",
        value: countText(logicalActions),
        note:
          "ZIP 317: the greater of the serialised input bytes over 150 and the serialised output bytes over 34, each rounded up, plus twice the joinsplits, plus the greater of the Sapling spends and outputs, plus every Orchard and Ironwood action.",
        accent: false,
      },
      {
        label: "conventional fee",
        // Three answers, not two. "no" on a coinbase would read as "it
        // underpaid", and a coinbase is not a fee-paying transaction at all.
        // "no" on a fee that is itself a lower bound would be a verdict derived
        // from an admittedly incomplete number - the page would say the fee is
        // incomplete in one tile and rule on it in the next.
        value: isCoinbase ? "not priced" : conventional === null ? "cannot say" : conventional ? "yes" : "no",
        note: isCoinbase
          ? "ZIP 317 prices the transactions a wallet builds. A coinbase is built by the consensus rules and pays nothing."
          : conventional === null
            ? `The fee above could not be computed, so whether it meets ZIP 317's ${zecText(conventionalFeeZat(logicalActions), 8)} cannot be decided.`
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
    // `null` where the fee could not be computed. The DTO field is nullable as
    // of HANDOFF-06 for exactly this: it used to be a boolean, so an unknown
    // fee had to be published as `false` - "this transaction did not pay the
    // conventional fee" - which is a verdict, not an absence.
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

/**
 * ZIP 317's conventional fee, for the same reason one level down.
 *
 * The arithmetic used to be written out here - `max(2, L) * 5,000` - and again
 * in `views/mempool.ts`, and a third time in `apps/web`'s mempool fixture, so
 * the fee curve had three authors and one of them could have been corrected
 * alone. It is now `packages/zec-types/src/zip317.ts`'s, beside the definition
 * of L it is a function of; the two belong together, because a change to either
 * one alone publishes a fee that does not match the actions it prices.
 */
export { conventionalFeeZat };
