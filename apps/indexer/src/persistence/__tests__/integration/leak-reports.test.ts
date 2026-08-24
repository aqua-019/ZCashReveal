/**
 * `persistLeakReport` against a real Postgres - and the first suite this table
 * has ever had.
 *
 * WHY IT DID NOT EXIST AND WHY IT DOES NOW. `leak_reports` is written on every
 * transaction the indexer sees and there was no integration test for it: the
 * files beside this one cover anchors, commitments, nullifiers, boundary flows,
 * replay, rollback, conservation, precision and the migration runner, and none
 * of them touches the leak report. That gap has a specific shape. The INSERT is
 * a tagged template with a hand-written column list, and postgres.js row types
 * are caller-asserted, so a column the writer forgot is not a compile error and
 * not a runtime error either - the value simply never lands, while
 * `serializeReport` puts it in the JSONB blob regardless. One row then holds a
 * figure in one place and not in another, which is exactly the split HANDOFF-06
 * recorded for `fee_zat`.
 *
 * HANDOFF-07 adds two columns to that list, so this is the handoff that owes
 * the test. What it checks is not the SQL but the pairing: every per-pool value
 * on the report reaches a column, the ON CONFLICT list refreshes the ones that
 * can change between analyses, and an unsupported report writes NULL where a
 * zero would read as a measurement.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { asHex, type Hex, type LeakReport } from "@zcashreveal/types";

import { persistLeakReport } from "../../leak-reports.js";
import { getSql, isPostgresReachable } from "./_setup.js";

const reachable = await isPostgresReachable();
const sql: Sql = getSql();

const hx = (seed: string): Hex => asHex(seed.padStart(64, "0"));

/** A minimal but complete report. Only the fields the columns read are varied. */
function report(over: {
  txid: Hex;
  ironwoodValueBalanceZat?: bigint;
  ironwoodActions?: number;
  unsupported?: LeakReport["unsupported"];
}): LeakReport {
  const ironwoodActions = Array.from({ length: over.ironwoodActions ?? 0 }, (_v, index) => ({
    pool: "ironwood" as const,
    index,
    nullifier: hx(`a${String(index)}`),
    cmx: hx(`b${String(index)}`),
    cv: hx(`c${String(index)}`),
    rk: hx(`d${String(index)}`),
    ephemeralKey: hx(`e${String(index)}`),
    encCiphertextSize: 580,
    outCiphertextSize: 80,
  }));
  return {
    txid: over.txid,
    seenAt: 1_785_000_000_000,
    tipHeightAtSeen: 3_430_000,
    txVersion: 6,
    leakClass: over.unsupported ? "UNSUPPORTED_TX" : "MIGRATION_O2I",
    overallSeverity: "INFO",
    bundle: {
      saplingSpends: [],
      saplingOutputs: [],
      saplingValueBalanceZat: 0n,
      orchardActions: [],
      orchardValueBalanceZat: 50_000_000_000n,
      orchardAnchor: null,
      orchardFlags: null,
      ironwoodActions,
      ironwoodValueBalanceZat: over.ironwoodValueBalanceZat ?? -49_999_990_000n,
      ironwoodAnchor: null,
      ironwoodFlags: null,
    },
    transparent: { vin: [], vout: [] },
    identity: {
      sender: { transparentAddresses: [], nullifiers: [], commitments: [] },
      recipient: { transparentAddresses: [], nullifiers: [], commitments: [] },
    },
    spends: [],
    outputs: [],
    valueFlow: {
      sproutValueBalanceZat: 0n,
      saplingValueBalanceZat: 0n,
      orchardValueBalanceZat: 50_000_000_000n,
      ironwoodValueBalanceZat: over.ironwoodValueBalanceZat ?? -49_999_990_000n,
      perPoolZat: [],
      netTransparentInflowZat: 0n,
      isPureShielded: false,
      crossesPoolBoundary: true,
      direction: "DEPOSIT",
    },
    fingerprint: {
      outputCount: 0,
      spendCount: 0,
      outputPadded: false,
      feeZat: null,
      isZip317ConventionalFee: null,
      logicalActions: 2,
      expiryDelta: null,
      hasMemo: false,
      likelyWallet: "UNKNOWN_UNPRICED",
    },
    findings: [],
    links: [],
    ...(over.unsupported ? { unsupported: over.unsupported } : {}),
  };
}

