/**
 * A6 - conservation across replay and rollback, over all four pools.
 *
 * The assertion: for any sequence of deltas across four pools followed by a
 * rollback to height h, the replayed balances equal the replayed prefix.
 *
 * THE PROPERTY IS SHAPED BY WHAT DOES NOT EXIST. There is no in-memory
 * rollback: ValuePool has no `unapply`, and the three other indexes have no
 * removal method. `rollbackAllToHeight` is not pool-scoped - it deletes across
 * all four tables for every pool at once - while `replayInto` is pool-scoped
 * and mutates a freshly-constructed PoolState in place. So the only way to
 * observe "the balances after a rollback" is to throw the in-memory state away
 * and replay a second time from whatever survived on disk:
 *
 *   plan deltas -> write -> replay into four fresh states -> capture balances
 *   -> rollbackAllToHeight(h) -> replay into four MORE fresh states -> compare.
 *
 * THE EXPECTATION IS SUMMED OVER THE PLAN, NEVER OVER THE ROWS THE DATABASE
 * HANDS BACK. `expectedBalances` filters the generated deltas by `height <= h`
 * and sums `-deltaZat`, which is the definition of Bal^p_h and not a second
 * copy of how the persistence layer arrives at it. A property that recomputed
 * its expectation along the same path as the code under test would agree with
 * that code by construction and could only ever pass; this one disagrees the
 * moment the SQL predicate, the read order or the sign convention moves. The
 * fail-side probe recorded in the handoff flipped `rollbackAllToHeight`'s
 * comparison from `>` to `>=` and this property reported a counterexample.
 *
 * WHY A PLANNER RATHER THAN A FILTER. Four separate throws are reachable from
 * a naively drawn sequence, so `planDeltas` constructs a legal one instead of
 * generating and discarding:
 *
 *   1. NegativeBalanceError - every prefix sum, in (block_height ASC, id ASC)
 *      order, must leave the balance at or above zero. The planner carries the
 *      running balance and sizes each withdrawal against it.
 *   2. ExitOnlyViolation - see the band comment on ORCHARD_EXIT_ONLY below.
 *   3. The UNIQUE (pool, txid, tx_seq) on pool_boundary_flows. `tx_seq` is a
 *      caller-supplied argument and the INSERT is ON CONFLICT DO NOTHING, so a
 *      reused triple is dropped in silence - the test would then pass while
 *      holding less data than it believes it wrote. The planner assigns tx_seq
 *      per (pool, txid), and the property asserts the row count it wrote is the
 *      row count in the table.
 *   4. Heights are non-decreasing in write order, which makes {height <= h}
 *      exactly a prefix of the (block_height ASC, id ASC) read order. That is
 *      what makes the surviving rows a replayable prefix: an arbitrary subset
 *      of a valid sequence is not one, because dropping a deposit that an
 *      earlier withdrawal depended on would throw during the second replay.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fc from "fast-check";
import { asHex, type Hex } from "@zcashreveal/types";
import { orchardExitOnlyFrom } from "../../../decoder/activation-heights.js";
import { PoolState } from "../../../state/pool-state.js";
import { writePoolBoundaryFlow } from "../../pool-boundary-flows.js";
import { replayInto, rollbackAllToHeight } from "../../replay.js";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

/**
 * All four, in the chronological order ShieldedPool declares them. Sprout and
 * Ironwood are the point of this file: they became insertable only when
 * migration 003 widened the pool CHECK, so before that migration every
 * assertion below would have failed as a check_violation on the first write.
 */
const POOLS = ["sprout", "sapling", "orchard", "ironwood"] as const;
type TestPool = (typeof POOLS)[number];

/**
 * ORCHARD IS EXIT-ONLY FROM HERE, AND THIS GENERATOR STAYS IN THAT REGION
 * RATHER THAN STEERING AROUND IT. From NU6.3 (mainnet height 3,428,143)
 * `ValuePool.apply` throws ExitOnlyViolation for any negative Orchard delta,
 * so a generator drawing heights freely would spend its runs failing on the
 * consensus rule instead of testing the property. The base height is therefore
 * drawn from three bands - see `baseHeight` - and the single thing `planDeltas`
 * suppresses is Orchard ENTRY at or above that height, which is exactly what
 * consensus forbids and nothing more. Every other pool-direction-height
 * combination is generated, and the coverage counters at the end of the
 * property assert that the interesting region was actually REACHED rather than
 * merely being reachable.
 *
 * AND "REACHED" CANNOT MEAN A ROW. This guard used to count Orchard rows at or
 * above the activation, which the generator cannot fail to produce: a
 * suppressed Orchard entry stays in the plan as a ZERO delta rather than being
 * dropped (see `planDeltas`), and a zero delta moves nothing across the
 * boundary. Measured over 1000 seeds of 200 runs, the two-band generator this
 * file used to carry produced a median of 93 such rows and a median of 13
 * non-zero ones, with a worst seed at 1 - so `rows > 0` was carried by the
 * no-ops, and suppressing every real Orchard exit above the activation left it
 * green. The counter below counts non-zero deltas, which are the only rows that
 * reach the exit-only branch of `ValuePool.apply` on replay.
 */
