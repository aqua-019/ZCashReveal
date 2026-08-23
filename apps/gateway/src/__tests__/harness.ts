/**
 * A whole gateway, built from scripted parts, for the route assertions.
 *
 * `buildServer` takes every dependency as an argument precisely so this can
 * exist: the tests drive real routes, the real rate limiter, the real
 * serialisation boundary and the real DTO validation, against a node that is a
 * function and a cache that is a Map. What is NOT simulated is anything the
 * assertions are about.
 */
import pino from "pino";
import type { Redis } from "ioredis";
import { ZebraRpc, type FetchLike } from "@zcashreveal/zebra-rpc";

import { MemoryCache, NullCache, type CacheStore } from "../cache.js";
import { loadConfig, type GatewayConfig } from "../config.js";
import { buildServer, type BuiltServer } from "../server.js";

export const SILENT = pino({ level: "silent" });

/** The lockbox multisig from `packages/content` labels.json. Assertion A2's address. */
export const LOCKBOX = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";
/** 78,183.4093 ZEC, the balance the label records, to the zatoshi. */
export const LOCKBOX_BALANCE_ZAT = 7_818_340_930_000;

/** A testnet P2SH address: valid, on the wrong chain. Assertion A3's third case. */
export const TESTNET_P2SH = "t2RnBRiqrN1nW4ecZs1Fj3WWjNdnSs4kiX8";

export type RpcHandler = (method: string, params: readonly unknown[]) => unknown;

export interface Harness extends BuiltServer {
  /** How many JSON-RPC calls actually reached the scripted node. */
  calls(): { total: number; byMethod: Record<string, number> };
  /** Every Redis url a client was constructed for, in order. */
  redisUrls(): readonly string[];
}

/**
 * Build a gateway whose node is `handle`.
 *
 * `handle` is given the method and params and returns the result. Throwing an
 * object with a `code` produces a JSON-RPC error, which is how a test provokes
 * a -5 or a -8 without hand-writing an envelope.
 */
export async function harness(options: {
  handle: RpcHandler;
  env?: Record<string, string>;
  cache?: CacheStore;
  withRedis?: boolean;
}): Promise<Harness> {
  const byMethod: Record<string, number> = {};
  let total = 0;

  const fetchLike: FetchLike = (_url, init) => {
    const body = JSON.parse(String(init.body)) as { method: string; params: unknown[] };
    total += 1;
    byMethod[body.method] = (byMethod[body.method] ?? 0) + 1;
    let payload: unknown;
    try {
      payload = { jsonrpc: "1.0", id: 1, result: options.handle(body.method, body.params) };
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (typeof e.code === "number") {
        payload = { jsonrpc: "1.0", id: 1, error: { code: e.code, message: e.message ?? "error" } };
      } else {
        throw err;
      }
    }
    const text = JSON.stringify(payload);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(text) as unknown),
      text: () => Promise.resolve(text),
    });
  };

  const cfg: GatewayConfig = loadConfig({
    GATEWAY_LOG_LEVEL: "silent",
    ZEBRAD_RPC_URL: "http://zebra.internal.example:8232",
    ZEBRAD_RPC_USER: "gateway-user",
    ZEBRAD_RPC_PASSWORD: "hunter2-should-never-be-served",
    ...options.env,
  } as NodeJS.ProcessEnv);

  const redisUrls: string[] = [];
  const built = await buildServer({
    cfg,
    log: SILENT,
    rpc: new ZebraRpc({ url: cfg.ZEBRAD_RPC_URL, fetch: fetchLike, retries: 0, sleep: () => Promise.resolve() }),
    cache: options.cache ?? new NullCache(),
    ...(options.withRedis === true
      ? {
          redisFactory: (url: string) => {
            redisUrls.push(url);
            return fakeRedis();
          },
        }
      : {}),
  });

  return {
    ...built,
    calls: () => ({ total, byMethod: { ...byMethod } }),
    redisUrls: () => redisUrls,
  };
}

/**
 * A Redis that does nothing.
 *
 * Assertion A4's second half counts CONSTRUCTIONS, not commands, so this needs
 * to satisfy the two calls the server makes on a subscriber and nothing else.
 */
function fakeRedis(): Redis {
  const client = {
    subscribe: () => Promise.resolve(0),
    on: () => client,
    hgetall: () => Promise.resolve({}),
    quit: () => Promise.resolve("OK"),
    // @fastify/rate-limit's RedisStore registers a Lua script on construction
    // and then calls it by the name it defined. Both are needed for the
    // third-connection case to get far enough to BE a third connection.
    defineCommand: (name: string) => {
      (client as unknown as Record<string, unknown>)[name] = () => Promise.resolve([0, 0]);
    },
  };
  return client as unknown as Redis;
}

export { MemoryCache };
