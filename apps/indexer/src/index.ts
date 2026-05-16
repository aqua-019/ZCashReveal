/**
 * Indexer entry point.
 *
 * Flow:
 *   ZMQ hashtx ─┐
 *               ├─▶ fetchAndAnalyze(txid) ─▶ MempoolState.upsert(report)
 *   poll loop ──┘                                      │
 *                                                       └─▶ persist + publish
 */

import pino from "pino";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { ZebradRpc } from "./zebrad-rpc.js";
import { ZebradZmqSubscriber } from "./zmq-subscriber.js";
import { MempoolState, type MempoolDiff } from "./mempool-state.js";
import { createDb, persistLeakReport } from "./persistence.js";
import { AnchorRegistry, analyze, LinkEngine } from "./decoder/index.js";

const cfg = loadConfig();
const log = pino(
  process.stdout.isTTY
    ? { level: cfg.INDEXER_LOG_LEVEL, transport: { target: "pino-pretty" } }
    : { level: cfg.INDEXER_LOG_LEVEL },
);

async function main() {
  log.info("ZCashReveal indexer starting");

  const rpc = new ZebradRpc(cfg);
  const sql = createDb(cfg.DATABASE_URL);
  const redis = new Redis(cfg.REDIS_URL, { lazyConnect: false });
  const anchorRegistry = new AnchorRegistry(redis, sql);
  const linkEngine = new LinkEngine();
  const state = new MempoolState(log);

  const info = await rpc.getBlockchainInfo();
  log.info({ height: info.blocks, chain: info.chain }, "chain context");
  let tipHeight = info.blocks;

  state.on("diff", (d: MempoolDiff) => {
    void publishDiff(d, sql, redis, log);
  });

  const zmq = new ZebradZmqSubscriber(cfg.ZEBRAD_ZMQ_URL, log);
  zmq.on("event", async (e) => {
    if (e.topic === "hashtx") {
      await fetchAndAnalyze(e.txid);
    } else if (e.topic === "hashblock") {
      try {
        const newInfo = await rpc.getBlockchainInfo();
        tipHeight = newInfo.blocks;
        const txids = await rpc.getRawMempool();
        state.reconcile(txids, "confirmed");
        await redis.publish("zcashreveal:tip", JSON.stringify({
          height: tipHeight, hash: newInfo.bestblockhash,
        }));
        log.info({ tipHeight }, "tip advanced");
      } catch (err) {
        log.error({ err }, "tip update failed");
      }
    }
  });
  zmq.on("error", (err) => log.error({ err }, "zmq error"));
  await zmq.start().catch((err) => {
    log.warn({ err }, "zmq unavailable — falling back to polling only");
  });

  const pollLoop = setInterval(async () => {
    try {
      const [info2, txids] = await Promise.all([
        rpc.getBlockchainInfo(),
        rpc.getRawMempool(),
      ]);
      tipHeight = info2.blocks;
      for (const txid of txids) {
        if (!state.has(txid)) {
          await fetchAndAnalyze(txid);
        }
      }
      state.reconcile(txids, "evicted");
    } catch (err) {
      log.error({ err }, "poll loop iteration failed");
    }
  }, cfg.INDEXER_POLL_INTERVAL_MS);

  const shutdown = async () => {
    log.info("shutting down");
    clearInterval(pollLoop);
    await zmq.stop().catch(() => undefined);
    await redis.quit();
    await sql.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  async function fetchAndAnalyze(txid: string): Promise<void> {
    try {
      const tx = await rpc.getRawTransaction(txid);
      const report = await analyze(tx, {
        tipHeight,
        seenAt: Date.now(),
        anchorRegistry,
        recentAnchorThreshold: cfg.RECENT_ANCHOR_THRESHOLD,
      });
      const newLinks = linkEngine.ingest(report);
      report.links = newLinks;
      if (newLinks.length > 0) {
        log.info(
          { txid: report.txid, count: newLinks.length },
          "round-trip links detected",
        );
        await redis.publish(
          "zcashreveal:links",
          JSON.stringify({
            type: "links_detected",
            txid: report.txid,
            links: newLinks.map(serializeReport),
          }),
        );
      }
      state.upsert(report);
    } catch (err) {
      log.warn({ err, txid }, "fetch/analyze failed");
    }
  }
}

async function publishDiff(
  d: MempoolDiff,
  sql: ReturnType<typeof createDb>,
  redis: Redis,
  log: pino.Logger,
): Promise<void> {
  try {
    if (d.kind === "added") {
      await persistLeakReport(sql, d.report);
      await redis.publish("zcashreveal:mempool", JSON.stringify({
        type: "tx_added",
        report: serializeReport(d.report),
      }));
      await redis.hset(
        "zcashreveal:mempool:live",
        d.report.txid,
        JSON.stringify(serializeReport(d.report)),
      );
      log.debug({ txid: d.report.txid, leakClass: d.report.leakClass }, "added");
    } else {
      await redis.publish("zcashreveal:mempool", JSON.stringify({
        type: "tx_removed", txid: d.txid, reason: d.reason,
      }));
      await redis.hdel("zcashreveal:mempool:live", d.txid);
      log.debug({ txid: d.txid, reason: d.reason }, "removed");
    }
  } catch (err) {
    log.error({ err }, "publishDiff failed");
  }
}

function serializeReport(r: unknown): unknown {
  return JSON.parse(
    JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

main().catch((err) => {
  log.fatal({ err }, "fatal error in indexer");
  process.exit(1);
});
