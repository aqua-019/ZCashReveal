/**
 * A1, A4 and A5 - the PRODUCTION path against a real Postgres holding real rows.
 *
 * WHY THIS FILE IS SEPARATE FROM `instruments-wired.test.ts`, WHICH ALREADY
 * DRIVES `readSnapshotInputs`. That suite injects the four queries as functions
 * returning literals. It proves the WIRING - that the values reach the
 * estimators and the estimators reach the document - and it cannot prove the
 * QUERIES, because there are none: a join that names a column that does not
 * exist, or that drops every row, is invisible to it. HANDOFF-09a's A1 was
 * ambiguous between the instrument side and the production path and said so;
 * HANDOFF-09b's is the production path only, and "not a literal, not a fixture
 * standing in for the query" is the scope's own wording.
 *
 * IF POSTGRES IS NOT REACHABLE THIS SUITE SKIPS ITSELF WITH A NAMED REASON AND
 * SAYS SO, on the pattern `redis-sink.integration.test.ts` established: a green
 * run that silently skipped an integration assertion reports coverage it does
 * not have.
 */

import postgres, { type Sql } from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { REAL_INSTRUMENTS } from "../instruments.js";
import { buildSnapshot } from "../snapshot-builder.js";
import {
  readSnapshotInputs,
  type DrainBaselineQuery,
  type IronwoodSpendQuery,
  type IronwoodSpendRow,
  type OrchardSeriesQuery,
  type OrchardSeriesRow,
} from "../sources/chain-inputs.js";

const DEFAULT_URL = "postgres://zcashreveal:zcashreveal@localhost:5432/zcashreveal";
const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;

/** The schema this RUN owns, matching the indexer's integration setup. */
const testSchema = process.env["ZR_TEST_SCHEMA"];
const connectionOptions =
  testSchema === undefined || testSchema === ""
    ? {}
    : { connection: { search_path: `"${testSchema}", public` } };

