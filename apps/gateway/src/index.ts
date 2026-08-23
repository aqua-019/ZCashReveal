/**
 * Gateway entry point: build the server from the real world and listen.
 *
 * Everything that decides behaviour is in `server.ts`. This file exists to do
 * the three things a test must not: read `process.env`, open sockets to
 * Postgres, Redis and the node, and bind a port.
 *
 * Endpoints (both `/api/*` and `/v2/*` - see routes/index.ts for why two):
 *   GET  /healthz                 liveness
 *   GET  /api/search?q=           what a query string is, by shape alone
 *   GET  /api/address/:addr       transparent address, from Zebra's address index
 *   GET  /api/tx/:txid            transaction, plus the indexer's record if it has one
 *   GET  /api/block/:height       block at a height, from getblock verbosity 2
 *   GET  /api/pools/balances      live per-pool balances, and the lockbox
 *   GET  /api/pools               503 until HANDOFF-09, naming what is missing
 *   GET  /api/mempool             the indexer's live mempool
 *   GET  /api/flows               the Tracking side of the Record's /flows
 *   GET  /api/labels              address labels, from packages/content
 *   GET  /api/cases               golden cases, from packages/content
 *   GET  /api/snapshot            501 until HANDOFF-09
 *   WS   /stream                  live mempool diff stream, capped
 */
import pino from "pino";
import { Redis } from "ioredis";
import postgres from "postgres";
import { ZebraRpc } from "@zcashreveal/zebra-rpc";

import { loadConfig } from "./config.js";
import { PgCache } from "./cache.js";
import { buildServer } from "./server.js";

const cfg = loadConfig();

const log = pino({
  level: cfg.GATEWAY_LOG_LEVEL,
  ...(process.stdout.isTTY ? { transport: { target: "pino-pretty" } } : {}),
  /**
   * `q` is redacted everywhere it can appear in a log line.
   *
   * A viewing key must never leave the browser, and `apps/web` classifies
   * locally so that it does not. But `/api/search` exists for other consumers,
   * and if one ever sends a key here the one thing this gateway can still
   * control is whether it is written down. Redaction is unconditional rather
   * than per-route: a rule that only applies to the route someone remembered is
   * not a rule.
   */
  redact: {
    paths: ["req.query.q", "query.q", "req.url"],
    censor: "[redacted]",
  },
});

async function main() {
  const sql = postgres(cfg.DATABASE_URL, { max: 5 });

  const rpc = new ZebraRpc({
    url: cfg.ZEBRAD_RPC_URL,
    user: cfg.ZEBRAD_RPC_USER,
    password: cfg.ZEBRAD_RPC_PASSWORD,
    timeoutMs: cfg.ZEBRAD_RPC_TIMEOUT_MS,
    retries: cfg.ZEBRAD_RPC_RETRIES,
  });

  const built = await buildServer({
    cfg,
    log,
    rpc,
    cache: new PgCache(sql),
    sql,
    redisFactory: (url, options) => new Redis(url, options ?? {}),
  });

  await built.app.listen({ host: cfg.GATEWAY_HOST, port: cfg.GATEWAY_PORT });
  log.info(
    { port: cfg.GATEWAY_PORT, network: cfg.GATEWAY_NETWORK, wsCap: cfg.GATEWAY_WS_MAX_CONNECTIONS },
    "gateway listening",
  );

  const shutdown = async () => {
    log.info("shutdown");
    try {
      await built.close();
      await sql.end();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  log.fatal({ err }, "gateway fatal");
  process.exit(1);
});
