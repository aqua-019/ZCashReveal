/**
 * `MempoolView` from the indexer's live reports.
 *
 * The rows come from `zcashreveal:mempool:live` on the VPS-LOCAL Redis - the
 * hash the indexer maintains as it watches the mempool - and not from
 * `getrawmempool`. That is a deliberate choice and it is the difference between
 * a table and a list of ids: the indexer has already decoded each transaction,
 * classified it and annotated its findings, and re-deriving any of that here
 * would mean two code paths that can disagree about the same transaction on the
 * same page.
 *
 * NOTHING ON THIS PATH TOUCHES THE MANAGED REDIS. `zecreveal:snapshot:*` lives
 * on the Vercel Marketplace store, is written only by the publisher and is read
 * only by `apps/web`; per-transaction traffic must never leave the VPS
 * (CLAUDE.md, HANDOFF-05 section 3).
 */
import type { LeakReport, MempoolRow, MempoolView } from "@zcashreveal/types";

import { countText, zecText } from "./units.js";

/**
 * Zcash's target block spacing, 75 seconds.
 *
 * Introduced by ZIP 208 and activated with BLOSSOM in 2019, not by NU6 - an
 * earlier version of this comment said NU6, which is a different upgrade five
 * years later.
 */
const TARGET_BLOCK_SECONDS = 75;

export function buildMempoolView(
  reports: readonly LeakReport[],
  tipHeight: number,
  now: number,
  /**
   * Serialised size per txid, from `getrawmempool` verbose.
   *
   * A SEPARATE ARGUMENT because the indexer's report does not carry a size and
   * the first version therefore emitted `bytes: 0` - which `apps/web`'s
   * /track page renders as "0.0 kB" beside a table of transactions. A zero is
   * not a missing value; it is a claim that the mempool is empty of bytes, and
   * it is the same class of defect as the fabricated pool blocks this handoff
   * refused to ship. Empty here means the node could not be asked, and the
   * summary says which.
   */
  sizes: Readonly<Record<string, { size: number }>> = {},
): MempoolView {
  const entries = reports.map((r) => mempoolRow(r, now));

  const shielded = entries.filter((e) => e.class === "shielded").length;
  const migrations = entries.filter((e) => e.class === "migration").length;
  const transparent = entries.filter((e) => e.class === "transparent").length;
  const crossings = entries.filter((e) => e.class === "shield" || e.class === "deshield");

  const intoPool = reports.reduce<bigint>((acc, r) => {
    const net = r.valueFlow.saplingValueBalanceZat + r.valueFlow.orchardValueBalanceZat;
    return net < 0n ? acc - net : acc;
  }, 0n);
  const outOfPool = reports.reduce<bigint>((acc, r) => {
    const net = r.valueFlow.saplingValueBalanceZat + r.valueFlow.orchardValueBalanceZat;
    return net > 0n ? acc + net : acc;
  }, 0n);

  /**
   * How many transactions actually pay ZIP 317's conventional fee.
   *
   * NOT `fingerprint.isZip317ConventionalFee`, WHICH IS NOT A FEE TEST. The
   * indexer sets that field from the WALLET GUESS
   * (`leak-analyzer.ts`: `wallet === "ZCASHD_RUST" || wallet === "NIGHTHAWK"`),
   * so a page built on it would tell a reader that N of M transactions pay the
   * conventional fee when what it counted was how many looked like two
   * particular wallets. That is a claim of fact derived from something else
   * entirely.
   *
   * The fee and the action counts ARE on the report, so the test is done here:
   * `feeZat === 5000 * max(2, logicalActions)`.
   */
  const conventional = reports.filter((r) => r.fingerprint.feeZat === conventionalFeeZat(logicalActionsOf(r)));
  const findingsHigh = reports.reduce((acc, r) => acc + r.findings.filter((f) => f.severity === "HIGH").length, 0);

  return {
    tipHeight,
    entries,
    summary: {
      unconfirmed: entries.length,
      shielded,
      migrations,
      transparent,
      bytes: reports.reduce((acc, r) => acc + (sizes[r.txid]?.size ?? 0), 0),
      // The TARGET interval, and that is the right answer to "how long until
      // the next block" rather than a lazy one. Block arrival is a Poisson
      // process, so the expected remaining wait is the mean interval however
      // long has already elapsed - the memorylessness is what makes a constant
      // correct here. Zcash's target has been 75 s since Blossom.
      nextBlockSeconds: TARGET_BLOCK_SECONDS,
      crossingZat: intoPool + outOfPool,
      crossingSplit:
        crossings.length === 0
          ? "Nothing in the mempool crosses a pool boundary."
          : `${zecText(intoPool)} in, ${zecText(outOfPool)} out, across ${countText(crossings.length)} ${crossings.length === 1 ? "transaction" : "transactions"}.`,
      // The fee total across the transactions that pay the conventional fee,
      // which is the quantity the count beside it is about.
      conventionalFeeZat: conventional.reduce<bigint>((acc, r) => acc + r.fingerprint.feeZat, 0n),
      conventionalCount: conventional.length,
      findingsHigh,
      findingsNote:
        findingsHigh === 0
          ? "No finding in the current mempool is rated HIGH."
          : `${countText(findingsHigh)} HIGH ${findingsHigh === 1 ? "finding" : "findings"} across the transactions below.`,
      feeWeather:
        entries.length === 0
          ? "Nothing is waiting."
          : conventional.length === entries.length
            ? "Every transaction in the mempool pays the ZIP 317 conventional fee."
            : `${countText(conventional.length)} of ${countText(entries.length)} pay the ZIP 317 conventional fee.`,
    },
  };
}

