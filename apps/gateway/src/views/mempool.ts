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
import type {
  Hex,
  LeakReport,
  MempoolRow,
  MempoolView,
  RpcTransaction,
  ShieldedPool,
  Zatoshi,
} from "@zcashreveal/types";
import { ZIP317_GRACE_ACTIONS, conventionalFeeZat, zip317LogicalActionsP2pkhApproximation } from "@zcashreveal/types";

import { versionText } from "./context.js";
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

  // THE TWO PRODUCERS OF THIS FIELD MEANT DIFFERENT THINGS BY IT, AND /track
  // RENDERS WHICHEVER MODE IT IS IN. This counted `class === "shielded"` alone
  // - the RESIDUAL class, the one a transaction lands in when it touched a pool
  // and none of the more specific labels fits it - while
  // `apps/web/src/lib/api/fixtures/mempool.ts`
  // counted `shield | deshield | shielded` under the heading "anything that
  // touches a shielded pool and is not a migration". On thirteen rows that is 3
  // against 7, published as the same header string and the same headline tile.
  // A gate round rated it HIGH under CLAUDE.md's sweep rule, because HANDOFF-07
  // is where the meaning of the number was decided and asserted - on one side.
  //
  // The fixture's reading wins, and not by seniority: a `shield` transaction
  // moved value into a shielded pool, so counting it out of "shielded" leaves
  // it in no bucket at all, and the three figures /track prints beside each
  // other then account for less than the mempool without saying so.
  // `mixed` JOINS THIS NUMERATOR IN HANDOFF-08 under the arbitration above,
  // applied rather than re-argued: a `mixed` transaction moved value between
  // shielded pools, so counting it out leaves it in no bucket while
  // `decodedCount` still counts it in the denominator.
  const shielded = entries.filter(
    (e) =>
      e.class === "shield" ||
      e.class === "deshield" ||
      e.class === "shielded" ||
      e.class === "mixed",
  ).length;
  const migrations = entries.filter((e) => e.class === "migration").length;
  const transparent = entries.filter((e) => e.class === "transparent").length;
  // THE DENOMINATOR FOR ANY SHARE OF THE MEMPOOL, and it is not `entries.length`.
  // An `undecoded` row is a transaction the decoder declined to read, so it is
  // evidence of nothing - and dividing by a total that includes it makes it
  // evidence AGAINST whatever is being measured. /track's shielded-share tile
  // read "8 of 13" while the undecoded row was counted as shielded and "7 of
  // 13" after it was not: four points of the same statistic, manufactured twice
  // out of one unreadable transaction, in opposite directions.
  //
  // `summary.pricedCount` exists for exactly this reason one field over
  // (HANDOFF-06: "'N of 12' would be a claim about the transactions nobody
  // priced"). This is that rule reused rather than rediscovered.
  const decodedCount = entries.filter((e) => e.class !== "undecoded").length;
  // A MIGRATION CROSSES A POOL BOUNDARY, so it belongs in this count. It was
  // `shield || deshield` only, which was consistent while the migration class
  // was unreachable and became a self-contradiction the moment the ordering
  // above was fixed: `crossingZat` sums `perPoolZat` over EVERY row, so a
  // mempool of two migrations printed a gold-accented "0.0002 ZEC" tile above
  // the subtitle "Nothing in the mempool crosses a pool boundary." The tile and
  // its own caption have to be counted over the same set.
  // COUNTED BY THE SAME FUNCTION THAT SUMS THE FIGURE, which is the only form
  // of this that cannot drift. It was a filter over three CLASS names, and a
  // class is a label the row producer derives - so narrowing the `migration`
  // class in the round before dropped a real crossing out of this set while
  // `crossingZat` below went on summing it over every report. A mempool holding
  // one Sapling-to-Orchard transfer that also paid a transparent address then
  // rendered a gold-accented "1.0000 ZEC" above the caption "Nothing in the
  // mempool crosses a pool boundary." That is the identical self-contradiction
  // the comment above records being fixed one handoff earlier, reintroduced
  // from the other side by a change to a different file.
  //
  // `crossingOf` is the answer to "did value cross a pool boundary", so the
  // caption asks it rather than asking what the row is called. A future class
  // rename cannot separate the two again.
  const crossings = reports.filter((r) => {
    const c = crossingOf(r);
    return c.into > 0n || c.out > 0n;
  });

  // SUMMED OVER `perPoolZat`, NOT OVER TWO NAMED FIELDS. These read
  // `saplingValueBalanceZat + orchardValueBalanceZat`, so a JoinSplit moving
  // value out of Sprout contributed exactly nothing to the crossing totals
  // /track publishes. That is the same omission HANDOFF-05 rated HIGH in
  // `context.ts`'s `poolValueBalanceZat`, surviving in a second file because
  // the fix there was a new term rather than a new source. `perPoolZat` is that
  // source: the analyser builds it once, a pool that did not move is absent
  // from it, and a pool that becomes decodable appears here with no edit.
  // THREE DESTINATIONS, NOT TWO, AND A MIGRATION IS THE THIRD. The split used
  // to be a sign test on the SUM of a transaction's per-pool deltas, which put
  // every transaction into "in" or "out" - and for a pool-to-pool crossing that
  // sum is the FEE, because the two legs cancel. So a mempool holding a 500 ZEC
  // Orchard-to-Ironwood migration reported a crossing of 0.005 ZEC.
  //
  // It was correct by accident until this handoff: Ironwood was not decoded, so
  // such a transaction had only its Orchard leg in `perPoolZat` and the sum WAS
  // the amount. Decoding the second leg is what turns the same arithmetic into
  // the fee, and no test would have caught it because the arithmetic did not
  // change - which is HANDOFF-06's lesson about widening a type, arriving in a
  // file nobody widened.
  //
  // The design corpus already says which quantity this tile means:
  // `apps/web/src/lib/api/fixtures/mempool.ts` builds `crossingZat` as
  // `tToZ + zToT + oToI` where the migration row contributes `500.0` - the
  // amount that crossed, not the fee it left behind. This now matches it, and
  // a pool-to-pool crossing is counted in its own term rather than being
  // squeezed into a direction it does not have.
  let intoPool = 0n;
  let outOfPool = 0n;
  let betweenPools = 0n;
  for (const r of reports) {
    const c = crossingOf(r);
    if (c.out > 0n && c.into > 0n) betweenPools += c.out >= c.into ? c.out : c.into;
    else if (c.out > 0n) outOfPool += c.out;
    else if (c.into > 0n) intoPool += c.into;
  }

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
      decodedCount,
      bytes: reports.reduce((acc, r) => acc + (sizes[r.txid]?.size ?? 0), 0),
      // The TARGET interval, and that is the right answer to "how long until
      // the next block" rather than a lazy one. Block arrival is a Poisson
      // process, so the expected remaining wait is the mean interval however
      // long has already elapsed - the memorylessness is what makes a constant
      // correct here. Zcash's target has been 75 s since Blossom.
      nextBlockSeconds: TARGET_BLOCK_SECONDS,
      crossingZat: intoPool + outOfPool + betweenPools,
      crossingSplit:
        crossings.length === 0
          ? "Nothing in the mempool crosses a pool boundary."
          : `${zecText(intoPool)} in, ${zecText(outOfPool)} out, ${zecText(betweenPools)} between pools, across ${countText(crossings.length)} ${crossings.length === 1 ? "transaction" : "transactions"}.`,
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
      pricedCount: priced.length,
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
 * involved - and, as the gate found, for NO migration, because the branch that
 * reached it was unreachable. Both halves of that are worth stating: the label
 * was wrong for any crossing that is not Sapling to Orchard, AND the reason
 * nobody had noticed is that `summary.migrations` was permanently zero and no
 * row ever carried it. Fixing the ordering above is what makes this function
 * live, so the label had to be right before the branch could be opened.
 *
 * The fixture corpus already spelled the right thing - `apps/web`'s mempool
 * fixture says "O to I" - so the producer and the fixture disagreed as well.
 */
