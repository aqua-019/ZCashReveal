/**
 * Postgres persistence for pool_boundary_flows (Bal^p_h deltas on disk).
 *
 * In-memory counterpart: ValuePool<P> in src/state/value-pool.ts.
 *
 * CRITICAL: read order is (block_height ASC, id ASC) to match the original
 * apply order. ValuePool.apply() throws NegativeBalanceError if the running
 * balance would go below zero; reordering deposits and withdrawals can
 * trigger spurious throws during replay even when the original sequence
 * was valid. The id column (BIGSERIAL) preserves write-time insertion
 * order within a block.
 *
 * tx_seq is a persistence-layer disambiguator for multiple deltas
 * belonging to the same tx (e.g. a tx with both Sapling and Orchard
 * components produces two deltas — tx_seq=0 and tx_seq=1 within their
 * respective pool partitions). It is NOT part of BoundaryDelta<P>: the
 * type is a value-level concept owned by Module 1, while tx_seq is a
 * persistence concern owned here.
 */

import type { Conn } from "./conn.js";
import type { BoundaryDelta, Pool } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * Write a single boundary delta with a caller-supplied per-tx sequence.
 * Idempotent on (pool, txid, tx_seq) via ON CONFLICT DO NOTHING.
 *
 * The caller (Module 6+'s block handler, not part of Module 2) is
 * responsible for assigning tx_seq starting at 0 for each tx and
 * monotonically increasing. The in-memory ValuePool array's index is the
 * canonical tx_seq source.
 */
export async function writePoolBoundaryFlow<P extends Pool>(
  record: BoundaryDelta<P>,
  txSeq: number,
  conn: Conn,
): Promise<void> {
  await conn`
    INSERT INTO pool_boundary_flows (pool, txid, tx_seq, block_height, delta_zat)
    VALUES (
      ${record.pool},
      ${record.txid},
      ${txSeq},
      ${record.height},
      ${record.deltaZat.toString()}
    )
    ON CONFLICT (pool, txid, tx_seq) DO NOTHING
  `;
}

/**
 * Read all boundary deltas for `pool`, ordered by (block_height ASC, id ASC)
 * — the original apply order. See the file-level comment for why this
 * ordering is load-bearing.
 */
export async function readAllPoolBoundaryFlows<P extends Pool>(
  pool: P,
  conn: Conn,
): Promise<BoundaryDelta<P>[]> {
  const rows = await conn<
    Array<{ txid: string; block_height: number; delta_zat: string }>
  >`
    SELECT txid, block_height, delta_zat
    FROM pool_boundary_flows
    WHERE pool = ${pool}
    ORDER BY block_height ASC, id ASC
  `;
  return rows.map((r) => ({
    pool,
    txid: asHex(r.txid),
    height: r.block_height,
    deltaZat: BigInt(r.delta_zat),
  }));
}

/**
 * Delete boundary deltas with block_height > H from `pool`. Records at
 * height H are retained. After the call, the table is consistent with
 * chain tip at height H. Returns the number of rows deleted.
 */
export async function rollbackPoolBoundaryFlowsToHeight<P extends Pool>(
  pool: P,
  height: number,
  conn: Conn,
): Promise<number> {
  const result = await conn`
    DELETE FROM pool_boundary_flows
    WHERE pool = ${pool} AND block_height > ${height}
  `;
  return result.count;
}
