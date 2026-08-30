/**
 * The migration runner and the pool CHECK constraints, exercised.
 *
 * HANDOFF-06 assertions A2 and A3 both say "(integration test)" and neither had
 * one: they held because a human ran psql by hand once. Nothing re-ran either
 * check, so the two things most likely to fail quietly - the 001-002-then-003
 * upgrade path, where 003's assumption about Postgres-generated constraint
 * NAMES could be wrong, and the CHECK itself - were unguarded from the moment
 * that psql session closed. This file is those two assertions.
 *
 * WHY A SUBPROCESS RATHER THAN AN IMPORT. `migrate.ts` is a script, not a
 * module: it has no export, it runs `main()` at import time against
 * `loadConfig()`, and it calls `process.exit(1)` on failure - importing it from
 * a test would kill the vitest worker on the one case this file most wants to
 * observe. So the runner is spawned exactly as `pnpm --filter
 * @zcashreveal/indexer migrate` spawns it, with DATABASE_URL pointed at a
 * scratch database, and its exit code is part of the evidence.
 *
 * WHY A COPY OF `src` FOR THE OTHER TWO CASES. `MIGRATIONS_DIR` in migrate.ts is
 * `join(here, "..", "migrations")` - there is no injection point, so the shipped
 * script can only ever read apps/indexer/migrations. Two cases need a different
 * directory: applying ONLY 001 and 002 to reach the pre-003 state, and running a
 * deliberately broken migration. Rather than paraphrase the runner's loop in
 * this file - which would leave the transactional guarantee asserted against a
 * copy of the code that could drift from it - the test copies `src/` verbatim
 * into a temp tree beside a temp `migrations/` and runs THOSE bytes. If
 * migrate.ts loses its `sql.begin`, the copy loses it too and the test goes red.
 * The fresh-database case runs the real script against the real directory, so
 * the copy machinery is tied back to reality by the constraint comparison: the
 * upgraded database's CHECKs are compared against the fresh one's.
 *
 * Scratch databases are named `zecreveal_migtest_*` and dropped in afterAll. The
 * names are fixed rather than generated - `Math.random` is banned in this repo -
 * so a leaked one is identifiable and the next run's DROP ... IF EXISTS clears
 * it. Fixed names also mean two SIMULTANEOUS runs of this file would drop each
 * other's databases, which is the same assumption every sibling suite already
 * makes when it truncates the shared tables in beforeEach: one test run at a
 * time against the database DATABASE_URL names. Within a run vitest enforces it
 * (`fileParallelism: false`).
 *
 * Nothing here touches that database except the A3 inserts, which truncate
 * after themselves like every sibling suite.
 */

