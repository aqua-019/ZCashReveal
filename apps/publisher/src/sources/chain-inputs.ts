/**
 * Read one tip's inputs out of the world, so `buildSnapshot` can stay pure.
 *
 * WHAT THIS READS, AND THE ONE PANEL IT STILL CANNOT FILL. Stated at the top
 * because a reader deserves the gap named rather than discovered as a `null` in
 * a published document.
 *
 *   READ: the five lane balances and the supply, from `getblockchaininfo`'s
 *   `valuePools` and `chainSupply`. The block's own timestamp, from the header
 *   the caller already fetched to resolve the tip. The Orchard-to-Ironwood
 *   crossings in the migration window, from `migrations_zip318`, whose three
 *   columns are exactly `Crossing`'s three fields.
 *
 *   READ SINCE HANDOFF-09b - `drain`. Plan section 3.3's velocity is "from block
 *   timestamps", and until migration 005 there was no block timestamp in this
 *   schema at all. `pool_snapshots.ts` is `TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
 *   the moment the indexer WROTE the row; substituting it would publish a rate
 *   measured against the indexer's own scheduling - correct to within seconds at
 *   the tip, arbitrarily wrong across a catch-up sync, and indistinguishable
 *   from the real thing on the page. The series now joins `blocks`, so every
 *   `timeMs` on it comes from a block header. A snapshot whose height has no
 *   `blocks` row is DROPPED from the series rather than timestamped from a
 *   fallback, and `orchardDrain`'s `sampleCount` reports the shortfall.
 *
 *   READ SINCE HANDOFF-09b - `neffSeries`. `IronwoodSpend.candidateCount` is
 *   Cand_0, which `rawCandidateRange` defines as `pool_anchors.max_position + 1`.
 *   That bound was already on disk; what no table could say was WHICH anchor a
 *   spend cited. Migration 005 adds `pool_nullifiers.anchor_root` and this module
 *   joins it, LEFT, so a spend whose anchor is unknown still comes back - with a
 *   NULL bound, which is `rawCandidateRange` returning null, "a candidate count
 *   cannot be claimed". `ironwoodSpendsFromRows` drops it, and the row count it
 *   was drawn from is published as `windowSpendCount`, so a share computed over
 *   the bounded subset cannot be read as a statement about the window.
 *
 *   NOT READ - `lastReports`. `mempoolRowSchema`'s fields are a VIEW - the flow
 *   text, the version text, the lane list, the severity - computed by
 *   `apps/gateway/src/views/mempool.ts` from a `LeakReport`. The raw reports are
 *   on the VPS Redis and this process could read them, but re-deriving that view
 *   here would be a second implementation of it, and two implementations of one
 *   view is how two surfaces come to disagree about the same transaction.
 *
 * NONE OF THOSE IS A ZERO. `SnapshotV1` makes every panel nullable precisely so
 * that "not measured" is expressible, and SNAPSHOT.md section 8.1 states the
 * rule this file obeys: "a `null` renders as an absence and a zero renders as a
 * measurement".
 */

import { asHex, type Pool } from "@zcashreveal/types";
import type { IronwoodSpend, PoolBalanceSample } from "@zcashreveal/instruments";

import type { PublisherConfig } from "../config.js";
import type { Crossing } from "../instruments.js";
import type { HeightWindow, LaneBalance, SnapshotInputs } from "../snapshot-builder.js";
import type { Tip } from "../publisher.js";

/**
 * Which `valuePools` id is which site lane. `lockbox` is deliberately absent.
 *
 * SIX POOLS ON THE WIRE, FIVE LANES ON THE SITE, and the sixth is the ZIP 271
 * lockbox - the protocol's own reserve, not a lane value moves along. Folding it
 * into `transparent` would overstate the transparent supply while hiding a
 * balance this site has an argument about. `apps/gateway/src/views/pools.ts`
 * makes the same split for the same reason.
 */
const LANE_BY_POOL_ID: Readonly<Record<string, LaneBalance["lane"]>> = {
  transparent: "transparent",
  sprout: "sprout",
  sapling: "sapling",
  orchard: "orchard",
  ironwood: "ironwood",
};

/** One `valuePools` entry, as this module reads it. */
export interface ValuePoolEntry {
  readonly id?: string | undefined;
  readonly chainValueZat: bigint;
}