const ORCHARD_EXIT_ONLY = orchardExitOnlyFrom("mainnet");

/**
 * How many distinct txids a plan draws from. Smaller than the step count on
 * purpose: transactions that touch two pools, and pools touched twice by one
 * transaction, are what tx_seq exists to disambiguate, and a plan with one
 * txid per row would never construct either.
 */
const TXID_POOL_SIZE = 8;

/** One raw draw. `planDeltas` turns a list of these into a legal sequence. */
interface RawStep {
  readonly poolIndex: number;
  readonly heightStep: number;
  readonly wantsEntry: boolean;
  readonly amountZat: bigint;
}

interface PlannedDelta {
  readonly pool: TestPool;
  readonly txid: Hex;
  readonly height: number;
  readonly deltaZat: bigint;
  readonly txSeq: number;
}

const rawStep = fc.record<RawStep>({
  poolIndex: fc.nat({ max: POOLS.length - 1 }),
  // Zero is included so several rows can share a height, which is the case
  // that separates the (block_height, id) read order from block_height alone.
  heightStep: fc.nat({ max: 3 }),
  wantsEntry: fc.boolean(),
  // 2n ** 40n is the precision gate's own upper probe and is roughly 11,000
  // ZEC, so a whole plan stays far inside NUMERIC(20,0) while still being
  // wide enough that a truncating round-trip would show up as a mismatch.
  amountZat: fc.bigInt({ min: 1n, max: 2n ** 40n }),
});

const baseHeight = fc.oneof(
  // A Sapling-era band, where all four pools move in both directions.
  fc.integer({ min: 1_000_000, max: 1_000_050 }),
  // A band straddling NU6.3. A plan spans at most 3 x 24 = 72 blocks, so a
  // base drawn here can sit wholly below, across, or wholly above activation.
  fc.integer({ min: ORCHARD_EXIT_ONLY - 40, max: ORCHARD_EXIT_ONLY + 8 }),
  // A band that puts the activation INSIDE nearly every plan. The band above
  // is allowed to do that and mostly does not: fast-check biases arrays toward
  // their minimum length and `heightStep` toward 0, so a typical plan spans a
  // handful of blocks rather than the 72 its bounds permit, and a base drawn 40
  // blocks below the activation usually never arrives. Twelve to two blocks
  // below leaves room for Orchard to take an entry first and still cross while
  // steps remain, which is the only shape that generates a non-zero Orchard
  // exit above the activation at all.
  fc.integer({ min: ORCHARD_EXIT_ONLY - 12, max: ORCHARD_EXIT_ONLY - 2 }),
);

/**
 * Turn raw draws into a sequence every layer will accept, carrying the running
 * per-pool balance so that no withdrawal can exceed it. Sign convention is
 * BoundaryDelta's: negative is value entering the pool, positive is value
 * leaving, and the balance moves by `-deltaZat`.
 *
 * A step that asked to withdraw from an empty pool, or to enter Orchard after
 * NU6.3, becomes a zero delta rather than being dropped. Zero is a legal
 * BoundaryDelta - an intra-pool transfer with no boundary movement - and
 * keeping the step means one drawn step is always one row, which is what lets
 * the row-count assertion below be exact.
 */
function planDeltas(base: number, steps: readonly RawStep[]): PlannedDelta[] {
  const planned: PlannedDelta[] = [];
  const balance = new Map<TestPool, bigint>();
  const nextSeq = new Map<string, number>();
  let height = base;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    height += step.heightStep;
    const pool = POOLS[step.poolIndex]!;
    const bal = balance.get(pool) ?? 0n;
    const entryForbidden = pool === "orchard" && height >= ORCHARD_EXIT_ONLY;

    let deltaZat: bigint;
    if (step.wantsEntry && !entryForbidden) {
      deltaZat = -step.amountZat;
    } else if (bal > 0n) {
      // Modulo then +1 lands in [1n, bal], so the balance after this step is
      // in [0n, bal - 1n] and NegativeBalanceError is unreachable by
      // construction rather than by rejection.
      deltaZat = (step.amountZat % bal) + 1n;
    } else {
      deltaZat = 0n;
    }

    balance.set(pool, bal - deltaZat);

    const txid = h(i % TXID_POOL_SIZE);
    const seqKey = `${pool}|${txid}`;
    const txSeq = nextSeq.get(seqKey) ?? 0;
    nextSeq.set(seqKey, txSeq + 1);

    planned.push({ pool, txid, height, deltaZat, txSeq });
  }

  return planned;
}

/**
 * Bal^p for every pool over the deltas at or below `cut`, summed straight from
 * the plan. This is the independent half of the property: it never reads the
 * database, never constructs a ValuePool, and never consults the read order.
 */
