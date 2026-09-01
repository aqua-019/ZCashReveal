/**
 * Gateway entry point: build the server from the real world and listen.
 *
 * Everything that decides behaviour is in `server.ts`. This file exists to do
 * the three things a test must not: read `process.env`, open sockets to
 * Postgres, Redis and the node, and bind a port.
 *
 * Endpoints (both `/api/*` and `/v2/*` - see routes/index.ts for why two):
 *   GET  /healthz                 liveness
 *   GET  /v2/search?q=           what a query string is, by shape alone
 *   GET  /v2/address/:addr       transparent address, from Zebra's address index
 *   GET  /v2/tx/:txid            transaction, plus the indexer's record if it has one
 *   GET  /v2/block/:height       block at a height, from getblock verbosity 2
 *   GET  /v2/pools/balances      live per-pool balances, and the lockbox
 *   GET  /v2/pools               503 while four blocks have no producer, named
 *   GET  /v2/mempool             the indexer's live mempool
 *   GET  /v2/flows               the Tracking side of the Record's /flows
 *   GET  /v2/labels              address labels, from packages/content
 *   GET  /v2/cases               golden cases, from packages/content
 *   GET  /v2/snapshot            the published snapshot, or 503 with a reason
 *   WS   /stream                  live mempool diff stream, capped
 */
import { Redis } from "ioredis";
import postgres from "postgres";
import { ZebraRpc } from "@zcashreveal/zebra-rpc";

import { loadConfig } from "./config.js";
import { PgCache } from "./cache.js";
import { createGatewayLogger } from "./logger.js";
import { buildServer } from "./server.js";

const cfg = loadConfig();

/**
 * The logger, with the viewing-key serialisers.
 *
 * `createGatewayLogger` is a factory rather than an inline `pino({...})` so
 * that the assertion in `__tests__/log-redaction.test.ts` exercises the SAME
 * serialisers this process uses, over a capturing stream. See `logger.ts` for
 * why the whole url is not simply redacted.
 */
const log = createGatewayLogger({ level: cfg.GATEWAY_LOG_LEVEL, pretty: process.stdout.isTTY });

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
