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
import { readSnapshotInputs } from "../sources/chain-inputs.js";
import { makeChainQueries } from "../sources/queries.js";
import { mayTruncate } from "./harness.js";

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
/**
 * The N_eff window's inclusive low bound.
 *
 * `tip - 1152 + 1` is 3,427,492, which is BELOW Ironwood's birth height, so the
 * clamp in `readSnapshotInputs` raises it to the birth height. That is the case
 * worth pinning: unclamped, the query returns spends from before the pool
 * existed and `ironwoodBirth` drops them without a word.
 */
const IRONWOOD_LOW = Math.max(BASELINE_HEIGHT, TIP - 1152 + 1);
const hashFor = (n: number) => n.toString(16).padStart(64, "0");

describe.skipIf(!up)("A1/A4/A5 - readSnapshotInputs against a real Postgres", () => {
  const sql = postgres(url, { max: 2, idle_timeout: 5, ...connectionOptions });

  // THE REAL QUERIES, IMPORTED - not a hand copy. The first draft duplicated all
  // three here and justified it by noting that importing `index.ts` opens
  // Postgres, a Redis subscriber and the managed store at module scope. True of
  // `index.ts`, and not a reason to duplicate: `sources/queries.ts` holds no
  // connections, takes `sql` as a parameter, and is what `index.ts` itself now
  // calls. The gate measured the cost of the copy - all three production queries
  // broken at once, suite green.
  const { queryOrchardSeries, queryDrainBaseline, queryIronwoodSpends } = makeChainQueries(sql);

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
    // NO SCHEMA, NO TRUNCATE - the same refusal `_setup.ts` makes, stated here
    // because this suite truncates directly rather than through `truncateAll`
    // and would otherwise be protected by nothing (gate round 2, F16). The
    // isolation used to be a PATH, the `globalSetup` line in this package's
    // vitest config, and a missing path is exactly how this suite came to
    // truncate `public` in the first place. A config that loses the line again,
    // a package move or a rename all reproduce it silently; this turns every one
    // of them into a loud failure on the first `beforeEach`.
    if (!mayTruncate(testSchema, process.env["ZR_ALLOW_PUBLIC_TRUNCATE"])) {
      throw new Error(
        "refused to TRUNCATE: ZR_TEST_SCHEMA is unset, so `search_path` is `public` and this " +
          "would wipe the shared tables. This package's vitest config must declare " +
          '`globalSetup: ["../indexer/test/global-setup.ts"]`, or set ' +
          "ZR_ALLOW_PUBLIC_TRUNCATE=1 if the database really is disposable.",
      );
    }
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
      // THE ORCHARD BASELINE SITS TEN BLOCKS BELOW THE CONFIGURED HEIGHT, so the
      // baseline query's `<=` - "the indexer may not have written a snapshot at
      // exactly the activation height" - is exercised rather than assumed, and
      // so that a SAPLING row can be placed between the two. Without that row
      // the baseline query's `pool = 'orchard'` predicate was not load-bearing:
      // deleting it left the whole suite green.
      [BASELINE_HEIGHT - 10, 900_000n, BASE_TIME_S - 3600 * 30, BASE_WRITE_S],
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

    // SAPLING DECOYS, SO THE FOUR POOL PREDICATES ARE LOAD-BEARING (gate round 1,
    // MEDIUM). Without these the fixture held only orchard snapshots and only
    // ironwood spends, so deleting `s.pool = 'orchard'`, `n.pool = 'ironwood'`,
    // `a.pool = n.pool` or the baseline's `pool = 'orchard'` - each on its own -
    // left the whole suite green. Each decoy carries a value that would be
    // WRONG if it leaked: a sapling balance the drain must not see, and a
    // sapling anchor whose max_position differs from the ironwood one, so a
    // leak changes a published number rather than merely a row count.
    await sql`
      INSERT INTO pool_snapshots (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count, ts)
      VALUES ('sapling', ${TIP}, ${(1_000_000n * ZAT_PER_ZEC).toString()}, 0, 0, 0, to_timestamp(${BASE_WRITE_S}))
    `;
    // BETWEEN THE ORCHARD BASELINE AND THE CONFIGURED BASELINE HEIGHT, so it is
    // the row a baseline query missing its pool predicate would pick - and its
    // balance differs, so the leak changes a published number rather than a row
    // count.
    await sql`
      INSERT INTO pool_snapshots (pool, height, balance_zat, commitment_count, nullifier_count, anchor_count, ts)
      VALUES ('sapling', ${BASELINE_HEIGHT - 5}, ${(1_234_000n * ZAT_PER_ZEC).toString()}, 0, 0, 0, to_timestamp(${BASE_WRITE_S}))
    `;
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('sapling', ${"ee".repeat(32)}, ${TIP - 20}, '77')
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('sapling', ${"44".repeat(32)}, ${"dd".repeat(32)}, ${TIP - 7}, ${"ee".repeat(32)})
    `;

    // WINDOW EDGES, so the low-bound arithmetic is exercised (gate round 1,
    // LOW). Without these the spends sat at TIP-10/-9/-8, nowhere near an edge,
    // and replacing BOTH low bounds with the literal 0, or dropping either `+1`,
    // left the suite green. `ironwoodLow` is inclusive and `ironwoodLow - 1` is
    // not; both anchors resolve, so admission is decided by the bound alone.
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"cd".repeat(32)}, ${TIP - 2000}, '10')
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"55".repeat(32)}, ${"e5".repeat(32)}, ${IRONWOOD_LOW - 1}, ${"cd".repeat(32)})
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"66".repeat(32)}, ${"e6".repeat(32)}, ${IRONWOOD_LOW}, ${"cd".repeat(32)})
    `;

    // ONE ANCHOR AND TWO IRONWOOD SPENDS. The second cites an anchor that is NOT
    // in pool_anchors, which is A5's fail side and must be excluded.
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"ee".repeat(32)}, ${TIP - 20}, '4090')
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
    // `pool_snapshots.ts` is the write time, and the fixture wrote thirty hours
    // of chain time in four seconds of it.
    //
    // THE HEIGHT BOUND MATCHES `drainLow` EXACTLY, and the first draft's did
    // not: it read `TIP - 200` where the real series query opens at
    // `TIP - 9215`, so the baseline row was in one series and absent from the
    // other and the comment's claim of identical membership was false (gate
    // round 1, LOW). The conclusion was unaffected - including the baseline
    // widens the write-time span and makes the ratio larger, not smaller - but a
    // later reader would have trusted the sentence.
    const writeTimeRows = await sql<Array<{ height: number; balance_zat: string; time_s: string }>>`
      SELECT height, balance_zat, EXTRACT(EPOCH FROM ts)::bigint AS time_s
      FROM pool_snapshots
      WHERE pool = 'orchard' AND height >= ${TIP - 9215} AND height <= ${TIP}
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

    // FIVE IRONWOOD SPENDS ARE ON DISK AND TWO ARE ADMITTED. Each of the three
    // that are not is a distinct member of the exclusion set, so the assertion
    // discriminates between the reasons rather than merely counting:
    //   nf 22  anchor_root names a root that is not in pool_anchors
    //   nf 33  anchor_root is NULL
    //   nf 55  below the window's inclusive low bound
    // The first two are dropped by the join rather than counted as zero -
    // `candidateCount > 0n` is ironwoodBirth's admission rule, so a zero would
    // exclude them while looking like a measurement.
    const onDisk = await sql<Array<{ n: string }>>`
      SELECT count(*)::text AS n FROM pool_nullifiers WHERE pool = 'ironwood'
    `;
    expect(onDisk[0]?.n, "the fixture lost rows").toBe("5");
    expect(spends).toHaveLength(2);

    const counts = spends.map((sp) => sp.candidateCount).sort((a, b) => Number(a - b));
    // 4090 + 1. Positions are 0-indexed inclusive, so an off-by-one here would
    // publish a claim level computed over the wrong set size.
    //
    // THE FIXTURE VALUE IS ITSELF THE ASSERTION (gate round 1, MEDIUM). It was
    // 4095 = 2^12 - 1, the one number where `max_position + 1` is numerically
    // indistinguishable from "round up to the next power of two", and 4096 is
    // exactly the constant a hardcoded implementation picks. Measured at 4095: a
    // hardcoded `4096n` passed this assertion, the neffSeries one, and the same
    // one in `instruments-wired.test.ts`; only the A5 fail side below caught it,
    // and that test exists to prove something else. At 4090 all of them catch
    // it, and so does a next-power-of-two implementation.
    // Two DIFFERENT bounds, from two different anchors, so a single hardcoded
    // constant cannot satisfy both.
    expect(counts).toEqual([11n, 4091n]);
    expect(spends.every((sp) => sp.pool === "ironwood")).toBe(true);

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    const neff = snapshot.neffSeries;
    if (neff === null) throw new Error("neffSeries is null; A1 should have caught this");
    expect(neff.spendCount).toBe(2);
    expect(neff.series.map((pt) => pt.candidateCount).sort((a, b) => a - b)).toEqual([11, 4091]);
  });

  it("A5 the window's low bound is INCLUSIVE, clamped to the birth height, and one block below it is not", async () => {
    // THE ARITHMETIC WAS CORRECT AND ENTIRELY UNTESTED (gate round 1, LOW):
    // replacing both low bounds with the literal 0, or dropping either `+1`,
    // left the whole suite green because every fixture spend sat ten blocks
    // below the tip. The two rows this pins straddle the edge and share an
    // anchor, so admission is decided by the bound and nothing else.
    //
    // AND THE EDGE IS THE BIRTH HEIGHT, NOT `tip - window + 1`, which is what
    // adding these rows exposed: the raw window opens 651 blocks BELOW Ironwood's
    // birth, so without the clamp the query returned a spend that `ironwoodBirth`
    // then dropped - `ironwoodSpends` had two entries and `neffSeries` published
    // one, with nothing anywhere saying which.
    const inputs = await readSnapshotInputs(deps(), tip);
    expect(inputs.ironwoodWindow?.lowHeight, "the published window must be the clamped one").toBe(
      BASELINE_HEIGHT,
    );
    const heights = (inputs.ironwoodSpends ?? []).map((sp) => sp.height);
    expect(heights, "the row AT the low bound must be admitted").toContain(IRONWOOD_LOW);
    expect(heights, "the row one block BELOW it must not be").not.toContain(IRONWOOD_LOW - 1);

    // THE QUERY AND THE SERIES NOW AGREE, which is the property the clamp buys.
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    expect(snapshot.neffSeries?.spendCount).toBe(heights.length);
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
    expect(spends).toHaveLength(3);
    // max_position 9 -> Cand_0 = 10, a third distinct bound, so no two spends in
    // this assertion can be confused for one another.
    expect(spends.map((sp) => sp.candidateCount).sort((a, b) => Number(a - b))).toEqual([
      10n,
      11n,
      4091n,
    ]);
    // The null-anchor spend and the out-of-window one are STILL excluded: this
    // fail side moved exactly ONE of the three excluded rows, which is what makes
    // it name a member rather than simply switching the join on.
  });

  it("re-basing the DRAIN CHART does not move Ironwood's birth height", async () => {
    // A REGRESSION PIN FOR A DEFECT THAT WAS SILENT. The first draft of this
    // handoff read `birthHeight` from `SNAPSHOT_DRAIN_BASELINE_HEIGHT`, arguing
    // one configured height beats two. But that value is a CHART ORIGIN an
    // operator may legitimately re-base - `orchardDrain`'s own docblock invites
    // it - while a birth height is a consensus fact. Sharing them meant moving
    // the chart origin above a spend's height silently dropped that spend from
    // `neffSeries`: a real measurement, of a window nobody asked for, with
    // nothing on the page saying so.
    //
    // THE MUTATION IS A DATA ONE, drawn from the set the predicate must reject:
    // a drain baseline ABOVE the admitted spend's height. Under the old code
    // this produced an empty series; under the current code the series is
    // unchanged, because the two heights are now independent.
    const rebased = loadConfig({
      SNAPSHOT_DRAIN_BASELINE_HEIGHT: String(TIP - 5),
    });
    const inputs = await readSnapshotInputs(deps({ cfg: rebased }), tip);

    expect(inputs.ironwoodWindow?.birthHeight).toBe(BASELINE_HEIGHT);
    expect(inputs.ironwoodSpends).toHaveLength(2);

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    expect(snapshot.neffSeries?.spendCount, "a spend was dropped by a re-based chart origin").toBe(2);

    // AND THE FAIL SIDE, so the assertion above is evidence rather than a
    // restatement: the old conflation, reproduced by passing the re-based height
    // as the birth height directly. The spend sits below it and must vanish.
    const conflated = await readSnapshotInputs(deps({ cfg: rebased }), tip);
    const asOldCode = {
      ...conflated,
      ironwoodWindow: conflated.ironwoodWindow
        ? { ...conflated.ironwoodWindow, birthHeight: rebased.SNAPSHOT_DRAIN_BASELINE_HEIGHT }
        : null,
    };
    const oldSnapshot = buildSnapshot(asOldCode, REAL_INSTRUMENTS, () => undefined);
    expect(
      oldSnapshot.neffSeries?.spendCount,
      "the conflation probe did not discriminate - it must drop the spend",
    ).toBe(0);
  });

  it("F6 spends exist and none can be bounded is an ABSENCE, not a measured zero", async () => {
    // THE STATE OF EVERY DATABASE THAT HAS JUST APPLIED 005. `anchor_root` is
    // nullable with no backfill, so every pre-existing Ironwood spend resolves
    // to no anchor. With an INNER join that returned `[]`, and `buildNeffSeries`
    // reads `[]` as "measured, and no spend qualified": it published
    // `spendCount: 0` and `requires_disclosure: 0`, so the site would have
    // stated, as a finding, that no Ironwood spend requires disclosure - for the
    // whole interval between deploying 005 and the indexer recording anchors
    // (gate round 1, HIGH). SNAPSHOT.md 8.1: "a null renders as an absence and a
    // zero renders as a measurement."
    await sql`UPDATE pool_nullifiers SET anchor_root = NULL WHERE pool = 'ironwood'`;

    const faults: Array<{ panel: string; message: string }> = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel, err) => faults.push({ panel, message: String(err) }) }),
      tip,
    );

    // NULL, NOT []. The distinction is the whole finding.
    expect(inputs.ironwoodSpends).toBeNull();
    expect(inputs.ironwoodWindow).toBeNull();
    // AND THE ABSENCE CARRIES ITS REASON, naming how many spends were seen - an
    // absence with no logged cause is indistinguishable from a panel nobody
    // wired, which is the argument the fault callback already exists for.
    expect(faults.map((f) => f.panel)).toContain("neffSeries");
    expect(faults.some((f) => /none carries a resolvable anchor/.test(f.message))).toBe(true);

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    expect(snapshot.neffSeries, "an unbounded window must publish as an absence").toBeNull();
    // The other panels are untouched: losing one input never costs the document.
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.drain).not.toBeNull();
  });

  it("F6 the other polarity: an EMPTY WINDOW really is a measured zero", async () => {
    // THE FIX MUST NOT SWALLOW THE HONEST CASE. If no Ironwood spend happened in
    // the window at all, we looked and found nothing - that is a measurement,
    // and turning it into an absence would be the opposite error. The two cases
    // are distinguished by the LEFT join returning rows-with-no-anchor versus no
    // rows, which is exactly why the join is a left join.
    await sql`DELETE FROM pool_nullifiers WHERE pool = 'ironwood'`;

    const faults: string[] = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel) => faults.push(panel) }),
      tip,
    );
    expect(inputs.ironwoodSpends).toEqual([]);
    expect(inputs.ironwoodWindow).not.toBeNull();
    expect(faults, "an empty window is not a fault").toEqual([]);

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    expect(snapshot.neffSeries?.spendCount).toBe(0);
  });

  it("F8 a rejecting query costs ONE panel and a logged fault, not the document", async () => {
    // THE DOCBLOCK HAS PROMISED THIS IN CAPITALS SINCE HANDOFF-09 AND THE CODE
    // HAD NO `try` ANYWHERE (gate round 1, HIGH). Executed then: a rejecting
    // query propagated, `SnapshotPublisher` caught it as a build failure, and
    // the tip published nothing at all - `pools`, `residual` and `lastReports`
    // going with it. HANDOFF-09b took the query count from one to four under
    // that promise.
    const boom = () => Promise.reject(new Error("connection terminated unexpectedly"));
    const faults: string[] = [];
    const inputs = await readSnapshotInputs(
      deps({
        queryOrchardSeries: boom,
        onInputFault: (panel) => faults.push(panel),
      }),
      tip,
    );
    expect(faults).toContain("drain");

    // A SPY, so an input absence is distinguishable from an estimator refusal
    // (gate round 2, F15).
    const panelFaults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel) => panelFaults.push(panel));
    expect(snapshot.drain).toBeNull();
    expect(panelFaults, "the absence must come from the INPUT layer").toEqual([]);
    // THE DOCUMENT SURVIVES, which is the half that makes this worth having.
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.neffSeries).not.toBeNull();
    expect(snapshot.pools.length).toBeGreaterThan(0);
  });

  it("F7 a malformed row costs ONE panel, and NaN is reachable through a live CHECK", async () => {
    // `NUMERIC(20,0)` ACCEPTS `'NaN'`, AND `CHECK (max_position >= 0)` DOES NOT
    // EXCLUDE IT, because Postgres sorts NaN above every number. Verified
    // against this database rather than assumed. `BigInt("NaN")` then throws a
    // SyntaxError, and before the fix that escaped `readSnapshotInputs` and cost
    // the whole document.
    await sql`
      INSERT INTO pool_anchors (pool, root, height_created, max_position)
      VALUES ('ironwood', ${"ab".repeat(32)}, ${TIP - 30}, 'NaN')
    `;
    await sql`
      INSERT INTO pool_nullifiers (pool, nf_id, spent_txid, spent_height, anchor_root)
      VALUES ('ironwood', ${"77".repeat(32)}, ${"e7".repeat(32)}, ${TIP - 5}, ${"ab".repeat(32)})
    `;

    const faults: Array<{ panel: string; message: string }> = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel, err) => faults.push({ panel, message: String(err) }) }),
      tip,
    );
    // ASSERT ON THE MESSAGE, NOT THE PANEL NAME (gate round 2, F13). This
    // fixture also trips the partial-anchor fault on the same panel, so
    // `toContain("neffSeries")` was green whether the NaN threw or was silently
    // skipped - an assertion satisfied by a different fault.
    expect(
      faults.some(
        (f) => f.panel === "neffSeries" && /Cannot convert NaN|SyntaxError/.test(f.message),
      ),
      "the right message on the right panel - `orchardSeriesFromRows` throws the same class",
    ).toBe(true);

    // A SPY, NOT `() => undefined` (gate round 2, F15). A panel whose estimator
    // refuses produces the SAME null as a panel with no input, so `toBeNull()`
    // alone stopped discriminating once refusals became absences - which is what
    // `instruments-wired.test.ts` already arms against.
    const panelFaults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel) => panelFaults.push(panel));
    expect(snapshot.neffSeries).toBeNull();
    expect(panelFaults, "the absence must come from the INPUT layer").toEqual([]);
    expect(snapshot.residual).not.toBeNull();
    expect(snapshot.drain).not.toBeNull();
  });

  it("F7 a non-positive drain baseline is an absence WITH a reason, not a silent one", async () => {
    // A negative Orchard balance is a ZIP 209 violation that `turnstileResidual`
    // and `lanesWithShares` both throw on, calling it "our replay being wrong,
    // never the chain". The first draft routed it to `null` and logged nothing,
    // so the identical reading vanished from the page without a trace.
    await sql`UPDATE pool_snapshots SET balance_zat = 0 WHERE pool = 'orchard' AND height = ${BASELINE_HEIGHT - 10}`;

    const faults: string[] = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel) => faults.push(panel) }),
      tip,
    );
    expect(inputs.drainBaseline).toBeNull();
    expect(faults, "a refused baseline must be logged").toContain("drain");

    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    expect(snapshot.drain).toBeNull();
    expect(snapshot.residual).not.toBeNull();
  });

  it("F6 a PARTIAL anchor loss still publishes, and says how many it lost", async () => {
    // THE FAULT THAT REPORTS A PARTIAL LOSS HAD NO COVERAGE AND COULD BE DELETED
    // WHOLE (gate round 2, F6). Its own comment says it is "the only place the
    // gap is stated", because `buildNeffSeries` drops `ironwoodBirth`'s audit
    // record and `countIn - countOut` reaches no reader - so an unstated gap was
    // protected by nothing.
    const faults: Array<{ panel: string; message: string }> = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel, err) => faults.push({ panel, message: String(err) }) }),
      tip,
    );

    // The fixture has two bounded spends and two in-window spends whose anchors
    // do not resolve, so this is the partial case rather than the total one.
    expect(inputs.ironwoodSpends).toHaveLength(2);
    expect(faults.some((f) => /carry no resolvable anchor and are excluded/.test(f.message))).toBe(
      true,
    );
    // AND IT NAMES BOTH NUMBERS. A message that said only "some were excluded"
    // would pass a `toContain` and tell an operator nothing.
    expect(faults.some((f) => /2 of 4/.test(f.message))).toBe(true);

    // AND THE DOCUMENT CARRIES BOTH NUMBERS, WHICH THE LOG CANNOT DO FOR IT
    // (gate round 2, F7). Publishing `spendCount` alone made a window where most
    // anchors did not resolve read as a share over the whole population: four of
    // five unbounded published "100 per cent require disclosure", computed over
    // the one spend that resolved, with no field that could say so. The log line
    // above is not the document and no reader sees it.
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    const neff = snapshot.neffSeries;
    if (neff === null) throw new Error("neffSeries is null; this is the partial case");
    expect(neff.spendCount).toBe(2);
    expect(neff.windowSpendCount, "the population must be published beside the measurement").toBe(4);
    // The shares are over `spendCount`, and the pair is what makes that legible.
    expect(neff.windowSpendCount).toBeGreaterThan(neff.spendCount);
  });

  it("F7 the fully-measured case publishes the two counts EQUAL, so the pair is not decorative", async () => {
    // THE OTHER POLARITY. If `windowSpendCount` were wired to the same quantity
    // as `spendCount` - the easiest wrong implementation - the assertion above
    // would still pass, because 2 != 4 only distinguishes them when they differ.
    // Here every in-window spend resolves, so the two are equal by measurement
    // rather than by construction.
    await sql`DELETE FROM pool_nullifiers WHERE anchor_root IS NULL OR anchor_root = ${"ff".repeat(32)}`;
    const inputs = await readSnapshotInputs(deps(), tip);
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, () => undefined);
    const neff = snapshot.neffSeries;
    if (neff === null) throw new Error("neffSeries is null; every anchor resolves here");
    expect(neff.spendCount).toBe(2);
    expect(neff.windowSpendCount).toBe(2);
  });

  it("F3 a tip BELOW the birth height is a MEASURED EMPTY series, not an absence and not an inverted window", async () => {
    // TWO DEFECTS, ONE ROUND APART, AND THE SECOND WAS THE FIX FOR THE FIRST.
    //
    // Round 2: the birth clamp had no upper bound at the tip, so on any tip
    // below NU6.3 it built [birthHeight, tip] with the low end ABOVE the high
    // end, `ironwoodBirth` threw, and the only line an operator saw blamed the
    // ESTIMATOR for a window the input layer manufactured - once per block, for
    // every block of an initial sync.
    //
    // Round 3: the guard that fixed it returned `null`, which publishes the same
    // `neffSeries: null` as "no Ironwood spend source" - and SNAPSHOT.md 8.1
    // THEN made that null render as "needs an Ironwood spend source
    // (HANDOFF-09b)", naming a handoff for an absence no handoff can close. The
    // same document drew that distinction against itself one line later. Round 4
    // swept 8.1 so all four rows name a CONDITION and none names a handoff, so
    // this paragraph is history: do not read the quoted string as current.
    //
    // The honest answer is the one `ironwoodBirth` documents: "a `highHeight`
    // below `birthHeight` is NOT an error: it is a window before the pool
    // existed, and the empty series is the correct answer to it."
    const early = { height: BASELINE_HEIGHT - 1000, hash: hashFor(1), timeMs: BASE_TIME_S * 1000 };
    const faults: Array<{ panel: string; message: string }> = [];
    const inputs = await readSnapshotInputs(
      deps({ onInputFault: (panel, err) => faults.push({ panel, message: String(err) }) }),
      early,
    );

    // MEASURED AND EMPTY, not absent.
    expect(inputs.ironwoodSpends).toEqual([]);
    expect(inputs.ironwoodWindow).not.toBeNull();
    // AND THE WINDOW IS NOT INVERTED, which is what the estimator throws on.
    expect(inputs.ironwoodWindow!.lowHeight).toBeLessThanOrEqual(inputs.ironwoodWindow!.highHeight);
    expect(inputs.ironwoodWindow!.spendsInWindow).toBe(0);
    // AND NOTHING IS REPORTED ON THE FAULT CHANNEL. This assertion used to read
    // `expect(faults.some(/does not exist yet at this height/)).toBe(true)` -
    // round 3 pinned its own defect as correct behaviour, which is why F-46-1
    // survived that round and needed a fourth. The panel is a measurement; the
    // one production wiring of `onInputFault` says a query failed; nothing
    // failed. See `chain-inputs.ts` for why the answer is no report rather than
    // a quieter one.
    expect(faults, "a measurement must not be reported as a failed query").toEqual([]);

    const panelFaults: string[] = [];
    const snapshot = buildSnapshot(inputs, REAL_INSTRUMENTS, (panel) => panelFaults.push(panel));
    // THE PANEL PUBLISHES, with zero spends over a population of zero - which is
    // a true statement about a pool that does not exist, and is distinguishable
    // from the null that means "no source".
    expect(snapshot.neffSeries).not.toBeNull();
    expect(snapshot.neffSeries?.spendCount).toBe(0);
    expect(snapshot.neffSeries?.windowSpendCount).toBe(0);
    // NOT `toEqual([])`: `drain` legitimately refuses at this tip, because the
    // fixture holds no Orchard snapshot at or below it. The claim under test is
    // narrower and is the one that was false.
    expect(panelFaults, "the N_eff estimator must not be blamed for this").not.toContain(
      "neffSeries",
    );
  });

  it("F-46-1 a pre-birth tip reports NOTHING on the fault channel, whose message says a query failed", async () => {
    // ROUND 3'S FIX CORRECTED THE RENDERING LAYER AND LEFT THE LOG LAYER STATING
    // THE FALSEHOOD IT REMOVED (gate round 4, L2's F-46-1). The panel is a
    // MEASUREMENT here - `spends: []` over a real window - and the branch still
    // called `fault("neffSeries", ...)`, whose one production wiring in
    // `index.ts` logs at ERROR: "an input query failed; publishing that panel as
    // a stated absence". Both halves false, on every block of an initial sync.
    //
    // THE QUERY THROWS IF IT IS CALLED, so "no query failed" is demonstrated
    // rather than argued: reaching it at all would fail this test by a different
    // route than the assertion.
    const explode = () => {
      throw new Error("queryIronwoodSpends must not be called below the birth height");
    };

    // THE DATA MUTATION IS THE TIP - two values of one variable, not two
    // versions of the code (the Q2 rule). One block BELOW the birth height and
    // one block ABOVE it, through the same fixture and the same code.
    const below = { height: BASELINE_HEIGHT - 1, hash: hashFor(2), timeMs: BASE_TIME_S * 1000 };
    const above = { height: BASELINE_HEIGHT + 1, hash: hashFor(3), timeMs: BASE_TIME_S * 1000 };

    const belowFaults: Array<{ panel: string; message: string }> = [];
    const belowInputs = await readSnapshotInputs(
      deps({
        queryIronwoodSpends: explode,
        onInputFault: (panel, err) => belowFaults.push({ panel, message: String(err) }),
      }),
      below,
    );

    // NOTHING ON THE FAULT CHANNEL. This is the assertion; it is red against the
    // code as round 3 left it.
    expect(belowFaults, "a measurement must not be reported as a failed query").toEqual([]);
    // AND THE PANEL IS STILL THE MEASUREMENT round 3 made it.
    expect(belowInputs.ironwoodSpends).toEqual([]);
    expect(belowInputs.ironwoodWindow?.spendsInWindow).toBe(0);
    // THE CONDITION IS PUBLISHED RATHER THAN LOGGED, AND THIS ASSERTS IT ON THE
    // DOCUMENT rather than on the inputs - which is the only place the claim can
    // be checked. An earlier draft asserted `ironwoodWindow.highHeight <
    // birthHeight` on the INPUTS; the window is not published at all
    // (`buildNeffSeries` drops it, gate round 3's F4), so that assertion could
    // have been green while the claim it stood for was false. What a reader
    // actually has is the snapshot's top-level `height` and the panel's
    // `birthHeight`, both required fields.
    const belowSnapshot = buildSnapshot(belowInputs, REAL_INSTRUMENTS, () => undefined);
    expect(belowSnapshot.neffSeries).not.toBeNull();
    expect(belowSnapshot.height).toBeLessThan(belowSnapshot.neffSeries!.birthHeight);

    // THE OTHER VALUE OF THE SAME VARIABLE. One block above, the query IS
    // called - so the two tips take different paths and the assertion above is
    // not green merely because nothing ever runs.
    //
    // AND THAT IS COUNTED RATHER THAN ASSERTED IN A COMMENT. An earlier draft
    // of this half passed the real query and asserted only on its outputs,
    // which made the sentence above a claim the test did not check: mutating
    // the pre-birth guard to `if (true)` left BOTH halves of this test green
    // (eight other tests in this file caught it, so the suite was safe and the
    // test's statement about itself was false). The counter is what makes the
    // DATA mutation discriminate - which is the half the Q2 rule exists for.
    const aboveFaults: string[] = [];
    let aboveCalls = 0;
    const aboveInputs = await readSnapshotInputs(
      deps({
        queryIronwoodSpends: (lo: number, hi: number) => {
          aboveCalls += 1;
          return queryIronwoodSpends(lo, hi);
        },
        onInputFault: (panel) => aboveFaults.push(panel),
      }),
      above,
    );
    expect(aboveCalls, "above the birth height the query IS called").toBe(1);
    expect(aboveFaults, "an ordinary tip reports nothing either").toEqual([]);
    expect(aboveInputs.ironwoodWindow!.highHeight).toBeGreaterThanOrEqual(
      aboveInputs.ironwoodWindow!.birthHeight,
    );
  });

  it.runIf(!up)("A1 SKIPPED, WITH ITS REASON: no reachable Postgres with migration 005 applied", () => {
    expect(up).toBe(false);
  });
});