function expectedBalances(
  planned: readonly PlannedDelta[],
  cut: number,
): Map<TestPool, bigint> {
  const out = new Map<TestPool, bigint>(POOLS.map((p) => [p, 0n]));
  for (const d of planned) {
    if (d.height <= cut) {
      out.set(d.pool, out.get(d.pool)! - d.deltaZat);
    }
  }
  return out;
}

/**
 * Choose the rollback height by indexing into the plan rather than by drawing
 * a number in the height range. `rollbackAllToHeight` deletes `block_height >
 * h` strictly, so rows sitting at exactly h are the ones a `>=` would wrongly
 * take; a cut drawn at random would land on a populated height only sometimes,
 * and the case that discriminates would be the case least often generated.
 * `offset` of -1 supplies the between-heights and delete-everything cuts.
 */
function chooseCut(
  planned: readonly PlannedDelta[],
  pick: number,
  offset: number,
): number {
  const last = planned[planned.length - 1]!;
  const idx = pick % (planned.length + 1);
  const at = idx === planned.length ? last.height + 1 : planned[idx]!.height;
  return at + offset;
}

async function replayBalances(sql: ReturnType<typeof getSql>) {
  const balances = new Map<TestPool, bigint>();
  for (const pool of POOLS) {
    const state = new PoolState(pool);
    await replayInto(state, sql);
    balances.set(pool, state.value.balance());
  }
  return balances;
}

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("A6: replay and rollback conserve balances across four pools", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("balances after rollback to h equal the replayed prefix at h", async () => {
    // Coverage the assertions below depend on but the generator only makes
    // likely. Asserted after fc.assert so that a generator which quietly
    // stopped reaching one of these fails loudly instead of passing narrow.
    const poolsExercised = new Set<TestPool>();
    let orchardExitsAfterExitOnly = 0;
    let cutsOnAPopulatedHeight = 0;
    let rowsDeleted = 0;

    await fc.assert(
      fc.asyncProperty(
        baseHeight,
        fc.array(rawStep, { minLength: 4, maxLength: 24 }),
        fc.nat(),
        fc.integer({ min: -1, max: 0 }),
        async (base, steps, pick, offset) => {
          // Per RUN, not per test: fast-check calls this 200 times inside one
          // `it`, and RESTART IDENTITY also resets the BIGSERIAL that decides
          // the read order within a block.
          await truncateAll(sql);

          const planned = planDeltas(base, steps);
          for (const d of planned) {
            poolsExercised.add(d.pool);
            if (
              d.pool === "orchard" &&
              d.height >= ORCHARD_EXIT_ONLY &&
              d.deltaZat !== 0n
            ) {
              orchardExitsAfterExitOnly += 1;
            }
            await writePoolBoundaryFlow(
              { pool: d.pool, txid: d.txid, height: d.height, deltaZat: d.deltaZat },
              d.txSeq,
              sql,
            );
          }

          // Hazard 3: ON CONFLICT DO NOTHING makes a reused (pool, txid,
          // tx_seq) a silent no-op, so the plan is only evidence of what is on
          // disk if the counts agree.
          const [countRow] = await sql<Array<{ count: string }>>`
            SELECT COUNT(*)::text AS count FROM pool_boundary_flows
          `;
          expect(Number(countRow!.count)).toBe(planned.length);

          const lastHeight = planned[planned.length - 1]!.height;
          const before = await replayBalances(sql);
          const expectedBefore = expectedBalances(planned, lastHeight);
          for (const pool of POOLS) {
            expect(before.get(pool)).toBe(expectedBefore.get(pool));
          }

          const cut = chooseCut(planned, pick, offset);
          if (planned.some((d) => d.height === cut)) cutsOnAPopulatedHeight += 1;

          const survivors = planned.filter((d) => d.height <= cut).length;
          const counts = await rollbackAllToHeight(cut, sql);
          expect(counts.boundaryFlows).toBe(planned.length - survivors);
          rowsDeleted += counts.boundaryFlows;

          const after = await replayBalances(sql);
          const expectedAfter = expectedBalances(planned, cut);
          for (const pool of POOLS) {
            expect(after.get(pool)).toBe(expectedAfter.get(pool));
          }
        },
      ),
      // Explicit because assertion A6 names the number.
      { numRuns: 200 },
    );

    expect([...poolsExercised].sort()).toEqual([...POOLS].sort());
    // Eight, not one. Over 1000 seeds of 200 runs the three-band generator's
    // worst seed produced 17 and its median 41, so eight is roughly half the
    // worst case: high enough that a generator which lost most of this coverage
    // fails, low enough that ordinary seed variance cannot. One would be
    // satisfied by a generator reaching the region once by luck - and 171 of
    // those 1000 seeds would have fallen short of eight under the two-band
    // generator, which is the measurement that says the band and the threshold
    // are one change and not two.
    expect(orchardExitsAfterExitOnly).toBeGreaterThanOrEqual(8);
    expect(cutsOnAPopulatedHeight).toBeGreaterThan(0);
    expect(rowsDeleted).toBeGreaterThan(0);
    // 200 runs of roughly 60 round trips each; the suite-wide 20s default is
    // for tests that make a handful.
  }, 180_000);
});
