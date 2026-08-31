/**
 * Postgres persistence for pool_snapshots (S^p_h on disk).
 *
 * In-memory counterpart: `PoolState<P>.snapshot(height)` in
 * src/state/pool-state.ts, which this table mirrors field for field (migration
 * 003's own note). Read order (height ASC) is load-bearing here in a way it is
 * not for the other four tables: the drain reads one pool THROUGH TIME, and
 * `orchardDrain` documents its input as a series.
 *
 * THIS IS THE FIRST WRITER THIS TABLE HAS EVER HAD. Migration 003 created it in
 * August and closed with "pool_snapshots is written per confirmed block by the
 * runtime pool state (HANDOFF-12)". Until this file there was no
 * `INSERT INTO pool_snapshots` anywhere outside one test probe asserting the
 * four-pool CHECK. That is why there is no backfill anywhere in HANDOFF-09b: not
 * "no rows on the VPS yet", but no rows at all, ever, in any environment.
 *
 * THE BLOCK TIME IS NOT ON THIS ROW, AND THAT IS THE DESIGN RATHER THAN AN
 * OMISSION. It lives once per height in `blocks` (migration 005). Writing it
 * here would store one consensus number four times per height - once per pool -
 * and would force `PoolStateSnapshot`, a type shared through
 * `packages/zec-types`, to gain a field that nothing in memory produces. The
 * consequence a reader can check by eye: {@link writePoolSnapshot} takes the
 * snapshot and the connection and nothing else, exactly like the other four pool
 * writers, and needs no third parameter for a clock.
 */

import type { Sql } from "postgres";
import type { Pool, PoolStateSnapshot } from "@zcashreveal/types";

/**
 * Write one pool's snapshot at one height. Idempotent on (pool, height) via
 * ON CONFLICT DO NOTHING.
 *
 * DO UPDATE, AGREEING WITH `writeBlock`, AND THE FIRST DRAFT DID NOT (gate round
 * 1, HIGH). It used `DO NOTHING`, on the argument that a snapshot is a pure
 * function of the pool's state at a height and the driver has already rolled
 * back on a reorg. `blocks.ts` argued the opposite for the same event - that a
 * height genuinely changes its block, so the row must refresh - and the two
 * writers were therefore describing two different reorg protocols for one
 * moment.
 *
 * What the disagreement produced, reproduced by the gate: replay one block
 * without a rollback and `blocks` takes chain B's timestamp while
 * `pool_snapshots` REFUSES chain B's balance and keeps chain A's. The publisher
 * then joins them and publishes chain B's clock married to chain A's balance,
 * as a measurement, with `sampleCount` reporting one sample and nothing saying
 * the two halves came from different chains.
 *
 * So both writers now refresh. It is the only variant that is safe when the
 * driver is wrong, and being wrong is precisely the case the ON CONFLICT clause
 * exists for - a correct driver never reaches it, because
 * {@link rollbackPoolSnapshotsToHeight} has already run.
 *
 * `balanceZat` and `commitmentCount` are `bigint` in `PoolStateSnapshot` and
 * `NUMERIC(20,0)` in the table, so both cross the boundary as strings - the same
 * `.toString()` the other three pool writers do for the same reason. A
 * `NUMERIC` handed a JS number would be the precision loss this project counts
 * zatoshi to avoid.
 */
export async function writePoolSnapshot<P extends Pool>(
  record: PoolStateSnapshot<P>,
  conn: Sql,
): Promise<void> {
  await conn`
    INSERT INTO pool_snapshots
      (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count)
    VALUES (
      ${record.pool},
      ${record.height},
      ${record.balanceZat.toString()},
      ${record.commitmentCount.toString()},
      ${record.nullifierCount},
      ${record.anchorCount}
    )
    ON CONFLICT (pool, height) DO UPDATE
      SET balance_zat      = EXCLUDED.balance_zat,
          commitment_count = EXCLUDED.commitment_count,
          nullifier_count  = EXCLUDED.nullifier_count,
          anchor_count     = EXCLUDED.anchor_count
  `;
}

/**
 * Read one pool's snapshots in `[lowHeight, highHeight]`, ascending by height.
 *
 * The `ts` column is deliberately NOT selected. It is the row's WRITE time and
 * reading it is the defect migration 005 exists to remove; a caller wanting a
 * time joins `blocks`. Leaving it out of the projection means a later reader
 * cannot reach for it by accident.
 */
export async function readPoolSnapshots<P extends Pool>(
  pool: P,
  lowHeight: number,
  highHeight: number,
  conn: Sql,
): Promise<PoolStateSnapshot<P>[]> {
  const rows = await conn<
    Array<{
      height: number;
      balance_zat: string;
      commitment_count: string;
      nullifier_count: number;
      anchor_count: number;
    }>
  >`
    SELECT height, balance_zat, commitment_count, nullifier_count, anchor_count
    FROM pool_snapshots
    WHERE pool = ${pool} AND height >= ${lowHeight} AND height <= ${highHeight}
    ORDER BY height ASC
  `;
  return rows.map((r) => ({
    pool,
    height: r.height,
    balanceZat: BigInt(r.balance_zat),
    commitmentCount: BigInt(r.commitment_count),
    nullifierCount: r.nullifier_count,
    anchorCount: r.anchor_count,
  }));
}

/**
 * Delete snapshots above H for `pool`. Rows at height H are retained, matching
 * the four pool rollbacks and {@link rollbackBlocksToHeight}. Returns the number
 * of rows deleted.
 */
export async function rollbackPoolSnapshotsToHeight<P extends Pool>(
  pool: P,
  height: number,
  conn: Sql,
): Promise<number> {
  const result = await conn`
    DELETE FROM pool_snapshots
    WHERE pool = ${pool} AND height > ${height}
  `;
  return result.count;
}