/**
 * The flow caption for a row class.
 *
 * A SWITCH WITH AN EXHAUSTIVENESS CHECK, NOT A TERNARY CHAIN WITH A TRAILING
 * ELSE. The chain this replaces ended `: "t to t"`, so every member it did not
 * name - including any future one - was published as a transparent-to-transparent
 * flow. That is not a missing caption, it is a false one, and on a site whose
 * thesis is that a transparent transaction publishes its addresses it is the
 * worst available default. `assertNeverClass` makes the next widening fail `tsc`
 * at this site instead.
 */
function flowTextFor(klass: MempoolRow["class"], r: LeakReport): string {
  switch (klass) {
    case "shield":
      return "t to z";
    case "deshield":
      return "z to t";
    case "migration":
      return migrationFlowText(r.valueFlow.perPoolZat);
    case "mixed":
      // It crossed pools AND has a public side, so the caption names both halves
      // rather than picking one. `migrationFlowText` renders the pool crossing;
      // the suffix is what distinguishes this row from a migration.
      return `${migrationFlowText(r.valueFlow.perPoolZat)} + t`;
    case "shielded":
      return "shielded";
    case "transparent":
      return "t to t";
    case "undecoded":
      return "not decoded";
    default:
      return assertNeverClass(klass);
  }
}

