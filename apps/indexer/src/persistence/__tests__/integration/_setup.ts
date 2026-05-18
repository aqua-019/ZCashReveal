/**
 * Integration-test setup helpers.
 *
 * These tests need a reachable Postgres with migrations applied. When
 * Postgres is down, every test file's top-level `isPostgresReachable()`
 * returns false and the suite skips cleanly — `pnpm test` stays green.
 *
 * To run for real:
 *   docker compose up -d postgres
 *   pnpm --filter @zcashreveal/indexer migrate
 *   pnpm --filter @zcashreveal/indexer test
 *
 * Isolation pattern: each test file truncates the four state-machine
 * tables in `beforeEach` (RESTART IDENTITY resets the BIGSERIAL on
 * pool_boundary_flows so test ordering is deterministic). The vitest
 * pool is `forks`, so each file gets its own process and its own Sql
 * connection — no cross-file leakage even when tests run in parallel.
 */

import postgres, { type Sql } from "postgres";

const DEFAULT_URL =
  "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";

function url(): string {
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

let _sql: Sql | null = null;

/** Per-process singleton Sql connection. Call sql.end() in an afterAll. */
export function getSql(): Sql {
  if (_sql === null) {
    _sql = postgres(url(), {
      max: 4,
      idle_timeout: 5,
      connect_timeout: 5,
    });
  }
  return _sql;
}

let _reachable: boolean | null = null;

/**
 * Cached availability probe. Attempts `SELECT 1` with a 1-second
 * connect_timeout so the skip is near-instant when infra is down.
 */
export async function isPostgresReachable(): Promise<boolean> {
  if (_reachable !== null) return _reachable;
  let probe: Sql | null = null;
  try {
    probe = postgres(url(), {
      max: 1,
      connect_timeout: 1,
      idle_timeout: 0,
    });
    await probe`SELECT 1`;
    _reachable = true;
  } catch {
    _reachable = false;
  } finally {
    if (probe) {
      await probe.end({ timeout: 1 }).catch(() => undefined);
    }
  }
  return _reachable;
}

/**
 * Truncate all four state-machine tables and reset BIGSERIAL counters.
 * Run in beforeEach for per-test isolation.
 */
export async function truncateAll(sql: Sql): Promise<void> {
  await sql.unsafe(
    "TRUNCATE pool_commitments, pool_anchors, pool_nullifiers, pool_boundary_flows RESTART IDENTITY",
  );
}
