/**
 * Vitest globalSetup: give this RUN its own Postgres schema.
 *
 * THE PROBLEM, from LEDGER-06 Q6 and HANDOFF-10 deliverable 5. Every integration
 * suite TRUNCATEs the same four state-machine tables in `beforeEach`. Two vitest
 * processes against one Postgres therefore corrupt each other, and HANDOFF-06's
 * round 2 reproduced it in BOTH directions: one worker's TRUNCATE wiping the
 * other's rows mid-test, and foreign rows landing in a count - including a
 * corrupted conservation assertion, which is the worst possible place for it
 * because that assertion is the project's central claim about value.
 *
 * The suite is safe today only because `.github/workflows/ci.yml` runs one
 * vitest process per package and `vitest.config.ts` sets `fileParallelism:
 * false`. THAT IS A CONFIGURATION, NOT A PROPERTY. Nothing stops a developer
 * running `pnpm test` while CI runs against the same box, and nothing stops a
 * future session turning `fileParallelism` on to buy wall clock - HANDOFF-07 was
 * told not to, which is a rule enforced by memory.
 *
 * WHICH OF THE THREE OPTIONS, AND WHY. The handoff names three:
 *
 *   database-per-worker - needs CREATEDB on the test role, and a template
 *     database to keep it fast. The most isolation and the most privilege; a
 *     CI role that can create databases is a bigger blast radius than the
 *     problem.
 *
 *   an advisory lock - three lines, no schema plumbing, and it makes concurrent
 *     runs SAFE by making them SEQUENTIAL. Rejected for two reasons. It buys
 *     safety by preventing concurrency rather than by isolating it, so it can
 *     never support `fileParallelism: true`; and its correctness depends on one
 *     connection staying alive for the whole run, so a pool that reconnects
 *     silently drops the lock and the suite is back to today's behaviour with
 *     nobody told.
 *
 *   SCHEMA-PER-RUN - chosen. Each vitest invocation creates its own schema,
 *     migrates into it, points every connection's `search_path` at it, and drops
 *     it at teardown. Two runs are then disjoint rather than serialised: they
 *     touch different tables with the same names. It needs only CREATE on the
 *     database, which the test role already has, and it makes the isolation a
 *     PROPERTY of the run - which is the exact distinction the handoff draws.
 *     `truncateAll` is unchanged and every test file is unchanged, because
 *     `search_path` does the work at the connection level.
 *
 * WHAT THIS DOES NOT SOLVE, stated so the bound is honest: it isolates RUNS, not
 * FILES. Two files inside one run still share the run's schema, so
 * `fileParallelism: false` is still doing real work and is still required. Making
 * files parallel would need a schema per worker, which is the same mechanism with
 * a different key, and is not done here because nothing is asking for it yet.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

const DEFAULT_URL = "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";

/** The env var `_setup.ts` reads to find this run's schema. */
export const SCHEMA_ENV = "ZR_TEST_SCHEMA";

/**
 * A schema name unique to this process, and derived without `Math.random`,
 * which is banned repository-wide by eslint.
 *
 * pid alone is not enough - pids are reused, and a killed run can leave its
 * schema behind for a later process to inherit with rows already in it. The
 * high-resolution clock breaks that tie: two runs cannot start on the same
 * nanosecond of the same pid.
 */
function schemaName(): string {
  return `zr_test_${process.pid}_${process.hrtime.bigint().toString(36)}`;
}

function url(): string {
  return process.env["DATABASE_URL"] ?? DEFAULT_URL;
}

export default async function setup(): Promise<() => Promise<void>> {
  // Reachability first. With no database the integration suites skip themselves
  // (`isPostgresReachable`) and the unit suites do not care, so a missing
  // Postgres must not turn into a globalSetup crash that fails the whole run -
  // that would convert a clean skip into a red build on any machine without a
  // database, which is most of them.
  let probe: postgres.Sql | null = null;
  try {
    probe = postgres(url(), { max: 1, connect_timeout: 2, idle_timeout: 0, onnotice: () => undefined });
    await probe`SELECT 1`;
  } catch {
    await probe?.end({ timeout: 1 }).catch(() => undefined);
    console.log("[global-setup] no Postgres reachable; integration suites will skip themselves.");
    return async () => undefined;
  }
  await probe.end({ timeout: 1 }).catch(() => undefined);

  const schema = schemaName();
  const sql = postgres(url(), { max: 1, idle_timeout: 0, onnotice: () => undefined });

  await sql.unsafe(`CREATE SCHEMA "${schema}"`);
  // Every statement from here on resolves unqualified names inside the new
  // schema. `public` stays on the path behind it so that extensions and types
  // living there are still visible; it is second, so a CREATE TABLE lands in
  // ours and never in the shared one.
  await sql.unsafe(`SET search_path TO "${schema}", public`);

  // Migrate INTO the schema. This is the same sequence apps/indexer/src/migrate.ts
  // applies, run here rather than imported because that module is a CLI with a
  // top-level main() and its own config loader; importing it would run it.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const body = await readFile(join(MIGRATIONS_DIR, f), "utf8");
    await sql.begin(async (tx) => {
      // The search_path is per-SESSION, and postgres.js may hand a transaction a
      // different connection from the pool, so it is set again inside. With
      // max: 1 that is belt and braces; without it, a migration would silently
      // create its tables in `public` and this whole mechanism would be a very
      // convincing no-op.
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      await tx.unsafe(body);
      await tx.unsafe("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    });
  }
  await sql.end({ timeout: 5 }).catch(() => undefined);

  // Forked vitest workers inherit process.env at fork time, and globalSetup runs
  // before any worker starts, so this reaches every test file without touching
  // one of them.
  process.env[SCHEMA_ENV] = schema;
  console.log(`[global-setup] migrated ${files.length} migration(s) into schema ${schema}`);

  return async function teardown(): Promise<void> {
    const drop = postgres(url(), { max: 1, idle_timeout: 0, onnotice: () => undefined });
    try {
      await drop.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      console.log(`[global-setup] dropped schema ${schema}`);
    } finally {
      await drop.end({ timeout: 5 }).catch(() => undefined);
    }
  };
}
