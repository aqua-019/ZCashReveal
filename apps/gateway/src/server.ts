/**
 * The gateway, built but not listening.
 *
 * Separated from `index.ts` so a test can build the whole server - routes, rate
 * limiter, WebSocket, error handler - and drive it through `app.inject()`
 * without binding a port, without a node and without Postgres. Assertions A2 to
 * A7 all depend on that: A4 counts Redis constructions, A6 counts RPC calls
 * behind the cache, and A7 greps serialised bodies, and none of the three can
 * be checked against a server that only exists when it is running.
 *
 * EVERY DEPENDENCY IS INJECTED, INCLUDING THE `Redis` CONSTRUCTOR. That last
 * one looks like over-engineering and is not: A4's second half asserts that the
 * gateway opens exactly two Redis connections when no rate-limit store is
 * configured, and the only honest way to check "exactly two" is to count the
 * constructions.
 */
import Fastify, { type FastifyBaseLogger } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { Logger } from "pino";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import type { Redis, RedisOptions } from "ioredis";
import type { Sql } from "postgres";
import { REDIS_CHANNELS, REDIS_KEYS, type LeakReport } from "@zcashreveal/types";
import type { ZebraRpc } from "@zcashreveal/zebra-rpc";
import type { WebSocket } from "ws";

import type { CacheStore } from "./cache.js";
import { secretValues, trustProxyFor, type GatewayConfig } from "./config.js";
import type { GatewayApp } from "./routes/deps.js";
import { registerReadRoutes } from "./routes/index.js";
import { toStatus } from "./routes/errors.js";
import { WsBroker, snapshotFrame } from "./ws-broker.js";

export type RedisFactory = (url: string, options?: RedisOptions) => Redis;

export interface BuildServerOptions {
  readonly cfg: GatewayConfig;
  readonly log: Logger;
  readonly rpc: ZebraRpc;
  readonly cache: CacheStore;
  readonly sql?: Sql | null;
  /**
   * How to construct a Redis client.
   *
   * Omitted means "no Redis at all", which is what the route tests use: the
   * mempool view is then empty and says so, and nothing else needs it.
   */
  readonly redisFactory?: RedisFactory | undefined;
}

export interface BuiltServer {
  readonly app: GatewayApp;
  readonly broker: WsBroker;
  /** Every Redis client this server opened, in order. A4 counts them. */
  readonly redisClients: readonly Redis[];
  close(): Promise<void>;
}

