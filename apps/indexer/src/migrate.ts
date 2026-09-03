import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl, loadConfig } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "migrations");

async function main() {
  const cfg = loadConfig();
  // A MIGRATION RUNNER WITH NO URL REFUSES RATHER THAN DEFAULTS.
  // `DATABASE_URL` became optional in HANDOFF-15 so the mempool path can run
  // without one; this entry point is the opposite case, and it is the one where
  // a default is actively dangerous - a localhost fallback is how a developer
  // migrates whichever database happens to be listening rather than the one
  // they meant. There is no correct guess, so it exits non-zero and says which
  // variable is missing.
  const url = databaseUrl(cfg);
  if (url === null) {
    console.error("[migrate] DATABASE_URL is not set. A migration runner has no default database.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const already = await sql`SELECT 1 FROM schema_migrations WHERE name = ${f}`;
    if (already.length > 0) {
      console.log(`[migrate] skip ${f}`);
      continue;
    }
    const body = await readFile(join(MIGRATIONS_DIR, f), "utf8");
    console.log(`[migrate] apply ${f}`);
    /**
     * The file body and the row that records it commit together or not at all.
     *
     * The body itself was never the exposed half: postgres.js sends a
     * parameterless `unsafe()` as one simple-query message, and Postgres wraps
     * a multi-statement simple query in an implicit transaction, so a statement
     * failing mid-file already rolled the whole file back. The gap was between
     * the two calls. The body committed on its own, and if the
     * schema_migrations INSERT then failed - a dropped connection, a crash
     * between the round trips - the database was migrated with nothing on it
     * saying so, and the next run replayed the entire file against a schema
     * that already had it.
     *
     * 001 and 002 replay harmlessly whatever the runner does, because they only
     * CREATE ... IF NOT EXISTS. 003 is the first migration that ALTERs objects
     * it did not create, and it survives a replay only because each of its
     * ALTERs was written to: DROP CONSTRAINT IF EXISTS before every ADD, ADD
     * COLUMN IF NOT EXISTS, DROP NOT NULL on a column that may already be
     * nullable. That is a property a later migration can simply forget to have,
     * and the runner is the only place it stops being load-bearing.
     */
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
  }

  await sql.end();
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
