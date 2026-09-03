/**
 * Indexer entry point.
 *
 * Flow:
 *   confirmed blocks (poll) ─▶ ChainFollower ─▶ applyConfirmedBlock ─▶ Postgres + PoolStates
 *                                                                          │
 *   ZMQ hashtx ─┐                                          chain state, read per call
 *               ├─▶ fetchAndAnalyze(txid) ─▶ MempoolState.upsert(report)   │
 *   poll loop ──┘                                      │◀───────────────────┘
 *                                                       └─▶ persist + publish
 *
 * STARTUP ORDER IS FIXED, AND `runStartup` IS THE CONTRACT (HANDOFF-12, A2).
 * The chain state is replayed from the store - or opened at
 * `INDEXER_START_HEIGHT` on a cold one - BEFORE the confirmed-block follower
 * starts, and the follower starts before ZMQ or the mempool poll loop does.
 * The analyser reads the chain state for every spend it assesses, so a
 * transaction analysed against a state still being replayed would carry an
 * assessment over a partial tree, published as if over the whole one.
 *
 * The analysis path carries a `PrevOutCache` from HANDOFF-06, because the fee
 * is not on the wire: no node sends one, so it is computed by summing the
 * outputs a transaction spends and those have to be fetched. Before that, the
 * analyser read `tx.feeZat` and every transaction it ever processed was
 * recorded as having paid nothing.
 */

