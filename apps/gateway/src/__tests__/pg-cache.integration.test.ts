import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

import { PgCache } from "../cache.js";

/**
 * The Postgres-gated integration test (HANDOFF-05 deliverable 3).
 *
 * WHAT THIS PROVES THAT THE UNIT TESTS CANNOT. `MemoryCache` and `PgCache`
 * implement the same interface, and the route tests use the first - so they
 * check that a cache saves a call, not that migration 003a's tables can hold
 * what the gateway puts in them. Three things can only be checked here:
 *
 *   - a zatoshi survives NUMERIC(20,0) exactly. The lockbox balance is thirteen
 *     digits and every value in this project is chosen so that a double would
 *     be wrong about it;
 *   - the TTL is evaluated by POSTGRES, against `NOW()`, not by the process -
 *     so a gateway on a host with a skewed clock does not serve a stale entry
 *     forever;
 *   - the upsert is an upsert. A second write for the same key must replace,
 *     not raise a unique violation.
 *
 * SKIPPED, NOT FAILED, with no database. `describe.skipIf` is the same
 * convention `apps/indexer` uses for its 37 gated tests, and the skip is
 * visible in the run summary rather than silent.
 */
const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";

async function reachable(): Promise<boolean> {
  const probe = postgres(DATABASE_URL, { max: 1, connect_timeout: 2, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

const HAVE_DB = await reachable();

/** The lockbox balance, to the zatoshi. Thirteen digits, and exact is the point. */
const LOCKBOX_ZAT = 7_818_340_930_000n;

describe.skipIf(!HAVE_DB)("PgCache against migration 003a", () => {
  let sql: Sql;
  let cache: PgCache;

  beforeAll(async () => {
    sql = postgres(DATABASE_URL, { max: 2, onnotice: () => undefined });
    // The migration itself, applied here rather than assumed: this test is
    // about whether these tables hold what the gateway writes, and a test that
    // needed a separate migrate step before it would be a test that usually
    // gets skipped for the wrong reason.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS tx_cache (
        txid TEXT PRIMARY KEY,
        height INTEGER,
        json JSONB NOT NULL,
        refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS address_cache (
        addr TEXT PRIMARY KEY,
        balance_zat NUMERIC(20,0) NOT NULL,
        received_zat NUMERIC(20,0) NOT NULL,
        spent_zat NUMERIC(20,0) NOT NULL,
        utxo_count INTEGER NOT NULL,
        first_seen INTEGER,
        last_seen INTEGER,
        txids JSONB NOT NULL DEFAULT '[]'::jsonb,
        refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      -- For a database where 003a was applied before the txids column existed.
      -- The migration itself is not yet merged, so a developer's local database
      -- may hold the earlier shape and the runner will not re-apply a file it
      -- has already recorded.
      ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS txids JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    cache = new PgCache(sql);
  });

  afterAll(async () => {
    if (sql !== undefined) {
      await sql`DELETE FROM address_cache WHERE addr LIKE 'test-%'`;
      await sql`DELETE FROM tx_cache WHERE txid LIKE 'test-%'`;
      await sql.end({ timeout: 5 });
    }
  });

  it("round-trips a thirteen-digit zatoshi exactly", async () => {
    await cache.putAddress("test-lockbox", {
      balanceZat: LOCKBOX_ZAT,
      receivedZat: LOCKBOX_ZAT + 1n,
      spentZat: 1n,
      utxoCount: 3,
      firstSeen: 3_400_000,
      lastSeen: 3_456_000,
      txids: ["aa".repeat(32), "bb".repeat(32)],
    });
    const back = await cache.getAddress("test-lockbox", 60);
    expect(back?.balanceZat).toBe(LOCKBOX_ZAT);
    expect(back?.receivedZat).toBe(LOCKBOX_ZAT + 1n);
    expect(back?.utxoCount).toBe(3);
    expect(back?.firstSeen).toBe(3_400_000);
  });

  it("round-trips the txid list in the SAME row as the balance", async () => {
    // The point of the column: the balance and the list are written at one
    // instant and read back together, so a page cannot show a minute-old total
    // above a current table.
    const ids = ["cc".repeat(32), "dd".repeat(32), "ee".repeat(32)];
    await cache.putAddress("test-txids", {
      balanceZat: 42n,
      receivedZat: 42n,
      spentZat: 0n,
      utxoCount: 1,
      firstSeen: 1,
      lastSeen: 2,
      txids: ids,
    });
    const back = await cache.getAddress("test-txids", 60);
    expect(back?.txids).toEqual(ids);
    expect(back?.balanceZat).toBe(42n);
  });

  it("upserts rather than raising a unique violation", async () => {
    await cache.putAddress("test-upsert", {
      balanceZat: 1n,
      receivedZat: 1n,
      spentZat: 0n,
      utxoCount: 1,
      firstSeen: null,
      lastSeen: null,
      txids: [],
    });
    await cache.putAddress("test-upsert", {
      balanceZat: 2n,
      receivedZat: 2n,
      spentZat: 0n,
      utxoCount: 2,
      firstSeen: 10,
      lastSeen: 20,
      txids: [],
    });
    const back = await cache.getAddress("test-upsert", 60);
    expect(back?.balanceZat).toBe(2n);
    expect(back?.utxoCount).toBe(2);
  });

  it("expires by the TTL, evaluated against the database's own clock", async () => {
    await cache.putAddress("test-ttl", {
      balanceZat: 5n,
      receivedZat: 5n,
      spentZat: 0n,
      utxoCount: 0,
      firstSeen: null,
      lastSeen: null,
      txids: [],
    });
    // Fresh under a generous TTL.
    expect(await cache.getAddress("test-ttl", 3600)).not.toBeNull();
    // Age it in the database rather than sleeping: the TTL comparison is
    // Postgres's `NOW()`, so moving the row's timestamp is the honest way to
    // exercise it and costs no wall-clock time.
    await sql`UPDATE address_cache SET refreshed_at = NOW() - INTERVAL '2 hours' WHERE addr = 'test-ttl'`;
    expect(await cache.getAddress("test-ttl", 3600)).toBeNull();
  });

  it("treats a TTL of zero as no cache at all, without querying", async () => {
    await cache.putAddress("test-zero", {
      balanceZat: 9n,
      receivedZat: 9n,
      spentZat: 0n,
      utxoCount: 0,
      firstSeen: null,
      lastSeen: null,
      txids: [],
    });
    expect(await cache.getAddress("test-zero", 0)).toBeNull();
  });

  it("stores a transaction body as JSONB and returns it unchanged", async () => {
    const body = { txid: "test-tx", version: 5, vin: [], vout: [], orchard: { actions: [], valueBalanceZat: 0 } };
    await cache.putTx("test-tx", 3_456_000, body);
    expect(await cache.getTx("test-tx", 60)).toEqual(body);
  });

  it("stores a mempool transaction with a NULL height rather than a zero", async () => {
    // A transaction recorded at height 0 would be recorded as being in the
    // genesis block, which is why the column is nullable.
    await cache.putTx("test-mempool", null, { txid: "test-mempool" });
    const rows = await sql<{ height: number | null }[]>`SELECT height FROM tx_cache WHERE txid = 'test-mempool'`;
    expect(rows[0]?.height).toBeNull();
  });
});
