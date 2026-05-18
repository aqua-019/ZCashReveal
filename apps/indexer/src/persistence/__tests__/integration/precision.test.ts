/**
 * Bigint precision gate — runs FIRST conceptually.
 *
 * Every other integration test in this directory depends on bigint values
 * round-tripping through NUMERIC(20,0) without precision loss. If this
 * file fails, the persistence layer's foundational primitive is broken
 * and downstream tests would give false positives — STOP and investigate
 * the postgres.js parser before fixing anything else.
 *
 * Uses an isolated temp table (_precision_probe) so the test exercises
 * the driver and PG NUMERIC behaviour directly, not the production
 * writers — keeps the signal narrow when something fails.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getSql, isPostgresReachable } from "./_setup.js";

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("bigint precision round-trip", () => {
  const sql = getSql();

  beforeAll(async () => {
    await sql`CREATE TABLE IF NOT EXISTS _precision_probe (
      id  SERIAL PRIMARY KEY,
      big NUMERIC(20,0) NOT NULL
    )`;
    await sql`TRUNCATE _precision_probe RESTART IDENTITY`;
  });

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS _precision_probe`;
    await sql.end({ timeout: 5 });
  });

  it("2n ** 40n round-trips exactly", async () => {
    const value = 2n ** 40n;
    await sql`INSERT INTO _precision_probe (big) VALUES (${value.toString()})`;
    const rows = await sql<Array<{ big: string }>>`
      SELECT big FROM _precision_probe WHERE big = ${value.toString()}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBeDefined();
    expect(BigInt(rows[0]!.big)).toBe(value);
  });

  it("2n ** 50n round-trips exactly (above JS safe-integer ceiling)", async () => {
    const value = 2n ** 50n;
    await sql`INSERT INTO _precision_probe (big) VALUES (${value.toString()})`;
    const rows = await sql<Array<{ big: string }>>`
      SELECT big FROM _precision_probe WHERE big = ${value.toString()}
    `;
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]!.big)).toBe(value);
  });

  it("2n ** 60n round-trips exactly (well past safe-integer ceiling)", async () => {
    const value = 2n ** 60n;
    await sql`INSERT INTO _precision_probe (big) VALUES (${value.toString()})`;
    const rows = await sql<Array<{ big: string }>>`
      SELECT big FROM _precision_probe WHERE big = ${value.toString()}
    `;
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]!.big)).toBe(value);
  });

  it("negative bigint (Zcash withdrawal-side balance) round-trips exactly", async () => {
    const value = -(2n ** 50n);
    await sql`INSERT INTO _precision_probe (big) VALUES (${value.toString()})`;
    const rows = await sql<Array<{ big: string }>>`
      SELECT big FROM _precision_probe WHERE big = ${value.toString()}
    `;
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]!.big)).toBe(value);
  });
});
