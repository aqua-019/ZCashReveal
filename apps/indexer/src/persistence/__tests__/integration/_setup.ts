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
 * Isolation, in two layers, because one was never enough.
 *
 * WITHIN a run: each test file truncates the state-machine tables in
 * `beforeEach` (RESTART IDENTITY resets the BIGSERIAL on
 * pool_boundary_flows so test ordering is deterministic), and
 * `fileParallelism: false` keeps files from overlapping. That is a
 * CONFIGURATION and it is still load-bearing.
 *
 * ACROSS runs: `test/global-setup.ts` gives each vitest invocation its
 * own Postgres schema and points every connection here at it via
 * `search_path`. Two concurrent runs then truncate different tables that
 * happen to share a name, instead of each other's. Before this existed,
 * two vitest processes on one Postgres corrupted each other in both
 * directions — including a conservation assertion, which is the worst
 * place in this project for a wrong number (LEDGER-06 Q6).
 */

import postgres, { type Sql } from "postgres";

const DEFAULT_URL =
  "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";

function url(): string {
  return process.env.DATABASE_URL ?? DEFAULT_URL;
}

let _sql: Sql | null = null;

/**
 * The schema this RUN owns, set by `test/global-setup.ts` before any worker
 * starts, or `null` when the suites are running without that setup.
 *
 * WHY EVERY CONNECTION MUST CARRY IT. The isolation is a `search_path`, so it
 * lives on the CONNECTION rather than in the SQL. A connection opened without it
 * resolves `pool_commitments` to `public.pool_commitments` - the shared table -
 * and then TRUNCATEs it, which is precisely the failure this mechanism exists to
 * prevent, arriving through the one connection that forgot to opt in. Anything
 * in this file that opens a socket goes through `connectionOptions()`.
 */
function testSchema(): string | null {
  const s = process.env["ZR_TEST_SCHEMA"];
  return s === undefined || s === "" ? null : s;
}

function connectionOptions(): Record<string, unknown> {
  const schema = testSchema();
  return schema === null ? {} : { connection: { search_path: `"${schema}", public` } };
}

/** Per-process singleton Sql connection. Call sql.end() in an afterAll. */
export function getSql(): Sql {
  if (_sql === null) {
    _sql = postgres(url(), {
      max: 4,
      idle_timeout: 5,
      connect_timeout: 5,
      ...connectionOptions(),
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
      ...connectionOptions(),
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
 * Truncate the state-machine tables and reset BIGSERIAL counters.
 * Run in beforeEach for per-test isolation.
 *
 * SIX TABLES, NOT FOUR. `pool_snapshots` (migration 003) and `blocks`
 * (migration 005) were outside this list for as long as neither had a writer -
 * LEDGER-06 recorded that as correct at the time and flagged that "it will need
 * changing by whichever handoff writes to them first". HANDOFF-09b is that
 * handoff. `migrations.test.ts` carried a second `TRUNCATE pool_snapshots` of
 * its own as a workaround; leaving that in place while adding a real writer
 * would give two test files two different ideas of what a clean database is.
 */
export async function truncateAll(sql: Sql): Promise<void> {
  await sql.unsafe(
    "TRUNCATE pool_commitments, pool_anchors, pool_nullifiers, pool_boundary_flows, pool_snapshots, blocks RESTART IDENTITY",
  );
}
