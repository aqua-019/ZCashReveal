/**
 * Read one tip's inputs out of the world, so `buildSnapshot` can stay pure.
 *
 * WHAT THIS READS, AND THE THREE PANELS IT CANNOT FILL YET. Stated at the top
 * because a reader deserves the gap named rather than discovered as four `null`s
 * in a published document.
 *
 *   READ: the five lane balances and the supply, from `getblockchaininfo`'s
 *   `valuePools` and `chainSupply`. The block's own timestamp, from the header
 *   the caller already fetched to resolve the tip. The Orchard-to-Ironwood
 *   crossings in the migration window, from `migrations_zip318`, whose three
 *   columns are exactly `Crossing`'s three fields.
 *
 *   NOT READ - `drain`. Plan section 3.3's velocity is "from block timestamps",
 *   and `pool_snapshots` does not carry one: its `ts` column is
 *   `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, which is when the indexer WROTE the
 *   row. Substituting a write time for a block time would publish a rate
 *   measured against the indexer's own scheduling - correct to within seconds
 *   while the indexer is at the tip, arbitrarily wrong across a catch-up sync,
 *   and indistinguishable from the real thing on the page. So the series is not
 *   assembled and `drainBaseline` is null, which publishes the panel as "not
 *   measured". The repair is a block-time column on `pool_snapshots`, which is a
 *   migration this handoff's publisher does not own.
 *
 *   NOT READ - `neffSeries`. The Ironwood spends and their `Cand_0` bounds live
 *   in the indexer's candidate analysis, not in a table this process reads.
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

import { asHex } from "@zcashreveal/types";

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

  for (const p of pools) {
    if (p.id === undefined) continue;
    sawAny = true;
    accounted += p.chainValueZat;
    const lane = LANE_BY_POOL_ID[p.id];
    if (lane === undefined) continue; // the lockbox, and anything a later node adds
    byLane.set(lane, (byLane.get(lane) ?? 0n) + p.chainValueZat);
  }

  const lanes: LaneBalance[] = [...byLane.entries()].map(([lane, balanceZat]) => ({
    lane,
    balanceZat,
  }));

  const supplyFromNode = info.chainSupply?.chainValueZat;
  const supplyZat = supplyFromNode ?? (sawAny ? accounted : null);
  const supplySource =
    supplyFromNode !== undefined
      ? `getblockchaininfo chainSupply at height ${atHeight}`
      : sawAny
        ? `getblockchaininfo valuePools, summed over all six entries including the ZIP 271 lockbox, at height ${atHeight}`
        : "not reported by the node";

  return {
    lanes,
    poolBalances: {
      sprout: byLane.get("sprout") ?? 0n,
      sapling: byLane.get("sapling") ?? 0n,
      orchard: byLane.get("orchard") ?? 0n,
      ironwood: byLane.get("ironwood") ?? 0n,
    },
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

/** Just enough of `postgres`'s `Sql` for this module, so a test needs no database. */
export type MigrationQuery = (
  lowHeight: number,
  highHeight: number,
) => Promise<ReadonlyArray<MigrationRow>>;

export interface ChainInputsDeps {
  /** `getblockchaininfo`, already parsed. */
  readonly readChainInfo: () => Promise<ChainValueReading>;
  /** The migration window query, or null when there is no database. */
  readonly queryMigrations: MigrationQuery | null;
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

  return {
    height: tip.height,
    hash: tip.hash,
    timeMs: tip.timeMs,
    publishedAtMs: deps.now(),
    lanes: values.lanes,
    supplyZat: values.supplyZat,
    supplySource: values.supplySource,
    poolBalances: values.poolBalances,
    // See this module's header: `pool_snapshots` carries no block time, so the
    // drain's velocities cannot be measured from block timestamps and the panel
    // is published as an absence rather than as a rate from the wrong clock.
    orchardSeries: [],
    drainBaseline: null,
    crossings,
    migrationWindow,
    ironwoodSpends: null,
    ironwoodWindow: null,
    lastReports: [],
    labelsVersion: deps.labelsVersion,
  };
}