/** What `getblockchaininfo` gives this module. */
export interface ChainValueReading {
  readonly valuePools?: ReadonlyArray<ValuePoolEntry> | undefined;
  readonly chainSupply?: { readonly chainValueZat: bigint } | undefined;
}

/** The lanes, the shielded balances and the supply, from one node reading. */
export interface ChainValues {
  readonly lanes: ReadonlyArray<LaneBalance>;
  readonly poolBalances: Readonly<Partial<Record<"sprout" | "sapling" | "orchard" | "ironwood", bigint>>>;
  readonly supplyZat: bigint | null;
  readonly supplySource: string;
}

/**
 * Split one `valuePools` reading into lanes, shielded balances and a supply.
 *
 * THE SUPPLY'S SOURCE TRAVELS WITH IT, because plan section 3.2 requires it:
 * "Supply from `getblockchaininfo` `valuePools`/issuance - document the source",
 * and the two answers differ. `chainSupply` is what the chain reports as minted;
 * summing `valuePools` is what it can account for. A reader comparing this
 * site's residual share against another's needs to know which was used, so the
 * string names it rather than a comment in a file they will not read.
 *
 * A NODE THAT REPORTS NO POOLS GIVES `supplyZat: null`, NOT ZERO. A zero supply
 * would make the residual share `U/0`, and the honest reading of a node that did
 * not answer is that the measurement was not taken.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function readChainValues(info: ChainValueReading, atHeight: number): ChainValues {
  const byLane = new Map<LaneBalance["lane"], bigint>([
    ["transparent", 0n],
    ["sprout", 0n],
    ["sapling", 0n],
    ["orchard", 0n],
    ["ironwood", 0n],
  ]);
  const pools = info.valuePools ?? [];
  let sawAny = false;
  let accounted = 0n;
  /** The lanes the node NAMED, as against the five `byLane` is seeded with. */
  const reportedLanes = new Set<LaneBalance["lane"]>();

  for (const p of pools) {
    if (p.id === undefined) continue;
    sawAny = true;
    accounted += p.chainValueZat;
    const lane = LANE_BY_POOL_ID[p.id];
    if (lane === undefined) continue; // the lockbox, and anything a later node adds
    reportedLanes.add(lane);
    byLane.set(lane, (byLane.get(lane) ?? 0n) + p.chainValueZat);
  }

  const lanes: LaneBalance[] = [...byLane.entries()].map(([lane, balanceZat]) => ({
    lane,
    balanceZat,
  }));

  const supplyFromNode = info.chainSupply?.chainValueZat;
  // A NON-POSITIVE `chainSupply` MUST NOT SUPPRESS THE `valuePools` FALLBACK
  // (round 3, L3). `supplyFromNode ?? ...` resolves first, so a node reporting
  // `chainSupply: 0n` alongside a complete five-lane reading dropped the whole
  // residual panel even though `accounted` was a perfectly good sum. Each
  // candidate is now tested for positivity in its own right.
  const fromNode = supplyFromNode !== undefined && supplyFromNode > 0n ? supplyFromNode : null;
  const fromPools = sawAny && accounted > 0n ? accounted : null;
  const reported = fromNode ?? fromPools;
  // A NON-POSITIVE SUPPLY IS NOT A MEASUREMENT, IT IS A NON-ANSWER. `U/Supply`
  // is undefined at zero and `turnstileResidual` refuses it, and `?? ` does not
  // catch a `0n` because zero is not nullish. A regtest node, a node at genesis
  // or any reading that sums to zero produced a `supplyZat: 0n` that reached the
  // estimator. Routed to the same branch this module already means by "the node
  // did not answer" (gate round 1, M2).
  const supplyZat = reported;
  // "not reported" AND "reported A NON-ANSWER" ARE DIFFERENT FACTS and the
  // string used to conflate them: a node that answered `chainSupply: 0n` was
  // described as not having answered. Never published - the residual is null
  // whenever the supply is - but it is what a diagnostic log would carry.
  const supplySource =
    supplyZat === null
      ? supplyFromNode !== undefined || sawAny
        ? `getblockchaininfo answered at height ${atHeight} with no positive supply, so none is claimed`
        : "not reported by the node"
      : fromNode !== null
        ? `getblockchaininfo chainSupply at height ${atHeight}`
        : `getblockchaininfo valuePools, summed over all six entries including the ZIP 271 lockbox, at height ${atHeight}`;

  return {
    lanes,
    // ONLY THE LANES THE NODE ACTUALLY REPORTED, and the `?? 0n` that used to be
    // here was a live defect (gate round 1, H2). `byLane` is pre-seeded with
    // zeros so that `lanes` above always carries five entries for the site to
    // render; reading `poolBalances` out of the same map made every pool key
    // PRESENT whatever the node said, which defeated `turnstileResidual`'s
    // deliberate refusal - "an absent balance is not a zero balance, and
    // treating it as one would overstate the verified share".
    //
    // `valuePools` is `.optional()` in `blockchainInfoSchema`. A reading with
    // `chainSupply` present and `valuePools` absent or partial therefore
    // published `U = 0`, `unprovableShare = 0` and `verifiedShare = 1` - "100
    // per cent of supply is verified" - stamped with a `supplySource` naming the
    // node and the height, as a MEASUREMENT. Dropping only sprout moved the
    // headline figure from 0.95669 to 0.95803, in the wrong direction. It was
    // latent until HANDOFF-09a wired the real estimator; before that the panel
    // was null and nothing was claimed.
    // The cast restores the key constraint `Object.fromEntries` erases: it
    // infers `{ [k: string]: bigint }`, which is assignable to the target and no
    // longer says anything about the key NAMES, so adding "transparent" to the
    // array above would compile clean and put a non-`Pool` key in (round 3, L4).
    // The `as const` array plus the annotated entries are what make the cast a
    // statement rather than a hope.
    poolBalances: Object.fromEntries(
      (["sprout", "sapling", "orchard", "ironwood"] as const)
        .filter((lane) => reportedLanes.has(lane))
        .map((lane): readonly [Pool, bigint] => [lane, byLane.get(lane) ?? 0n]),
    ) as ChainValues["poolBalances"],
    supplyZat,
    supplySource,
  };
}

