/**
 * Postgres persistence for pool_nullifiers (NFSet^p_h on disk).
 *
 * In-memory counterpart: NullifierIndex<P> in src/state/nullifier-index.ts.
 * Read order (spent_height ASC, nf_id ASC) is deterministic — NullifierIndex
 * is order-independent but stable ordering simplifies test assertions.
 */

import type { Sql } from "postgres";
import type { Pool, SpentNullifier } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * Write a single spent nullifier. Idempotent on (pool, nf_id) via
 * ON CONFLICT DO NOTHING. The application layer (Module 1's
 * NullifierIndex.record) detects duplicates and throws DoubleSpendError
 * BEFORE the DB write — the DB never sees a true double-spend, so
 * DO NOTHING is the right policy.
 */
export async function writePoolNullifier<P extends Pool>(
  record: SpentNullifier<P>,
  conn: Sql,
): Promise<void> {
  await conn`
    INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height)
    VALUES (
      ${record.pool},
      ${record.nfId},
      ${record.spentTxid},
      ${record.spentHeight}
    )
    ON CONFLICT (pool, nf_id) DO NOTHING
  `;
}

/**
 * Read all spent nullifiers for `pool`, ordered by (spent_height ASC,
 * nf_id ASC) for determinism.
 */
export async function readAllPoolNullifiers<P extends Pool>(
  pool: P,
  conn: Sql,
): Promise<SpentNullifier<P>[]> {
  const rows = await conn<
    Array<{ nf_id: string; spent_txid: string; spent_height: number }>
  >`
    SELECT nf_id, spent_txid, spent_height
    FROM pool_nullifiers
    WHERE pool = ${pool}
    ORDER BY spent_height ASC, nf_id ASC
  `;
  return rows.map((r) => ({
    pool,
    nfId: asHex(r.nf_id),
    spentTxid: asHex(r.spent_txid),
    spentHeight: r.spent_height,
  }));
}

/**
 * Delete spent nullifiers with spent_height > H from `pool`. Records at
 * height H are retained. After the call, the table is consistent with
 * chain tip at height H. Returns the number of rows deleted.
 */
export async function rollbackPoolNullifiersToHeight<P extends Pool>(
  pool: P,
  height: number,
  conn: Sql,
): Promise<number> {
  const result = await conn`
    DELETE FROM pool_nullifiers
    WHERE pool = ${pool} AND spent_height > ${height}
  `;
  return result.count;
}
