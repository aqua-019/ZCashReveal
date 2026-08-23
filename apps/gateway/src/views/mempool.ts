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
import type { LeakReport, MempoolRow, MempoolView, RpcTransaction, ShieldedPool } from "@zcashreveal/types";
import { ZIP317_GRACE_ACTIONS, conventionalFeeZat, zip317LogicalActionsP2pkhApproximation } from "@zcashreveal/types";

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

  // SUMMED OVER `perPoolZat`, NOT OVER TWO NAMED FIELDS. These read
  // `saplingValueBalanceZat + orchardValueBalanceZat`, so a JoinSplit moving
  // value out of Sprout contributed exactly nothing to the crossing totals
  // /track publishes. That is the same omission HANDOFF-05 rated HIGH in
  // `context.ts`'s `poolValueBalanceZat`, surviving in a second file because
  // the fix there was a new term rather than a new source. `perPoolZat` is that
  // source: the analyser builds it once, a pool that did not move is absent
  // from it, and a pool that becomes decodable appears here with no edit.
  const netCrossing = (r: LeakReport): bigint =>
    r.valueFlow.perPoolZat.reduce<bigint>((acc, p) => acc + p.deltaZat, 0n);
  const intoPool = reports.reduce<bigint>((acc, r) => {
    const net = netCrossing(r);
    return net < 0n ? acc - net : acc;
  }, 0n);
  const outOfPool = reports.reduce<bigint>((acc, r) => {
    const net = netCrossing(r);
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
   * `feeZat === 5000 * max(2, logicalActions)` - through the same
   * `conventionalFeeZat` that prices the tile above and `/tx`'s verdict, so the
   * curve has one author.
   *
   * A NULL FEE IS AN UNKNOWN, NOT A ZERO, and that is why the reports are split
   * in two first. `FingerprintAnnotation.feeZat` became nullable in HANDOFF-06 -
   * a fee is the difference between the outputs a transaction spends and the
   * ones it creates, and the spent side is not always resolvable - and
   * `null === 10_000n` is false, so an unpriced transaction would otherwise be
   * counted as one that failed to pay.
   */
  const priced = reports.filter((r) => r.fingerprint.feeZat !== null);
  const conventional = priced.filter((r) => r.fingerprint.feeZat === conventionalFeeZat(logicalActionsOf(r)));
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
      /*
       * THE CONVENTIONAL FEE, not a total of fees paid.
       *
       * The first version summed the fees of the transactions that pay it,
       * which is a different quantity from the one the field is named after and
       * a different quantity from the one `apps/web` renders it as: the fixture
       * at `apps/web/src/lib/api/fixtures/mempool.ts` sets it to 10,000 and
       * /track prints it under the subtitle "zat - ZIP 317 at 2 logical actions
       * - N of M conventional". A sum of fees under that subtitle is a false
       * label, and it would have appeared only when the gateway replaced the
       * fixture - the exact shape of defect HANDOFF-04's ledger warns about.
       *
       * So the gateway emits what the label says: ZIP 317's fee at the grace
       * minimum of two logical actions. `conventionalCount` beside it carries
       * how many transactions actually pay their own, which is the part that
       * varies.
       */
      conventionalFeeZat: conventionalFeeZat(ZIP317_GRACE_ACTIONS),
      conventionalCount: conventional.length,
      findingsHigh,
      findingsNote:
        findingsHigh === 0
          ? "No finding in the current mempool is rated HIGH."
          : `${countText(findingsHigh)} HIGH ${findingsHigh === 1 ? "finding" : "findings"} across the transactions below.`,
      feeWeather: feeWeatherText(entries.length, priced.length, conventional.length),
    },
  };
}

/**
 * The flow label for a migration, named after the pools that actually moved.
 *
 * IT WAS THE LITERAL `"S to O"`, for every migration, whichever pools were
 * involved. That was true while Sapling to Orchard was the only crossing this
 * project could see, and NU6.3 made it false: an Orchard-to-Ironwood migration
 * rendered on /track as "S to O", which is a specific wrong statement about a
 * specific transaction on the page the site exists to publish. The fixture
 * corpus already spelled the right thing - `apps/web`'s mempool fixture says
 * "O to I" - so the two also disagreed with each other.
 *
 * Initials, matching the fixture's spelling: Sprout, Sapling, Orchard,
 * Ironwood. Sprout and Sapling both begin with S, so Sprout takes "Sp".
 */
function migrationFlowText(pools: readonly ShieldedPool[]): string {
  const from = pools.filter((p, i) => pools.indexOf(p) === i);
  if (from.length < 2) return "migration";
  return from.map(poolInitial).join(" to ");
}

function poolInitial(pool: ShieldedPool): string {
  switch (pool) {
    case "sprout":
      return "Sp";
    case "sapling":
      return "S";
    case "orchard":
      return "O";
    case "ironwood":
      return "I";
  }
}

