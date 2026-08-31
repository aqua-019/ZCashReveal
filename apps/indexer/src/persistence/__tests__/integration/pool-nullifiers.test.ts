import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { asHex, type SpentNullifier } from "@zcashreveal/types";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import {
  writePoolNullifier,
  readAllPoolNullifiers,
  readPoolNullifierAnchor,
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
  it("an anchor arriving AFTER the spend is recorded, and never overwrites one", async () => {
    // MIGRATION 005 EXPLICITLY DESIGNS FOR THIS ORDERING - "the anchor may also
    // arrive after the spend; an Ironwood root comes from `z_gettreestate`, a
    // separate call" - and the first draft's `ON CONFLICT DO NOTHING` made it
    // permanently unrecordable: the second write was refused, nothing else in
    // the tree UPDATEs `anchor_root`, and the spend was dropped from
    // `neffSeries` forever. On the page that is indistinguishable from an anchor
    // that genuinely cannot be resolved (gate round 1, MEDIUM).
    const rec = {
      pool: "ironwood" as const,
      nfId: h(0x11),
      spentTxid: h(0xaa),
      spentHeight: 500,
    };
    await writePoolNullifier(rec, sql);
    expect(await readPoolNullifierAnchor("ironwood", h(0x11), sql)).toBeNull();

    await writePoolNullifier(rec, sql, h(0xee));
    expect(await readPoolNullifierAnchor("ironwood", h(0x11), sql)).toBe(h(0xee));

    // AND A RECORDED ANCHOR STILL WINS. COALESCE fills a NULL in; it never
    // overwrites an observation, which is the property the four pool writers
    // share and which a bare DO UPDATE would have broken.
    await writePoolNullifier(rec, sql, h(0xff));
    expect(await readPoolNullifierAnchor("ironwood", h(0x11), sql)).toBe(h(0xee));
  });

  it("a DIFFERENT spend for the same nullifier is refused, not merged into a mixed row", async () => {
    // THE CONFLICT CLAUSE'S `WHERE`, AND THE DEFECT IT CLOSES (gate round 2,
    // MEDIUM). `DO UPDATE SET anchor_root = ...` touches one column, so
    // `spent_txid` and `spent_height` keep the FIRST write's values. Without the
    // `WHERE`, a competing chain's write filled in ITS anchor beside the old
    // chain's txid and height - a row that never existed on either chain, which
    // the publisher then bounded and published a claim level for. The two
    // writers this branch made agree on refreshing every column cannot produce
    // that; this one, refreshing exactly one, could.
    const rec = {
      pool: "ironwood" as const,
      nfId: h(0x22),
      spentTxid: h(0xbb),
      spentHeight: 501,
    };
    await writePoolNullifier(rec, sql);
    // A different txid and height for the same nullifier, carrying an anchor.
    await writePoolNullifier(
      { ...rec, spentTxid: h(0xcc), spentHeight: 999 },
      sql,
      h(0xee),
    );

    const rows = await readAllPoolNullifiers("ironwood", sql);
    const found = rows.find((r) => r.nfId === h(0x22));
    // The identity is the first write's, as before...
    expect(found?.spentTxid).toBe(h(0xbb));
    expect(found?.spentHeight).toBe(501);
    // ...AND THE ANCHOR DID NOT COME ACROSS. This is the assertion the previous
    // version lacked: it checked only that the identity held, which was true
    // while the mixed row was being built.
    expect(await readPoolNullifierAnchor("ironwood", h(0x22), sql)).toBeNull();
  });
});
