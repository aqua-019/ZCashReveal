import { describe, it, expect, beforeEach, afterAll } from "vitest";
import type { PoolStateSnapshot } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolSnapshot,
  readPoolSnapshots,
  rollbackPoolSnapshotsToHeight,
} from "../../pool-snapshots.js";

const reachable = await isPostgresReachable();

const snap = (
  over: Partial<PoolStateSnapshot> & Pick<PoolStateSnapshot, "pool" | "height">,
): PoolStateSnapshot => ({
  commitmentCount: 0n,
  anchorCount: 0,
  nullifierCount: 0,
  balanceZat: 0n,
  ...over,
});

describe.skipIf(!reachable)("pool_snapshots persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("round-trips every field of a PoolStateSnapshot", async () => {
    const record = snap({
      pool: "orchard",
      height: 3_428_143,
      balanceZat: 90_000_000_000_000n,
      commitmentCount: 12_345n,
      nullifierCount: 42,
      anchorCount: 7,
    });
    await writePoolSnapshot(record, sql);
    expect(await readPoolSnapshots("orchard", 0, 4_000_000, sql)).toEqual([record]);
  });

  it("keeps zatoshi above 2^53 exact, which is why the column is NUMERIC", async () => {
    // The whole ZEC supply is 1.689e15 zatoshi, already past Number.MAX_SAFE_INTEGER
    // (9.007e15 is the limit, and a value that survives a float round-trip by
    // luck proves nothing). This value does not survive one.
    const balanceZat = 9_007_199_254_740_993n; // 2^53 + 1
    await writePoolSnapshot(snap({ pool: "orchard", height: 1, balanceZat }), sql);
    const [row] = await readPoolSnapshots("orchard", 1, 1, sql);
    expect(row?.balanceZat).toBe(balanceZat);
    // AND THE VALUE IS ONE A FLOAT ROUND-TRIP REALLY DOES CORRUPT, so the line
    // above is evidence rather than a tautology about a number that would have
    // survived either way. 2^53 + 1 has no float64 representation: it becomes
    // 2^53. A first draft wrote this as
    // `expect(Number(row.balanceZat)).not.toBe(Number(balanceZat) + 1)`, which
    // fails - both sides collapse to 2^53 - and the failure was the assertion's,
    // not the driver's.
    expect(BigInt(Number(balanceZat))).not.toBe(balanceZat);
  });

  it("accepts all four pools, matching the union", async () => {
    for (const pool of ["sprout", "sapling", "orchard", "ironwood"] as const) {
      await writePoolSnapshot(snap({ pool, height: 10 }), sql);
      expect(await readPoolSnapshots(pool, 10, 10, sql)).toHaveLength(1);
    }
  });

  it("re-writing (pool, height) REFRESHES the row, agreeing with writeBlock on a reorg", async () => {
    const record = snap({ pool: "orchard", height: 5, balanceZat: 100n });
    await writePoolSnapshot(record, sql);
    await writePoolSnapshot({ ...record, balanceZat: 999n }, sql);
    // THIS ASSERTION USED TO READ `toBe(100n)` AND WAS CORRECT BY ACCIDENT.
    // The writer used `ON CONFLICT DO NOTHING` on the argument that a snapshot
    // is a pure function of state at a height, so a correct caller re-derives
    // the same row. `writeBlock` argued the OPPOSITE for the same event - a
    // height genuinely changes its block across a reorg - and the disagreement
    // published chain B's timestamp married to chain A's balance (gate round 1,
    // HIGH). Both writers refresh now, so a driver that failed to roll back
    // gets a consistent pair rather than a mixed one.
    const [row] = await readPoolSnapshots("orchard", 5, 5, sql);
    expect(row?.balanceZat).toBe(999n);
  });

  it("a refresh rewrites every column, not only the one that changed", async () => {
    // The ON CONFLICT clause names four columns by hand, so a fifth added to the
    // table would be silently left stale. This is what would catch that.
    await writePoolSnapshot(
      snap({ pool: "orchard", height: 7, balanceZat: 1n, commitmentCount: 1n, nullifierCount: 1, anchorCount: 1 }),
      sql,
    );
    const refreshed = snap({
      pool: "orchard",
      height: 7,
      balanceZat: 2n,
      commitmentCount: 3n,
      nullifierCount: 4,
      anchorCount: 5,
    });
    await writePoolSnapshot(refreshed, sql);
    expect(await readPoolSnapshots("orchard", 7, 7, sql)).toEqual([refreshed]);
  });

  it("reads one pool through time, ascending, and does not see another pool's rows", async () => {
    for (const n of [3, 1, 2]) {
      await writePoolSnapshot(snap({ pool: "orchard", height: n, balanceZat: BigInt(n) }), sql);
      await writePoolSnapshot(snap({ pool: "sapling", height: n, balanceZat: 999n }), sql);
    }
    const rows = await readPoolSnapshots("orchard", 1, 3, sql);
    expect(rows.map((r) => r.height)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.balanceZat)).toEqual([1n, 2n, 3n]);
  });

  it("rolls back above H for one pool only, retaining the row AT H", async () => {
    for (const n of [1, 2, 3]) {
      await writePoolSnapshot(snap({ pool: "orchard", height: n }), sql);
      await writePoolSnapshot(snap({ pool: "sapling", height: n }), sql);
    }
    expect(await rollbackPoolSnapshotsToHeight("orchard", 2, sql)).toBe(1);
    expect(await readPoolSnapshots("orchard", 0, 9, sql)).toHaveLength(2);
    expect(await readPoolSnapshots("sapling", 0, 9, sql)).toHaveLength(3);
  });
});
