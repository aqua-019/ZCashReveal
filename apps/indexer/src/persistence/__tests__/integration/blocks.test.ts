import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import { writeBlock, readBlockTimes, rollbackBlocksToHeight } from "../../blocks.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("blocks persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("writes and reads a block's height, time and hash", async () => {
    await writeBlock({ height: 100, timeS: 1_780_000_000, hash: h(100) }, sql);
    const rows = await readBlockTimes(0, 200, sql);
    expect(rows).toEqual([{ height: 100, timeS: 1_780_000_000, hash: h(100) }]);
  });

  it("returns timeS as a NUMBER, not the string postgres.js hands back for a BIGINT", async () => {
    // THE ONE THING A `toEqual` ABOVE WOULD NOT CATCH ON ITS OWN. `time_s` is
    // BIGINT and postgres.js returns BIGINT as a STRING - measured against a real
    // Postgres 16, alongside INTEGER (number) and NUMERIC (string). A string
    // reaching `PoolBalanceSample.timeMs` would make every velocity NaN, and
    // `"1780000000" == 1780000000` is true under the loose comparison a careless
    // assertion would use.
    await writeBlock({ height: 100, timeS: 1_780_000_000, hash: h(100) }, sql);
    const [row] = await readBlockTimes(0, 200, sql);
    expect(typeof row?.timeS).toBe("number");
  });

  it("stores a time past INT_MAX, which is why the column is BIGINT", async () => {
    // 2038-01-19 03:14:07 is INT_MAX seconds. A block after it must round-trip,
    // and an INTEGER column would have refused this row.
    const past2038 = 2_147_483_648;
    await writeBlock({ height: 101, timeS: past2038, hash: h(101) }, sql);
    const [row] = await readBlockTimes(101, 101, sql);
    expect(row?.timeS).toBe(past2038);
  });

  it("reads a height range in ascending order, inclusive at both ends", async () => {
    for (const n of [5, 1, 3, 2, 4]) {
      await writeBlock({ height: n, timeS: 1_780_000_000 + n, hash: h(n) }, sql);
    }
    expect((await readBlockTimes(2, 4, sql)).map((r) => r.height)).toEqual([2, 3, 4]);
  });

  it("a reorg REPLACES the row at a height rather than keeping the orphan", async () => {
    // WHY THIS WRITER REFRESHES. `writePoolSnapshot` now does the same, for the
    // same event, because the two disagreeing published chain B's timestamp
    // beside chain A's balance. The three remaining pool writers use DO NOTHING
    // because Module 1's in-memory index throws on the real conflict first;
    // there is no such index here, and a height genuinely changes its block
    // across a reorg, so DO NOTHING would keep the orphaned block's timestamp
    // forever while every later read looked perfectly correct.
    await writeBlock({ height: 100, timeS: 1_780_000_000, hash: h(1) }, sql);
    await writeBlock({ height: 100, timeS: 1_780_000_900, hash: h(2) }, sql);
    const rows = await readBlockTimes(100, 100, sql);
    expect(rows).toEqual([{ height: 100, timeS: 1_780_000_900, hash: h(2) }]);
  });

  it("rolls back above H and retains the row AT H", async () => {
    for (const n of [98, 99, 100, 101]) {
      await writeBlock({ height: n, timeS: 1_780_000_000 + n, hash: h(n) }, sql);
    }
    expect(await rollbackBlocksToHeight(99, sql)).toBe(2);
    expect((await readBlockTimes(0, 200, sql)).map((r) => r.height)).toEqual([98, 99]);
  });

  it("refuses a non-positive time, which could only be a decode fault on our side", async () => {
    await expect(writeBlock({ height: 1, timeS: 0, hash: h(1) }, sql)).rejects.toThrow(
      /blocks_time_s_check/,
    );
  });
});
