/**
 * How this process opens Postgres, and what the mempool path does without it.
 *
 * THE SHAPE IS `apps/publisher/src/index.ts`'s `chainAccessFor`, REUSED RATHER
 * THAN REINVENTED (HANDOFF-14). Its two rationales carry over unchanged:
 *
 *   A FUNCTION AND NOT AN `if` INSIDE `main`, because `main` reads the
 *   environment, opens sockets and exits the process, so nothing can call it.
 *   A8 asserts that NO client is constructed in mempool-only mode, and the only
 *   honest way to assert that is to watch the constructor and see it not called
 *   - which needs a seam.
 *
 *   `connect` DEFAULTS TO THE REAL DRIVER so the composition root reads as it
 *   did. The default is what production uses; the parameter is what the
 *   assertion substitutes.
 *
 * WHAT IS DIFFERENT HERE, AND IT IS THE INTERESTING HALF. The publisher's
 * absent database removes three panels from a document. The indexer's removes a
 * WRITE and a READ from a live path, and the read has a consumer that has been
 * reading it since HANDOFF-06:
 *
 *   persistLeakReport   a write. Absent, the report still reaches Redis and the
 *                       gateway, because `publishDiff` publishes and `hset`s
 *                       independently of it. What is lost is history, not the
 *                       live view.
 *   getHeightForAnchor  a read, on the hot path, per shielded spend. Absent,
 *                       the memo and Redis still answer; a root in neither
 *                       resolves to `null`, which `leak-analyzer.ts` already
 *                       renders as an unknown depth graded LOW. It must NEVER
 *                       resolve to 0 - a depth of zero is a claim that the
 *                       anchor is the tip, which is the strongest statement
 *                       this analyser can make about a spend, manufactured out
 *                       of a table nobody read.
 *
 * SO THE NULL OBJECT IS `NO_CHAIN_WRITES` AND IT IS NAMED RATHER THAN FOUR
 * `null`s AT THE CALL SITE, for the publisher's own stated reason: adding a
 * fifth database-backed capability breaks HERE, one place, with the type,
 * instead of silently leaving it bound to a connection that does not exist.
 */
import type { Sql } from "postgres";
import type { Redis } from "ioredis";
import type { LeakReport } from "@zcashreveal/types";

import { databaseUrl, type Config } from "./config.js";
import { AnchorRegistry, type AnchorHeightSource } from "./decoder/anchor-depth.js";
import { createDb, persistLeakReport } from "./persistence/index.js";
import { MemoryChainStore, PostgresChainStore, type ChainStore } from "./runtime/index.js";

/** How a caller opens Postgres. Injected so an assertion can watch it not happen. */
export type ConnectPostgres = (url: string) => Sql;

/** Persisting a report, or not. Null-object rather than a nullable callback. */
export type PersistReport = (report: LeakReport) => Promise<void>;

/** What this process can do with a database, and what it holds open. */
export interface ChainAccess {
  /** The client, or null in mempool-only mode. The caller closes it if not null. */
  readonly sql: Sql | null;
  /** The confirmed-block store, or null - which is what stops the follower starting. */
  readonly store: ChainStore | null;
  /** Anchor depths. Always present; answers null in mempool-only mode. */
  readonly anchors: AnchorHeightSource;
  /** Report persistence. Always present; a no-op in mempool-only mode. */
  readonly persist: PersistReport;
  /** Whether a reorg can forget anchors above a height. Null in mempool-only mode. */
  readonly forgetAnchorsAbove: ((height: number) => Promise<number>) | null;
  /** Recording an anchor from an applied block. Null in mempool-only mode. */
  readonly recordAnchor: ((anchor: string, height: number) => Promise<void>) | null;
}

/**
 * The mempool-only value.
 *
 * `getHeightForAnchor` RESOLVES `null` AND THAT IS A MEASUREMENT OF NOTHING,
 * NOT A MEASUREMENT OF ZERO. See the header. `persist` resolves without doing
 * anything and does not throw: a report that could not be filed is not a report
 * that could not be published, and turning the first into the second would take
 * the live view down to protect a history nobody asked for.
 */
