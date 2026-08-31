import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import { writePoolCommitment } from "../../pool-commitments.js";
import { writePoolAnchor } from "../../pool-anchors.js";
import { writePoolNullifier } from "../../pool-nullifiers.js";
import { writePoolBoundaryFlow } from "../../pool-boundary-flows.js";
import { rollbackAllToHeight } from "../../replay.js";
import { writeBlock, readBlockTimes } from "../../blocks.js";
import { writePoolSnapshot, readPoolSnapshots } from "../../pool-snapshots.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));
/** Same helper under the name the new test uses, so `h` keeps its local meaning. */
const hx = h;

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("rollbackAllToHeight (chain-level reorg primitive)", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  /**
   * ALL FOUR POOLS, NOT TWO. This loop ran over sapling and orchard until
   * HANDOFF-06, which was right when the model had two pools and became a
   * silent gap when it gained Sprout and Ironwood: `rollbackAllToHeight` issues
   * DELETEs with no `WHERE pool = ...`, so it covered the new pools the moment
   * they existed - and nothing here would have noticed if it had not, because
   * no row of theirs was ever written.
   *
   * The per-pool id offset is derived from the pool's index rather than from a
   * `pool === "sapling" ? 1 : 100` ternary, which had no third answer to give.
   */
  const POOLS = ["sprout", "sapling", "orchard", "ironwood"] as const;

  async function seed() {
    // Seed three records per table per pool at heights 100, 200, 300.
    for (const pool of POOLS) {
      const offset = POOLS.indexOf(pool) * 1_000;
      for (let i = 0; i < 3; i++) {
        const height = 100 * (i + 1);
        await writePoolCommitment(
          {
            pool,
            cmId: h(i + offset + 1),
            position: BigInt(i),
            txid: h(i + 10),
            height,
          },
          sql,
        );
        await writePoolAnchor(
          {
            pool,
            root: h(i + offset + 10_000),
            heightCreated: height,
            maxPosition: BigInt(i),
          },
          sql,
        );
        await writePoolNullifier(
          {
            pool,
            nfId: h(i + offset + 20_000),
            spentTxid: h(i + 5000),
            spentHeight: height,
          },
          sql,
        );
        await writePoolBoundaryFlow(
          { pool, txid: h(i + 6000), height, deltaZat: -BigInt(1000 * (i + 1)) },
          0,
          sql,
        );
      }
    }
  }

  it("deletes rows with height > H across all six tables and all four pools", async () => {
    await seed();
    const counts = await rollbackAllToHeight(150, sql);
    // Per table: 2 rows above 150 (at 200 and 300) in each of four pools = 8.
    // `snapshots` and `blocks` are 0 here because `seed()` writes neither; the
    // dedicated test below is what exercises them.
    expect(counts).toEqual({
      commitments: 8,
      anchors: 8,
      nullifiers: 8,
      boundaryFlows: 8,
      snapshots: 0,
      blocks: 0,
    });
  });

  it("retains records at exactly H", async () => {
    await seed();
    await rollbackAllToHeight(100, sql);
    const rows = await sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM pool_commitments
    `;
    expect(rows[0]).toBeDefined();
    expect(Number(rows[0]!.count)).toBe(4); // one per pool at height 100
  });

  it("at H above all records, deletes zero rows", async () => {
    await seed();
    const counts = await rollbackAllToHeight(10_000, sql);
    expect(counts).toEqual({
      commitments: 0,
      anchors: 0,
      nullifiers: 0,
      boundaryFlows: 0,
      snapshots: 0,
      blocks: 0,
    });
  });

  it("uses the correct height column per table (height_created, spent_height, block_height)", async () => {
    // Mix the height columns across tables: same H should affect each table
    // by its own height column. We write each table's record at a unique
    // height and check that rollback to a value between them deletes only
    // the higher ones, regardless of column name.
    await writePoolCommitment(
      { pool: "sapling", cmId: h(1), position: 0n, txid: h(11), height: 100 },
      sql,
    );
    await writePoolCommitment(
      { pool: "sapling", cmId: h(2), position: 1n, txid: h(22), height: 200 },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(100), heightCreated: 100, maxPosition: 0n },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(200), heightCreated: 200, maxPosition: 1n },
      sql,
    );
    await writePoolNullifier(
      { pool: "sapling", nfId: h(101), spentTxid: h(11), spentHeight: 100 },
      sql,
    );
    await writePoolNullifier(
      { pool: "sapling", nfId: h(201), spentTxid: h(22), spentHeight: 200 },
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(11), height: 100, deltaZat: -100n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(22), height: 200, deltaZat: -200n },
      0,
      sql,
    );

    const counts = await rollbackAllToHeight(150, sql);
    expect(counts).toEqual({
      commitments: 1,
      anchors: 1,
      nullifiers: 1,
      boundaryFlows: 1,
      snapshots: 0,
      blocks: 0,
    });
  });

  it("rolls back pool_snapshots and blocks, which it did not until HANDOFF-09b's gate", async () => {
    // THE DEFECT THIS PINS WAS INVISIBLE IN A GREEN RUN. Both tables gained
    // writers in HANDOFF-09b and neither was added to the tree's only reorg
    // primitive, so a reorg left orphaned balances and orphaned block times
    // standing - and the publisher then joined them into a drain series where
    // three of four samples carried the old chain's balance against the new
    // chain's clock, published as a measurement.
    // THE TWO POPULATIONS ARE DIFFERENT SIZES ON PURPOSE (gate round 2, F10).
    // With three blocks and three snapshots at the same three heights, both
    // counts were 2 and swapping the two fields in the return left this suite
    // green - the two names were interchangeable in every assertion in the tree.
    // That is the same "fixture makes distinct quantities equal" shape as the
    // 4095 candidateCount, reproduced inside the test written to close it.
    for (const h of [100, 200, 300]) {
      await writeBlock({ height: h, timeS: 1_780_000_000 + h, hash: hx(h) }, sql);
    }
    for (const h of [100, 200]) {
      await writePoolSnapshot(
        {
          pool: "orchard",
          height: h,
          balanceZat: BigInt(h),
          commitmentCount: 0n,
          nullifierCount: 0,
          anchorCount: 0,
        },
        sql,
      );
    }

    const counts = await rollbackAllToHeight(100, sql);
    // Two blocks above 100 (200, 300) and ONE snapshot (200). Different numbers,
    // so the fields cannot be swapped without this failing.
    expect(counts).toMatchObject({ snapshots: 1, blocks: 2 });

    // AND THE ROW AT EXACTLY H SURVIVES, matching the other four tables so a
    // driver can call one function with one height.
    expect((await readBlockTimes(0, 1000, sql)).map((b) => b.height)).toEqual([100]);
    expect((await readPoolSnapshots("orchard", 0, 1000, sql)).map((r) => r.height)).toEqual([100]);
  });

  it("blocks_height_check refuses a negative height", async () => {
    // The constraint shipped in 005 with no assertion anywhere (gate round 2,
    // F14). Its argument is `time_s`'s: a negative height could only be a decode
    // fault on our side, never a chain observation.
    await expect(
      writeBlock({ height: -1, timeS: 1_780_000_000, hash: hx(1) }, sql),
    ).rejects.toThrow(/blocks_height_check/);
  });
});