function assertNeverClass(k: never): never {
  throw new Error(`unhandled mempool row class: ${JSON.stringify(k)}`);
}

function migrationFlowText(deltas: ReadonlyArray<{ pool: ShieldedPool; deltaZat: bigint }>): string {
  // DIRECTION COMES FROM THE SIGN, NOT FROM THE ORDER OF THE LIST. `perPoolZat`
  // is built in canonical pool order - sprout, sapling, orchard - regardless of
  // which side of the crossing each pool is on, so reading the label off that
  // order printed "S to O" for a transaction moving value from Orchard INTO
  // Sapling. That is the same class of false statement as the hardcoded
  // "S to O" this function replaced, arrived at by a different route, and it
  // was invisible until the ordering fix above made the branch reachable.
  //
  // Positive means value LEFT the pool, so positives are sources and negatives
  // are sinks.
  const from = deltas.filter((d) => d.deltaZat > 0n).map((d) => d.pool);
  const to = deltas.filter((d) => d.deltaZat < 0n).map((d) => d.pool);
  if (from.length === 0 || to.length === 0) return "migration";
  // More than one pool on a side is a shape this label cannot describe without
  // inventing a grammar for it, and "P to S to O" is not a flow. Say the
  // number instead of guessing the story.
  if (from.length > 1 || to.length > 1) return `${from.length + to.length} pools`;
  return `${poolInitial(from[0]!)} to ${poolInitial(to[0]!)}`;
}

/**
 * One pool, one letter, in the abbreviation the corpus already settled on.
 *
 * SPROUT AND SAPLING BOTH BEGIN WITH S, so one of them cannot have its own
 * initial and something has to say which. This function used to answer "Sp",
 * which is a coinage: grep the tree and it appears in no other file, no
 * fixture and no mockup. The corpus had already written the mapping down -
 * `apps/web/src/lib/api/fixtures/mempool.ts` states "O, I, S, P for Orchard,
 * Ironwood, Sapling and Sprout" over the column that prints these same four
 * pools - so Sapling keeps S and SPROUT IS P, which is not a typo.
 *
 * Taking the mapping from there rather than inventing one is the whole point.
 * The flow column and the value-balance column sit beside each other in one
 * table, and a pool abbreviated two ways across two columns of one row is a
 * second spelling of the same concept, which is a defect this session has
 * already fixed once. The fixture's `flow: "O to I"` is what this function has
 * to reproduce, and it does.
 *
 * Spelling the pools out in full would also be legible - the cell has no
 * nowrap and the table lays out automatically - but it would put "orchard to
 * ironwood" in the gateway's flow column against "O to I" in the fixture's,
 * which is the disagreement this is avoiding rather than a fix for it.
 */
