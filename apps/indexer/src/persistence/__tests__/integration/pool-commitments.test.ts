import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex, type Commitment } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolCommitment,
  readAllPoolCommitments,
  rollbackPoolCommitmentsToHeight,
} from "../../pool-commitments.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("pool_commitments persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("write → readAll round-trips a single record", async () => {
    const rec: Commitment<"sapling"> = {
      pool: "sapling",
      cmId: h(1),
      position: 0n,
      txid: h(11),
      height: 100,
    };
    await writePoolCommitment(rec, sql);
    const got = await readAllPoolCommitments("sapling", sql);
    expect(got).toEqual([rec]);
  });

  it("preserves bigint position precision (2n ** 40n)", async () => {
    const rec: Commitment<"sapling"> = {
      pool: "sapling",
      cmId: h(7),
      position: 2n ** 40n,
      txid: h(77),
      height: 500,
    };
    await writePoolCommitment(rec, sql);
    const [got] = await readAllPoolCommitments("sapling", sql);
    expect(got).toBeDefined();
    expect(got!.position).toBe(2n ** 40n);
  });

  it("readAll returns rows in position-ascending order", async () => {
    const records: Commitment<"sapling">[] = [
      { pool: "sapling", cmId: h(3), position: 2n, txid: h(33), height: 100 },
      { pool: "sapling", cmId: h(1), position: 0n, txid: h(11), height: 100 },
      { pool: "sapling", cmId: h(2), position: 1n, txid: h(22), height: 100 },
    ];
    for (const r of records) await writePoolCommitment(r, sql);
    const got = await readAllPoolCommitments("sapling", sql);
    expect(got.map((c) => c.position)).toEqual([0n, 1n, 2n]);
  });

  it("idempotent: writing the same record twice leaves one row", async () => {
    const rec: Commitment<"sapling"> = {
      pool: "sapling",
      cmId: h(1),
      position: 0n,
      txid: h(11),
      height: 100,
    };
    await writePoolCommitment(rec, sql);
    await writePoolCommitment(rec, sql);
    const got = await readAllPoolCommitments("sapling", sql);
    expect(got).toHaveLength(1);
  });

  it("pool-separated: a sapling write does not appear in orchard readAll", async () => {
    await writePoolCommitment(
      { pool: "sapling", cmId: h(1), position: 0n, txid: h(11), height: 100 },
      sql,
    );
    const orchard = await readAllPoolCommitments("orchard", sql);
    expect(orchard).toEqual([]);
    const sapling = await readAllPoolCommitments("sapling", sql);
    expect(sapling).toHaveLength(1);
  });

  it("rollbackToHeight deletes rows with block_height > H and retains H", async () => {
    await writePoolCommitment(
      { pool: "sapling", cmId: h(1), position: 0n, txid: h(11), height: 100 },
      sql,
    );
    await writePoolCommitment(
      { pool: "sapling", cmId: h(2), position: 1n, txid: h(22), height: 200 },
      sql,
    );
    await writePoolCommitment(
      { pool: "sapling", cmId: h(3), position: 2n, txid: h(33), height: 300 },
      sql,
    );

    const deleted = await rollbackPoolCommitmentsToHeight("sapling", 150, sql);
    expect(deleted).toBe(2);

    const remaining = await readAllPoolCommitments("sapling", sql);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.height).toBe(100);
  });

  it("rollbackToHeight at H retains records exactly at H", async () => {
    await writePoolCommitment(
      { pool: "sapling", cmId: h(1), position: 0n, txid: h(11), height: 100 },
      sql,
    );
    const deleted = await rollbackPoolCommitmentsToHeight("sapling", 100, sql);
    expect(deleted).toBe(0);
    const remaining = await readAllPoolCommitments("sapling", sql);
    expect(remaining).toHaveLength(1);
  });
});
