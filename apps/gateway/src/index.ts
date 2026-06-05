/**
 * Gateway server. Redis pub/sub -> WS fan-out + REST for historical queries.
 *
 * Endpoints:
 *   GET  /healthz                       liveness
 *   GET  /api/mempool                   current mempool snapshot
 *   GET  /api/reports?limit=&class=     historical leak reports
 *   GET  /api/reports/:txid             single report by txid
 *   WS   /stream                        live mempool diff stream
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import pino from "pino";
import { Redis } from "ioredis";
import postgres from "postgres";
import { z } from "zod";
import type { WebSocket } from "ws";
import {
  REDIS_CHANNELS,
  REDIS_KEYS,
  type LeakReport,
} from "@zcashreveal/types";

import { loadConfig } from "./config.js";
import { WsBroker, snapshotFrame } from "./ws-broker.js";

const cfg = loadConfig();

const log = pino({
  level: cfg.GATEWAY_LOG_LEVEL,
  ...(process.stdout.isTTY ? { transport: { target: "pino-pretty" } } : {}),
});

async function main() {
  const app = Fastify({ loggerInstance: log });

  await app.register(cors, { origin: cfg.GATEWAY_CORS_ORIGIN });
  await app.register(websocket);

  const sql = postgres(cfg.DATABASE_URL, { max: 5 });
  const subscriber = new Redis(cfg.REDIS_URL);
  const reader = new Redis(cfg.REDIS_URL);

  const broker = new WsBroker(log);

  await subscriber.subscribe(REDIS_CHANNELS.mempool, REDIS_CHANNELS.tip);
  subscriber.on("message", (channel, message) => {
    broker.broadcast(broker.translate(channel, message));
  });

  app.get("/healthz", async () => ({ ok: true, ts: Date.now() }));

  app.get("/api/mempool", async () => {
    const live = await reader.hgetall(REDIS_KEYS.mempoolLive);
    const reports = Object.values(live)
      .map((j) => safeJsonParse(j))
      .filter((r): r is LeakReport => r !== null);
    return { count: reports.length, reports };
  });

  const ReportsQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).default(100),
    class: z.string().optional(),
    severity: z.string().optional(),
  });

  app.get("/api/reports", async (req) => {
    const q = ReportsQuery.parse(req.query);
    const rows = await sql<{ report: LeakReport }[]>`
      SELECT report
      FROM leak_reports
      WHERE ${q.class ? sql`leak_class = ${q.class}` : sql`TRUE`}
        AND ${q.severity ? sql`overall_severity = ${q.severity}` : sql`TRUE`}
      ORDER BY seen_at DESC
      LIMIT ${q.limit}
    `;
    return rows.map((r) => r.report);
  });

  app.get<{ Params: { txid: string } }>(
    "/api/reports/:txid",
    async (req, reply) => {
      const rows = await sql<{ report: LeakReport }[]>`
        SELECT report FROM leak_reports WHERE txid = ${req.params.txid} LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        reply.code(404);
        return { error: "not found" };
      }
      return row.report;
    },
  );

  app.register(async (fastify) => {
    fastify.get("/stream", { websocket: true }, async (socket: WebSocket) => {
      const count = broker.add(socket);
      log.info({ clientCount: count }, "client connected");

      try {
        const live = await reader.hgetall(REDIS_KEYS.mempoolLive);
        const reports = Object.values(live)
          .map((j) => safeJsonParse(j))
          .filter((r): r is LeakReport => r !== null);
        socket.send(JSON.stringify(snapshotFrame(reports)));
      } catch (err) {
        log.warn({ err }, "failed to send snapshot");
      }

      socket.on("close", () => {
        const remaining = broker.remove(socket);
        log.info({ clientCount: remaining }, "client disconnected");
      });
      socket.on("error", (err) => {
        log.warn({ err }, "ws client error");
        broker.remove(socket);
      });
    });
  });

  await app.listen({ host: cfg.GATEWAY_HOST, port: cfg.GATEWAY_PORT });
  log.info({ port: cfg.GATEWAY_PORT }, "gateway listening");

  const shutdown = async () => {
    log.info("shutdown");
    try {
      await app.close();
      await subscriber.quit();
      await reader.quit();
      await sql.end();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

main().catch((err) => {
  log.fatal({ err }, "gateway fatal");
  process.exit(1);
});
