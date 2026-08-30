/**
 * The `ioredis` connection to the Vercel-managed store, behind the narrow
 * {@link SnapshotStore} interface the sink actually uses.
 *
 * WHY THE ADAPTER EXISTS RATHER THAN HANDING `ioredis` STRAIGHT TO THE SINK.
 * `sinks/redis.ts` declares a two-method interface - open a transaction, close
 * the connection - and that narrowness is a safety property, not a typing
 * preference: a later edit that wants to read, enumerate or remove something on
 * a store shared with another production project has to widen a declared
 * interface first, in a diff a reviewer sees. Handing the driver over directly
 * would give that edit every command in Redis and no diff to notice.
 *
 * THE URL CARRIES THE STORE'S PASSWORD. It is `rediss://default:PASSWORD@host`,
 * it arrives from the environment, and it never enters git (A8 greps for exactly
 * that). `logger.ts` redacts URL userinfo out of error messages for the same
 * reason: `ioredis` puts the endpoint into its own error text.
 */

import { Redis } from "ioredis";

import type { SnapshotStore, SnapshotTransaction } from "./redis.js";

/**
 * How long a command waits before it is allowed to fail.
 *
 * BOUNDED ON PURPOSE, AND THE BOUND IS WHAT MAKES A7's FAIL SIDE A TEST RATHER
 * THAN A HANG. The default `ioredis` behaviour for an unreachable endpoint is to
 * queue the command and retry indefinitely, so a publisher pointed at a closed
 * port would neither write nor report - it would simply stop, which is the one
 * outcome SNAPSHOT.md section 8.5 forbids. With a small retry limit the command
 * rejects, `writeToAllSinks` logs `{sink: "redis", err}`, and the file sink's
 * write still stands.
 */
const MAX_RETRIES_PER_REQUEST = 1;
const CONNECT_TIMEOUT_MS = 5_000;
/** Reconnect backoff, capped. A shared store is not a thing to hammer. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Open the managed store.
 *
 * ONE CONNECTION PER PROCESS. Three writes per block is the entire traffic
 * budget; a pool would be more sockets than commands.
 */
export function connectManagedStore(url: string): SnapshotStore {
  const conn = new Redis(url, {
    maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy: (times: number) => Math.min(times * 1_000, MAX_RECONNECT_DELAY_MS),
  });

  return {
    multi(): SnapshotTransaction {
      const queued = conn.multi();
      // The wrapper is what narrows `ChainableCommander` - every command in
      // Redis - down to `set`. It returns itself so the sink can chain, and it
      // holds no state of its own beyond the driver's own queue.
      const chain: SnapshotTransaction = {
        set(key: string, value: string, mode?: "EX", seconds?: number): SnapshotTransaction {
          if (mode === undefined || seconds === undefined) queued.set(key, value);
          else queued.set(key, value, mode, seconds);
          return chain;
        },
        exec: () => queued.exec(),
      };
      return chain;
    },
    quit: () => conn.quit(),
  };
}