function mempoolRow(r: LeakReport, now: number): MempoolRow {
  const sapling = r.valueFlow.saplingValueBalanceZat;
  const orchard = r.valueFlow.orchardValueBalanceZat;
  const net = sapling + orchard;
  const hasTransparent = r.transparent.vin.length + r.transparent.vout.length > 0;
  const hasSapling = r.bundle.saplingSpends.length + r.bundle.saplingOutputs.length > 0;
  const hasOrchard = r.bundle.orchardActions.length > 0;

  const lanes: MempoolRow["lanes"] = [];
  if (hasTransparent) lanes.push("transparent");
  if (hasSapling) lanes.push("sapling");
  if (hasOrchard) lanes.push("orchard");
  if (lanes.length === 0) lanes.push("transparent");

  const klass: MempoolRow["class"] =
    r.valueFlow.direction === "DEPOSIT"
      ? "shield"
      : r.valueFlow.direction === "WITHDRAWAL"
        ? "deshield"
        : hasSapling && hasOrchard
          ? "migration"
          : hasSapling || hasOrchard
            ? "shielded"
            : "transparent";

  const reasoning = r.findings.length > 0
    ? r.findings.map((f) => `${f.code}: ${f.message}`)
    : ["No finding was raised for this transaction. That is a statement about what it publishes, not about who sent it."];

  return {
    txid: r.txid,
    ageSeconds: Math.max(0, Math.round((now - r.seenAt) / 1000)),
    version: r.txVersion >= 6 ? "v6" : r.txVersion === 5 ? "v5" : "v4",
    flow:
      klass === "shield"
        ? "t to z"
        : klass === "deshield"
          ? "z to t"
          : klass === "migration"
            ? "S to O"
            : klass === "shielded"
              ? "shielded"
              : "t to t",
    lanes,
    valueBalanceText: net === 0n ? "no net crossing" : zecText(net < 0n ? -net : net),
    feeZat: r.fingerprint.feeZat,
    logicalActions: logicalActionsOf(r),
    // The indexer's own word for it, never re-derived here. `UNKNOWN_*` values
    // are passed through as they are: HANDOFF-05 found that two of the five
    // wallet tells could not fire at all before the RPC boundary was corrected,
    // and dressing an unknown up as a guess would hide that.
    walletGuess: r.fingerprint.likelyWallet,
    finding:
      r.findings[0]?.message ??
      "Nothing this transaction publishes distinguishes it from any other of its shape.",
    severity: r.overallSeverity === "MEDIUM" ? "MED" : r.overallSeverity === "CRITICAL" ? "HIGH" : r.overallSeverity,
    class: klass,
    reasoning,
  };
}

/**
 * ZIP 317's logical-action count, from what a `LeakReport` carries.
 *
 * THE OBVIOUS SUM DOUBLE-COUNTS ORCHARD. `FingerprintAnnotation.outputCount` is
 * `vout + saplingOutputs + orchardActions` and `spendCount` is
 * `vin + saplingSpends + orchardActions`, so `outputCount + spendCount` counts
 * every Orchard action TWICE - and that doubled figure was rendered to the
 * reader as the transaction's logical actions.
 *
 * This is the count-based approximation of ZIP 317's rule: the greater of the
 * transparent input and output counts, plus the greater of the Sapling spends
 * and outputs, plus the Orchard actions. It is exact for standard P2PKH
 * transactions and understates a transaction with oversized scripts, because a
 * `LeakReport` carries counts and not serialised sizes - `views/tx.ts` has the
 * raw transaction and uses the size-based rule there. The two agree wherever
 * both can be computed, which is what stops /track and /tx contradicting each
 * other about the same transaction.
 */
function logicalActionsOf(r: LeakReport): number {
  const transparent = Math.max(r.transparent.vin.length, r.transparent.vout.length);
  const sapling = Math.max(r.bundle.saplingSpends.length, r.bundle.saplingOutputs.length);
  return transparent + sapling + r.bundle.orchardActions.length;
}

/** ZIP 317's conventional fee for a count of logical actions. Mirrors `views/tx.ts`. */
function conventionalFeeZat(logicalActions: number): bigint {
  const actions = BigInt(logicalActions);
  return (actions > 2n ? actions : 2n) * 5_000n;
}
