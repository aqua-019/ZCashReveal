/**
 * Postgres persistence for LeakReports (v0.1 mempool observability).
 *
 * Module 2's per-pool state-machine tables live in sibling files in this
 * directory (pool-commitments.ts, pool-anchors.ts, etc.). LeakReports are
 * a separate persistence concern owned by the mempool ingest pipeline.
 */

import postgres, { type Sql } from "postgres";
import { serializeWire, type LeakReport } from "@zcashreveal/types";

export function createDb(url: string): Sql {
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: { undefined: null },
  });
}

/**
 * Write one leak report.
 *
 * `fee_zat` IS WRITTEN AS NULL WHEN THE FEE IS UNKNOWN, which migration 003
 * makes possible by dropping the column's `NOT NULL DEFAULT 0`. Until then
 * every row in this table claimed a fee of zero, because the analyser read
 * `tx.feeZat` and no node sends one - so the column recorded a measurement that
 * had never been taken, in a shape indistinguishable from a transaction that
 * genuinely paid nothing.
 *
 * `sprout_value_balance_zat` is new in the same migration. It comes off
 * `valueFlow` rather than `bundle`, because Sprout is a JoinSplit sum and not a
 * decoded bundle - see decoder/sprout.ts.
 *
 * `ironwood_value_balance_zat` AND `ironwood_action_count` ARE NEW IN MIGRATION
 * 004, AND THEY ARE WRITTEN NULL FOR AN UNSUPPORTED TRANSACTION rather than
 * zero. A report with `leakClass === "UNSUPPORTED_TX"` carries defaults in every
 * quantitative field because the decoder declined to read the transaction's
 * shape at all; writing its `0n` into these columns would record "measured, and
 * the pool did not move" about bundles nobody looked at. `report.unsupported`
 * is the flag that says which it is, and it is read here rather than the zeros -
 * which is the rule its own docblock states and the one thing a writer of this
 * table must not skip.
 */
export async function persistLeakReport(sql: Sql, r: LeakReport): Promise<void> {
  // THE ON CONFLICT LIST REFRESHES EVERY RECOMPUTED COLUMN, AND IT DID NOT.
  // `fetchAndAnalyze` re-runs on every ZMQ announcement of a transaction, so one
  // transaction is analysed repeatedly - and since HANDOFF-06 the fee
  // legitimately CHANGES between those analyses: null while a parent is still
  // propagating, a real number once it lands. The list refreshed the JSONB
  // `report` and not the columns, so the blob learned the new fee and the column
  // kept the first answer, and one row published two different fees for one
  // transaction. The gateway reads the COLUMN. Harmless before this handoff only
  // because `fee_zat` was always 0 and could not change.
  //
  // (This reasoning lives here rather than as a `--` comment inside the query:
  // the SQL is a tagged template literal, so a backtick in it terminates the
  // template. That is not a hypothetical - it is how this comment was first
  // written, and `tsc` rejected the file.)
  await sql`
    INSERT INTO leak_reports (
      txid, seen_at, tip_height_at_seen, tx_version,
      leak_class, overall_severity,
      sprout_value_balance_zat,
      sapling_value_balance_zat, orchard_value_balance_zat,
      ironwood_value_balance_zat,
      sapling_spend_count, sapling_output_count, orchard_action_count,
      ironwood_action_count,
      net_transparent_inflow_zat, value_flow_direction,
      fee_zat, expiry_delta, likely_wallet,
      report
    ) VALUES (
      ${r.txid},
      to_timestamp(${Math.floor(r.seenAt / 1000)}),
      ${r.tipHeightAtSeen},
      ${r.txVersion},
      ${r.leakClass},
      ${r.overallSeverity},
      ${r.valueFlow.sproutValueBalanceZat.toString()},
      ${r.bundle.saplingValueBalanceZat.toString()},
      ${r.bundle.orchardValueBalanceZat.toString()},
      ${unmeasured(r) ? null : r.bundle.ironwoodValueBalanceZat.toString()},
      ${r.bundle.saplingSpends.length},
      ${r.bundle.saplingOutputs.length},
      ${r.bundle.orchardActions.length},
      ${unmeasured(r) ? null : r.bundle.ironwoodActions.length},
      ${r.valueFlow.netTransparentInflowZat.toString()},
      ${r.valueFlow.direction},
      ${r.fingerprint.feeZat === null ? null : r.fingerprint.feeZat.toString()},
      ${r.fingerprint.expiryDelta},
      ${r.fingerprint.likelyWallet},
      ${sql.json(serializeWire(r) as Parameters<typeof sql.json>[0])}
    )
    ON CONFLICT (txid) DO UPDATE SET
      tip_height_at_seen = EXCLUDED.tip_height_at_seen,
      overall_severity = EXCLUDED.overall_severity,
      fee_zat = EXCLUDED.fee_zat,
      sprout_value_balance_zat = EXCLUDED.sprout_value_balance_zat,
      sapling_value_balance_zat = EXCLUDED.sapling_value_balance_zat,
      orchard_value_balance_zat = EXCLUDED.orchard_value_balance_zat,
      ironwood_value_balance_zat = EXCLUDED.ironwood_value_balance_zat,
      ironwood_action_count = EXCLUDED.ironwood_action_count,
      value_flow_direction = EXCLUDED.value_flow_direction,
      leak_class = EXCLUDED.leak_class,
      expiry_delta = EXCLUDED.expiry_delta,
      likely_wallet = EXCLUDED.likely_wallet,
      report = EXCLUDED.report
  `;
}

/**
 * Whether this report measured nothing, so its zeros must be written as NULL.
 *
 * READS `unsupported`, NEVER THE ZEROS. An unsupported report's numeric fields
 * are indistinguishable from a genuinely empty transaction's by inspection -
 * that is what makes the flag necessary rather than convenient. The one-line
 * form exists so the two column expressions above cannot drift apart on which
 * condition they test.
 */
function unmeasured(r: LeakReport): boolean {
  return r.unsupported !== undefined;
}

/*
 * THE JSONB COLUMN CARRIES THE SAME WIRE FORM AS THE REDIS SEAM, from the same
 * function. A second, private `serializeReport` stood here until HANDOFF-12 -
 * the same replacer as `index.ts`'s, copied - so one quantity had two writers
 * that happened to agree. `serializeWire` tags every bigint by value, whatever
 * its key, and `reviveWire` is the one reader; whoever writes the first reader
 * of this column inherits one form, and the counts inside an assessment come
 * back as the bigints the type declares rather than as strings (A3).
 */