export async function buildServer(options: BuildServerOptions): Promise<BuiltServer> {
  const { cfg, log, rpc, cache } = options;
  const app = Fastify<Server, IncomingMessage, ServerResponse, FastifyBaseLogger>({
    loggerInstance: log,
    // Fastify generates one per request and it is echoed on every log line and
    // in the response header, so a reader reporting a failure can name the
    // request and a log search can find it. HANDOFF-05 section 3 asks for
    // request-id logging and this is it.
    genReqId: () => `req-${(reqCounter += 1).toString(36)}`,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "reqId",
    disableRequestLogging: false,
    /**
     * Whose `x-forwarded-for` to believe, and therefore what `req.ip` is.
     *
     * The rate limiter keys on `req.ip`. Behind a reverse proxy - which is the
     * shipped topology, since HANDOFF-10 puts a cloudflared tunnel in front of
     * this gateway - every request arrives from ONE address, so without this
     * every reader shares one bucket and a single client denies service to all
     * of them. Measured before this was set: ten requests with ten distinct
     * `x-forwarded-for` values and one socket address filled one bucket of five
     * and 429'd the rest.
     *
     * `false` unless an operator names the proxy, because blanket trust is
     * worse than none: any caller could then forge the header and mint a fresh
     * bucket per request, removing the limit rather than coarsening it.
     */
    trustProxy: trustProxyFor(cfg),
  });

  const redisClients: Redis[] = [];
  const openRedis = (url: string, opts?: RedisOptions): Redis | null => {
    if (options.redisFactory === undefined) return null;
    const client = options.redisFactory(url, opts);
    redisClients.push(client);
    return client;
  };

  /* --------------------------------------------------------------- hardening */

  await app.register(cors, {
    origin: cfg.GATEWAY_CORS_ORIGIN === "*" ? true : cfg.GATEWAY_CORS_ORIGIN.split(",").map((s) => s.trim()),
  });

  /**
   * Per-IP rate limiting.
   *
   * THE STORE IS IN-PROCESS UNLESS `RATE_LIMIT_REDIS_URL` IS SET, and that is
   * the whole of A4's second half. One gateway process needs no shared store,
   * and opening a third Redis connection to provide one would be a connection
   * held open for nothing. Several processes behind a load balancer DO need
   * one, and then the variable is set and the third connection is correct.
   */
  const limiterRedis =
    cfg.RATE_LIMIT_REDIS_URL === undefined
      ? null
      : openRedis(cfg.RATE_LIMIT_REDIS_URL, { enableOfflineQueue: false });

  await app.register(rateLimit, {
    max: cfg.GATEWAY_RATE_LIMIT_MAX,
    timeWindow: cfg.GATEWAY_RATE_LIMIT_WINDOW_MS,
    ...(limiterRedis === null ? {} : { redis: limiterRedis }),
    // The limit is a property of the deployment, not a secret, and saying so
    // lets a well-behaved client back off instead of hammering.
    addHeaders: { "x-ratelimit-limit": true, "x-ratelimit-remaining": true, "x-ratelimit-reset": true, "retry-after": true },
  });

  await app.register(websocket);

  const broker = new WsBroker(log, cfg.GATEWAY_WS_MAX_CONNECTIONS);

  /* ------------------------------------------------------------------ redis */

  const subscriber = openRedis(cfg.REDIS_URL);
  const reader = openRedis(cfg.REDIS_URL);

  if (subscriber !== null) {
    await subscriber.subscribe(REDIS_CHANNELS.mempool, REDIS_CHANNELS.tip);
    subscriber.on("message", (channel: string, message: string) => {
      broker.broadcast(broker.translate(channel, message));
    });
  }

  /**
   * Echo the request id back.
   *
   * Fastify reads `x-request-id` from the request and puts it on every log
   * line; it does not put it on the RESPONSE. Without this a reader reporting a
   * failure has nothing to quote, and a trace cannot be followed across the
   * tunnel between the site and the VPS, which is the one hop nobody can watch
   * from either end.
   */
  app.addHook("onSend", (req, reply, payload, done) => {
    void reply.header("x-request-id", String(req.id));
    done(null, payload);
  });

  /* ----------------------------------------------------------------- routes */

  app.get("/healthz", () => ({ ok: true, ts: Date.now() }));

  await registerReadRoutes(app, {
    cfg,
    log,
    rpc,
    cache,
    redis: reader,
    sql: options.sql ?? null,
    broker,
  });

  /* --------------------------------------------------------------- websocket */

  await app.register((scope, _opts, done) => {
    scope.get("/stream", { websocket: true }, (socket: WebSocket) => {
      const { admitted, count } = broker.add(socket);
      if (!admitted) return;
      log.info({ clientCount: count }, "client connected");

      void (async () => {
        try {
          const reports = reader === null ? [] : await readLive(reader);
          socket.send(JSON.stringify(snapshotFrame(reports)));
        } catch (err) {
          log.warn({ err }, "failed to send snapshot");
        }
      })();

      socket.on("close", () => {
        log.info({ clientCount: broker.remove(socket) }, "client disconnected");
      });
      socket.on("error", (err: unknown) => {
        log.warn({ err }, "ws client error");
        broker.remove(socket);
      });
    });
    done();
  });

  /* ------------------------------------------------------------ error handler */

  /**
   * The last line of defence for assertion A7.
   *
   * Fastify's default handler serialises `err.message` into the body, and an
   * `RpcTransportError`'s message carries the node's URL. Every route already
   * maps its own failures, so this only catches what escaped one - and it maps
   * rather than echoes, so an unforeseen error cannot publish an internal
   * hostname to whoever triggered it. The full error goes to the log, where it
   * belongs and where a reader cannot see it.
   */
  /**
   * An unmatched route, WITHOUT the query string.
   *
   * `setErrorHandler` does not cover this: Fastify routes an unmatched request
   * to `setNotFoundHandler`, whose default body is
   * `Route ${method}:${request.url} not found` with the URL verbatim - query
   * string included. Executed before this handler existed:
   *
   *   GET /api/nope?q=uview1SECRETKEYMATERIAL -> 404
   *   {"message":"Route GET:/api/nope?q=uview1SECRETKEYMATERIAL not found", ...}
   *
   * `/api/search` is built so that a viewing key which arrives is neither
   * logged nor echoed. This was the same leak through the back door, reachable
   * by a typo or by a client built against a different API version. The method
   * and the PATH are enough to tell a caller what happened; the query string
   * never is.
   */
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0] ?? req.url;
    void reply.code(404);
    return reply.send({ error: "no such route", detail: `${req.method} ${path}` });
  });

  app.setErrorHandler((err, req, reply) => {
    // A rate-limit rejection is Fastify's own and already carries the right
    // status; passing it through this mapper would turn every 429 into a 500.
    if (reply.statusCode === 429) {
      return reply.send({ error: "too many requests", detail: "slow down and retry after the interval in the header" });
    }
    req.log.error({ err }, "unhandled route failure");
    return reply.send(toStatus(err, reply));
  });

  return {
    app,
    broker,
    redisClients,
    async close() {
      await app.close();
      for (const client of redisClients) {
        try {
          await client.quit();
        } catch {
          // A client that never connected has nothing to quit, and a shutdown
          // that threw here would leave the rest of the teardown undone.
        }
      }
    },
  };
}

let reqCounter = 0;

async function readLive(reader: Redis): Promise<LeakReport[]> {
  const live = await reader.hgetall(REDIS_KEYS.mempoolLive);
  const out: LeakReport[] = [];
  for (const raw of Object.values(live)) {
    try {
      out.push(JSON.parse(raw) as LeakReport);
    } catch {
      // Skipped rather than fatal: see routes/mempool.ts.
    }
  }
  return out;
}

/** Re-exported so a test can assert on the same list the config module defines. */
export { secretValues };
