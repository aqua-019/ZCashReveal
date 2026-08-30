/**
 * Publisher entry point: refuse or start, then publish one snapshot per new tip.
 *
 * Everything that decides behaviour is in the modules beside this file. This one
 * exists to do the four things a test must not: read `process.env`, read the
 * clock, open sockets to Postgres, the VPS Redis and the node, and exit the
 * process.
 *
 * THE ORDER OF THE FIRST FOUR STATEMENTS IS PART OF THE CONTRACT. Configuration,
 * logger, counter, gate - and the gate before ANY connection is opened. A12
 * requires that a publisher over its monthly ceiling "writes nothing to the
 * managed store", and the strongest way to satisfy that is for the refusal to
 * happen before a client to the managed store exists. It also means the refusal
 * costs nothing and cannot itself fail on an unrelated outage.
 *
 * "THE FILE SINK IS UNAFFECTED" (SNAPSHOT.md section 8.7) IS READ LITERALLY: the
 * refusal writes nothing, removes nothing and rewrites nothing, so whatever
 * `snapshot.json` the previous run left on disk is still there, byte for byte,
 * for the gateway to serve. It does not mean the refused process keeps
 * publishing - the same sentence says it exits non-zero, and a process cannot do
 * both. The mid-run half of the ceiling, where a RUNNING publisher drops the
 * managed-store sink and keeps writing the file, is in `publisher.ts`.
 */

import { pathToFileURL } from "node:url";

import { asHex, serializeSnapshot } from "@zcashreveal/types";
import { ZebraRpc } from "@zcashreveal/zebra-rpc";
import postgres from "postgres";

import { FileCommandBudget } from "./budget.js";
import { loadConfig, managedStoreUrl, type PublisherConfig } from "./config.js";
import { NO_INSTRUMENTS } from "./instruments.js";
import { createPublisherLogger } from "./logger.js";
import { currentLabelsVersion } from "./labels-version.js";
import { SnapshotPublisher, type Tip } from "./publisher.js";
import { buildSnapshot } from "./snapshot-builder.js";
import { createFileSink } from "./sinks/file.js";
import { connectManagedStore } from "./sinks/managed-store.js";
import { createRedisSink } from "./sinks/redis.js";
import type { Sink } from "./sinks/sink.js";
import {
  readSnapshotInputs,
  type MigrationQuery,
  type MigrationRow,
} from "./sources/chain-inputs.js";
import { createRedisTipSource } from "./sources/tip-source.js";

/** Milliseconds in a second - block times arrive from the node in seconds. */
const MS_PER_SECOND = 1_000;

/**
 * The sinks a configuration asks for.
 *
 * THE FILE SINK IS ALWAYS BUILT AND THE REDIS SINK ONLY WHEN A URL IS SET
 * (SNAPSHOT.md section 8.5). Absent both TCP spellings the publisher runs
 * file-only, which is what a laptop does and what a VPS does while the operator
 * has not yet pasted the URL into the VPS `.env`.
 */
export function sinksFor(cfg: PublisherConfig): Sink[] {
  const sinks: Sink[] = [createFileSink({ path: cfg.SNAPSHOT_FILE })];
  const url = managedStoreUrl(cfg);
  if (url !== null) {
    sinks.push(createRedisSink({ connect: () => connectManagedStore(url) }));
  }
  return sinks;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = createPublisherLogger({
    level: cfg.PUBLISHER_LOG_LEVEL,
    pretty: process.stdout.isTTY,
  });

  /* ------------------------------------------------------------- the gate */

  const budget = new FileCommandBudget({
    path: cfg.SNAPSHOT_BUDGET_FILE,
    ceiling: cfg.SNAPSHOT_REDIS_MONTHLY_BUDGET,
    now: () => Date.now(),
  });
  budget.load();
  const gate = budget.gate();
  if (!gate.ok) {
    log.fatal(
      { ceiling: cfg.SNAPSHOT_REDIS_MONTHLY_BUDGET, recorded: budget.state.commands },
      gate.message,
    );
    process.exit(gate.exitCode);
  }
  log.info(
    { ceiling: cfg.SNAPSHOT_REDIS_MONTHLY_BUDGET, recorded: budget.state.commands },
    gate.message,
  );

  /* ------------------------------------------------------------ the world */

  const sinks = sinksFor(cfg);
  const sql = postgres(cfg.DATABASE_URL, { max: 2 });
  const rpc = new ZebraRpc({
    url: cfg.ZEBRAD_RPC_URL,
    user: cfg.ZEBRAD_RPC_USER,
    password: cfg.ZEBRAD_RPC_PASSWORD,
    timeoutMs: cfg.ZEBRAD_RPC_TIMEOUT_MS,
    retries: cfg.ZEBRAD_RPC_RETRIES,
  });

  const queryMigrations: MigrationQuery = (lowHeight, highHeight) =>
    sql<MigrationRow[]>`
      SELECT txid, height, amount_zat
      FROM migrations_zip318
      WHERE height >= ${lowHeight} AND height <= ${highHeight}
      ORDER BY height ASC
    `;

  const labelsVersion = currentLabelsVersion();

  const publisher = new SnapshotPublisher({
    sinks,
    log,
    budget,
    build: async (tip: Tip) => {
      const inputs = await readSnapshotInputs(
        {
          readChainInfo: () => rpc.getBlockchainInfoFull(),
          queryMigrations,
          cfg,
          labelsVersion,
          now: () => Date.now(),
        },
        tip,
      );
      // NO_INSTRUMENTS, and `instruments.ts`'s header is the whole argument for
      // it: the Dockerfile this app must satisfy copies three sibling packages
      // and not `apps/indexer`, whose analysis modules these are, and whose
      // dependency tree carries a native addon this image has no compiler for.
      // Every panel they would fill publishes as a stated absence until those
      // modules live somewhere the publisher may depend on.
      const snapshot = buildSnapshot(inputs, NO_INSTRUMENTS);
      return { snapshot, json: serializeSnapshot(snapshot) };
    },
  });

  const tipSource = createRedisTipSource({
    url: cfg.REDIS_URL,
    log,
    onTip: async (chainTip) => {
      // The channel carries height and hash; the block's own timestamp is not on
      // the wire, and `snapshotV1Schema`'s `time` is the BLOCK's timestamp
      // rather than the publish time, so it is read from the header.
      const header = await rpc.getBlockHeader(asHex(chainTip.hash));
      await publisher.onTip({
        height: chainTip.height,
        hash: chainTip.hash,
        timeMs: header.time * MS_PER_SECOND,
      });
    },
  });

  await tipSource.start();
  log.info(
    { file: cfg.SNAPSHOT_FILE, sinks: sinks.map((s) => s.name).join(" ") },
    "publisher started",
  );

  const shutdown = async () => {
    log.info({}, "shutdown");
    try {
      await tipSource.close();
      for (const sink of sinks) await sink.close();
      await sql.end();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/**
 * Run only when this file IS the process, never when a test imports it.
 *
 * Without the check, importing anything from this module - `sinksFor`, which the
 * assertions do import - would open Postgres, a subscriber and the managed store
 * as a side effect of the import.
 */
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((err: unknown) => {
    // No logger here on purpose: this catch also covers a failure INSIDE
    // `loadConfig`, which is where `assertNotManagedStore` throws, and that is
    // exactly the moment there is no configured logger to report it with.
    console.error("publisher fatal", err);
    process.exit(1);
  });
}
