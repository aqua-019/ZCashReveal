import { describe, expect, it } from "vitest";
import pino from "pino";
import type { WebSocket } from "ws";

import { harness, LOCKBOX, type RpcHandler } from "./harness.js";
import { WS_CLOSE_TRY_AGAIN_LATER, WsBroker } from "../ws-broker.js";

/**
 * A4 and A5 - the rate limiter, the Redis connection count, and the WS cap.
 *
 * A4's second half is the interesting one and it is easy to get wrong: the
 * claim is not "Redis works", it is that the gateway opens EXACTLY TWO
 * connections with no rate-limit store configured, and a third only when one
 * is. The only honest way to check "exactly two" is to count constructions,
 * which is why `buildServer` takes the constructor as an argument.
 */

const node: RpcHandler = (method) => {
  if (method === "getblockchaininfo") return { chain: "main", blocks: 1, bestblockhash: "cd".repeat(32) };
  if (method === "getaddressbalance") return { balance: 1, received: 1 };
  if (method === "getaddressutxos") return [];
  if (method === "getaddresstxids") return [];
  throw new Error(`unscripted method ${method}`);
};

describe("A4 - per-IP rate limiting", () => {
  it("PASS STATE: 120 requests in the window from one IP yield at least one 429", async () => {
    const h = await harness({
      handle: node,
      env: { GATEWAY_RATE_LIMIT_MAX: "100", GATEWAY_RATE_LIMIT_WINDOW_MS: "10000" },
    });

    const statuses: number[] = [];
    for (let i = 0; i < 120; i += 1) {
      const res = await h.app.inject({
        method: "GET",
        url: "/healthz",
        // One IP. Without this every injected request looks like a new client
        // and the limiter would never fire, which is the way this assertion
        // passes vacuously.
        remoteAddress: "203.0.113.7",
      });
      statuses.push(res.statusCode);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    expect(statuses.filter((s) => s === 200).length).toBe(100);
    await h.close();
  });

  it("FAIL STATE: 120 requests from 120 DIFFERENT IPs yield none", async () => {
    // The limiter is per-IP, so this is the shape that must NOT be limited -
    // and it is what makes the test above a statement about one client rather
    // than about a global counter.
    const h = await harness({
      handle: node,
      env: { GATEWAY_RATE_LIMIT_MAX: "100", GATEWAY_RATE_LIMIT_WINDOW_MS: "10000" },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 120; i += 1) {
      const res = await h.app.inject({ method: "GET", url: "/healthz", remoteAddress: `198.51.100.${i % 255}` });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBe(0);
    await h.close();
  });

  it("a 429 body carries no internal detail", async () => {
    const h = await harness({ handle: node, env: { GATEWAY_RATE_LIMIT_MAX: "2", GATEWAY_RATE_LIMIT_WINDOW_MS: "10000" } });
    for (let i = 0; i < 3; i += 1) await h.app.inject({ method: "GET", url: "/healthz", remoteAddress: "203.0.113.9" });
    const res = await h.app.inject({ method: "GET", url: "/healthz", remoteAddress: "203.0.113.9" });
    expect(res.statusCode).toBe(429);
    expect(res.body).not.toContain("zebra.internal.example");
    await h.close();
  });
});

describe("A4 - the gateway opens exactly two Redis connections, and a third only when told to", () => {
  it("PASS STATE: with RATE_LIMIT_REDIS_URL unset, exactly two - subscriber and reader", async () => {
    const h = await harness({ handle: node, withRedis: true });
    expect(h.redisClients).toHaveLength(2);
    expect(h.redisUrls()).toEqual(["redis://localhost:6379", "redis://localhost:6379"]);
    await h.close();
  });

  it("FAIL STATE: setting RATE_LIMIT_REDIS_URL opens a third, on that url", async () => {
    const h = await harness({
      handle: node,
      withRedis: true,
      env: { RATE_LIMIT_REDIS_URL: "redis://limiter.example:6379" },
    });
    expect(h.redisClients).toHaveLength(3);
    // The limiter's client is opened FIRST, before the two VPS-local ones, and
    // is on a different url - so this cannot pass by a duplicate of either.
    expect(h.redisUrls()[0]).toBe("redis://limiter.example:6379");
    expect(h.redisUrls().filter((u) => u === "redis://localhost:6379")).toHaveLength(2);
    await h.close();
  });

  it("neither url is the Vercel-managed snapshot store, which must never be on this path", async () => {
    // CLAUDE.md's two-Redis rule, asserted rather than trusted: no
    // per-transaction traffic leaves the VPS.
    const h = await harness({ handle: node, withRedis: true, env: { SNAPSHOT_REDIS_URL: "rediss://managed.upstash.io:6379" } });
    for (const url of h.redisUrls()) {
      expect(url).not.toContain("upstash");
      expect(url).not.toContain("rediss://");
    }
    await h.close();
  });
});

describe("A5 - the WebSocket connection cap", () => {
  /** A socket that records what it was closed with. */
  function socket() {
    const closes: { code: number; reason: string }[] = [];
    const ws = {
      close: (code: number, reason: string) => closes.push({ code, reason }),
      send: () => undefined,
      on: () => ws,
    };
    return { ws: ws as unknown as WebSocket, closes };
  }

  it("PASS STATE: with the cap at 2, the third connection is closed with 1013", async () => {
    const broker = new WsBroker(pino({ level: "silent" }), 2);
    const a = socket();
    const b = socket();
    const c = socket();

    expect(broker.add(a.ws)).toEqual({ admitted: true, count: 1 });
    expect(broker.add(b.ws)).toEqual({ admitted: true, count: 2 });
    expect(broker.add(c.ws)).toEqual({ admitted: false, count: 2 });

    expect(c.closes).toEqual([{ code: WS_CLOSE_TRY_AGAIN_LATER, reason: "at capacity" }]);
    expect(a.closes).toEqual([]);
    expect(b.closes).toEqual([]);
    // The refused client is not in the fan-out set, so it costs nothing beyond
    // the close frame.
    expect(broker.size()).toBe(2);
    await Promise.resolve();
  });

  it("FAIL STATE: with the cap at 3, the third connection is admitted and closed with nothing", async () => {
    const broker = new WsBroker(pino({ level: "silent" }), 3);
    const c = socket();
    broker.add(socket().ws);
    broker.add(socket().ws);
    expect(broker.add(c.ws)).toEqual({ admitted: true, count: 3 });
    expect(c.closes).toEqual([]);
    await Promise.resolve();
  });

  it("a disconnection frees a slot, so the cap is a concurrency limit and not a lifetime quota", async () => {
    const broker = new WsBroker(pino({ level: "silent" }), 1);
    const a = socket();
    const b = socket();
    expect(broker.add(a.ws).admitted).toBe(true);
    expect(broker.add(b.ws).admitted).toBe(false);
    broker.remove(a.ws);
    const c = socket();
    expect(broker.add(c.ws).admitted).toBe(true);
    await Promise.resolve();
  });

  it("1013 is the code, and it is Try Again Later rather than a policy violation", async () => {
    // 1008 would tell a client it did something wrong and 1011 that the server
    // is broken. apps/web's socket reconnects with a seeded backoff, so 1013
    // makes a refusal a delay rather than a dead panel.
    expect(WS_CLOSE_TRY_AGAIN_LATER).toBe(1013);
    await Promise.resolve();
  });

  it("the cap the server builds is the configured one", async () => {
    const h = await harness({ handle: node, env: { GATEWAY_WS_MAX_CONNECTIONS: "7" } });
    expect(h.broker.capacity()).toBe(7);
    await h.close();
  });
});

describe("request identity", () => {
  it("every response carries a request id", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({ method: "GET", url: `/api/address/${LOCKBOX}` });
    expect(res.headers["x-request-id"]).toBeTruthy();
    await h.close();
  });

  it("a caller-supplied request id is honoured, so a trace can span the tunnel", async () => {
    const h = await harness({ handle: node });
    const res = await h.app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "trace-abc" },
    });
    expect(res.headers["x-request-id"]).toBe("trace-abc");
    await h.close();
  });
});
