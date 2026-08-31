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
 *   joins it. A spend whose anchor is unknown yields no count and is excluded by
 *   the join, which is `rawCandidateRange` returning null - "a candidate count
 *   cannot be claimed" - arriving as an absent row rather than as a zero.
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
import type { LaneBalance, SnapshotInputs } from "../snapshot-builder.js";
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

/** One Ironwood spend joined to the anchor that bounds it. */
export interface IronwoodSpendRow {
  readonly spent_txid: string;
  readonly spent_height: number;
  /** `pool_anchors.max_position`, `NUMERIC(20,0)`, so a string. Cand_0 is this plus one. */
  readonly max_position: string;
}

/** Milliseconds in a second. The one place this module converts the chain's unit. */
const MS_PER_SECOND = 1000;

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
  return rows.map((r) => ({
    txid: asHex(r.spent_txid),
    height: r.spent_height,
    pool: "ironwood" as const,
    candidateCount: BigInt(r.max_position) + 1n,
  }));
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

export interface ChainInputsDeps {
  /** `getblockchaininfo`, already parsed. */
  readonly readChainInfo: () => Promise<ChainValueReading>;
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

  const lowHeight = Math.max(0, tip.height - deps.cfg.SNAPSHOT_MIGRATION_WINDOW_BLOCKS + 1);
  let crossings: Crossing[] = [];
  let migrationWindow: { lowHeight: number; highHeight: number } | null = null;
  if (deps.queryMigrations !== null) {
    crossings = crossingsFromRows(await deps.queryMigrations(lowHeight, tip.height));
    migrationWindow = { lowHeight, highHeight: tip.height };
  }

  // THE DRAIN. Both halves are required and neither substitutes for the other:
  // the SERIES carries the current balance and the two velocities, and the
  // BASELINE is the denominator of `D = 1 - current/baseline`. A series with no
  // baseline cannot form D, and a baseline with no series has no current
  // balance, so either being absent suppresses the panel rather than producing
  // half of it. `buildDrain` reads `drainBaseline` for exactly that reason.
  const drainLow = Math.max(0, tip.height - deps.cfg.SNAPSHOT_DRAIN_WINDOW_BLOCKS + 1);
  let orchardSeries: PoolBalanceSample[] = [];
  let drainBaseline: { height: number; zat: bigint } | null = null;
  if (deps.queryOrchardSeries !== null && deps.queryDrainBaseline !== null) {
    orchardSeries = orchardSeriesFromRows(await deps.queryOrchardSeries(drainLow, tip.height));
    const baseline = await deps.queryDrainBaseline(deps.cfg.SNAPSHOT_DRAIN_BASELINE_HEIGHT);
    // A NON-POSITIVE BASELINE IS ROUTED TO `null` RATHER THAN PASSED ON.
    // `orchardDrain` THROWS on `baselineZat <= 0n`, and a throw here would cost
    // the whole document to lose one panel - the trade `readSnapshotInputs`
    // already refuses for the migration query. A zero baseline is also not a
    // measurement: it is a height at which the pool held nothing, and "the pool
    // has drained 100 per cent" is a claim no reading supports.
    drainBaseline =
      baseline !== null && BigInt(baseline.balance_zat) > 0n
        ? { height: baseline.height, zat: BigInt(baseline.balance_zat) }
        : null;
  }

  // THE N_eff SERIES. The window is its own, not the migration lens's - see
  // `SNAPSHOT_IRONWOOD_WINDOW_BLOCKS`. `ironwoodSpends` is `null` rather than
  // `[]` when there is no database, because `buildNeffSeries` reads the null as
  // "not measured" and an empty array as "measured, and no spend qualified" -
  // two different claims, and SNAPSHOT.md section 8.1 turns on the difference.
  const ironwoodLow = Math.max(0, tip.height - deps.cfg.SNAPSHOT_IRONWOOD_WINDOW_BLOCKS + 1);
  let ironwoodSpends: IronwoodSpend[] | null = null;
  let ironwoodWindow: { lowHeight: number; highHeight: number; birthHeight: number } | null = null;
  if (deps.queryIronwoodSpends !== null) {
    ironwoodSpends = ironwoodSpendsFromRows(
      await deps.queryIronwoodSpends(ironwoodLow, tip.height),
    );
    // THE BIRTH HEIGHT IS ITS OWN CONFIGURED VALUE, NOT THE DRAIN BASELINE, even
    // though both default to NU6.3 and coincide on mainnet. A first draft read
    // the drain baseline here, arguing that one configured height is one thing
    // to get right instead of two. That was wrong, and the failure it produces
    // is silent: the drain baseline is a CHART ORIGIN an operator may
    // legitimately re-base - `orchardDrain`'s docblock says so in as many words,
    // "a chart re-based to a later height" - and a birth height is a CONSENSUS
    // FACT that cannot be re-based at all. Sharing them means re-basing the
    // drain chart also moves Ironwood's birth, `ironwoodBirth` then drops every
    // spend below the new value, and `neffSeries` shortens into a real
    // measurement of a window nobody asked for, with nothing on the page saying
    // so. See `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` in config.ts.
    ironwoodWindow = {
      lowHeight: ironwoodLow,
      highHeight: tip.height,
      birthHeight: deps.cfg.SNAPSHOT_IRONWOOD_BIRTH_HEIGHT,
    };
  }

  return {
    height: tip.height,
    hash: tip.hash,
    timeMs: tip.timeMs,
    publishedAtMs: deps.now(),
    lanes: values.lanes,
    supplyZat: values.supplyZat,
    supplySource: values.supplySource,
    poolBalances: values.poolBalances,
    orchardSeries,
    drainBaseline,
    crossings,
    migrationWindow,
    ironwoodSpends,
    ironwoodWindow,
    lastReports: [],
    labelsVersion: deps.labelsVersion,
  };
}
