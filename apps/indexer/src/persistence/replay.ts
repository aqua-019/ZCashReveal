/**
 * Snapshot/replay and chain-level reorg primitive for the per-pool state
 * machine. Reads from disk into an in-memory PoolState<P>; rolls back
 * persisted state to a given chain tip.
 */

import type { Sql } from "postgres";
import type { Pool } from "@zcashreveal/types";
import type { PoolState } from "../state/pool-state.js";
import { readAllPoolCommitments } from "./pool-commitments.js";
import { readAllPoolAnchors } from "./pool-anchors.js";
import { readAllPoolNullifiers } from "./pool-nullifiers.js";
import { readAllPoolBoundaryFlows } from "./pool-boundary-flows.js";

/**
 * Reconstruct an empty PoolState<P> from persisted records. Reads each of
 * the four indexes in deterministic order and re-applies records via the
 * Module 1 index APIs:
 *
 *   commitments    by position ASC          → commitments.append
 *   anchors        by height_created ASC    → recordAnchor (cross-index check)
 *   nullifiers     by spent_height ASC      → nullifiers.record
 *   boundary flows by (block_height, id)    → value.apply
 *
 * Caller must pass a freshly-constructed PoolState. Replay does NOT
 * verify emptiness — replaying into a populated state will throw
 * CommitmentAlreadyExistsError (or similar) from Module 1.
 *
 * Any ZCashRevealStateError from Module 1 (e.g. AnchorOutOfBoundsError,
 * NegativeBalanceError) propagates unchanged — it surfaces persisted-state
 * corruption directly. Caller decides whether to abort or attempt repair.
 *
 * recordAnchor (rather than anchors.record) is used so the cross-index
 * invariant `maxPosition < commitments.size()` is checked during replay.
 */
export async function replayInto<P extends Pool>(
  state: PoolState<P>,
  conn: Sql,
): Promise<void> {
  const commitments = await readAllPoolCommitments(state.pool, conn);
  for (const c of commitments) {
    state.commitments.append({
      pool: c.pool,
      cmId: c.cmId,
      txid: c.txid,
      height: c.height,
    });
  }

  const anchors = await readAllPoolAnchors(state.pool, conn);
  for (const a of anchors) {
    state.recordAnchor(a);
  }

  const nullifiers = await readAllPoolNullifiers(state.pool, conn);
  for (const nf of nullifiers) {
    state.nullifiers.record(nf);
  }

  const deltas = await readAllPoolBoundaryFlows(state.pool, conn);
  for (const d of deltas) {
    state.value.apply(d);
  }
}

/**
 * Rollback all six chain-derived tables to height H across ALL FOUR POOLS
 * atomically. Deletes records with block_height > H (or the table's
 * analogous height column: pool_anchors.height_created,
 * pool_nullifiers.spent_height). Records at height H are retained.
 *
 * It said "both pools" until HANDOFF-06 widened the model, and the sentence was
 * describing the pool count rather than the query: the DELETEs carry no
 * `WHERE pool = ...` at all, so this function covered a fourth pool the moment
 * one existed and needed no change. Only the description was wrong, which is
 * the kind of stale statement that survives longest because nothing fails.
 *
 * Wraps the six DELETEs in a single transaction so a mid-rollback crash
 * leaves the tables consistent. Works whether `conn` is a top-level Sql
 * or a transaction-bound one — porsager's begin nests as a savepoint.
 *
 * Returns per-table delete counts for diagnostics. The "what was rolled
 * back" enumeration (txids, cm_ids, etc.) is intentionally NOT included
 * here — that's a Module 6+ concern. If a future caller needs the
 * records, either SELECT before the rollback or add a `returnDeleted`
 * option then.
 */
export async function rollbackAllToHeight(
  height: number,
  conn: Sql,
): Promise<{
  commitments: number;
  anchors: number;
  nullifiers: number;
  boundaryFlows: number;
  snapshots: number;
  blocks: number;
}> {
  return conn.begin(async (tx) => {
    const c = await tx`DELETE FROM pool_commitments    WHERE block_height   > ${height}`;
    const a = await tx`DELETE FROM pool_anchors        WHERE height_created > ${height}`;
    const n = await tx`DELETE FROM pool_nullifiers     WHERE spent_height   > ${height}`;
    const b = await tx`DELETE FROM pool_boundary_flows WHERE block_height   > ${height}`;
    // SIX TABLES, NOT FOUR (gate round 1, HIGH). `pool_snapshots` and `blocks`
    // gained writers in HANDOFF-09b and were not added here, so the tree's ONLY
    // reorg primitive left both standing. Both new modules' docblocks assert
    // that "the driver has already called" their rollbacks - and the one
    // function a driver would call did not.
    //
    // What that produced, reproduced by the gate: after
    // `rollbackAllToHeight(100)` and re-applying a competing chain at 101-103,
    // three of four samples in the published drain series carried the ORPHANED
    // chain's balance against the NEW chain's clock. The real drop over that
    // span was 900 -> 300 ZEC and the series said 900 -> 870, as a measurement,
    // with `sampleCount` reporting four samples and nothing signalling the mix.
    //
    // The return type widening is the point of the fix rather than a side
    // effect: a caller that destructures four fields is unchanged, and a caller
    // ASSERTING on the shape - `rollback.test.ts` did, on exactly four keys -
    // is forced to acknowledge the two new tables.
    const s = await tx`DELETE FROM pool_snapshots      WHERE height         > ${height}`;
    const k = await tx`DELETE FROM blocks              WHERE height         > ${height}`;
    return {
      commitments: c.count,
      anchors: a.count,
      nullifiers: n.count,
      boundaryFlows: b.count,
      snapshots: s.count,
      blocks: k.count,
    };
  });
}