async function reachable(): Promise<boolean> {
  let probe: Sql | null = null;
  try {
    probe = postgres(url, { max: 1, connect_timeout: 1, idle_timeout: 0, ...connectionOptions });
    await probe`SELECT 1 FROM blocks LIMIT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe?.end({ timeout: 1 }).catch(() => undefined);
  }
}

const up = await reachable();

const BASELINE_HEIGHT = 3_428_143;
const TIP = BASELINE_HEIGHT + 500;
const ZAT_PER_ZEC = 100_000_000n;
/** A round wall-clock second, so the arithmetic below is checkable by eye. */
const BASE_TIME_S = 1_780_000_000;
/** When the indexer WROTE the rows: one burst, four seconds wide. */
const BASE_WRITE_S = 1_780_200_000;
const hashFor = (n: number) => n.toString(16).padStart(64, "0");

describe.skipIf(!up)("A1/A4/A5 - readSnapshotInputs against a real Postgres", () => {
  const sql = postgres(url, { max: 2, idle_timeout: 5, ...connectionOptions });

  /**
   * The three real queries, character for character what `index.ts` composes.
   * Duplicated deliberately and the duplication is the risk this suite carries:
   * `apps/publisher/src/index.ts` opens Postgres, a Redis subscriber and the
   * managed store at module scope, so importing it here would connect to all
   * three. A2 of HANDOFF-09b's gate re-reads both copies against each other.
   */
  const queryOrchardSeries: OrchardSeriesQuery = (lowHeight, highHeight) =>
    sql<OrchardSeriesRow[]>`
      SELECT s.height, s.balance_zat, b.time_s
      FROM pool_snapshots s
      JOIN blocks b ON b.height = s.height
      WHERE s.pool = 'orchard' AND s.height >= ${lowHeight} AND s.height <= ${highHeight}
      ORDER BY s.height ASC
    `;

  const queryDrainBaseline: DrainBaselineQuery = async (baselineHeight) => {
    const rows = await sql<Array<{ height: number; balance_zat: string }>>`
      SELECT height, balance_zat FROM pool_snapshots
      WHERE pool = 'orchard' AND height <= ${baselineHeight}
      ORDER BY height DESC LIMIT 1
    `;
    return rows[0] ?? null;
  };

  const queryIronwoodSpends: IronwoodSpendQuery = (lowHeight, highHeight) =>
    sql<IronwoodSpendRow[]>`
      SELECT n.spent_txid, n.spent_height, a.max_position
      FROM pool_nullifiers n
      JOIN pool_anchors a ON a.pool = n.pool AND a.root = n.anchor_root
      WHERE n.pool = 'ironwood'
        AND n.spent_height >= ${lowHeight} AND n.spent_height <= ${highHeight}
      ORDER BY n.spent_height ASC, n.nf_id ASC
    `;

  const chainInfo = () =>
    Promise.resolve({
      valuePools: [
        { id: "transparent", chainValueZat: 4_000_000n * ZAT_PER_ZEC },
        { id: "sprout", chainValueZat: 22_621n * ZAT_PER_ZEC },
        { id: "sapling", chainValueZat: 1_200_000n * ZAT_PER_ZEC },
        { id: "orchard", chainValueZat: 708_841n * ZAT_PER_ZEC },
        { id: "ironwood", chainValueZat: 300_000n * ZAT_PER_ZEC },
      ],
      chainSupply: { chainValueZat: 16_889_987n * ZAT_PER_ZEC },
    });

  const deps = (over: Partial<Parameters<typeof readSnapshotInputs>[0]> = {}) => ({
    readChainInfo: chainInfo,
    queryMigrations: null,
    queryOrchardSeries,
    queryDrainBaseline,
    queryIronwoodSpends,
    cfg: loadConfig({}),
    labelsVersion: "labels-9-2026-08-22",
    now: () => (BASE_TIME_S + 10) * 1000,
    ...over,
  });

  const tip = { height: TIP, hash: hashFor(TIP), timeMs: BASE_TIME_S * 1000 };

  /**
   * RE-SEEDED PER TEST, NOT ONCE PER FILE. The first draft seeded in `beforeAll`
   * and restored what it deleted in a `finally`, which is how the A1 fail side
   * came to hand A4 a series spaced 75 seconds apart instead of an hour - the
   * restore wrote times the seed never had, and A4 then measured -47,789 ZEC/h
   * against a fixture it did not build. It failed loudly, which is the only
   * reason it is a footnote rather than a published velocity. Shared mutable
   * fixture state between an assertion and its own fail side is not worth the
   * few milliseconds it saves.
   */
  beforeEach(async () => {
    await sql.unsafe("TRUNCATE pool_snapshots, blocks, pool_nullifiers, pool_anchors RESTART IDENTITY");

    // THE FIXTURE MODELS A CATCH-UP SYNC, WHICH IS THE ONE CONDITION UNDER WHICH
    // THE TWO CLOCKS VISIBLY DISAGREE - and therefore the only fixture on which
    // A4 can discriminate at all. Thirty hours of CHAIN time are written in four
    // seconds of WALL time, because the indexer was behind and caught up in a
    // burst. `ts` is set explicitly rather than left to `DEFAULT NOW()`, so the
    // probe does not depend on how fast this loop happens to run.
    //
    // THE BASELINE SITS 30 HOURS BACK, OUTSIDE THE 24-HOUR WINDOW, and that is
    // load-bearing. A first draft put it four hours back; `selectWindow` then
    // admitted it to the 24h window and the velocity was -47,789 ZEC/h - which
    // was the CORRECT answer for that fixture and not the quantity the test
    // meant to measure. The estimator was right and the fixture was wrong.
    const samples: Array<[number, bigint, number, number]> = [
      // height, balance ZEC, block time, write time
      [BASELINE_HEIGHT, 900_000n, BASE_TIME_S - 3600 * 30, BASE_WRITE_S],
      [TIP - 144, 711_841n, BASE_TIME_S - 3600 * 3, BASE_WRITE_S + 1],
      [TIP - 96, 710_841n, BASE_TIME_S - 3600 * 2, BASE_WRITE_S + 2],
      [TIP - 48, 709_841n, BASE_TIME_S - 3600, BASE_WRITE_S + 3],
      [TIP, 708_841n, BASE_TIME_S, BASE_WRITE_S + 4],
    ];
    for (const [height, zec, timeS, writeS] of samples) {
      await sql`INSERT INTO blocks (height, time_s, hash) VALUES (${height}, ${timeS}, ${hashFor(height)})`;
      await sql`
        INSERT INTO pool_snapshots (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count, ts)
        VALUES ('orchard', ${height}, ${(zec * ZAT_PER_ZEC).toString()}, 0, 0, 0, to_timestamp(${writeS}))
      `;
    }

    // ONE ANCHOR AND TWO IRONWOOD SPENDS. The second cites an anchor that is NOT
    // in pool_anchors, which is A5's fail side and must be excluded.
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"ee".repeat(32)}, ${TIP - 20}, '4095')
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"11".repeat(32)}, ${"aa".repeat(32)}, ${TIP - 10}, ${"ee".repeat(32)})
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"22".repeat(32)}, ${"bb".repeat(32)}, ${TIP - 9}, ${"ff".repeat(32)})
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"33".repeat(32)}, ${"cc".repeat(32)}, ${TIP - 8}, NULL)
    `;
  });

  afterAll(() => sql.end({ timeout: 5 }));

  it("A1 all four panels are measurements on a snapshot built through the real queries", async () => {
    const inputs = await readSnapshotInputs(deps(), tip);
    const faults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel) => faults.push(panel));

    // A REFUSED PANEL AND AN ABSENT ONE PRODUCE THE SAME NULL since gate round 2
    // of HANDOFF-09a made refusals into absences, so the fault list is checked
    // first or `not.toBeNull()` below would not say what it appears to say.
    expect(faults, "a panel was REFUSED rather than absent").toEqual([]);

    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.migrationHist).toBeNull(); // queryMigrations is null here, by construction
    expect(snapshot.drain).not.toBeNull();
    expect(snapshot.neffSeries).not.toBeNull();
  });

  it("A1 fail side: the same rows with their blocks deleted publish drain as an absence again", async () => {
    // A DATA MUTATION, DRAWN FROM THE EXCLUSION SET - "rows exist but carry no
    // joinable block time" - rather than a code mutation. Withholding the query
    // function would prove only that the parameter is read.
    // EVERY block row, not a range. A first attempt deleted `height >= TIP - 200`
    // and left the baseline's block standing, because the drain's window is
    // eight days of blocks and reaches far below that - so the series was one
    // sample rather than none, `drained` was still computable, and the panel did
    // not go null. The narrower delete proved nothing and looked like a defect.
    await sql`DELETE FROM blocks`;

    const inputs = await readSnapshotInputs(deps(), tip);
    expect(inputs.orchardSeries).toEqual([]);

    const faults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel) => faults.push(panel));
    expect(snapshot.drain, "drain survived losing every block time").toBeNull();
    // AND IT IS A REFUSAL WITH A NAMED CAUSE, not a silent absence: `orchardDrain`
    // throws when the series holds no sample at or below `atHeight`, and the
    // publisher logs that rather than dropping the panel without a reason.
    expect(faults).toContain("drain");
    // THE OTHER PANELS ARE UNAFFECTED. A fail side that took the whole document
    // down would be a different defect wearing this one's clothes.
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.neffSeries).not.toBeNull();
  });

  it("A4 the velocities are computed from BLOCK time, and WRITE time gives a different, wrong answer", async () => {
    // THE ASSERTION THE WHOLE MIGRATION EXISTS FOR. The two clocks are made to
    // differ the way a catch-up sync makes them differ: four blocks spanning
    // three hours of chain time were all WRITTEN within one second of each
    // other, because the indexer caught up in a burst.
    const inputs = await readSnapshotInputs(deps(), tip);
    const blockTimeSeries = inputs.orchardSeries;
    expect(blockTimeSeries.length).toBeGreaterThanOrEqual(4);

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    const drain = snapshot.drain;
    if (drain === null) throw new Error("drain is null; A1 should have caught this");

    // 1000 ZEC an hour out of the pool, measured from the header timestamps:
    // 711,841 -> 708,841 across the three hourly samples inside the 24h window.
    // The baseline is 30 hours back and correctly outside it.
    expect(drain.velocity24hZecPerHour).toBeCloseTo(-1000, 6);
    // AND THE 7d WINDOW REACHES THE BASELINE, so it is a different number over a
    // different span - 191,159 ZEC across 30 hours. Two windows agreeing here
    // would mean the window selector was not selecting.
    expect(drain.velocity7dZecPerHour).toBeCloseTo(-191_159 / 30, 6);

    // NOW THE SAME ROWS THROUGH THE CLOCK THIS MIGRATION EXISTS TO REPLACE.
    // `pool_snapshots.ts` is the write time, and every row here was written by
    // the same INSERT loop microseconds apart.
    const writeTimeRows = await sql<Array<{ height: number; balance_zat: string; time_s: string }>>`
      SELECT height, balance_zat, EXTRACT(EPOCH FROM ts)::bigint AS time_s
      FROM pool_snapshots
      WHERE pool = 'orchard' AND height >= ${TIP - 200} AND height <= ${TIP}
      ORDER BY height ASC
    `;
    const writeInputs = await readSnapshotInputs(
      deps({ queryOrchardSeries: () => Promise.resolve(writeTimeRows) }),
      tip,
    );
    const writeSnapshot = buildSnapshot(writeInputs, REAL_INSTRUMENTS, () => undefined);
    const writeDrain = writeSnapshot.drain;
    if (writeDrain === null) throw new Error("the write-time drain is null; the probe did not run");

    // THE TWO CLOCKS MUST DISAGREE, AND THE ASSERTION IS THAT THEY DO. If they
    // agreed, this test would be green while proving nothing - which is exactly
    // the shape CLAUDE.md calls a fail side that does not discriminate.
    const blockV = drain.velocity24hZecPerHour;
    const writeV = writeDrain.velocity24hZecPerHour;
    expect(blockV, "the block-time velocity is null; the fixture is wrong").not.toBeNull();
    expect(writeV, "the write-time velocity is null; the probe did not discriminate").not.toBeNull();
    // Three hours of chain time collapsed into under a second of write time, so
    // the write-time rate is larger by orders of magnitude and of no use.
    expect(Math.abs(writeV as number)).toBeGreaterThan(Math.abs(blockV as number) * 100);

    // THE DRAINED FRACTION IS THE SAME EITHER WAY, and that is the point of
    // measuring the velocity rather than D: `D = 1 - current/baseline` reads two
    // balances and no clock, so it CANNOT distinguish the two sources. An
    // assertion written on `drained` alone would have passed against the wrong
    // clock and is the reason this one is written on the velocity.
    expect(writeDrain.drained).toBeCloseTo(drain.drained, 12);
  });

  it("A5 candidateCount is max_position + 1, and a spend whose anchor is unknown is excluded", async () => {
    const inputs = await readSnapshotInputs(deps(), tip);
    const spends = inputs.ironwoodSpends;
    if (spends === null) throw new Error("ironwoodSpends is null; A1 should have caught this");

    // THREE SPENDS ARE ON DISK AND ONE IS ADMITTED. The other two are the
    // exclusion set's two members: an anchor_root naming a root that is not in
    // pool_anchors, and a null anchor_root. Both are dropped by the join rather
    // than counted as zero - `candidateCount > 0n` is ironwoodBirth's admission
    // rule, so a zero would exclude them while looking like a measurement.
    const onDisk = await sql<Array<{ n: string }>>`
      SELECT count(*)::text AS n FROM pool_nullifiers WHERE pool = 'ironwood'
    `;
    expect(onDisk[0]?.n, "the fixture lost rows").toBe("3");
    expect(spends).toHaveLength(1);

    // 4095 + 1. Positions are 0-indexed inclusive, so an off-by-one here would
    // publish a claim level computed over the wrong set size.
    expect(spends[0]?.candidateCount).toBe(4096n);
    expect(spends[0]?.pool).toBe("ironwood");

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    const neff = snapshot.neffSeries;
    if (neff === null) throw new Error("neffSeries is null; A1 should have caught this");
    expect(neff.spendCount).toBe(1);
    expect(neff.series[0]?.candidateCount).toBe(4096);
  });

  it("A5 fail side: giving the orphaned spend a real anchor admits it, so the exclusion was the join", async () => {
    // THE OTHER POLARITY, AND IT IS THE ONE THAT MAKES THE TEST ABOVE EVIDENCE.
    // A spend could be missing from the series for many reasons - the window,
    // the pool filter, a typo in the join. Recording the anchor it cites and
    // watching it appear proves the exclusion was the missing edge and nothing
    // else.
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"ff".repeat(32)}, ${TIP - 19}, '9')
    `;
    const inputs = await readSnapshotInputs(deps(), tip);
    const spends = inputs.ironwoodSpends ?? [];
    expect(spends).toHaveLength(2);
    // max_position 9 -> Cand_0 = 10, a different bound from the first spend's,
    // so the two cannot be confused for one another.
    expect(spends.map((s) => s.candidateCount).sort((a, b) => Number(a - b))).toEqual([10n, 4096n]);
    // The null-anchor spend is STILL excluded: this fail side moved exactly one
    // of the two excluded rows, which is what makes it name a member rather than
    // simply switching the join on.
  });

  it.runIf(!up)("A1 SKIPPED, WITH ITS REASON: no reachable Postgres with migration 005 applied", () => {
    expect(up).toBe(false);
  });
});