/** One `migrations_zip318` row, as Postgres hands it back. */
export interface MigrationRow {
  readonly txid: string;
  readonly height: number;
  /** `NUMERIC(20,0)`, which the driver returns as a decimal string. */
  readonly amount_zat: string;
}

/**
 * Read `migrations_zip318` rows as crossings.
 *
 * `NUMERIC` ARRIVES AS A STRING AND IS PARSED WITH `BigInt`, NEVER `Number`.
 * That is the whole reason the column is `NUMERIC(20,0)` rather than `BIGINT`
 * (migration 003's own note), and `Number("2100000000000000")` losing precision
 * is the failure this project counts zatoshi to avoid.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function crossingsFromRows(rows: ReadonlyArray<MigrationRow>): Crossing[] {
  return rows.map((r) => ({
    txid: asHex(r.txid),
    height: r.height,
    amountZat: BigInt(r.amount_zat),
  }));
}

/** One `pool_snapshots` row joined to its `blocks` row, as Postgres hands it back. */
export interface OrchardSeriesRow {
  readonly height: number;
  /** `NUMERIC(20,0)`, which the driver returns as a decimal string. */
  readonly balance_zat: string;
  /** `blocks.time_s` - unix SECONDS. `BIGINT`, so also a string. */
  readonly time_s: string;
}

/**
 * One Ironwood spend, LEFT-joined to the anchor that bounds it.
 *
 * `max_position` IS NULLABLE BECAUSE THE JOIN IS A LEFT JOIN, and that
 * nullability is load-bearing: it is what distinguishes "no Ironwood spend
 * happened in this window" from "spends happened and none could be bounded".
 * See `queries.ts` for why an inner join made those two indistinguishable and
 * published the second as a measurement of zero.
 */
export interface IronwoodSpendRow {
  readonly spent_txid: string;
  readonly spent_height: number;
  /** Read from the row, never assumed - see `queries.ts`. */
  readonly pool: string;
  /** `pool_anchors.max_position`, `NUMERIC(20,0)`, so a string. Cand_0 is this plus one. */
  readonly max_position: string | null;
}

/**
 * Milliseconds in a second - the ONE declaration in this app.
 *
 * `index.ts` declared a second one of the same name and the same value for the
 * tip header's conversion, and migration 005's comment then named the wrong one
 * as the place `blocks.time_s` crosses the unit boundary (gate round 1, LOW).
 * Two constants of one name in one app is how a later reader comes to believe a
 * conversion happens somewhere it does not, so there is now one and `index.ts`
 * imports it.
 */
export const MS_PER_SECOND = 1_000;