export const NO_CHAIN_WRITES: Omit<ChainAccess, "sql" | "store"> = {
  anchors: { getHeightForAnchor: () => Promise.resolve(null) },
  persist: () => Promise.resolve(),
  forgetAnchorsAbove: null,
  recordAnchor: null,
};

export function chainAccessFor(
  cfg: Config,
  redis: Redis,
  connect: ConnectPostgres = (url) => createDb(url),
): ChainAccess {
  const url = databaseUrl(cfg);
  if (url === null) {
    /**
     * RUNG 3'S THIRD MODE: NO DATABASE, BUT A STORE (HANDOFF-16).
     *
     * WHY IT IS A THIRD MODE AND NOT A RELAXATION OF THE SECOND. Rung 2's
     * mempool-only mode does not start the follower at all, so nothing is
     * indexed and no crossing is ever counted - which is correct for rung 2 and
     * is exactly what rung 3 exists to change. `MemoryChainStore` implements the
     * same `ChainStore` contract as `PostgresChainStore`, including the
     * per-table rollback a reorg needs, so the driver, the reorg walk and the
     * pool state all run against it unmodified.
     *
     * WHAT IT COSTS, STATED HERE BECAUSE THE COST IS INVISIBLE FROM THE OUTSIDE.
     * The store is the process's memory. A restart loses every block applied and
     * reopens the base at `INDEXER_START_HEIGHT`, so `migrationHist` starts
     * again from that height and the crossings counted before the restart are
     * gone. That is a real property of this mode and `describeMode` says it on
     * every start rather than leaving an operator to discover it from a chart
     * that reset overnight.
     *
     * THE ANCHOR REGISTRY IS STILL ABSENT, AND THAT IS NOT AN OVERSIGHT.
     * `AnchorRegistry` is Redis in front of Postgres; without the table its
     * `getHeightForAnchor` must answer null - a measurement of nothing - and
     * NEVER zero, which would be a claim that the anchor is the tip
     * (`NO_CHAIN_WRITES`'s docblock above). `recordAnchor` stays null for the
     * same reason: recording into a registry whose reads cannot be trusted
     * would make a depth out of half a record.
     */
    if (cfg.INDEXER_CHAIN_STORE === "memory") {
      return { sql: null, store: new MemoryChainStore(), ...NO_CHAIN_WRITES };
    }
    return { sql: null, store: null, ...NO_CHAIN_WRITES };
  }

  const sql = connect(url);
  const registry = new AnchorRegistry(redis, sql);
  return {
    sql,
    store: new PostgresChainStore(sql),
    anchors: registry,
    persist: (report) => persistLeakReport(sql, report),
    forgetAnchorsAbove: (height) => registry.forgetAbove(height),
    recordAnchor: (anchor, height) => registry.record(anchor, height),
  };
}

/**
 * The one line that says which mode this process is in.
 *
 * AT `info` AND NOT AT `warn`, on HANDOFF-14's precedent and for its reason: an
 * absent database is a configuration, not a failure. An operator who chose
 * mempool-only should not be told every start that something is wrong.
 */
export function describeMode(access: ChainAccess): {
  readonly mode: string;
  readonly absent: string;
  readonly message: string;
} {
  if (access.sql === null && access.store !== null) {
    return {
      mode: "memory-chain",
      absent: "durability, anchor depth, report history",
      message:
        "no DATABASE_URL with INDEXER_CHAIN_STORE=memory: the confirmed-block follower runs against an IN-MEMORY store. " +
        "Crossings accrue from the start height forward and are LOST ON RESTART - the base reopens at INDEXER_START_HEIGHT " +
        "and nothing backfills what was counted before. Anchor depth reads as unknown rather than zero",
    };
  }
  if (access.sql === null) {
    return {
      mode: "mempool-only",
      absent: "confirmed blocks, pool state, reorg handling, anchor depth, report history",
      message:
        "no DATABASE_URL: running the mempool path alone. Anchor depth reads as unknown rather than zero, and reports are published but not persisted",
    };
  }
  return {
    mode: "full",
    absent: "none by configuration",
    message: "DATABASE_URL set: running the confirmed-block follower and the mempool path",
  };
}
