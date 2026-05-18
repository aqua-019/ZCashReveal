import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex, type BoundaryDelta } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolBoundaryFlow,
  readAllPoolBoundaryFlows,
  rollbackPoolBoundaryFlowsToHeight,
} from "../../pool-boundary-flows.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("pool_boundary_flows persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("write → readAll round-trips a single delta", async () => {
    const rec: BoundaryDelta<"sapling"> = {
      pool: "sapling",
      txid: h(11),
      height: 100,
      deltaZat: -1_000_000n,
    };
    await writePoolBoundaryFlow(rec, 0, sql);
    const got = await readAllPoolBoundaryFlows("sapling", sql);
    expect(got).toEqual([rec]);
  });

  it("preserves bigint deltaZat precision (2n ** 50n and -2n ** 50n)", async () => {
    const deposit: BoundaryDelta<"sapling"> = {
      pool: "sapling",
      txid: h(1),
      height: 100,
      deltaZat: -(2n ** 50n),
    };
    const withdraw: BoundaryDelta<"sapling"> = {
      pool: "sapling",
      txid: h(2),
      height: 101,
      deltaZat: 2n ** 50n,
    };
    await writePoolBoundaryFlow(deposit, 0, sql);
    await writePoolBoundaryFlow(withdraw, 0, sql);
    const got = await readAllPoolBoundaryFlows("sapling", sql);
    expect(got[0]?.deltaZat).toBe(-(2n ** 50n));
    expect(got[1]?.deltaZat).toBe(2n ** 50n);
  });

  it("tx_seq disambiguates multiple deltas for the same tx", async () => {
    const txid = h(99);
    await writePoolBoundaryFlow(
      { pool: "sapling", txid, height: 100, deltaZat: -100n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid, height: 100, deltaZat: -200n },
      1,
      sql,
    );
    const got = await readAllPoolBoundaryFlows("sapling", sql);
    expect(got).toHaveLength(2);
    expect(got.map((d) => d.deltaZat)).toEqual([-100n, -200n]);
  });

  it("idempotent on (pool, txid, tx_seq): same triple twice leaves one row", async () => {
    const rec: BoundaryDelta<"sapling"> = {
      pool: "sapling",
      txid: h(1),
      height: 100,
      deltaZat: -100n,
    };
    await writePoolBoundaryFlow(rec, 0, sql);
    await writePoolBoundaryFlow(rec, 0, sql);
    expect(await readAllPoolBoundaryFlows("sapling", sql)).toHaveLength(1);
  });

  it("pool-separated", async () => {
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(1), height: 100, deltaZat: -100n },
      0,
      sql,
    );
    expect(await readAllPoolBoundaryFlows("orchard", sql)).toEqual([]);
  });

  it("readAll order: (block_height ASC, id ASC) — original apply order", async () => {
    // Write deltas out of height order to confirm the read sorts.
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(2), height: 200, deltaZat: -200n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(1), height: 100, deltaZat: -100n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(3), height: 300, deltaZat: -300n },
      0,
      sql,
    );
    const got = await readAllPoolBoundaryFlows("sapling", sql);
    expect(got.map((d) => d.height)).toEqual([100, 200, 300]);
  });

  it("within a single height, id-order preserves insertion order", async () => {
    // Two deltas at height 100, inserted in a specific order. id-order
    // matters here because the non-negativity invariant in ValuePool.apply
    // can spuriously throw if read order diverges from write order.
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(1), height: 100, deltaZat: -500n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(2), height: 100, deltaZat: 200n },
      0,
      sql,
    );
    const got = await readAllPoolBoundaryFlows("sapling", sql);
    expect(got.map((d) => d.deltaZat)).toEqual([-500n, 200n]);
  });

  it("rollbackToHeight deletes rows with block_height > H", async () => {
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(1), height: 100, deltaZat: -100n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(2), height: 200, deltaZat: -200n },
      0,
      sql,
    );
    await writePoolBoundaryFlow(
      { pool: "sapling", txid: h(3), height: 300, deltaZat: -300n },
      0,
      sql,
    );

    const deleted = await rollbackPoolBoundaryFlowsToHeight("sapling", 150, sql);
    expect(deleted).toBe(2);

    const remaining = await readAllPoolBoundaryFlows("sapling", sql);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.height).toBe(100);
  });
});
