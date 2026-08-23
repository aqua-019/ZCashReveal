/**
 * What every route needs, in one place.
 *
 * Injected rather than imported so the route tests can supply a mocked RPC and
 * an in-memory cache without standing up Postgres or a node. Assertions A2, A3,
 * A6 and A7 all turn on being able to do that.
 */
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { Sql } from "postgres";
import type { Redis } from "ioredis";
import type { ZebraRpc } from "@zcashreveal/zebra-rpc";

import type { CacheStore } from "../cache.js";
import type { GatewayConfig } from "../config.js";
import type { WsBroker } from "../ws-broker.js";

export interface RouteDeps {
  readonly cfg: GatewayConfig;
  readonly log: Logger;
  readonly rpc: ZebraRpc;
  readonly cache: CacheStore;
  /** The VPS-local Redis reader. Null where none is configured. */
  readonly redis: Redis | null;
  /** Postgres, for `leak_reports`. Null where none is configured. */
  readonly sql: Sql | null;
  readonly broker: WsBroker;
}

/**
 * The concrete Fastify instance this gateway builds.
 *
 * Spelled out rather than left implicit because `buildServer` passes a pino
 * `Logger` as `loggerInstance`, which would otherwise SPECIALISE the instance's
 * logger type parameter - and the scope Fastify hands a plugin is typed with
 * the default `FastifyBaseLogger`, so the two stop being assignable and every
 * route registration fails to compile. `buildServer` pins the generics to this
 * alias instead. One name, used everywhere, keeps that from being rediscovered
 * per route file.
 */
export type GatewayApp = FastifyInstance<Server, IncomingMessage, ServerResponse, FastifyBaseLogger>;
