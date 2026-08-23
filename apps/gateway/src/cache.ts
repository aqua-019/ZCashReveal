/**
 * Cache-aside over the two tables migration 003a adds.
 *
 * The shape is deliberately the plainest one that works: read, and on a miss or
 * an expiry, fetch and write. There is no write-through, no background refresh
 * and no invalidation by event, because the gateway does not observe reorgs -
 * so the only honest guarantee is "at most TTL seconds old", and that is the
 * one the response states.
 *
 * TTL ZERO MEANS NO CACHE, and that is not an edge case to tolerate but the
 * documented way to turn it off - it is also assertion A6's fail side, where
 * the same request twice must reach the node twice.
 *
 * THE STORE IS AN INTERFACE for one reason: the route tests count RPC calls
 * behind the cache, and a test that had to stand up Postgres to prove the cache
 * saves a call would be testing Postgres. The Postgres implementation is
 * exercised by the integration test, gated on a database being present.
 */
import type { Sql } from "postgres";

export interface CachedAddress {
  readonly balanceZat: bigint;
  readonly receivedZat: bigint;
  readonly spentZat: bigint;
  readonly utxoCount: number;
  readonly firstSeen: number | null;
  readonly lastSeen: number | null;
}

export interface CacheStore {
  getTx(txid: string, ttlSeconds: number): Promise<unknown | null>;
  putTx(txid: string, height: number | null, json: unknown): Promise<void>;
  getAddress(addr: string, ttlSeconds: number): Promise<CachedAddress | null>;
  putAddress(addr: string, value: CachedAddress): Promise<void>;
}

/**
 * A store that never hits.
 *
 * The default when no database is configured, so the gateway degrades to
 * "always ask the node" rather than refusing to start. That is the right
 * failure mode for a read API whose data is all reconstructible.
 */
export class NullCache implements CacheStore {
  getTx(): Promise<unknown | null> {
    return Promise.resolve(null);
  }
  putTx(): Promise<void> {
    return Promise.resolve();
  }
  getAddress(): Promise<CachedAddress | null> {
    return Promise.resolve(null);
  }
  putAddress(): Promise<void> {
    return Promise.resolve();
  }
}

/** An in-process store. Used by the route tests, where the point is the call count. */
export class MemoryCache implements CacheStore {
  readonly #tx = new Map<string, { at: number; height: number | null; json: unknown }>();
  readonly #addr = new Map<string, { at: number; value: CachedAddress }>();

  /** Injectable so a TTL test does not have to wait for real seconds to pass. */
  constructor(private readonly now: () => number = Date.now) {}

  getTx(txid: string, ttlSeconds: number): Promise<unknown | null> {
    const hit = this.#tx.get(txid);
    if (hit === undefined || !fresh(hit.at, ttlSeconds, this.now())) return Promise.resolve(null);
    return Promise.resolve(hit.json);
  }

  putTx(txid: string, height: number | null, json: unknown): Promise<void> {
    this.#tx.set(txid, { at: this.now(), height, json });
    return Promise.resolve();
  }

  getAddress(addr: string, ttlSeconds: number): Promise<CachedAddress | null> {
    const hit = this.#addr.get(addr);
    if (hit === undefined || !fresh(hit.at, ttlSeconds, this.now())) return Promise.resolve(null);
    return Promise.resolve(hit.value);
  }

  putAddress(addr: string, value: CachedAddress): Promise<void> {
    this.#addr.set(addr, { at: this.now(), value });
    return Promise.resolve();
  }
}

/** The real one, over migration 003a's tables. */
export class PgCache implements CacheStore {
  constructor(private readonly sql: Sql) {}

  async getTx(txid: string, ttlSeconds: number): Promise<unknown | null> {
    if (ttlSeconds <= 0) return null;
    const rows = await this.sql<{ json: unknown }[]>`
      SELECT json FROM tx_cache
      WHERE txid = ${txid}
        AND refreshed_at > NOW() - MAKE_INTERVAL(secs => ${ttlSeconds})
      LIMIT 1
    `;
    return rows[0]?.json ?? null;
  }

  async putTx(txid: string, height: number | null, json: unknown): Promise<void> {
    await this.sql`
      INSERT INTO tx_cache (txid, height, json, refreshed_at)
      VALUES (${txid}, ${height}, ${this.sql.json(json as never)}, NOW())
      ON CONFLICT (txid) DO UPDATE
        SET height = EXCLUDED.height, json = EXCLUDED.json, refreshed_at = NOW()
    `;
  }

  async getAddress(addr: string, ttlSeconds: number): Promise<CachedAddress | null> {
    if (ttlSeconds <= 0) return null;
    const rows = await this.sql<
      {
        balance_zat: string;
        received_zat: string;
        spent_zat: string;
        utxo_count: number;
        first_seen: number | null;
        last_seen: number | null;
      }[]
    >`
      SELECT balance_zat, received_zat, spent_zat, utxo_count, first_seen, last_seen
      FROM address_cache
      WHERE addr = ${addr}
        AND refreshed_at > NOW() - MAKE_INTERVAL(secs => ${ttlSeconds})
      LIMIT 1
    `;
    const row = rows[0];
    if (row === undefined) return null;
    // NUMERIC arrives as a string from `postgres`, which is exactly what is
    // wanted: BigInt() of it is exact, and Number() of it would not be.
    return {
      balanceZat: BigInt(row.balance_zat),
      receivedZat: BigInt(row.received_zat),
      spentZat: BigInt(row.spent_zat),
      utxoCount: row.utxo_count,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    };
  }

  async putAddress(addr: string, value: CachedAddress): Promise<void> {
    await this.sql`
      INSERT INTO address_cache (addr, balance_zat, received_zat, spent_zat, utxo_count, first_seen, last_seen, refreshed_at)
      VALUES (
        ${addr},
        ${value.balanceZat.toString()},
        ${value.receivedZat.toString()},
        ${value.spentZat.toString()},
        ${value.utxoCount},
        ${value.firstSeen},
        ${value.lastSeen},
        NOW()
      )
      ON CONFLICT (addr) DO UPDATE SET
        balance_zat = EXCLUDED.balance_zat,
        received_zat = EXCLUDED.received_zat,
        spent_zat = EXCLUDED.spent_zat,
        utxo_count = EXCLUDED.utxo_count,
        first_seen = EXCLUDED.first_seen,
        last_seen = EXCLUDED.last_seen,
        refreshed_at = NOW()
    `;
  }
}

function fresh(at: number, ttlSeconds: number, now: number): boolean {
  if (ttlSeconds <= 0) return false;
  return now - at < ttlSeconds * 1000;
}
