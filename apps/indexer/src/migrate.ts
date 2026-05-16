import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadConfig } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "migrations");

async function main() {
  const cfg = loadConfig();
  const sql = postgres(cfg.DATABASE_URL, { max: 1 });

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
    await sql.unsafe(body);
    await sql`INSERT INTO schema_migrations (name) VALUES (${f})`;
  }

  await sql.end();
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