/**
 * Turn joined rows into the samples `orchardDrain` reads.
 *
 * `time_s` IS SECONDS ON THE WIRE AND MILLISECONDS ON THE SAMPLE, and this is
 * the only place the conversion happens. `blocks.time_s` stores the header's own
 * integer because that is what the chain states; `PoolBalanceSample.timeMs` is
 * milliseconds because every estimator in this project is. Doing it here rather
 * than in the column means a reader of the table sees the same number
 * `zcash-cli getblockheader` prints.
 *
 * `Number` for the time and `BigInt` for the balance, which is not an
 * inconsistency: a unix second is far below 2^53 and a zatoshi balance is not.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function orchardSeriesFromRows(
  rows: ReadonlyArray<OrchardSeriesRow>,
): PoolBalanceSample[] {
  return rows.map((r) => ({
    height: r.height,
    timeMs: Number(r.time_s) * MS_PER_SECOND,
    balanceZat: BigInt(r.balance_zat),
  }));
}

/**
 * Turn joined rows into the spends `ironwoodBirth` reads.
 *
 * `candidateCount` IS `max_position + 1n` AND IS NOT STORED. That is
 * `rawCandidateRange`'s own definition - positions are 0-indexed inclusive, so a
 * tree whose highest occupied position is 9 bounds ten candidates. Deriving it
 * from `pool_anchors` rather than storing it beside the spend keeps one source
 * of truth for a number the anchor already determines, and means a spend whose
 * anchor is unknown produces no row at all rather than a zero: `candidateCount >
 * 0n` is `ironwoodBirth`'s admission rule, so a manufactured zero would exclude
 * the spend silently while looking like a measurement.
 *
 * Pure. No I/O, no clock, no mutation of the input array.
 */
export function ironwoodSpendsFromRows(
  rows: ReadonlyArray<IronwoodSpendRow>,
): IronwoodSpend[] {
  const out: IronwoodSpend[] = [];
  for (const r of rows) {
    // A ROW WITH NO ANCHOR IS DROPPED HERE RATHER THAN BY THE SQL, so the caller
    // can still see how many spends there were. That count is the difference
    // between a measurement of zero and a stated absence.
    if (r.max_position === null) continue;
    // A NON-POSITIVE BOUND IS A DEFECT, NOT AN EXCLUSION (gate round 2, LOW).
    // `BigInt("-5") + 1n` is `-4n`, `ironwoodBirth` drops it on
    // `candidateCount > 0n`, and the document then carries `spendCount: 0` and
    // `requires_disclosure: 0` - verbatim what migration 005's own prose says
    // this design refuses, "a manufactured zero would SILENTLY EXCLUDE a spend
    // while looking like a measurement". The live `CHECK (max_position >= 0)`
    // makes it unreachable from the database, and this function is EXPORTED and
    // takes rows from any source, so the guard is one comparison rather than an
    // assumption. It throws because the caller wraps this parse and turns a
    // throw into a stated absence with a logged reason.
    const candidateCount = BigInt(r.max_position) + 1n;
    if (candidateCount <= 0n) {
      throw new RangeError(
        `ironwoodSpendsFromRows: max_position ${r.max_position} for txid ${r.spent_txid} gives ` +
          `Cand_0 = ${candidateCount}, which is not a candidate set`,
      );
    }
    out.push({
      txid: asHex(r.spent_txid),
      height: r.spent_height,
      // READ FROM THE ROW. Stamping `"ironwood"` here made `ironwoodBirth`'s
      // first admission rule inert, because the value it tests was manufactured.
      pool: r.pool as IronwoodSpend["pool"],
      candidateCount,
    });
  }
  return out;
}

/** Just enough of `postgres`'s `Sql` for this module, so a test needs no database. */
export type MigrationQuery = (
  lowHeight: number,
  highHeight: number,
) => Promise<ReadonlyArray<MigrationRow>>;

/** The Orchard balance series over a height window, already joined to `blocks`. */
export type OrchardSeriesQuery = (
  lowHeight: number,
  highHeight: number,
) => Promise<ReadonlyArray<OrchardSeriesRow>>;

/**
 * The drain's denominator: the Orchard balance at or below the baseline height.
 *
 * Returns null when no snapshot exists at or below it, which suppresses the
 * panel. That is the honest answer rather than an inconvenience: `orchardDrain`
 * THROWS on a non-positive baseline, because `D = 1 - current/baseline` is
 * undefined there and "a pool that held nothing cannot drain".
 */