import pino from "pino";
import { Redis } from "ioredis";
import { loadConfig, rpcCeilingPerMinute } from "./config.js";
import { RateGate, RpcRateLimitError, ZebraRpc } from "@zcashreveal/zebra-rpc";
import { ZebradZmqSubscriber } from "./zmq-subscriber.js";
import { MempoolState, type MempoolDiff } from "./mempool-state.js";
import { analyze } from "./decoder/index.js";
import { chainAccessFor, describeMode, type ChainAccess } from "./chain-access.js";
import { planMempoolPoll } from "./mempool-plan.js";
import { MempoolTicker } from "./mempool-tick.js";
import { publishDrainState } from "./drain-state.js";
import { RoundTripIndex } from "./analysis/round-trip.js";
import { PrevOutCache } from "./analysis/prevout-cache.js";
import { bootstrapChain, ChainFollower, runStartup } from "./runtime/index.js";
import type { PoolStates } from "./state/pool-state.js";
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
  // THE CEILING AND THE PLAN ARE READ BEFORE THE CLIENT IS BUILT, because the
  // gate is a constructor argument: a client built first and metered later is a
  // client that has already issued its first request unmetered. `ceiling` is
  // null for a node you own, which is every deployment before HANDOFF-15.
  const ceiling = rpcCeilingPerMinute(cfg);
  const gate = ceiling === null ? undefined : new RateGate({ perMinute: ceiling });
  const plan = planMempoolPoll({
    perMinute: ceiling,
    requestedIntervalMs: cfg.INDEXER_POLL_INTERVAL_MS,
  });

  const rpc = new ZebraRpc({
    url: cfg.ZEBRAD_RPC_URL,
    user: cfg.ZEBRAD_RPC_USER,
    password: cfg.ZEBRAD_RPC_PASSWORD,
    timeoutMs: cfg.ZEBRAD_RPC_TIMEOUT_MS,
    retries: cfg.ZEBRAD_RPC_RETRIES,
    ...(gate === undefined ? {} : { gate }),
  });
  const redis = new Redis(cfg.REDIS_URL, { lazyConnect: false });
  // ONE SEAM DECIDES WHETHER THIS PROCESS HAS A DATABASE (HANDOFF-15,
  // deliverable 6). Before it, `createDb(cfg.DATABASE_URL)` ran unconditionally
  // against a URL that carried a localhost default, so the four `| null`s
  // downstream were unreachable from any configuration - LEDGER-14's shape, one
  // app over. See chain-access.ts for what absence costs and what it must never
  // turn into.
  const access: ChainAccess = chainAccessFor(cfg, redis);
  const anchorRegistry = access.anchors;
  // Makes the fee real rather than zero. No node sends a fee, so it is computed
  // by summing the outputs each transaction spends, and those come from here.
  const prevOuts = new PrevOutCache(rpc);

  // THE CHAIN STATE IS READ THROUGH THE FOLLOWER ON EVERY CALL, NEVER HELD. The
  // follower REPLACES its `chain` on a reorg (it rebuilds from disk rather
  // than undoing in place), so a captured reference would assess spends
  // against a branch the node abandoned. `follower` is null until `bootstrap`
  // resolves, and `runStartup` guarantees nothing that analyses a transaction
  // runs before then; the getter's `undefined` branch is therefore never the
  // live path, and it is kept because the two consumers accept it by type.
  let follower: ChainFollower | null = null;
  const chainState = (): PoolStates | undefined => follower?.chain.pools;
  const roundTrip = new RoundTripIndex({ chainState });
  const state = new MempoolState(log);

  const info = await rpc.getBlockchainInfo();
  log.info({ height: info.blocks, chain: info.chain, network: cfg.INDEXER_NETWORK }, "chain context");
  let tipHeight = info.blocks;

  state.on("diff", (d: MempoolDiff) => {
    void publishDiff(d, access, redis, log);
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

  let pollLoop: NodeJS.Timeout | null = null;
  let stopping = false;
  const shutdown = async (code: number) => {
    if (stopping) return;
    stopping = true;
    log.info({ code }, "shutting down");
    if (pollLoop !== null) clearInterval(pollLoop);
    await zmq.stop().catch(() => undefined);
    await follower?.stop();
    await redis.quit();
    // WRITTEN AS AN EXPLICIT NULL CHECK RATHER THAN `access.sql?.end()`, on
    // HANDOFF-14's precedent: the optional call reads as "close it if it
    // happens to be there", which invites a later reader to treat the null as
    // an accident. It is a mode.
    if (access.sql !== null) await access.sql.end();
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  const mode = describeMode(access);
  log.info({ mode: mode.mode, absent: mode.absent, ceilingPerMinute: ceiling }, mode.message);
  log.info(
    {
      pollIntervalMs: plan.pollIntervalMs,
      txBudgetPerTick: plan.txBudget,
      txPerMinute: plan.txPerMinute,
      metered: plan.metered,
    },
    plan.metered
      ? "metered poll: the interval and the per-tick transaction budget come from the ceiling, not from INDEXER_POLL_INTERVAL_MS"
      : "unmetered poll: every unseen transaction is fetched every tick",
  );

  const store = access.store;
  await runStartup({
    bootstrap: async () => {
      // THE FOLLOWER IS THE HALF THAT NEEDS POSTGRES, AND IN MEMPOOL-ONLY MODE
      // IT DOES NOT START (HANDOFF-15 deliverable 6). Confirmed blocks, pool
      // state, reorg handling and every crossing are rung 3's subject and are
      // absent here by configuration rather than by failure. `chainState()`
      // then returns undefined, which `analyze` has accepted since HANDOFF-12
      // as "no state, so no spend is assessed" - not as "assessed and found
      // nothing".
      if (store === null) {
        log.info("mempool-only: the confirmed-block follower does not start, so no block is applied and no pool state is maintained");
        return;
      }
      const chain = await bootstrapChain({
        rpc,
        store,
        startHeight: cfg.INDEXER_START_HEIGHT,
        network: cfg.INDEXER_NETWORK,
        log,
      });
      follower = new ChainFollower(chain, {
        rpc,
        store,
        log,
        pollIntervalMs: cfg.INDEXER_POLL_INTERVAL_MS,
        // The anchor registry - the depth the analyser reports on every spend -
        // is fed from the applied block. Before HANDOFF-12 nothing wrote it, so
        // every spend's depth was null and every anchor read as "unknown".
        onApplied: async (block) => {
          // `recordAnchor` is non-null on this path by construction: the
          // follower only exists when `access.store` does, and both come from
          // the same branch of `chainAccessFor`. Written as a guard rather than
          // an assertion because the compiler cannot see that and a later
          // reader should not have to reconstruct it.
          for (const a of block.anchors) await access.recordAnchor?.(a.root, a.heightCreated);
          log.info(
            { height: block.height, anchors: block.anchors.length, notices: block.notices.map((n) => n.code) },
            "block applied",
          );
        },
        // The anchor registry is a SEVENTH table with a height in it, and the
        // rollback inside the store covers six. Without this, an orphaned
        // branch's roots kept answering `getHeightForAnchor` and every spend
        // citing one was given a depth measured from an abandoned block.
        onReorg: async (splitHeight, rolledBack) => {
          const forgotten = (await access.forgetAnchorsAbove?.(splitHeight)) ?? 0;
          log.warn(
            { splitHeight, rolledBack, anchorsForgotten: forgotten },
            "reorg resolved: rolled back to the split, forgot the orphaned anchors, and replayed",
          );
        },
        // A consensus disagreement is this build's fault and is never retried:
        // the follower has already logged it at fatal, and the process exits
        // non-zero so the supervisor restarts it into a replay rather than
        // letting the mempool path publish assessments over a state that
        // stopped advancing.
        onFatal: () => void shutdown(1),
      });
    },
    startFollower: () => {
      // The null here means TWO different things and only one of them is a bug,
      // which is why the store is tested first. With a store and no follower,
      // `bootstrap` did not run and `runStartup`'s ordering contract is broken.
      // With no store, there was never going to be a follower.
      if (store === null) return;
      if (follower === null) throw new Error("startFollower ran before bootstrap; runStartup's order is the contract");
      follower.start();
    },
    startZmq: () =>
      zmq.start().catch((err) => {
        log.warn({ err }, "zmq unavailable — falling back to polling only");
      }),
  });

  // THE TICK LIVES IN `mempool-tick.ts` SO AN ASSERTION CAN CALL IT. See that
  // file's header: `main` opens sockets and exits the process, so behaviour
  // inside it is behaviour no test can reach, and A1 is a statement about what
  // the loop DOES rather than about what it was configured with.
  const ticker = new MempoolTicker({
    rpc,
    state,
    analyzeOne: fetchAndAnalyze,
    plan,
    publish: (drain) => publishDrainState(redis, drain, log),
    onTip: (height) => {
      tipHeight = height;
    },
    log,
    ceilingPerMinute: ceiling,
  });

  pollLoop = setInterval(() => {
    void ticker.tick();
  }, plan.pollIntervalMs);

  /**
   * Fetch one transaction and analyse it.
   *
   * RETURNS ITS OUTCOME RATHER THAN SWALLOWING EVERYTHING (HANDOFF-15). It used
   * to catch every failure and log a warning, which is correct for a decode
   * error - one unreadable transaction must not stop a tick - and wrong for a
   * 429, because the caller then spends the rest of its budget on requests that
   * will all be refused. The three outcomes are distinguished so the caller can
   * treat them differently; nothing throws out of here, as before.
   */
  async function fetchAndAnalyze(txid: Hex): Promise<"analysed" | "failed" | "rate-limited"> {
    try {
      const tx = await rpc.getRawTransaction(txid);
      const report = await analyze(tx, {
        tipHeight,
        seenAt: Date.now(),
        anchorRegistry,
        recentAnchorThreshold: cfg.RECENT_ANCHOR_THRESHOLD,
        resolvePrevOut: prevOuts.resolve,
        chainState: chainState(),
        network: cfg.INDEXER_NETWORK,
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
      return "analysed";
    } catch (err) {
      if (err instanceof RpcRateLimitError) {
        log.warn(
          { txid, retryAfterMs: err.retryAfterMs },
          "rate limited mid-drain; stopping this tick rather than spending the rest of the budget on refusals",
        );
        return "rate-limited";
      }
      log.warn({ err, txid }, "fetch/analyze failed");
      return "failed";
    }
  }
}

async function publishDiff(
  d: MempoolDiff,
  access: ChainAccess,
  redis: Redis,
  log: pino.Logger,
): Promise<void> {
  try {
    if (d.kind === "added") {
      // PERSISTENCE FIRST AND STILL FIRST, but through the seam: in
      // mempool-only mode this is a no-op that resolves, so the publish and the
      // `hset` below run exactly as they did. What is lost without a database
      // is HISTORY, not the live view - `/v2/mempool` and the WebSocket read
      // the two Redis writes below and never the table.
      await access.persist(d.report);
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
