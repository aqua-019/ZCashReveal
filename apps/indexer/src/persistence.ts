/**
 * Postgres persistence for LeakReports.
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

export async function persistLeakReport(sql: Sql, r: LeakReport): Promise<void> {
  await sql`
    INSERT INTO leak_reports (
      txid, seen_at, tip_height_at_seen, tx_version,
      leak_class, overall_severity,
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
      ${r.bundle.saplingValueBalanceZat.toString()},
      ${r.bundle.orchardValueBalanceZat.toString()},
      ${r.bundle.saplingSpends.length},
      ${r.bundle.saplingOutputs.length},
      ${r.bundle.orchardActions.length},
      ${r.valueFlow.netTransparentInflowZat.toString()},
      ${r.valueFlow.direction},
      ${r.fingerprint.feeZat.toString()},
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
