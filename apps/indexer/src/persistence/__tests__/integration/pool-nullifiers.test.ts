import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex, type SpentNullifier } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolNullifier,
  readAllPoolNullifiers,
  rollbackPoolNullifiersToHeight,
} from "../../pool-nullifiers.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("pool_nullifiers persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("write → readAll round-trips a single record", async () => {
    const rec: SpentNullifier<"sapling"> = {
      pool: "sapling",
      nfId: h(1),
      spentTxid: h(11),
      spentHeight: 100,
    };
    await writePoolNullifier(rec, sql);
    const got = await readAllPoolNullifiers("sapling", sql);
    expect(got).toEqual([rec]);
  });

  it("idempotent: writing the same nullifier twice leaves one row", async () => {
    const rec: SpentNullifier<"orchard"> = {
      pool: "orchard",
      nfId: h(1),
      spentTxid: h(11),
      spentHeight: 100,
    };
    await writePoolNullifier(rec, sql);
    await writePoolNullifier(rec, sql);
    expect(await readAllPoolNullifiers("orchard", sql)).toHaveLength(1);
  });

  it("pool-separated", async () => {
    await writePoolNullifier(
      { pool: "sapling", nfId: h(1), spentTxid: h(11), spentHeight: 100 },
      sql,
    );
    expect(await readAllPoolNullifiers("orchard", sql)).toEqual([]);
  });

  it("readAll order: spent_height ASC, nf_id ASC", async () => {
    await writePoolNullifier(
      { pool: "sapling", nfId: h(2), spentTxid: h(22), spentHeight: 200 },
      sql,
    );
    await writePoolNullifier(
      { pool: "sapling", nfId: h(1), spentTxid: h(11), spentHeight: 100 },
      sql,
    );
    const got = await readAllPoolNullifiers("sapling", sql);
    expect(got.map((n) => n.spentHeight)).toEqual([100, 200]);
  });

  it("rollbackToHeight deletes rows with spent_height > H and retains H", async () => {
    await writePoolNullifier(
      { pool: "sapling", nfId: h(1), spentTxid: h(11), spentHeight: 100 },
      sql,
    );
    await writePoolNullifier(
      { pool: "sapling", nfId: h(2), spentTxid: h(22), spentHeight: 200 },
      sql,
    );
    await writePoolNullifier(
      { pool: "sapling", nfId: h(3), spentTxid: h(33), spentHeight: 300 },
      sql,
    );

    const deleted = await rollbackPoolNullifiersToHeight("sapling", 150, sql);
    expect(deleted).toBe(2);

    const remaining = await readAllPoolNullifiers("sapling", sql);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.spentHeight).toBe(100);
  });
});
