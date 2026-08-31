/**
 * Where a new tip comes from: the VPS Redis `zcashreveal:tip` channel.
 *
 * THE VPS REDIS, NOT THE MANAGED STORE, and the prefixes differ by one letter.
 * `zcashreveal:` (with the `a`) is the box-local instance the indexer publishes
 * on; `zecreveal:` (no `a`) is the shared managed store this process writes
 * three keys to. `packages/zec-types/src/realtime.ts` owns the channel name so
 * neither is retyped here.
 *
 * A SUBSCRIBER IS A SEPARATE CONNECTION BY PROTOCOL. A Redis client in
 * subscribe mode may issue no other command, which is why this opens its own
 * and does nothing else with it.
 *
 * A MALFORMED MESSAGE IS LOGGED AND DROPPED, NEVER PUBLISHED. The payload
 * crosses a process boundary as JSON, so its shape is an assumption until it is
 * checked; a height that arrived as a string, or a hash that is not a hash,
 * would otherwise reach `buildSnapshot` and either throw there or - worse - be
 * published as a document naming a block that does not exist.
 */

import { Redis } from "ioredis";
import { REDIS_CHANNELS } from "@zcashreveal/types";

/** A tip as the channel carries it. The block's timestamp is not on the wire. */
export interface ChainTip {
  readonly height: number;
  /** 64 lowercase hex characters, no `0x`. */
  readonly hash: string;
}

/** The subset of a pino logger this module uses. */
export interface TipSourceLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface TipSource {
  start(): Promise<void>;
  close(): Promise<void>;
}

const BLOCK_HASH = /^[0-9a-f]{64}$/;

/**
 * Read a channel message as a tip, or null.
 *
 * Pure. No I/O, no clock, no mutation of the input.
 */
export function parseTipMessage(message: string): ChainTip | null {
  let raw: unknown;
  try {
    raw = JSON.parse(message);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  if (rec["type"] !== "tip") return null;
  const height = rec["height"];
  const hash = rec["hash"];
  if (typeof height !== "number" || !Number.isSafeInteger(height) || height < 0) return null;
  if (typeof hash !== "string" || !BLOCK_HASH.test(hash)) return null;
  return { height, hash };
}

export interface RedisTipSourceOptions {
  /** `REDIS_URL` - the VPS instance. Never the managed store; `config.ts` asserts that. */
  readonly url: string;
  readonly log: TipSourceLog;
  /**
   * What to do with a tip.
   *
   * Its rejection is caught and logged here rather than escaping into an
   * `ioredis` event handler, where it would become an unhandled rejection and
   * take the process down - which is the one thing SNAPSHOT.md section 8.5
   * forbids a publish failure from doing.
   */
  readonly onTip: (tip: ChainTip) => Promise<void>;
}

/** Subscribe to the tip channel. */
export function createRedisTipSource(options: RedisTipSourceOptions): TipSource {
  const conn = new Redis(options.url, {
    // A subscriber that gives up is a publisher that silently stops. Unlimited
    // retries with a capped backoff is the right shape for a box-local socket.
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  });

  conn.on("error", (err: Error) => {
    options.log.error({ err }, "tip subscriber connection error");
  });

  conn.on("message", (_channel: string, message: string) => {
    const tip = parseTipMessage(message);
    if (tip === null) {
      options.log.warn({ bytes: message.length }, "dropped a malformed tip message");
      return;
    }
    void options.onTip(tip).catch((err: unknown) => {
      options.log.error({ err, height: tip.height }, "tip handler failed");
    });
  });

  return {
    async start(): Promise<void> {
      await conn.subscribe(REDIS_CHANNELS.tip);
      options.log.info({ channel: REDIS_CHANNELS.tip }, "subscribed to the tip channel");
    },
    async close(): Promise<void> {
      await conn.quit();
    },
  };
}
