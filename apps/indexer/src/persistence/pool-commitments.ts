/**
 * Postgres persistence for pool_commitments (T^p_h on disk).
 *
 * In-memory counterpart: CommitmentIndex<P> in src/state/commitment-index.ts.
 * Records are read in position-ascending order for deterministic replay.
 */

import type { Sql } from "postgres";
import type { Commitment, Pool } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * Write a single commitment. Idempotent on (pool, cm_id) via
 * ON CONFLICT DO NOTHING — a second write of the same cm_id is a no-op.
 * The application layer (Module 1's CommitmentIndex) is responsible for
 * detecting cm_id duplicates and position contiguity; this writer trusts
 * its input and only enforces uniqueness at the DB layer.
 */
export async function writePoolCommitment<P extends Pool>(
  record: Commitment<P>,
  conn: Sql,
): Promise<void> {
  await conn`
    INSERT INTO pool_commitments (pool, cm_id, position, txid, block_height)
    VALUES (
      ${record.pool},
      ${record.cmId},
      ${record.position.toString()},
      ${record.txid},
      ${record.height}
    )
    ON CONFLICT (pool, cm_id) DO NOTHING
  `;
}

/**
 * Read all commitments for `pool`, ordered by position ascending.
 * Returns an array — Module 2's working set is bounded. If/when historical
 * replay needs streaming, add a paginated reader later.
 */
export async function readAllPoolCommitments<P extends Pool>(
  pool: P,
  conn: Sql,
): Promise<Commitment<P>[]> {
  const rows = await conn<
    Array<{ cm_id: string; position: string; txid: string; block_height: number }>
  >`
    SELECT cm_id, position, txid, block_height
    FROM pool_commitments
    WHERE pool = ${pool}
    ORDER BY position ASC
  `;
  return rows.map((r) => ({
    pool,
    cmId: asHex(r.cm_id),
    position: BigInt(r.position),
    txid: asHex(r.txid),
    height: r.block_height,
  }));
}

/**
 * Delete commitments with block_height > H from `pool`. Records at height
 * H are retained. After the call, the table is consistent with chain tip
 * at height H. Returns the number of rows deleted.
 */
export async function rollbackPoolCommitmentsToHeight<P extends Pool>(
  pool: P,
  height: number,
  conn: Sql,
): Promise<number> {
  const result = await conn`
    DELETE FROM pool_commitments
    WHERE pool = ${pool} AND block_height > ${height}
  `;
  return result.count;
}