export type DrainBaselineQuery = (
  baselineHeight: number,
) => Promise<{ readonly height: number; readonly balance_zat: string } | null>;

/** Ironwood spends in a height window, joined to the anchors that bound them. */
export type IronwoodSpendQuery = (
  lowHeight: number,
  highHeight: number,
) => Promise<ReadonlyArray<IronwoodSpendRow>>;

/**
 * Where an input-layer fault is reported.
 *
 * `panel` is the snapshot panel whose inputs were lost, so the log line names
 * what the reader will not see. A missing sink means faults are swallowed, which
 * is why `readSnapshotInputs` defaults it to a no-op ONLY for tests and the
 * composition root always supplies one.
 */
export type InputFault = (panel: string, err: unknown) => void;

export interface ChainInputsDeps {
  /** `getblockchaininfo`, already parsed. */
  readonly readChainInfo: () => Promise<ChainValueReading>;
  /** Reports a query that failed, so a lost panel is never a silent absence. */
  readonly onInputFault?: InputFault | undefined;
  /** The migration window query, or null when there is no database. */
  readonly queryMigrations: MigrationQuery | null;
  /** The drain's series query, or null when there is no database. */
  readonly queryOrchardSeries: OrchardSeriesQuery | null;
  /** The drain's baseline query, or null when there is no database. */
  readonly queryDrainBaseline: DrainBaselineQuery | null;
  /** The N_eff series query, or null when there is no database. */
  readonly queryIronwoodSpends: IronwoodSpendQuery | null;
  readonly cfg: PublisherConfig;
  readonly labelsVersion: string;
  /** The clock, injected. Supplies `publishedAt`, which the builder must not read. */
  readonly now: () => number;
}

/**
 * Assemble one tip's inputs.
 *
 * A FAILING MIGRATION QUERY IS AN EMPTY WINDOW AND A LOGGED FAULT, NOT A FAILED
 * PUBLISH - the caller decides, and this function reports it by returning no
 * crossings with a null window rather than by rejecting. Losing one panel is a
 * smaller failure than losing the document that carries the other four, which is
 * the same trade `writeToAllSinks` makes between sinks.
 */
