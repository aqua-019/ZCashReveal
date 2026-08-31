/**
 * Postgres persistence for pool_nullifiers (NFSet^p_h on disk).
 *
 * In-memory counterpart: NullifierIndex<P> in src/state/nullifier-index.ts.
 * Read order (spent_height ASC, nf_id ASC) is deterministic — NullifierIndex
 * is order-independent but stable ordering simplifies test assertions.
 */

import type { Sql } from "postgres";
import type { Hex, Pool, SpentNullifier } from "@zcashreveal/types";
import { asHex } from "@zcashreveal/types";

/**
 * Write a single spent nullifier, and the anchor it cited when the caller knows
 * one. Idempotent on (pool, nf_id): a re-write of the SAME spend fills in an
 * anchor that arrived later and changes nothing else. The application layer
 * (Module 1's NullifierIndex.record) detects duplicates and throws
 * DoubleSpendError BEFORE the DB write - the DB never sees a true double-spend,
 * so the conflict clause never has to arbitrate one.
 *
 * `anchorRoot` IS THE MISSING EDGE MIGRATION 005 ADDED, AND IT IS WHAT MAKES
 * `neffSeries` MEASURABLE. `IronwoodSpend.candidateCount` is Cand_0, which
 * `analysis/candidate-set.ts` defines as `pool_anchors.max_position + 1n`. That
 * bound is already on disk; what no table could say is WHICH anchor a given
 * spend cited, so the bound could not be attached to the spend. The pairing
 * exists in the decoder — `DecodedBlockTx` carries `ironwoodActions[].nullifier`
 * and `ironwoodAnchor` side by side — and was discarded before it reached disk.
 *
 * IT IS A TRAILING OPTIONAL PARAMETER RATHER THAN A FIELD ON
 * `SpentNullifier<P>`, and rather than the middle position
 * `writePoolBoundaryFlow(record, txSeq, conn)` uses. Both choices are
 * deliberate. `SpentNullifier` is a SHARED type in `packages/zec-types`, and
 * `NullifierIndex` — its main consumer — bounds cardinality and has no use for
 * an anchor; widening it would put an optional field in front of every consumer
 * for one writer's benefit, which is the type-widening shape CLAUDE.md warns
 * releases a set of untested branches. And `txSeq` sits in the middle because it
 * is REQUIRED; an optional parameter cannot, without making `conn` optional too.
 *
 * THE CONFLICT CLAUSE FILLS IN A LATE ANCHOR AND NEVER OVERWRITES ONE (gate
 * round 1, MEDIUM). The first draft kept `DO NOTHING` unchanged, which made the
 * ordering migration 005 explicitly designs for - "the anchor may also arrive
 * after the spend; an Ironwood root comes from `z_gettreestate`, a separate
 * call" - permanently unrecordable: the second write was refused, no
 * `UPDATE ... SET anchor_root` exists anywhere in the tree, and the spend was
 * dropped from `neffSeries` forever. On the page that is indistinguishable from
 * an anchor that genuinely cannot be resolved, which is the one thing the null
 * is supposed to mean.
 *
 * `COALESCE(existing, incoming)` keeps the recorded value winning, so the "never
 * overwrite an observation" property survives here too: only a NULL is ever
 * filled in. THREE pool writers still share it - `writePoolSnapshot` is no
 * longer one of them, because it refreshes every column for the reason
 * `blocks.ts` gives.
 *
 * AND THE `WHERE` REFUSES A MIXED-CHAIN ROW, WHICH THE FIRST `DO UPDATE` BUILT
 * (gate round 2, MEDIUM). The clause updates `anchor_root` alone, so
 * `spent_txid` and `spent_height` keep the FIRST write's values. Under the very
 * reorg scenario both of this branch's `DO UPDATE`s are justified by - "the only
 * variant that is safe when the driver is wrong" - that produced a row carrying
 * chain A's spend identity beside chain B's anchor, and the publisher then
 * bounded an ORPHANED txid with an anchor it never cited and published a claim
 * level for a transaction that is not on the chain. It is the same failure
 * `writeBlock` and `writePoolSnapshot` were just made to agree in order to
 * prevent, reintroduced by the other conflict clause in the same commit: those
 * two refresh EVERY column and so cannot mix, and this one refreshes exactly
 * one.
 *
 * So the update applies only when the incoming row is the SAME spend. A
 * different spend's write falls through to doing nothing, which is the right
 * answer for a case this clause was never designed for and which a rollback is
 * what actually handles.
 *
 * DEFAULTING TO `null` IS THE HONEST DEFAULT AND IS NOT THE THING MIGRATION 005
 * ARGUES AGAINST. What 005 refuses is a `DEFAULT 0` on a derived COUNT, because
 * `candidateCount > 0n` is an admission predicate and a manufactured zero would
 * silently exclude a spend while looking like a measurement. A null anchor
 * claims nothing: it says "this caller did not resolve one", the join then
 * yields no count, and `rawCandidateRange`'s own contract — "a candidate count
 * cannot be claimed" — falls out rather than being restated.
 */
export async function writePoolNullifier<P extends Pool>(
  record: SpentNullifier<P>,
  conn: Sql,
  anchorRoot: Hex | null = null,
): Promise<void> {
  await conn`
    INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
    VALUES (
      ${record.pool},
      ${record.nfId},
      ${record.spentTxid},
      ${record.spentHeight},
      ${anchorRoot}
    )
    ON CONFLICT (pool, nf_id) DO UPDATE
      SET anchor_root = COALESCE(pool_nullifiers.anchor_root, EXCLUDED.anchor_root)
      WHERE pool_nullifiers.spent_txid   = EXCLUDED.spent_txid
        AND pool_nullifiers.spent_height = EXCLUDED.spent_height
  `;
}

/**
 * Read the anchor a spend cited, or null when none was recorded.
 *
 * Separate from {@link readAllPoolNullifiers} rather than folded into it,
 * because that function's return type is `SpentNullifier<P>[]` and its one
 * caller is `replayInto`, which hydrates a `NullifierIndex` that has no field to
 * put an anchor in. A reader that wants the edge asks for it.
 */
export async function readPoolNullifierAnchor<P extends Pool>(
  pool: P,
  nfId: Hex,
  conn: Sql,
): Promise<Hex | null> {
  const rows = await conn<Array<{ anchor_root: string | null }>>`
    SELECT anchor_root
    FROM pool_nullifiers
    WHERE pool = ${pool} AND nf_id = ${nfId}
  `;
  const root = rows[0]?.anchor_root;
  return root === undefined || root === null ? null : asHex(root);
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
