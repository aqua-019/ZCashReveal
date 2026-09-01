/**
 * Indexer entry point.
 *
 * Flow:
 *   ZMQ hashtx ─┐
 *               ├─▶ fetchAndAnalyze(txid) ─▶ MempoolState.upsert(report)
 *   poll loop ──┘                                      │
 *                                                       └─▶ persist + publish
 *
 * The analysis path carries a `PrevOutCache` from HANDOFF-06, because the fee
 * is not on the wire: no node sends one, so it is computed by summing the
 * outputs a transaction spends and those have to be fetched. Before that, the
 * analyser read `tx.feeZat` and every transaction it ever processed was
 * recorded as having paid nothing.
 */

import pino from "pino";
import { Redis } from "ioredis";
import { loadConfig } from "./config.js";
import { ZebraRpc } from "@zcashreveal/zebra-rpc";
import { ZebradZmqSubscriber } from "./zmq-subscriber.js";
import { MempoolState, type MempoolDiff } from "./mempool-state.js";
import { createDb, persistLeakReport } from "./persistence/index.js";
import { AnchorRegistry, analyze } from "./decoder/index.js";
import { RoundTripIndex } from "./analysis/round-trip.js";
import { PrevOutCache } from "./analysis/prevout-cache.js";
import { asHex, serializeWire, type Hex } from "@zcashreveal/types";

const cfg = loadConfig();
const log = pino(
  process.stdout.isTTY
    ? { level: cfg.INDEXER_LOG_LEVEL, transport: { target: "pino-pretty" } }
    : { level: cfg.INDEXER_LOG_LEVEL },
);

async function main() {
  log.info("ZCashReveal indexer starting");

  // The client moved to packages/zebra-rpc in HANDOFF-05 and no longer reads
  // the indexer's Config object: a shared package that imports one app's
  // configuration is not shared. Every field it needs is passed explicitly.
  const rpc = new ZebraRpc({
    url: cfg.ZEBRAD_RPC_URL,
    user: cfg.ZEBRAD_RPC_USER,
    password: cfg.ZEBRAD_RPC_PASSWORD,
    timeoutMs: cfg.ZEBRAD_RPC_TIMEOUT_MS,
    retries: cfg.ZEBRAD_RPC_RETRIES,
  });
  const sql = createDb(cfg.DATABASE_URL);
  const redis = new Redis(cfg.REDIS_URL, { lazyConnect: false });
  const anchorRegistry = new AnchorRegistry(redis, sql);
  // Makes the fee real rather than zero. No node sends a fee, so it is computed
  // by summing the outputs each transaction spends, and those come from here.
  const prevOuts = new PrevOutCache(rpc);
  const roundTrip = new RoundTripIndex();
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
      await fetchAndAnalyze(asHex(e.txid));
    } else if (e.topic === "hashblock") {
      try {
        const newInfo = await rpc.getBlockchainInfo();
        tipHeight = newInfo.blocks;
        const txids = await rpc.getRawMempool();
        state.reconcile(txids, "confirmed");
        // `type: "tip"` HAS BEEN DECLARED SINCE `realtime.ts` WAS WRITTEN AND
        // WAS NEVER ON THE WIRE. `TipChannelPayload` is
        // `{type: "tip", height, hash}` and this call published the last two
        // fields only, so the one shared type describing this channel was false
        // about it - the same family as `expiryheight` and `tx.feeZat` at `0n`,
        // and it would have been invisible until a consumer narrowed on the
        // discriminator. HANDOFF-11's gateway relay is that consumer.
        // Additive, so a gateway that has not been redeployed still reads
        // `height` exactly as it did.
        await redis.publish("zcashreveal:tip", JSON.stringify({
          type: "tip", height: tipHeight, hash: newInfo.bestblockhash,
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

  async function fetchAndAnalyze(txid: Hex): Promise<void> {
    try {
      const tx = await rpc.getRawTransaction(txid);
      const report = await analyze(tx, {
        tipHeight,
        seenAt: Date.now(),
        anchorRegistry,
        recentAnchorThreshold: cfg.RECENT_ANCHOR_THRESHOLD,
        resolvePrevOut: prevOuts.resolve,
      });
      const newLinks = roundTrip.ingest(report);
      report.links = newLinks;
      if (newLinks.length > 0) {
        log.info(
          { txid: report.txid, count: newLinks.length },
          "round-trip links detected",
        );
      }
      // THE LINKS-CHANNEL PUBLISH THAT STOOD HERE IS GONE (HANDOFF-12, A5,
      // LEDGER-12 Q1). It published to a literal no constant named and no
      // process read: `REDIS_CHANNELS` declares `mempool` and `tip` only, and
      // the gateway subscribes to exactly those two. The egress ordering was
      // confirmed at THIS site rather than taken from a report: the links are
      // assigned onto `report.links` above, `state.upsert` emits the diff, and
      // `publishDiff` then carries the whole report - links included - to
      // `persistLeakReport`, to `zcashreveal:mempool` and to
      // `zcashreveal:mempool:live`. The channel was therefore a third copy of
      // data that already reached every consumer through the report, and
      // removing it loses nothing a reader could have seen. Whether link
      // records have any path to the SITE is a product question and is
      // recorded as one in the ledger; a channel nobody reads did not answer it.
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
        report: serializeWire(d.report),
      }));
      await redis.hset(
        "zcashreveal:mempool:live",
        d.report.txid,
        JSON.stringify(serializeWire(d.report)),
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

// `serializeReport` LIVED HERE AND IN persistence/leak-reports.ts, TWICE, AND
// STRINGIFIED EVERY BIGINT BY VALUE WHILE THE GATEWAY REVIVED BY KEY. Both
// copies are replaced by `serializeWire` from @zcashreveal/types, the one
// producer beside the one reviver, so the two sides of the seam cannot drift
// (HANDOFF-12, A3; see realtime.ts).

main().catch((err) => {
  log.fatal({ err }, "fatal error in indexer");
  process.exit(1);
});