import { spawn } from "node:child_process";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postgres, { type Sql } from "postgres";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** src/persistence/__tests__/integration -> apps/indexer */
const INDEXER_ROOT = resolve(HERE, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(INDEXER_ROOT, "migrations");
const REAL_RUNNER = join(INDEXER_ROOT, "src", "migrate.ts");
/**
 * A suffix unique to this vitest RUN.
 *
 * THIS FILE IS THE ONE HAZARD SCHEMA-PER-RUN DOES NOT COVER, and two concurrent
 * runs found it: `test/global-setup.ts` isolates TABLES inside a schema, but the
 * scratch DATABASES below live in `pg_database`, which is cluster-wide and has
 * no schema to hide in. With fixed names the second run's `CREATE DATABASE`
 * failed on `duplicate key value violates unique constraint
 * "pg_database_datname_index"` - or worse, its `DROP DATABASE ... WITH (FORCE)`
 * would have terminated the first run's connections mid-assertion.
 *
 * `ZR_TEST_SCHEMA` is set once per run by globalSetup and is already unique, so
 * reusing it keeps one source of run identity instead of inventing a second.
 * The fallback matters for a run started without globalSetup: it must still be
 * unique, and `Math.random` is banned repository-wide, so it comes from the pid
 * and the high-resolution clock exactly as globalSetup's does.
 */
const RUN_ID = (
  process.env["ZR_TEST_SCHEMA"] ?? `${process.pid}_${process.hrtime.bigint().toString(36)}`
)
  .replace(/^zr_test_/, "")
  .replace(/[^a-z0-9_]/gi, "")
  .toLowerCase()
  .slice(0, 24);

const TEMP_ROOT = join(tmpdir(), `zecreveal-migrations-test-${RUN_ID}`);

/** Every scratch database this file creates. The DROP helper refuses anything
 *  outside this prefix, so a typo cannot reach the project's own database. The
 *  run id is inside the prefixed part, so that guard still covers all three. */
const SCRATCH_PREFIX = "zecreveal_migtest_";
const DB_FRESH = `${SCRATCH_PREFIX}${RUN_ID}_fresh`;
const DB_UPGRADE = `${SCRATCH_PREFIX}${RUN_ID}_upgrade`;
const DB_TXN = `${SCRATCH_PREFIX}${RUN_ID}_txn`;

/** Mirrors _setup.ts, which keeps its default private. */
const DEFAULT_URL =
  "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";

function urlForDatabase(name: string): string {
  const u = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

// ---------------------------------------------------------------------------
// Running the runner
// ---------------------------------------------------------------------------

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn a migration runner the way the package script does
 * (`node --import tsx <script>`), with cwd at the indexer root so the `tsx`
 * specifier resolves from its node_modules, and DATABASE_URL overridden.
 */
function runMigrate(script: string, databaseUrl: string): Promise<RunResult> {
  return new Promise<RunResult>((done) => {
    const child = spawn(process.execPath, ["--import", "tsx", script], {
      cwd: INDEXER_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => done({ code: code ?? -1, stdout, stderr }));
  });
}

const linesFor = (verb: "apply" | "skip", stdout: string): string[] =>
  [...stdout.matchAll(new RegExp(`^\\[migrate] ${verb} (.+)$`, "gm"))].map(
    (m) => m[1]!,
  );

/**
 * A temp tree holding a verbatim copy of `src/` next to a `migrations/` this
 * test controls. The package.json is the reason the copy runs at all: tsx picks
 * the module system from the nearest package.json, and outside the repo there
 * is none, so the copied ESM would be loaded as CommonJS and fail to resolve
 * `@zcashreveal/types` (its exports map has no "require" condition). The
 * node_modules symlink is how `./config.js`'s imports resolve at all.
 */
async function makeRunnerTree(
  caseName: string,
  migrations: readonly string[],
): Promise<string> {
  const root = join(TEMP_ROOT, caseName);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, "migrations"), { recursive: true });
  await cp(join(INDEXER_ROOT, "src"), join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "zecreveal-migtest-runner", private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await symlink(join(INDEXER_ROOT, "node_modules"), join(root, "node_modules"));
  await addMigrations(root, migrations);
  return root;
}

async function addMigrations(
  root: string,
  migrations: readonly string[],
): Promise<void> {
  for (const f of migrations) {
    await cp(join(MIGRATIONS_DIR, f), join(root, "migrations", f));
  }
}

const runnerIn = (root: string): string => join(root, "src", "migrate.ts");

// ---------------------------------------------------------------------------
// Reading the schema back
// ---------------------------------------------------------------------------

/** The five tables 003 gives a four-pool CHECK. */
const POOL_TABLES = [
  "pool_anchors",
  "pool_boundary_flows",
  "pool_commitments",
  "pool_nullifiers",
  "pool_snapshots",
] as const;

/**
 * Every CHECK constraint on a column named `pool`, as `table|name|definition`.
 *
 * Selected by COLUMN rather than by name, because the failure 003's header
 * warns about is a surviving two-pool constraint sitting BESIDE the new one
 * under a name nothing in this tree mentions. A query that asked for
 * `<table>_pool_check` by name would report that database as correct; this one
 * returns an extra row and the comparison fails.
 */
async function poolChecks(sql: Sql): Promise<string[]> {
  const rows = await sql<{ tbl: string; conname: string; def: string }[]>`
    SELECT c.conrelid::regclass::text AS tbl,
           c.conname                  AS conname,
           pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'c'
       AND a.attname = 'pool'
       AND c.conrelid::regclass::text = ANY (${[...POOL_TABLES]})
     ORDER BY 1, 2
  `;
  return rows.map((r) => `${r.tbl}|${r.conname}|${r.def}`);
}

/**
 * The migrations a database records as applied, ordered BY JAVASCRIPT.
 *
 * THE SORT DELIBERATELY DOES NOT HAPPEN IN SQL, and this cost a red CI run to
 * learn. These names are compared against `migrationFiles()`, which is the
 * runner's own `readdir().sort()` - a byte-order sort. `ORDER BY name` in
 * Postgres sorts by the DATABASE'S COLLATION instead, and the two disagree on
 * exactly the pair this project has:
 *
 *   C / C.UTF-8   `_` is 0x5F and `a` is 0x61, so 003_four_pools precedes 003a_gateway_cache
 *   en_US.utf8    punctuation is ignored at the primary level, so 003a_gateway_cache precedes 003_four_pools
 *
 * THE SECOND ROW IS A PROPERTY OF GLIBC, NOT OF "en-US". The same Postgres 16
 * asked for `en-US-x-icu` returns the BYTE order, because ICU's CLDR root
 * treats punctuation as non-ignorable by default. `postgres:16` initdbs with
 * glibc `en_US.utf8`, so CI is the glibc case and this fix is aimed correctly -
 * but a reader who generalises the row above to "any en-US collation" will be
 * surprised (L2 RESOLUTION - HANDOFF-06, verification note (a)).
 *
 * The development container runs C.UTF-8 and the CI service container runs
 * en_US.utf8, so this file passed locally and failed on the runner with a diff
 * showing the same four names in a different order. Sorting both sides in the
 * same language removes the dependency rather than pinning a collation the next
 * environment may not have - and the ORDER migrations were applied in is
 * asserted separately and better, from the runner's own `[migrate] apply` lines.
 */
async function appliedNames(sql: Sql): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT name FROM schema_migrations
  `;
  return rows.map((r) => r.name).sort();
}

/** As `appliedNames`, sorted in JavaScript for the same reason. */
async function appliedStamps(sql: Sql): Promise<string[]> {
  const rows = await sql<{ name: string; applied_at: Date }[]>`
    SELECT name, applied_at FROM schema_migrations
  `;
  return rows
    .map((r) => `${r.name}|${r.applied_at.toISOString()}`)
    .sort((a, b) => (a.split("|")[0]! < b.split("|")[0]! ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Scratch databases
// ---------------------------------------------------------------------------

/**
 * One hex mark and one height for every row this file writes.
 *
 * The A3 inserts go into the database DATABASE_URL points at, alongside every
 * sibling suite's rows. Reading the result back with a bare `count(*)` would be
 * asserting against whatever else happens to be in the table, so the marks are
 * what make the read-back identify THIS test's rows: `a3...` is not a txid any
 * other suite writes (they use `0000...0N`), and the height is outside the
 * 100-500 and 3,428,xxx bands the state-machine suites use. Lowercase hex with
 * no 0x, per CLAUDE.md, and 64 characters like every other id in this tree.
 */
const A3_HEX = "a3".repeat(32);
const A3_HEIGHT = 903_000;

interface PoolTableProbe {
  /** The height column, so a read-back can select only this test's rows. */
  readonly heightColumn: string;
  /** Every other NOT NULL column filled, so the ONLY constraint a bad pool
   *  value can trip is the pool CHECK. */
  readonly insert: (sql: Sql, pool: string) => Promise<unknown>;
}

const PROBES: Record<(typeof POOL_TABLES)[number], PoolTableProbe> = {
  pool_anchors: {
    heightColumn: "height_created",
    insert: (sql, pool) => sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES (${pool}, ${A3_HEX}, ${A3_HEIGHT}, 0)
    `,
  },
  pool_boundary_flows: {
    heightColumn: "block_height",
    insert: (sql, pool) => sql`
      INSERT INTO pool_boundary_flows (pool, txid, tx_seq, block_height, delta_zat)
      VALUES (${pool}, ${A3_HEX}, 0, ${A3_HEIGHT}, 0)
    `,
  },
  pool_commitments: {
    heightColumn: "block_height",
    insert: (sql, pool) => sql`
      INSERT INTO pool_commitments (pool, cm_id, position, txid, block_height)
      VALUES (${pool}, ${A3_HEX}, 0, ${A3_HEX}, ${A3_HEIGHT})
    `,
  },
  pool_nullifiers: {
    heightColumn: "spent_height",
    insert: (sql, pool) => sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height)
      VALUES (${pool}, ${A3_HEX}, ${A3_HEX}, ${A3_HEIGHT})
    `,
  },
  pool_snapshots: {
    heightColumn: "height",
    insert: (sql, pool) => sql`
      INSERT INTO pool_snapshots
        (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count)
      VALUES (${pool}, ${A3_HEIGHT}, 0, 0, 0, 0)
    `,
  },
};

/** The rejection, reduced to the two fields that make it the RIGHT rejection. */
interface PgFailure {
  readonly code?: string;
  readonly constraint_name?: string;
}

async function failureOf(p: Promise<unknown>): Promise<PgFailure> {
  return p.then(
    () => ({}),
    (err: unknown) => err as PgFailure,
  );
}

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("A3: the pool CHECK admits four pools", () => {
  const sql = getSql();

  beforeEach(async () => {
    await truncateAll(sql);
    // pool_snapshots arrives in 003, after _setup.ts's truncateAll was written.
    await sql`TRUNCATE pool_snapshots`;
  });
  afterAll(() => sql.end({ timeout: 5 }));

  for (const table of POOL_TABLES) {
    const probe = PROBES[table];

    it(`${table} accepts sprout and ironwood`, async () => {
      await probe.insert(sql, "sprout");
      await probe.insert(sql, "ironwood");
      // Read back by mark, not by count: the row has to be THERE, and it has to
      // be one of this test's. Sprout is as load-bearing as ironwood - 002's
      // CHECK admitted neither, and Sprout has existed since launch.
      const rows = await sql<{ pool: string }[]>`
        SELECT pool FROM ${sql(table)}
         WHERE ${sql(probe.heightColumn)} = ${A3_HEIGHT}
         ORDER BY pool
      `;
      expect(rows.map((r) => r.pool)).toEqual(["ironwood", "sprout"]);
    });

    it(`${table} rejects tachyon with ${table}_pool_check`, async () => {
      const failure = await failureOf(probe.insert(sql, "tachyon"));
      /**
       * Both fields are load-bearing. `23514` is check_violation: asserting only
       * that something threw would also pass on `23502` (not-null violation) or
       * `23505` (unique violation), so a test written that way would go green
       * against a table whose pool CHECK had been dropped entirely and whose
       * insert failed for an unrelated reason. And the NAME is the half 003's
       * header is anxious about - a rejection by some other constraint would
       * mean the four-pool CHECK is not the thing enforcing the union.
       */
      expect(failure.code).toBe("23514");
      expect(failure.constraint_name).toBe(`${table}_pool_check`);
    });
  }
});

interface A2State {
  readonly admin: Sql;
  readonly fresh: Sql;
  readonly upgrade: Sql;
  readonly txn: Sql;
  /** Fresh database, real script, real migrations directory. */
  freshRun: RunResult;
  freshRerun: RunResult;
  freshChecks: string[];
  freshNames: string[];
  freshStamps: string[];
  rerunStamps: string[];
  /** 001-002 only, then 003 + 003a on top. */
  upgradeRun1: RunResult;
  upgradeRun2: RunResult;
  preThreeIronwood: PgFailure;
  upgradeChecks: string[];
  upgradeNames: string[];
  /** A migration whose body fails partway. */
  bodyRun: RunResult;
  bodyTable: string | null;
  bodyRow: number;
  /** A migration whose body commits and whose bookkeeping row then fails. */
  bookRun: RunResult;
  bookTable: string | null;
  bookRow: number;
  bookConstraint: number;
  txnNames: string[];
}

/** Every .sql in apps/indexer/migrations, in the order the runner sorts them.
 *  Read rather than listed so migration 004 does not need an edit here. */
async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * TWO broken migrations, because the runner has two failure modes and only one
 * of them is what `sql.begin` was added for.
 *
 * (a) THE BODY FAILS PARTWAY. Creates an object, then trips a duplicate key.
 * This leaves no trace whether or not the runner opens a transaction, and
 * migrate.ts's own header says why: postgres.js sends a parameterless
 * `unsafe()` as one simple-query message and Postgres wraps a multi-statement
 * simple query in an implicit transaction, so the file already rolled itself
 * back. Asserting it is still worth the lines - it is a regression guard on
 * that property, which a future runner that split the file on `;` and sent the
 * statements one at a time would silently lose - but it is NOT evidence that
 * the runner is transactional, and a fail-side probe that removed `sql.begin`
 * was observed to leave this case green.
 *
 * (b) THE BODY SUCCEEDS AND THE BOOKKEEPING ROW THEN FAILS. This is the gap
 * migrate.ts describes: "The body committed on its own, and if the
 * schema_migrations INSERT then failed the database was migrated with nothing
 * on it saying so." The body here is valid SQL that commits cleanly and arms
 * the constraint the runner's own INSERT is about to violate, which is the
 * cheapest way to make that INSERT fail on demand. Without `sql.begin` the
 * table survives and the row does not; with it, neither does.
 */
const BROKEN_BODY_NAME = "900_body.sql";
const BROKEN_BODY_SQL = `-- Written by migrations.test.ts into a temp directory.
CREATE TABLE migtest_body_probe (id INTEGER PRIMARY KEY);
INSERT INTO migtest_body_probe (id) VALUES (1);
INSERT INTO migtest_body_probe (id) VALUES (1);
`;

const BROKEN_BOOK_NAME = "901_bookkeeping.sql";
const BROKEN_BOOK_CONSTRAINT = "migtest_reject_901";
const BROKEN_BOOK_SQL = `-- Written by migrations.test.ts into a temp directory.
CREATE TABLE migtest_bookkeeping_probe (id INTEGER PRIMARY KEY);
ALTER TABLE schema_migrations
  ADD CONSTRAINT ${BROKEN_BOOK_CONSTRAINT} CHECK (name <> '${BROKEN_BOOK_NAME}');
`;

describe.skipIf(!reachable)("A2: migrations apply, upgrade and re-apply", () => {
  let s: A2State;

  beforeAll(async () => {
    const admin = postgres(urlForDatabase("postgres"), { max: 1 });
    const create = async (name: string): Promise<void> => {
      if (!name.startsWith(SCRATCH_PREFIX)) {
        throw new Error(`refusing to recreate ${name}: not a scratch database`);
      }
      // FORCE evicts a connection left by a previous run that crashed before
      // afterAll; without it a leaked session makes the DROP hang.
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.unsafe(`CREATE DATABASE ${name}`);
    };
    await create(DB_FRESH);
    await create(DB_UPGRADE);
    await create(DB_TXN);

    const conn = (name: string): Sql =>
      postgres(urlForDatabase(name), { max: 1, idle_timeout: 5 });
    const fresh = conn(DB_FRESH);
    const upgrade = conn(DB_UPGRADE);
    const txn = conn(DB_TXN);

    const all = await migrationFiles();

    // (1) Fresh database, shipped script, shipped migrations directory.
    const freshRun = await runMigrate(REAL_RUNNER, urlForDatabase(DB_FRESH));
    const freshStamps = await appliedStamps(fresh);
    const freshRerun = await runMigrate(REAL_RUNNER, urlForDatabase(DB_FRESH));

    // (2) 001-002 only, then 003 + 003a on top of it.
    const upTree = await makeRunnerTree("upgrade", all.slice(0, 2));
    const upgradeRun1 = await runMigrate(
      runnerIn(upTree),
      urlForDatabase(DB_UPGRADE),
    );
    const preThreeIronwood = await failureOf(
      PROBES.pool_commitments.insert(upgrade, "ironwood"),
    );
    await addMigrations(upTree, all.slice(2));
    const upgradeRun2 = await runMigrate(
      runnerIn(upTree),
      urlForDatabase(DB_UPGRADE),
    );

    // (3) Two broken migrations, on a fully migrated database.
    await runMigrate(REAL_RUNNER, urlForDatabase(DB_TXN));

    const bodyTree = await makeRunnerTree("broken-body", []);
    await writeFile(
      join(bodyTree, "migrations", BROKEN_BODY_NAME),
      BROKEN_BODY_SQL,
      "utf8",
    );
    const bodyRun = await runMigrate(runnerIn(bodyTree), urlForDatabase(DB_TXN));
    const [bodyProbe] = await txn<{ reg: string | null }[]>`
      SELECT to_regclass('migtest_body_probe')::text AS reg
    `;
    const [bodyRowCount] = await txn<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM schema_migrations WHERE name = ${BROKEN_BODY_NAME}
    `;

    const bookTree = await makeRunnerTree("broken-bookkeeping", []);
    await writeFile(
      join(bookTree, "migrations", BROKEN_BOOK_NAME),
      BROKEN_BOOK_SQL,
      "utf8",
    );
    const bookRun = await runMigrate(runnerIn(bookTree), urlForDatabase(DB_TXN));
    const [bookProbe] = await txn<{ reg: string | null }[]>`
      SELECT to_regclass('migtest_bookkeeping_probe')::text AS reg
    `;
    const [bookRowCount] = await txn<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM schema_migrations WHERE name = ${BROKEN_BOOK_NAME}
    `;
    const [bookCon] = await txn<{ n: number }[]>`
      SELECT count(*)::int AS n
        FROM pg_constraint WHERE conname = ${BROKEN_BOOK_CONSTRAINT}
    `;

    s = {
      admin,
      fresh,
      upgrade,
      txn,
      freshRun,
      freshRerun,
      freshChecks: await poolChecks(fresh),
      freshNames: await appliedNames(fresh),
      freshStamps,
      rerunStamps: await appliedStamps(fresh),
      upgradeRun1,
      upgradeRun2,
      preThreeIronwood,
      upgradeChecks: await poolChecks(upgrade),
      upgradeNames: await appliedNames(upgrade),
      bodyRun,
      bodyTable: bodyProbe!.reg,
      bodyRow: bodyRowCount!.n,
      bookRun,
      bookTable: bookProbe!.reg,
      bookRow: bookRowCount!.n,
      bookConstraint: bookCon!.n,
      txnNames: await appliedNames(txn),
    };
  }, 180_000);

  afterAll(async () => {
    if (s === undefined) return;
    await Promise.all([
      s.fresh.end({ timeout: 5 }),
      s.upgrade.end({ timeout: 5 }),
      s.txn.end({ timeout: 5 }),
    ]);
    for (const name of [DB_FRESH, DB_UPGRADE, DB_TXN]) {
      if (!name.startsWith(SCRATCH_PREFIX)) continue;
      await s.admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await s.admin.end({ timeout: 5 });
    await rm(TEMP_ROOT, { recursive: true, force: true });
  }, 60_000);

  it("a fresh database takes every migration in the directory", async () => {
    const all = await migrationFiles();
    expect(s.freshRun.code).toBe(0);
    expect(linesFor("apply", s.freshRun.stdout)).toEqual(all);
    expect(linesFor("skip", s.freshRun.stdout)).toEqual([]);
    expect(s.freshNames).toEqual(all);
  });

  it("re-running on the same database applies nothing and rewrites nothing", async () => {
    const all = await migrationFiles();
    expect(s.freshRerun.code).toBe(0);
    expect(linesFor("apply", s.freshRerun.stdout)).toEqual([]);
    expect(linesFor("skip", s.freshRerun.stdout)).toEqual(all);
    /**
     * The timestamps, not just the names: a runner that deleted and reinserted
     * the schema_migrations rows would keep the name set identical while having
     * re-run every file. `applied_at` is the only column that can tell those
     * apart.
     */
    expect(s.rerunStamps).toEqual(s.freshStamps);
  });

  it("a database migrated only through 002 cannot hold an ironwood row", () => {
    expect(s.upgradeRun1.code).toBe(0);
    expect(linesFor("apply", s.upgradeRun1.stdout)).toEqual([
      "001_initial.sql",
      "002_candidate_analysis.sql",
    ]);
    /**
     * This is the state 003 has to upgrade, and asserting it is what makes the
     * next test mean anything: if 002's CHECK already admitted ironwood, the
     * comparison below would pass on a database 003 had never touched.
     */
    expect(s.preThreeIronwood.code).toBe("23514");
    expect(s.preThreeIronwood.constraint_name).toBe("pool_commitments_pool_check");
  });

  it("003 applies on top of 001-002 and reaches the fresh schema exactly", async () => {
    const all = await migrationFiles();
    expect(s.upgradeRun2.code).toBe(0);
    expect(linesFor("apply", s.upgradeRun2.stdout)).toEqual(all.slice(2));
    expect(linesFor("skip", s.upgradeRun2.stdout)).toEqual(all.slice(0, 2));
    expect(s.upgradeNames).toEqual(all);
    /**
     * A2's real content. 003 DROPs each pool CHECK by a name Postgres chose when
     * 002 declared them inline, and Postgres has no ADD CONSTRAINT IF NOT
     * EXISTS - so one wrong name leaves the two-pool constraint in place beside
     * the four-pool one, both applying, and an ironwood insert still rejected.
     * Comparing the full constraint set - names and definitions, on either path
     * to the same schema - is what catches that; "003 raised no error" does not.
     */
    expect(s.upgradeChecks).toEqual(s.freshChecks);
    expect(s.freshChecks).toHaveLength(POOL_TABLES.length);
  });

  it("the upgraded database accepts ironwood and rejects tachyon", async () => {
    await PROBES.pool_commitments.insert(s.upgrade, "ironwood");
    const failure = await failureOf(
      PROBES.pool_commitments.insert(s.upgrade, "tachyon"),
    );
    expect(failure.code).toBe("23514");
    expect(failure.constraint_name).toBe("pool_commitments_pool_check");
  });

  it("a migration whose body fails partway leaves no object and no row", () => {
    expect(s.bodyRun.code).not.toBe(0);
    expect(s.bodyTable).toBeNull();
    expect(s.bodyRow).toBe(0);
  });

  it("a migration whose bookkeeping row fails leaves no object and no row", () => {
    expect(s.bookRun.code).not.toBe(0);
    /**
     * Both halves, because the gap migrate.ts names is exactly between them:
     * the body committing on its own leaves a migrated database with nothing on
     * it saying so, and the next run replays the whole file against a schema
     * that already has it. The constraint is the second witness that the body
     * itself went back - it was created by the body and by nothing else.
     */
    expect(s.bookTable).toBeNull();
    expect(s.bookConstraint).toBe(0);
    expect(s.bookRow).toBe(0);
  });

  it("neither failure takes the already-applied migrations down with it", async () => {
    expect(s.txnNames).toEqual(await migrationFiles());
  });
});