function poolInitial(pool: ShieldedPool): string {
  switch (pool) {
    case "sprout":
      return "P";
    case "sapling":
      return "S";
    case "orchard":
      return "O";
    case "ironwood":
      return "I";
  }
}

function mempoolRow(r: LeakReport, now: number): MempoolRow {
  // A REPORT THAT MEASURED NOTHING GETS A ROW THAT CLAIMS NOTHING, AND IT HAS
  // TO BE DECIDED HERE, FIRST. Every field below is recomputed from `valueFlow`
  // and the decoded bundles - deliberately, so /tx and /track cannot state two
  // different things about one transaction - and on an `UNSUPPORTED_TX` report
  // every one of those inputs is empty. Falling through would therefore produce
  // `class: "transparent"`, `flow: "t to t"`, "no net crossing" and "Nothing
  // this transaction publishes distinguishes it from any other of its shape":
  // four confident statements about a transaction the decoder declined to read.
  //
  // The flag is read, never the zeros. That is the contract `LeakReport.
  // unsupported` states, and this is the surface it was written for.
  if (r.unsupported !== undefined) {
    return {
      txid: r.txid,
      ageSeconds: Math.max(0, Math.round((now - r.seenAt) / 1000)),
      // Through the shared helper, not a second copy of the rule. The inline
      // ternary this replaces is where the false `v6` came from, and it was a
      // second derivation of a quantity the module already imports one for -
      // the split this file's own docblocks forbid.
      version: versionText(r.txVersion),
      flow: "not decoded",
      // Empty rather than `["transparent"]`. A lane swatch is a claim that the
      // transaction touched that lane, and nothing here can make one.
      lanes: [],
      valueBalanceText: "not measured",
      feeZat: null,
      // NOT `0`. Nothing counted them, and `L = 0` is a measurement no
      // transaction can produce - ZIP 317 prices `max(2, L)`, so zero is
      // outside the quantity's range rather than merely unusual.
      logicalActions: null,
      walletGuess: r.fingerprint.likelyWallet,
      finding: r.unsupported.reason,
      severity: "INFO",
      class: "undecoded",
      reasoning: [
        `This transaction is version ${r.unsupported.version}, and the decoder declined to read it: ${r.unsupported.reason}.`,
        "Nothing on this row is a measurement. The pools, the fee and the flow are all absent rather than zero, because reading a shape this build does not model would produce numbers with no source.",
        `Top-level fields the node sent: ${r.unsupported.rawFieldNames.join(", ")}.`,
      ],
    };
  }

  const net = netCrossingZat(r);
  const hasTransparent = r.transparent.vin.length + r.transparent.vout.length > 0;
  const hasSapling = r.bundle.saplingSpends.length + r.bundle.saplingOutputs.length > 0;
  const hasOrchard = r.bundle.orchardActions.length > 0;
  const hasIronwood = r.bundle.ironwoodActions.length > 0;
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
  // IRONWOOD PUSHED SINCE HANDOFF-07, AND THE FALLBACK BELOW IS WHY IT MATTERS
  // MORE THAN SPROUT'S DID. `lanes` has accepted five members since HANDOFF-04
  // and this producer emitted at most four, so a pure-Ironwood transaction
  // failed every test above and fell through to `["transparent"]` - not an
  // omission but an affirmative claim that a fully shielded transaction had a
  // transparent side.
  if (hasIronwood) lanes.push("ironwood");
  if (lanes.length === 0) lanes.push("transparent");

  // Which pools this transaction actually moved value in, in the order the site
  // draws them. A migration is more than one, whichever two - keyed off
  // `hasSapling && hasOrchard` this said "migration" only for the crossing that
  // existed before NU6.3.
  const movedPools = r.valueFlow.perPoolZat.map((p) => p.pool);

  /**
   * ASSERTION A9, APPLIED HERE TOO. The indexer's `LeakClass` learned that a
   * class naming the transparent side requires a transparent side; this is the
   * same rule for the same reason on the row /track actually renders, and the
   * two must not diverge - a reader comparing /tx with /track would otherwise
   * see one page call a transaction a migration and the other call it a shield.
   *
   * TWO DEFECTS ARE FIXED BY THE ORDER OF THESE TESTS. `direction` was tested
   * FIRST, and every transaction that moves a pool at all has a `direction` of
   * DEPOSIT or WITHDRAWAL - so the migration branch below it was UNREACHABLE
   * for every input, `summary.migrations` was permanently zero, and a
   * Sapling-to-Orchard migration was published as `class: "shield"`,
   * `flow: "t to z"` while the same row printed "no net crossing". The row
   * contradicted itself and made a transparent-side claim about a transaction
   * with no transparent side.
   *
   * So the migration test goes first, and shield and deshield now require the
   * transparent half they name.
   */
  // A MIGRATION IS A CROSSING WITH NO PUBLIC SIDE, HERE AS WELL AS IN THE
  // CLASSIFIER. `movedPools.length > 1` alone published `class: "migration"`
  // and `flow: "S to O"` for a Sapling-to-Orchard transfer that also paid a
  // transparent address - a public recipient standing in the same row the site
  // labels a pool-to-pool migration - and the indexer's classifier had just
  // been taught to refuse exactly that shape. The two then disagreed about one
  // transaction: /tx reads `leakClass` straight off the report and said MIXED
  // while /track said migration, which is the divergence ASSERTION A9 and the
  // docblock above this ternary both forbid. A gate round found the fix had
  // landed in the classifier and not in the producer that renders it.
  const crossesWithNoPublicSide =
    movedPools.length > 1 && r.transparent.vin.length === 0 && r.transparent.vout.length === 0;

  const klass: MempoolRow["class"] =
    crossesWithNoPublicSide
      ? "migration"
      : // A POOL CROSSING WITH A PUBLIC SIDE IS `mixed`, AND IT IS TESTED BEFORE
        // `shield` AND `deshield` RATHER THAN AFTER THEM. That ordering is the
        // whole substance of the member: `direction` is DEPOSIT whenever ANY
        // pool leg is negative, so a Sapling-to-Orchard transfer with a
        // transparent input satisfies the `shield` test - and would have been
        // published as `shield`, `flow: "t to z"`, for a transaction whose
        // transparent side is one end of three.
        //
        // `shield` and `deshield` name the direction of a SINGLE pool's
        // movement across the transparent boundary. Once more than one pool
        // moved, there is no single direction to name, which is why the test
        // for that has to come first. This is the same argument the migration
        // test above already makes, one class further down.
        movedPools.length > 1
        ? "mixed"
        : r.valueFlow.direction === "DEPOSIT" && r.transparent.vin.length > 0
        ? "shield"
        : r.valueFlow.direction === "WITHDRAWAL" && r.transparent.vout.length > 0
          ? "deshield"
          : // IRONWOOD BELONGS IN THIS TEST TOO, AND IT WAS ADDED TO THE LANE
            // LIST ABOVE AND NOT HERE. An ordinary z-to-z transfer inside
            // Ironwood - which is what most shielded traffic becomes after
            // NU6.3 - has no transparent side, no Sapling, no Orchard and a
            // zero Ironwood balance, so it fell past every test and landed on
            // "transparent". The row then printed flow "t to t" beside its own
            // Ironwood lane swatch, counted into `summary.transparent`, and
            // contradicted /tx, whose classifier calls the same transaction
            // PURE_SHIELDED. On a site whose thesis is that a transparent
            // transaction publishes its addresses, that is a false statement
            // about the transaction and not a missing one.
            // AND `shielded` REMAINS THE RESIDUAL, NOW FOR A SINGLE POOL ONLY.
            // An ordinary z-to-z transfer inside one pool lands here, which is
            // what most shielded traffic becomes after NU6.3. Every multi-pool
            // shape has been claimed above it by `migration` or `mixed`, so this
            // residual no longer absorbs a crossing it cannot describe -
            // which is what it was doing until HANDOFF-08.
            hasSprout || hasSapling || hasOrchard || hasIronwood
            ? "shielded"
            : "transparent";

  const reasoning = r.findings.length > 0
    ? r.findings.map((f) => `${f.code}: ${f.message}`)
    : ["No finding was raised for this transaction. That is a statement about what it publishes, not about who sent it."];

  return {
    txid: r.txid,
    ageSeconds: Math.max(0, Math.round((now - r.seenAt) / 1000)),
    // The same helper the unsupported branch above uses. Two copies of the
    // version rule in one file is how the branch above came to publish `v6`
    // for a version 7 while this one said the same thing about a v1.
    version: versionText(r.txVersion),
    // THE TRAILING ARM USED TO BE `: "t to t"` AND WOULD HAVE PRINTED A
    // TRANSPARENT FLOW BESIDE TWO POOL LANE SWATCHES for a `mixed` row - the
    // same false statement the Ironwood case above records being fixed. It is a
    // switch with an exhaustiveness check now, so the NEXT member is a compile
    // error here rather than a wrong caption.
    flow: flowTextFor(klass, r),
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
 * nothing else, and six of the seven terms it looks for are what a report
 * carries. Ironwood joined them in HANDOFF-07 - the excuse for omitting it was
 * that `DecodedShieldedBundle` did not hold one, and it now does, so leaving it
 * out would understate the count for exactly the transactions NU6.3 produces
 * while `docs/2.0/API.md` tells readers the rule counts "every Orchard and
 * Ironwood action".
 *
 * SPROUT IS THE ONE STILL MISSING, and it cannot be fixed the same way: Sprout
 * moves value through JoinSplits with no decoded structure on the report at
 * all, so a Sprout transaction's count is understated here by two per
 * JoinSplit. `views/tx.ts` has the raw transaction and does not have this gap.
 */
function logicalActionsOf(r: LeakReport): number {
  // A REAL `RpcTransaction` SHAPE RATHER THAN A CAST. The old form went through
  // `as unknown as RpcTransaction`, which is what let the Ironwood term be
  // silently absent: a cast agrees with whatever the author wrote. Every field
  // below is now checked by the compiler against the declared interface, and
  // the fields this approximation does not read are supplied as the empty
  // values they would have on a transaction with none of them.
  const shape: RpcTransaction = {
    txid: r.txid,
    version: r.txVersion,
    locktime: 0,
    vin: r.transparent.vin.map(() => ({ sequence: 0 })),
    vout: r.transparent.vout.map((_o, n) => ({
      value: 0,
      valueZat: 0,
      n,
      scriptPubKey: { asm: "", hex: EMPTY_HEX, type: "" },
    })),
    vShieldedSpend: r.bundle.saplingSpends.map(() => EMPTY_SAPLING_SPEND),
    vShieldedOutput: r.bundle.saplingOutputs.map(() => EMPTY_SAPLING_OUTPUT),
    orchard: { actions: r.bundle.orchardActions.map(() => EMPTY_ORCHARD_ACTION), valueBalanceZat: 0 },
    ironwood: { actions: r.bundle.ironwoodActions.map(() => EMPTY_ORCHARD_ACTION), valueBalanceZat: 0 },
  };
  return zip317LogicalActionsP2pkhApproximation(shape);
}

/**
 * Placeholder members for the shape above.
 *
 * The approximation reads LIST LENGTHS and the transparent counts, and nothing
 * else - so the contents of these are never inspected. They exist so the shape
 * can be a declared `RpcTransaction` instead of a cast, which is the whole
 * point: the compiler now checks that every list this function fills is a list
 * the interface has, and would have caught the missing Ironwood term.
 */
const EMPTY_HEX = "00" as Hex;
const EMPTY_SAPLING_SPEND = {
  cv: EMPTY_HEX,
  anchor: EMPTY_HEX,
  nullifier: EMPTY_HEX,
  rk: EMPTY_HEX,
  proof: EMPTY_HEX,
  spendAuthSig: EMPTY_HEX,
} as const;
const EMPTY_SAPLING_OUTPUT = {
  cv: EMPTY_HEX,
  cmu: EMPTY_HEX,
  ephemeralKey: EMPTY_HEX,
  encCiphertext: EMPTY_HEX,
  outCiphertext: EMPTY_HEX,
  proof: EMPTY_HEX,
} as const;
const EMPTY_ORCHARD_ACTION = {
  cv: EMPTY_HEX,
  nullifier: EMPTY_HEX,
  rk: EMPTY_HEX,
  cmx: EMPTY_HEX,
  ephemeralKey: EMPTY_HEX,
  encCiphertext: EMPTY_HEX,
  outCiphertext: EMPTY_HEX,
  spendAuthSig: EMPTY_HEX,
} as const;

/**
 * The net value a transaction moved across pool boundaries.
 *
 * A MIGRATION HAS TWO LEGS AND THEIR SUM IS THE FEE, NOT THE CROSSING. Until
 * HANDOFF-07 this was a plain reduce over `perPoolZat`, and it was correct by
 * accident: an Orchard-to-Ironwood crossing had only its Orchard leg in the
 * array, because Ironwood was not decoded, so the reduce returned the amount
 * that crossed. Decoding the second leg turns that same reduce into
 * `+500 ZEC + -499.995 ZEC = 0.005 ZEC`, and /track would have reported five
 * thousandths of a ZEC as the crossing for a mempool holding a 500 ZEC pool
 * migration - a number that is not wrong by a little, and one no test would
 * have caught because the arithmetic never changed.
 *
 * So the magnitude is taken from the LARGER SIDE rather than from the sum: the
 * value that left the pools it left, which for a migration is the amount that
 * crossed and for a plain shield or deshield is the same number the reduce used
 * to give. The sign is kept - negative means value went into the pools on net -
 * because the callers use it to decide the in/out split.
 *
 * The residue between the two sides is the fee, and it is deliberately NOT
 * reported here: `fingerprint.feeZat` is where the fee lives, computed from the
 * inputs a transaction spends, and a second derivation of one quantity is how
 * `summary.conventionalFeeZat` came to mean two things in HANDOFF-05.
 */
function crossingOf(r: LeakReport): { out: Zatoshi; into: Zatoshi } {
  let out = 0n;
  let into = 0n;
  for (const p of r.valueFlow.perPoolZat) {
    if (p.deltaZat > 0n) out += p.deltaZat;
    else into -= p.deltaZat;
  }
  return { out, into };
}

/**
 * One signed number for the row's own value-balance cell.
 *
 * The magnitude is the LARGER SIDE, not the sum, for the reason above: for a
 * migration the sum is the fee. The sign keeps the row's existing meaning -
 * negative when value went into the pools on net - so the cell reads the same
 * for every transaction that is not a pool-to-pool crossing, and reads the
 * amount rather than the fee for one that is.
 */
function netCrossingZat(r: LeakReport): Zatoshi {
  const { out, into } = crossingOf(r);
  if (out === 0n && into === 0n) return 0n;
  return out >= into ? out : -into;
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
