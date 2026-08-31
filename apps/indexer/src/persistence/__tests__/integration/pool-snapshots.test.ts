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

  it("is idempotent on (pool, height)", async () => {
    const record = snap({ pool: "orchard", height: 5, balanceZat: 100n });
    await writePoolSnapshot(record, sql);
    await writePoolSnapshot({ ...record, balanceZat: 999n }, sql);
    // DO NOTHING, so the FIRST write stands. A snapshot is a pure function of the
    // pool's state at a height, so a correct caller can only ever re-derive the
    // same row; a reorg is handled by rolling back first, not by overwriting.
    const [row] = await readPoolSnapshots("orchard", 5, 5, sql);
    expect(row?.balanceZat).toBe(100n);
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
