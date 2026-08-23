/**
 * Postgres persistence for LeakReports (v0.1 mempool observability).
 *
 * Module 2's per-pool state-machine tables live in sibling files in this
 * directory (pool-commitments.ts, pool-anchors.ts, etc.). LeakReports are
 * a separate persistence concern owned by the mempool ingest pipeline.
 */

import postgres, { type Sql } from "postgres";
import type { LeakReport } from "@zcashreveal/types";

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
 */
export async function persistLeakReport(sql: Sql, r: LeakReport): Promise<void> {
  await sql`
    INSERT INTO leak_reports (
      txid, seen_at, tip_height_at_seen, tx_version,
      leak_class, overall_severity,
      sprout_value_balance_zat,
      sapling_value_balance_zat, orchard_value_balance_zat,
      sapling_spend_count, sapling_output_count, orchard_action_count,
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
      ${r.bundle.saplingSpends.length},
      ${r.bundle.saplingOutputs.length},
      ${r.bundle.orchardActions.length},
      ${r.valueFlow.netTransparentInflowZat.toString()},
      ${r.valueFlow.direction},
      ${r.fingerprint.feeZat === null ? null : r.fingerprint.feeZat.toString()},
      ${r.fingerprint.expiryDelta},
      ${r.fingerprint.likelyWallet},
      ${sql.json(serializeReport(r) as Parameters<typeof sql.json>[0])}
    )
    ON CONFLICT (txid) DO UPDATE SET
      tip_height_at_seen = EXCLUDED.tip_height_at_seen,
      overall_severity = EXCLUDED.overall_severity,
      report = EXCLUDED.report
  `;
}

function serializeReport(r: LeakReport): unknown {
  return JSON.parse(
    JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}