interface Row {
  ironwood_value_balance_zat: string | null;
  ironwood_action_count: number | null;
  orchard_value_balance_zat: string | null;
  leak_class: string;
}

async function rowFor(txid: Hex): Promise<Row | undefined> {
  const rows = await sql<Row[]>`
    SELECT ironwood_value_balance_zat, ironwood_action_count,
           orchard_value_balance_zat, leak_class
    FROM leak_reports WHERE txid = ${txid}
  `;
  return rows[0];
}

describe.skipIf(!reachable)("persistLeakReport - the Ironwood columns migration 004 adds", () => {
  beforeEach(async () => {
    await sql`DELETE FROM leak_reports WHERE txid LIKE ${"%f7"}`;
  });

  afterAll(async () => {
    await sql`DELETE FROM leak_reports WHERE txid LIKE ${"%f7"}`;
    await sql.end({ timeout: 5 });
  });

  it("writes the Ironwood balance and action count, so the blob and the columns agree", async () => {
    const txid = hx("11f7");
    await persistLeakReport(sql, report({ txid, ironwoodActions: 2 }));
    const row = await rowFor(txid);

    // NUMERIC comes back as a string, which is what keeps a zatoshi value out
    // of a JS number. Compared as BigInt rather than as text so a future column
    // type change fails loudly instead of on formatting.
    expect(BigInt(row?.ironwood_value_balance_zat ?? "0")).toBe(-49_999_990_000n);
    expect(row?.ironwood_action_count).toBe(2);
    expect(BigInt(row?.orchard_value_balance_zat ?? "0")).toBe(50_000_000_000n);
  });

  it("the ON CONFLICT list refreshes them, because a re-analysis can change them", async () => {
    // `fetchAndAnalyze` re-runs on every ZMQ announcement, so one transaction is
    // analysed repeatedly. The ON CONFLICT list refreshed the JSONB blob and
    // not the columns once before, and one row published two different fees for
    // one transaction. Ironwood is the column most able to change between
    // analyses - NULL while the shape is unreadable, a number once it is not -
    // so it is the one most worth pinning.
    const txid = hx("22f7");
    await persistLeakReport(sql, report({ txid, ironwoodValueBalanceZat: -1n, ironwoodActions: 1 }));
    await persistLeakReport(
      sql,
      report({ txid, ironwoodValueBalanceZat: -49_999_990_000n, ironwoodActions: 3 }),
    );

    const row = await rowFor(txid);
    expect(BigInt(row?.ironwood_value_balance_zat ?? "0")).toBe(-49_999_990_000n);
    expect(row?.ironwood_action_count).toBe(3);
  });

  it("an UNSUPPORTED_TX report writes NULL, not zero, because nothing was measured", async () => {
    // THE ONE ASSERTION THIS TABLE MOST NEEDED. An unsupported report carries
    // `0n` in every quantitative field because the decoder declined to read the
    // transaction, and `0n` in this column would record "measured, and the pool
    // did not move" about a bundle nobody looked at. The writer reads
    // `report.unsupported`, never the zeros.
    const txid = hx("33f7");
    await persistLeakReport(
      sql,
      report({
        txid,
        ironwoodValueBalanceZat: 0n,
        unsupported: { version: 7, reason: "version 7 is outside the range", rawFieldNames: ["txid"] },
      }),
    );

    const row = await rowFor(txid);
    expect(row?.leak_class).toBe("UNSUPPORTED_TX");
    expect(row?.ironwood_value_balance_zat).toBeNull();
    expect(row?.ironwood_action_count).toBeNull();
  });

  it("FAIL SIDE: the same zero on a SUPPORTED report is written as zero", async () => {
    // The discriminating half. If the writer keyed on the value rather than on
    // the flag, this row would be NULL too - and a genuinely measured "the pool
    // did not move" would become indistinguishable from "nobody looked", which
    // is the distinction the column exists to hold.
    const txid = hx("44f7");
    await persistLeakReport(sql, report({ txid, ironwoodValueBalanceZat: 0n, ironwoodActions: 0 }));

    const row = await rowFor(txid);
    expect(row?.ironwood_value_balance_zat).not.toBeNull();
    expect(BigInt(row?.ironwood_value_balance_zat ?? "1")).toBe(0n);
    expect(row?.ironwood_action_count).toBe(0);
  });
});
