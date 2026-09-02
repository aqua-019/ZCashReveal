/**
 * Postgres persistence for `blocks` - the height to block-time mapping.
 *
 * WHY THIS TABLE EXISTS. Plan section 3.3's Orchard drain measures a velocity
 * "from block timestamps", and before migration 005 there was no block timestamp
 * anywhere in this schema. The nearest thing, `pool_snapshots.ts`, is
 * `TIMESTAMPTZ NOT NULL DEFAULT NOW()`: the moment the INDEXER wrote the row.
 * That is correct to within seconds while the indexer sits at the tip,
 * arbitrarily wrong across a catch-up sync, and indistinguishable from the real
 * thing once it is a number on a chart.
 *
 * WHY A TABLE RATHER THAN A COLUMN ON `pool_snapshots`, in one line, with the
 * argument in 005's own header: a block has ONE time, and a column on
 * `pool_snapshots` would store that one consensus number four times per height,
 * in four independently written rows with nothing holding them equal.
 *
 * SECONDS, NOT MILLISECONDS, and the field name says so. The block header's own
 * field is an integer number of seconds (`DecodedBlock.time`,
 * `BlockHeaderResult.time`), and this module stores it unconverted. The
 * millisecond form every estimator wants (`PoolBalanceSample.timeMs`) is derived
 * once at the read boundary, in the process that needs it.
 *
 * NO IN-MEMORY COUNTERPART, unlike the four pool tables. There is no
 * `BlockIndex` in `src/state/` because nothing replays a block time into memory:
 * the drain reads this table directly, over a height range, from another process.
 */

import type { Conn } from "./conn.js";
import type { Hex } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * One block's identity and time, as this table holds it.
 *
 * `timeS` IS THE HEADER'S OWN INTEGER, not a `Date` and not milliseconds. A
 * `Date` here would invite a timezone question that a consensus integer has no
 * answer to, and milliseconds would advertise a resolution the chain does not
 * have - the low three digits would be zero on every row.
 */
export interface BlockTime {
  readonly height: number;
  /** Unix SECONDS from the block header. Never a wall clock. */
  readonly timeS: number;
  readonly hash: Hex;
}

/**
 * Write one block's height, time and hash.
 *
 * `ON CONFLICT (height) DO UPDATE`, WHICH `writePoolSnapshot` NOW MATCHES AND
 * THE THREE REMAINING POOL WRITERS DO NOT. Those three use DO NOTHING because
 * Module 1's in-memory index detects the real conflict and throws first, so the
 * database never sees one. (`writePoolNullifier` is a fourth case again: it
 * updates one column, and only for the same spend.) There is no such index here, and a height
 * genuinely CHANGES its block across a reorg: the same height then carries a
 * different hash and a different time, and DO NOTHING would keep the orphaned
 * block's timestamp forever while every later read looked correct. Refreshing is
 * the only answer that stays true, which is the argument `persistLeakReport`
 * makes for recomputation.
 *
 * A reorg deeper than one block is handled by {@link rollbackBlocksToHeight},
 * which the driver calls before re-applying - this UPDATE is what makes a
 * single-block replacement safe on its own.
 */
export async function writeBlock(record: BlockTime, conn: Conn): Promise<void> {
  await conn`
    INSERT INTO blocks (height, time_s, hash)
    VALUES (
      ${record.height},
      ${record.timeS},
      ${record.hash}
    )
    ON CONFLICT (height) DO UPDATE
      SET time_s = EXCLUDED.time_s,
          hash   = EXCLUDED.hash
  `;
}

/**
 * Read the blocks in `[lowHeight, highHeight]`, ascending by height.
 *
 * `time_s` IS A `BIGINT` AND POSTGRES.JS HANDS A `BIGINT` BACK AS A STRING, so
 * it is parsed with `Number` rather than read as one. That was measured against
 * a real Postgres 16 rather than assumed - `INTEGER` returns a JS number,
 * `BIGINT` and `NUMERIC` return strings, `TIMESTAMPTZ` returns a `Date` - and it
 * is the same boundary `crossingsFromRows` crosses for `amount_zat`.
 *
 * `Number` and not `BigInt`: a unix second is far below 2^53 and every consumer
 * of a block time in this project is a `number`. The column is `BIGINT` for a
 * different reason, which is that unix seconds pass `INT_MAX` in January 2038.
 */
export async function readBlockTimes(
  lowHeight: number,
  highHeight: number,
  conn: Conn,
): Promise<BlockTime[]> {
  const rows = await conn<Array<{ height: number; time_s: string; hash: string }>>`
    SELECT height, time_s, hash
    FROM blocks
    WHERE height >= ${lowHeight} AND height <= ${highHeight}
    ORDER BY height ASC
  `;
  return rows.map((r) => ({
    height: r.height,
    timeS: Number(r.time_s),
    hash: asHex(r.hash),
  }));
}

/**
 * Delete blocks above H. Rows at height H are retained, matching the other five
 * per-table rollbacks exactly - the four pool ones and
 * {@link rollbackPoolSnapshotsToHeight} - so a driver can call all six with the
 * same argument. (The count was "four pool rollbacks ... all five" when written,
 * in the same commit that added the fifth; gate round 4.)
 * Returns the number of rows deleted.
 */
export async function rollbackBlocksToHeight(height: number, conn: Conn): Promise<number> {
  const result = await conn`
    DELETE FROM blocks
    WHERE height > ${height}
  `;
  return result.count;
}

/**
 * The lowest and highest rows, which the runtime reads at startup: the lowest
 * is the BASE the indexer opened at (HANDOFF-12, `runtime/chain-replay.ts`)
 * and the highest is where it left off. `null` when the table is empty, which
 * is a cold start and not an error.
 */
export async function readLowestBlock(conn: Conn): Promise<BlockTime | null> {
  const rows = await conn<Array<{ height: number; time_s: string; hash: string }>>`
    SELECT height, time_s, hash FROM blocks ORDER BY height ASC LIMIT 1
  `;
  const r = rows[0];
  return r === undefined ? null : { height: r.height, timeS: Number(r.time_s), hash: asHex(r.hash) };
}

export async function readHighestBlock(conn: Conn): Promise<BlockTime | null> {
  const rows = await conn<Array<{ height: number; time_s: string; hash: string }>>`
    SELECT height, time_s, hash FROM blocks ORDER BY height DESC LIMIT 1
  `;
  const r = rows[0];
  return r === undefined ? null : { height: r.height, timeS: Number(r.time_s), hash: asHex(r.hash) };
}
