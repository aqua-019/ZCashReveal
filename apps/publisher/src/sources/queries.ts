/**
 * The SQL this publisher runs, in ONE place that both the composition root and
 * the assertions import.
 *
 * WHY THIS MODULE EXISTS. HANDOFF-09b's first draft wrote the three queries in
 * `index.ts` and again, by hand, in `snapshot-inputs.integration.test.ts`, with
 * a comment saying the duplication was deliberate because importing `index.ts`
 * "opens Postgres, a Redis subscriber and the managed store at module scope" -
 * true of `index.ts`, and not a reason to duplicate, because a module holding no
 * connections has neither problem. The mitigation the comment named was a human
 * re-read scoped to one gate, which expires at merge.
 *
 * What the duplication cost, measured by the gate rather than argued: with ALL
 * THREE production queries broken at once - the Ironwood join stripped of
 * `a.pool = n.pool`, `WHERE n.pool = 'ironwood'` replaced by `1 = 1`, `blocks`
 * joined on `s.nullifier_count` instead of `s.height`, and `pool = 'orchard'`
 * dropped from the baseline - the full publisher suite stayed GREEN. Nothing in
 * the repository executed the queries the publisher actually runs.
 *
 * So they live here and there is one copy. That is the fix LEDGER-08 fold 6 asks
 * for over another review: the duplication is DELETED rather than policed.
 *
 * NO CONNECTION IS OPENED HERE. Every function takes `sql` as a parameter, so
 * importing this module from a test costs nothing and reaches nothing.
 */

import type { Sql } from "postgres";

import type {
  DrainBaselineQuery,
  IronwoodSpendQuery,
  IronwoodSpendRow,
  MigrationQuery,
  MigrationRow,
  OrchardSeriesQuery,
  OrchardSeriesRow,
} from "./chain-inputs.js";

/** Every query `readSnapshotInputs` needs, bound to one connection. */
export interface ChainQueries {
  readonly queryMigrations: MigrationQuery;
  readonly queryOrchardSeries: OrchardSeriesQuery;
  readonly queryDrainBaseline: DrainBaselineQuery;
  readonly queryIronwoodSpends: IronwoodSpendQuery;
}

export function makeChainQueries(sql: Sql): ChainQueries {
  return {
    queryMigrations: (lowHeight, highHeight) =>
      sql<MigrationRow[]>`
        SELECT txid, height, amount_zat
        FROM migrations_zip318
        WHERE height >= ${lowHeight} AND height <= ${highHeight}
        ORDER BY height ASC
      `,

    /**
     * The drain's series.
     *
     * AN INNER JOIN, so a snapshot whose height has no `blocks` row is dropped
     * rather than kept with a null time: a null reaching
     * `PoolBalanceSample.timeMs` is a `NaN` velocity, which is a worse answer
     * than a shorter series. Migration 005 declines the foreign key that would
     * have prevented the WRITE, because refusing to record an observation
     * destroys the evidence; dropping it on READ is where the honest answer
     * belongs, and `orchardDrain`'s `sampleCount` reports the shortfall.
     */
    queryOrchardSeries: (lowHeight, highHeight) =>
      sql<OrchardSeriesRow[]>`
        SELECT s.height, s.balance_zat, b.time_s
        FROM pool_snapshots s
        JOIN blocks b ON b.height = s.height
        WHERE s.pool = 'orchard' AND s.height >= ${lowHeight} AND s.height <= ${highHeight}
        ORDER BY s.height ASC
      `,

    /**
     * The drain's denominator: the newest Orchard snapshot at or below the
     * baseline height.
     *
     * `<=` rather than `=` because the indexer may not have written a snapshot
     * at exactly the activation height - it writes one per block it processes,
     * and a node that started syncing later has no row there. The nearest
     * earlier reading is the honest baseline, and `drainBaseline.height` is
     * published beside the result so a reader is never told the wrong height.
     */
    queryDrainBaseline: async (baselineHeight) => {
      const rows = await sql<Array<{ height: number; balance_zat: string }>>`
        SELECT height, balance_zat
        FROM pool_snapshots
        WHERE pool = 'orchard' AND height <= ${baselineHeight}
        ORDER BY height DESC
        LIMIT 1
      `;
      return rows[0] ?? null;
    },

    /**
     * Ironwood spends in a window, with the anchor bound where one is resolvable.
     *
     * A **LEFT** JOIN, AND THE DIRECTION OF THAT DECISION IS THE WHOLE POINT.
     * An inner join returns only the bounded spends, which makes "no Ironwood
     * spend happened" and "spends happened and none could be bounded"
     * indistinguishable - and the second is the CURRENT state of any database
     * that has just applied 005, because `anchor_root` is nullable with no
     * backfill, so every pre-existing row joins to nothing. `buildNeffSeries`
     * reads an empty array as "measured, and no spend qualified" and publishes
     * `spendCount: 0` with `requires_disclosure: 0` - the site stating, as a
     * finding, that no Ironwood spend requires disclosure (gate round 1, HIGH).
     *
     * The left join returns both facts in one round trip: the row count is how
     * many spends there were, and the non-null `max_position` count is how many
     * could be bounded. `readSnapshotInputs` turns that pair into a measurement
     * or a stated absence.
     *
     * `n.pool` IS SELECTED RATHER THAN ASSUMED, even though the WHERE clause
     * pins it. `ironwoodSpendsFromRows` used to stamp `pool: "ironwood"` on
     * every row, which made `ironwoodBirth`'s own first admission rule -
     * `s.pool === "ironwood"` - inert on this path, because the value it tests
     * was manufactured rather than read. That is the same defect this file
     * refuses for `candidateCount`, one level up.
     */
    queryIronwoodSpends: (lowHeight, highHeight) =>
      sql<IronwoodSpendRow[]>`
        SELECT n.spent_txid, n.spent_height, n.pool, a.max_position
        FROM pool_nullifiers n
        LEFT JOIN pool_anchors a ON a.pool = n.pool AND a.root = n.anchor_root
        WHERE n.pool = 'ironwood'
          AND n.spent_height >= ${lowHeight} AND n.spent_height <= ${highHeight}
        ORDER BY n.spent_height ASC, n.nf_id ASC
      `,
  };
}