export async function readSnapshotInputs(
  deps: ChainInputsDeps,
  tip: Tip,
): Promise<SnapshotInputs> {
  const info = await deps.readChainInfo();
  const values = readChainValues(info, tip.height);

  // EVERY QUERY IS WRAPPED, AND UNTIL THE GATE NONE OF THEM WAS. This function's
  // docblock has promised since HANDOFF-09 that "a failing migration query is an
  // empty window and a logged fault, NOT a failed publish" - and there was no
  // `try` anywhere in the body. Executed by the gate: a rejecting query
  // PROPAGATED, `SnapshotPublisher` caught it as a build failure, and the tip
  // published NOTHING - no document at all, so `pools`, `residual` and
  // `lastReports` went with it. HANDOFF-09b went from one query to four under
  // that promise, quadrupling the exposure, which is what makes it this
  // handoff's to fix rather than an inherited defect to note.
  //
  // The row PARSES are inside the wrapper too, and that is the half a
  // `try` around the await alone would miss. `BigInt` and `asHex` throw on a
  // malformed value, and malformed values are reachable: `NUMERIC(20,0)` accepts
  // `'NaN'`, and `max_position`'s `CHECK (>= 0)` does not exclude it because
  // Postgres sorts NaN ABOVE every number - verified against a real Postgres 16,
  // where the INSERT succeeds and `BigInt("NaN")` then throws a SyntaxError.
  // A THROWING SINK MUST NEVER COST THE DOCUMENT (gate round 2, LOW). `fault` is
  // called INSIDE the `try` in three places and again inside the `catch`, where a
  // second throw is unguarded - so a logger that rejected turned a panel loss
  // into exactly the whole-document loss this wrapper exists to prevent.
  const sink: InputFault = deps.onInputFault ?? (() => undefined);
  const fault: InputFault = (panel, err) => {
    try {
      // `void` IN `InputFault` DOES NOT FORBID AN ASYNC SINK - TypeScript's
      // void-return assignability admits `Promise<void>` - and a rejected
      // promise escapes a `catch` entirely. Executed: an `async` sink that
      // throws produced an UNHANDLED REJECTION that reached the process, which
      // on Node 22 is an exit - worse than the document loss this guard was
      // added to prevent (gate round 3). Both halves are caught.
      void Promise.resolve(sink(panel, err)).catch(() => undefined);
    } catch {
      /* a broken sink is not worth the document it would cost */
    }
  };
  async function panelInputs<T>(panel: string, read: () => Promise<T>, absent: T): Promise<T> {
    try {
      return await read();
    } catch (err) {
      fault(panel, err);
      return absent;
    }
  }

  const lowHeight = Math.max(0, tip.height - deps.cfg.SNAPSHOT_MIGRATION_WINDOW_BLOCKS + 1);
  const migration = await panelInputs(
    "migrationHist",
    async (): Promise<{ crossings: Crossing[]; window: HeightWindow | null }> => {
      if (deps.queryMigrations === null) return { crossings: [], window: null };
      return {
        crossings: crossingsFromRows(await deps.queryMigrations(lowHeight, tip.height)),
        window: { lowHeight, highHeight: tip.height },
      };
    },
    { crossings: [], window: null },
  );

  // THE DRAIN. Both halves are required and neither substitutes for the other:
  // the SERIES carries the current balance and the two velocities, and the
  // BASELINE is the denominator of `D = 1 - current/baseline`. A series with no
  // baseline cannot form D, and a baseline with no series has no current
  // balance, so either being absent suppresses the panel rather than producing
  // half of it.
  const drainLow = Math.max(0, tip.height - deps.cfg.SNAPSHOT_DRAIN_WINDOW_BLOCKS + 1);
  const drain = await panelInputs(
    "drain",
    async (): Promise<{
      series: PoolBalanceSample[];
      baseline: { height: number; zat: bigint } | null;
    }> => {
      if (deps.queryOrchardSeries === null || deps.queryDrainBaseline === null) {
        return { series: [], baseline: null };
      }
      const series = orchardSeriesFromRows(await deps.queryOrchardSeries(drainLow, tip.height));
      const row = await deps.queryDrainBaseline(deps.cfg.SNAPSHOT_DRAIN_BASELINE_HEIGHT);
      if (row === null) return { series, baseline: null };
      const zat = BigInt(row.balance_zat);
      // A NON-POSITIVE BASELINE IS AN ABSENCE **WITH A REASON**, not a silent
      // one. `orchardDrain` throws on `baselineZat <= 0n` because
      // `D = 1 - current/baseline` is undefined there. The first draft routed it
      // to `null` and logged nothing, so a ZIP 209 violation - which
      // `turnstileResidual` calls "our replay being wrong, never the chain" -
      // vanished from the page with no trace anywhere.
      if (zat <= 0n) {
        fault("drain", new RangeError(`drain baseline at height ${row.height} is ${zat}, not positive`));
        return { series, baseline: null };
      }
      return { series, baseline: { height: row.height, zat } };
    },
    { series: [], baseline: null },
  );

  // THE N_eff SERIES, AND THE `null`/`[]` DISTINCTION IS THE WHOLE OF IT.
  // `buildNeffSeries` reads `null` as "not measured" and `[]` as "measured, and
  // no spend qualified" - two different claims, and SNAPSHOT.md section 8.1
  // turns on the difference. The query LEFT-joins so both facts arrive: how many
  // spends there were, and how many could be bounded.
  // CLAMPED TO THE BIRTH HEIGHT, NOT JUST TO ZERO. `ironwoodBirth` admits a spend
  // only at or above `birthHeight`, so for the first window-length of blocks
  // after NU6.3 an unclamped low bound asks for spends from before the pool
  // existed and the estimator drops them - silently, because `buildNeffSeries`
  // discards the audit record that would carry `countIn - countOut`. That is the
  // same shape as the birth-height conflation this file refuses below: a series
  // that quietly narrows and still reads as a measurement. Clamping makes the
  // query's row count and the series' point count agree.
  //
  // IT DOES NOT MAKE `ironwoodWindow.lowHeight` "truthful about what was
  // searched", which an earlier draft claimed (gate round 2, MEDIUM):
  // `snapshotNeffSeriesSchema` carries no window at all, so nothing published
  // ever shows it. The claim was about a field the document does not have.
  const ironwoodLow = Math.max(
    0,
    deps.cfg.SNAPSHOT_IRONWOOD_BIRTH_HEIGHT,
    tip.height - deps.cfg.SNAPSHOT_IRONWOOD_WINDOW_BLOCKS + 1,
  );
  const ironwood = await panelInputs(
    "neffSeries",
    async (): Promise<{
      spends: IronwoodSpend[] | null;
      window: (HeightWindow & { birthHeight: number; spendsInWindow: number }) | null;
    }> => {
      if (deps.queryIronwoodSpends === null) return { spends: null, window: null };
      // A TIP BELOW THE BIRTH HEIGHT IS A POOL THAT DOES NOT EXIST YET, AND IT
      // IS A STATED ABSENCE RATHER THAN AN INVERTED WINDOW (gate round 2,
      // MEDIUM). The clamp above has no upper bound at the tip, so on any tip
      // below NU6.3 - every block of an initial sync, and every block on a
      // network whose configured birth height sits above the tip - it produced
      // `[birthHeight, tip]` with the low end ABOVE the high end.
      // `ironwoodBirth` throws on an inverted window, `buildSnapshot` caught it,
      // and the only line an operator saw was "analysis panel refused its
      // inputs" - blaming the estimator for a window the input layer
      // manufactured, which is exactly the discrimination
      // `instruments-wired.test.ts` exists to protect. Once per block, for
      // millions of blocks.
      //
      // It also made a path `ironwoodBirth` documents as correct unreachable
      // from here: "a `highHeight` below `birthHeight` is NOT an error: it is a
      // window before the pool existed, and the empty series is the correct
      // answer to it."
      if (deps.cfg.SNAPSHOT_IRONWOOD_BIRTH_HEIGHT > tip.height) {
        // NOTHING IS REPORTED HERE, AND ROUND 3'S FIX REPORTED A FAULT (gate
        // round 4, F-46-1). It corrected the RENDERING layer and left the LOG
        // layer stating the falsehood it had just removed: the branch returned a
        // measurement and still called `fault("neffSeries", ...)`, whose one
        // production wiring in `index.ts` logs at ERROR "an input query failed;
        // publishing that panel as a stated absence". Both halves false, on
        // every one of ~3.4 million blocks of an initial sync. Demonstrated with
        // a `queryIronwoodSpends` that throws if it is called: it never is.
        //
        // NO REPORT AT ALL, RATHER THAN A SEPARATE NON-FAULT CHANNEL, and the
        // argument is that there is nothing to say. Four reasons, in order:
        //
        //   NOTHING HAPPENED. This is not a failure, not an absence and not an
        //   anomaly. The pool does not exist at this height, the empty series is
        //   the correct measurement of it, and `ironwoodBirth` documents that in
        //   as many words.
        //
        //   THE DOCUMENT ALREADY CARRIES IT, at the surface that has readers.
        //   The snapshot's top-level `height` and the panel's `birthHeight` are
        //   both REQUIRED fields, and `height < birthHeight` IS "the pool does
        //   not exist yet" - measured on a pre-birth tip as 3,428,142 against
        //   3,428,143. A log line addressed to one operator answers a question
        //   the document already answers for everyone, including the
        //   misconfiguration case: a `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` set far
        //   above the real birth is visible as a published `birthHeight` that is
        //   simply wrong.
        //
        //   NOT the WINDOW, which an earlier draft of this comment named and
        //   which is NOT published: `snapshotNeffSeriesSchema` carries
        //   `birthHeight`, `series`, `spendCount`, `windowSpendCount` and
        //   `shares`, and `buildNeffSeries` drops the window. Gate round 3
        //   established that and corrected the clamp comment above for it; this
        //   comment then made the same claim again, in the commit fixing an
        //   instance of exactly this shape. Caught by measuring the published
        //   document rather than re-reading the sentence.
        //
        //   A CONTINUOUS EXPECTED LINE IS NOT WHAT THE RUNBOOK'S PRECEDENT
        //   COVERS. `RUNBOOK-VPS.md` carries "zmq unavailable # expected, once"
        //   - an expected line that fires ONCE and is triaged once. This one
        //   fires per block for an entire initial sync, and a continuous
        //   expected line at any severity trains an operator to filter the
        //   panel, taking the real `neffSeries` fault with it - the one the
        //   round-2 unresolvable-anchor fixture exists to produce.
        //
        //   AND IT WOULD BE INCONSISTENT. A tip ABOVE the birth height with no
        //   spends in its window makes the identical claim - "measured, and it
        //   is zero" - and reports nothing. Reporting one zero and not the other
        //   would make the log's meaning depend on which of two true zeros
        //   produced it.
        //
        // MEASURED AND EMPTY, NOT ABSENT (gate round 3). Returning `null` here
        // published the same `neffSeries: null` as "no Ironwood spend source",
        // and SNAPSHOT.md section 8.1 makes that null render as "needs an
        // Ironwood spend source (HANDOFF-09b)" - naming a handoff for an absence
        // no handoff can close, on every block of an initial sync. That document
        // draws the distinction against itself one line later: a CONDITION, not
        // an owner, is what an absence of this kind names.
        //
        // `[]` is also the answer `ironwoodBirth` documents as correct, which
        // the first version of this guard quoted and then made unreachable: "a
        // `highHeight` below `birthHeight` is NOT an error: it is a window
        // before the pool existed, and the empty series is the correct answer to
        // it." A degenerate one-block window keeps the estimator's own
        // precondition (`lowHeight <= highHeight`) satisfied.
        return {
          spends: [],
          window: {
            lowHeight: tip.height,
            highHeight: tip.height,
            birthHeight: deps.cfg.SNAPSHOT_IRONWOOD_BIRTH_HEIGHT,
            spendsInWindow: 0,
          },
        };
      }
      const rows = await deps.queryIronwoodSpends(ironwoodLow, tip.height);
      const spends = ironwoodSpendsFromRows(rows);
      const window = {
        lowHeight: ironwoodLow,
        highHeight: tip.height,
        // THE BIRTH HEIGHT IS ITS OWN CONFIGURED VALUE, NOT THE DRAIN BASELINE,
        // even though both default to NU6.3 and coincide on mainnet. The drain
        // baseline is a CHART ORIGIN an operator may legitimately re-base -
        // `orchardDrain`'s docblock says so, "a chart re-based to a later
        // height" - and a birth height is a CONSENSUS FACT. Sharing them meant
        // re-basing the drain chart silently shortened this series.
        birthHeight: deps.cfg.SNAPSHOT_IRONWOOD_BIRTH_HEIGHT,
        // THE POPULATION, NOT THE MEASURED COUNT. `rows` is every Ironwood spend
        // in the window; `spends` is the subset whose anchor resolved. The panel
        // publishes both so a share computed over the second cannot be read as a
        // statement about the first.
        spendsInWindow: rows.length,
      };
      // SPENDS EXIST AND NONE COULD BE BOUNDED IS AN ABSENCE, NOT A ZERO. This
      // is the state of every database that has just applied 005: `anchor_root`
      // is nullable with no backfill, so every pre-existing spend resolves to no
      // anchor. Publishing `[]` there makes `buildNeffSeries` emit
      // `spendCount: 0` and `requires_disclosure: 0` - the site stating, as a
      // measured finding, that no Ironwood spend requires disclosure. An empty
      // WINDOW is a different matter and stays `[]`: nothing happened, and that
      // really is a measurement of zero.
      if (rows.length > 0 && spends.length === 0) {
        fault(
          "neffSeries",
          new RangeError(
            `${rows.length} Ironwood spend(s) in [${ironwoodLow}, ${tip.height}] and none carries a ` +
              "resolvable anchor, so Cand_0 cannot be claimed for any of them",
          ),
        );
        return { spends: null, window: null };
      }
      // A PARTIAL LOSS IS REPORTED THOUGH THE PANEL STILL PUBLISHES. The series
      // is honest about what it measured, but `buildNeffSeries` drops
      // `ironwoodBirth`'s audit record, so `countIn - countOut` reaches no
      // reader; this log line is the only place the gap is stated.
      if (spends.length < rows.length) {
        fault(
          "neffSeries",
          new RangeError(
            `${rows.length - spends.length} of ${rows.length} Ironwood spend(s) carry no resolvable ` +
              "anchor and are excluded from the series",
          ),
        );
      }
      return { spends, window };
    },
    { spends: null, window: null },
  );

  return {
    height: tip.height,
    hash: tip.hash,
    timeMs: tip.timeMs,
    publishedAtMs: deps.now(),
    lanes: values.lanes,
    supplyZat: values.supplyZat,
    supplySource: values.supplySource,
    poolBalances: values.poolBalances,
    orchardSeries: drain.series,
    drainBaseline: drain.baseline,
    crossings: migration.crossings,
    migrationWindow: migration.window,
    ironwoodSpends: ironwood.spends,
    ironwoodWindow: ironwood.window,
    lastReports: [],
    labelsVersion: deps.labelsVersion,
  };
}