function mempoolRow(r: LeakReport, now: number): MempoolRow {
  const net = r.valueFlow.perPoolZat.reduce<bigint>((acc, p) => acc + p.deltaZat, 0n);
  const hasTransparent = r.transparent.vin.length + r.transparent.vout.length > 0;
  const hasSapling = r.bundle.saplingSpends.length + r.bundle.saplingOutputs.length > 0;
  const hasOrchard = r.bundle.orchardActions.length > 0;
  const hasSprout = r.valueFlow.sproutValueBalanceZat !== 0n;

  // THE LANE SWATCHES ARE WHAT A READER SEES FIRST, so a missing lane is a
  // stronger claim than a missing number: it says the transaction did not touch
  // that pool. Sprout was never pushed, so every Sprout transaction on /track
  // was drawn as transparent-only. `lanes` has accepted all five lanes since
  // HANDOFF-04; only the producer was short.
  const lanes: MempoolRow["lanes"] = [];
  if (hasTransparent) lanes.push("transparent");
  if (hasSprout) lanes.push("sprout");
  if (hasSapling) lanes.push("sapling");
  if (hasOrchard) lanes.push("orchard");
  if (lanes.length === 0) lanes.push("transparent");

  // Which pools this transaction actually moved value in, in the order the site
  // draws them. A migration is more than one, whichever two - keyed off
  // `hasSapling && hasOrchard` this said "migration" only for the crossing that
  // existed before NU6.3.
  const movedPools = r.valueFlow.perPoolZat.map((p) => p.pool);

  const klass: MempoolRow["class"] =
    r.valueFlow.direction === "DEPOSIT"
      ? "shield"
      : r.valueFlow.direction === "WITHDRAWAL"
        ? "deshield"
        : movedPools.length > 1
          ? "migration"
          : hasSprout || hasSapling || hasOrchard
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
            ? migrationFlowText(movedPools)
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
 * ZIP 317's logical-action count, as far as a `LeakReport` can carry it.
 *
 * THE OBVIOUS SUM DOUBLE-COUNTS ORCHARD. `FingerprintAnnotation.outputCount` is
 * `vout + saplingOutputs + orchardActions` and `spendCount` is
 * `vin + saplingSpends + orchardActions`, so `outputCount + spendCount` counts
 * every Orchard action TWICE - and that doubled figure was rendered to the
 * reader as the transaction's logical actions.
 *
 * THIS IS THE COUNT FORM, AND IT IS THE ONLY FORM AVAILABLE ON THIS PATH. ZIP
 * 317 measures the transparent term in serialised BYTES,
 * `max(ceil(inSize/150), ceil(outSize/34))`, and a `LeakReport` carries counts
 * and script TYPES rather than the scripts themselves, so the sizes cannot be
 * recovered from it. `views/tx.ts` has the raw transaction and uses the byte
 * rule there. The two agree while every input and output is a standard P2PKH
 * and diverge above it: a 2-of-3 P2SH multisig input serialises at 297 bytes,
 * so two of them cost the protocol four logical actions where this says two.
 * When `FingerprintAnnotation` carries the indexer's own byte-based count, this
 * function should read that instead of approximating.
 *
 * The arithmetic itself is `packages/zec-types/src/zip317.ts`'s and is called
 * rather than rewritten, because a fourth hand-written L is how /track and /tx
 * came to state two different action counts for one transaction. The argument
 * is a SHAPE, not a transaction: the approximation reads list LENGTHS and
 * nothing else, and five of the seven it looks for are exactly what a report
 * carries. The other two stay at zero because a `DecodedShieldedBundle` holds
 * neither: an Ironwood bundle needs the v6 decoder, which is HANDOFF-07's, and
 * Sprout moves value through JoinSplits without a decoded structure at all. So a
 * Sprout transaction's count is understated here by two per JoinSplit until they
 * arrive.
 */
function logicalActionsOf(r: LeakReport): number {
  return zip317LogicalActionsP2pkhApproximation({
    vin: r.transparent.vin,
    vout: r.transparent.vout,
    vShieldedSpend: r.bundle.saplingSpends,
    vShieldedOutput: r.bundle.saplingOutputs,
    orchard: { actions: r.bundle.orchardActions },
  } as unknown as RpcTransaction);
}

/**
 * The sentence under /track's conventional-fee tile.
 *
 * A TRANSACTION WHOSE FEE IS UNKNOWN IS NOT ONE THAT UNDERPAID. With the fee
 * nullable, "3 of 10 pay the ZIP 317 conventional fee" would be a claim about
 * seven transactions nobody priced. The denominator here is what could be
 * priced, and the remainder is stated rather than folded into the count.
 */
function feeWeatherText(unconfirmed: number, priced: number, conventional: number): string {
  if (unconfirmed === 0) return "Nothing is waiting.";
  const noun = unconfirmed === 1 ? "transaction" : "transactions";
  if (priced === 0) {
    return `No fee could be computed for any of the ${countText(unconfirmed)} ${noun} waiting, so none can be tested against ZIP 317.`;
  }
  if (priced < unconfirmed) {
    return `${countText(conventional)} of the ${countText(priced)} that could be priced pay the ZIP 317 conventional fee; ${countText(unconfirmed - priced)} could not be priced.`;
  }
  return conventional === unconfirmed
    ? "Every transaction in the mempool pays the ZIP 317 conventional fee."
    : `${countText(conventional)} of ${countText(unconfirmed)} pay the ZIP 317 conventional fee.`;
}
