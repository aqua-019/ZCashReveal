import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import { writePoolCommitment } from "../../pool-commitments.js";
import { writePoolAnchor } from "../../pool-anchors.js";
import { writePoolNullifier } from "../../pool-nullifiers.js";
import { writePoolBoundaryFlow } from "../../pool-boundary-flows.js";
import { rollbackAllToHeight } from "../../replay.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("rollbackAllToHeight (chain-level reorg primitive)", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  async function seed() {
    // Seed three records per table per pool at heights 100, 200, 300.
    for (const pool of ["sapling", "orchard"] as const) {
      for (let i = 0; i < 3; i++) {
        const height = 100 * (i + 1);
        await writePoolCommitment(
          {
            pool,
            cmId: h(i + (pool === "sapling" ? 1 : 100)),
            position: BigInt(i),
            txid: h(i + 10),
            height,
          },
          sql,
        );
        await writePoolAnchor(
          {
            pool,
            root: h(i + (pool === "sapling" ? 1000 : 2000)),
            heightCreated: height,
            maxPosition: BigInt(i),
          },
          sql,
        );
        await writePoolNullifier(
          {
            pool,
            nfId: h(i + (pool === "sapling" ? 3000 : 4000)),
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

  it("deletes rows with height > H across all four tables and both pools", async () => {
    await seed();
    const counts = await rollbackAllToHeight(150, sql);
    // For each table: 2 sapling rows + 2 orchard rows above 150 = 4 deleted
    expect(counts).toEqual({
      commitments: 4,
      anchors: 4,
      nullifiers: 4,
      boundaryFlows: 4,
    });
  });

  it("retains records at exactly H", async () => {
    await seed();
    await rollbackAllToHeight(100, sql);
    const rows = await sql<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count FROM pool_commitments
    `;
    expect(rows[0]).toBeDefined();
    expect(Number(rows[0]!.count)).toBe(2); // 1 sapling + 1 orchard at height 100
  });

  it("at H above all records, deletes zero rows", async () => {
    await seed();
    const counts = await rollbackAllToHeight(10_000, sql);
    expect(counts).toEqual({
      commitments: 0,
      anchors: 0,
      nullifiers: 0,
      boundaryFlows: 0,
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
    });
  });
});
