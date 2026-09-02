/**
 * Postgres persistence for pool_anchors (Roots^p_h on disk).
 *
 * In-memory counterpart: AnchorIndex<P> in src/state/anchor-index.ts.
 * Read order (height_created ASC) is deterministic but not load-bearing —
 * AnchorIndex is order-independent.
 */

import type { Conn } from "./conn.js";
import type { Anchor, Pool } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * Write a single anchor. Idempotent on (pool, root) via ON CONFLICT
 * DO NOTHING. The application layer (Module 1's AnchorIndex.record) detects
 * conflicting (max_position, height_created) for an existing root BEFORE
 * the DB write and throws ConflictingAnchorError — the DB never sees a
 * conflicting overwrite, so DO NOTHING is safe.
 */
export async function writePoolAnchor<P extends Pool>(
  record: Anchor<P>,
  conn: Conn,
): Promise<void> {
  await conn`
    INSERT INTO pool_anchors (pool, root, height_created, max_position)
    VALUES (
      ${record.pool},
      ${record.root},
      ${record.heightCreated},
      ${record.maxPosition.toString()}
    )
    ON CONFLICT (pool, root) DO NOTHING
  `;
}

/**
 * Read all anchors for `pool`, ordered by height_created ASC for
 * determinism (AnchorIndex itself is order-independent).
 */
export async function readAllPoolAnchors<P extends Pool>(
  pool: P,
  conn: Conn,
): Promise<Anchor<P>[]> {
  const rows = await conn<
    Array<{ root: string; height_created: number; max_position: string }>
  >`
    SELECT root, height_created, max_position
    FROM pool_anchors
    WHERE pool = ${pool}
    ORDER BY height_created ASC, root ASC
  `;
  return rows.map((r) => ({
    pool,
    root: asHex(r.root),
    heightCreated: r.height_created,
    maxPosition: BigInt(r.max_position),
  }));
}

/**
 * Delete anchors with height_created > H from `pool`. Records at height H
 * are retained. After the call, the table is consistent with chain tip
 * at height H. Returns the number of rows deleted.
 */
export async function rollbackPoolAnchorsToHeight<P extends Pool>(
  pool: P,
  height: number,
  conn: Conn,
): Promise<number> {
  const result = await conn`
    DELETE FROM pool_anchors
    WHERE pool = ${pool} AND height_created > ${height}
  `;
  return result.count;
}
