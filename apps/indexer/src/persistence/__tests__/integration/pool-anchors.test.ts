import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex, type Anchor } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolAnchor,
  readAllPoolAnchors,
  rollbackPoolAnchorsToHeight,
} from "../../pool-anchors.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("pool_anchors persistence", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("write → readAll round-trips a single record", async () => {
    const rec: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      heightCreated: 100,
      maxPosition: 10n,
    };
    await writePoolAnchor(rec, sql);
    const got = await readAllPoolAnchors("sapling", sql);
    expect(got).toEqual([rec]);
  });

  it("preserves bigint maxPosition precision (2n ** 40n)", async () => {
    const rec: Anchor<"orchard"> = {
      pool: "orchard",
      root: h(9),
      heightCreated: 500,
      maxPosition: 2n ** 40n,
    };
    await writePoolAnchor(rec, sql);
    const [got] = await readAllPoolAnchors("orchard", sql);
    expect(got!.maxPosition).toBe(2n ** 40n);
  });

  it("readAll returns rows in height_created ASC, root ASC order", async () => {
    await writePoolAnchor(
      { pool: "sapling", root: h(2), heightCreated: 200, maxPosition: 5n },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(1), heightCreated: 100, maxPosition: 3n },
      sql,
    );
    const got = await readAllPoolAnchors("sapling", sql);
    expect(got.map((a) => a.heightCreated)).toEqual([100, 200]);
  });

  it("idempotent: writing the same anchor twice leaves one row", async () => {
    const rec: Anchor<"sapling"> = {
      pool: "sapling",
      root: h(1),
      heightCreated: 100,
      maxPosition: 10n,
    };
    await writePoolAnchor(rec, sql);
    await writePoolAnchor(rec, sql);
    expect(await readAllPoolAnchors("sapling", sql)).toHaveLength(1);
  });

  it("idempotent on duplicate root with different data (DO NOTHING preserves original)", async () => {
    // The application layer (Module 1 AnchorIndex) is expected to catch
    // genuine conflicts BEFORE the DB write. If the DB ever sees a
    // duplicate write with different (max_position, height_created), the
    // policy is to preserve the original row — the second write is a no-op.
    await writePoolAnchor(
      { pool: "sapling", root: h(1), heightCreated: 100, maxPosition: 10n },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(1), heightCreated: 999, maxPosition: 99n },
      sql,
    );
    const [got] = await readAllPoolAnchors("sapling", sql);
    expect(got!.heightCreated).toBe(100);
    expect(got!.maxPosition).toBe(10n);
  });

  it("pool-separated", async () => {
    await writePoolAnchor(
      { pool: "sapling", root: h(1), heightCreated: 100, maxPosition: 10n },
      sql,
    );
    expect(await readAllPoolAnchors("orchard", sql)).toEqual([]);
    expect(await readAllPoolAnchors("sapling", sql)).toHaveLength(1);
  });

  it("rollbackToHeight deletes rows with height_created > H and retains H", async () => {
    await writePoolAnchor(
      { pool: "sapling", root: h(1), heightCreated: 100, maxPosition: 1n },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(2), heightCreated: 200, maxPosition: 2n },
      sql,
    );
    await writePoolAnchor(
      { pool: "sapling", root: h(3), heightCreated: 300, maxPosition: 3n },
      sql,
    );

    const deleted = await rollbackPoolAnchorsToHeight("sapling", 150, sql);
    expect(deleted).toBe(2);

    const remaining = await readAllPoolAnchors("sapling", sql);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.heightCreated).toBe(100);
  });
});
