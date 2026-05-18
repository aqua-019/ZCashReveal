/**
 * Snapshot → replay round-trip.
 *
 * Builds a non-trivial PoolState in memory, persisting each record to the
 * DB in parallel. Then builds a fresh empty PoolState and uses replayInto
 * to reconstruct it from disk. Verifies equivalence via the existing
 * Module 1 accessors (byCmId, atPosition, maxPositionFor, isSpent,
 * spendingTx, deltasFor, balance) — does NOT extend Module 1 with new
 * iterator surfaces just to serve a test.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  asHex,
  type Anchor,
  type BoundaryDelta,
  type Hex,
  type SpentNullifier,
} from "@zcashreveal/types";
import { PoolState } from "../../../state/pool-state.js";
import { getSql, isPostgresReachable, truncateAll } from "./_setup.js";
import { writePoolCommitment } from "../../pool-commitments.js";
import { writePoolAnchor } from "../../pool-anchors.js";
import { writePoolNullifier } from "../../pool-nullifiers.js";
import { writePoolBoundaryFlow } from "../../pool-boundary-flows.js";
import { replayInto } from "../../replay.js";

const h = (n: number) => asHex(n.toString(16).padStart(64, "0"));

const reachable = await isPostgresReachable();

describe.skipIf(!reachable)("replayInto: snapshot → replay round-trip", () => {
  const sql = getSql();
  beforeEach(() => truncateAll(sql));
  afterAll(() => sql.end({ timeout: 5 }));

  it("reconstructs a non-trivial sapling PoolState identically", async () => {
    const original = new PoolState<"sapling">("sapling");

    // 10 commitments at heights 100..109
    const commitmentInputs: Array<{ cmId: Hex; txid: Hex; height: number }> = [];
    for (let i = 0; i < 10; i++) {
      const cmId = h(i + 1);
      const txid = h(i + 100);
      const height = 100 + i;
      const position = original.commitments.append({
        pool: "sapling",
        cmId,
        txid,
        height,
      });
      await writePoolCommitment(
        { pool: "sapling", cmId, position, txid, height },
        sql,
      );
      commitmentInputs.push({ cmId, txid, height });
    }

    // 3 anchors — exercises the cross-index invariant (maxPosition < size)
    const anchors: Anchor<"sapling">[] = [
      { pool: "sapling", root: h(2001), heightCreated: 105, maxPosition: 4n },
      { pool: "sapling", root: h(2002), heightCreated: 107, maxPosition: 6n },
      { pool: "sapling", root: h(2003), heightCreated: 109, maxPosition: 9n },
    ];
    for (const a of anchors) {
      original.recordAnchor(a);
      await writePoolAnchor(a, sql);
    }

    // 2 spent nullifiers
    const nullifiers: SpentNullifier<"sapling">[] = [
      { pool: "sapling", nfId: h(3001), spentTxid: h(108), spentHeight: 108 },
      { pool: "sapling", nfId: h(3002), spentTxid: h(109), spentHeight: 109 },
    ];
    for (const n of nullifiers) {
      original.nullifiers.record(n);
      await writePoolNullifier(n, sql);
    }

    // Boundary deltas — exercises tx_seq disambiguation at height 109
    // (one tx, two deltas) and a supply-scale bigint at height 105.
    // Order keeps the running balance non-negative throughout.
    const deltas: Array<{ delta: BoundaryDelta<"sapling">; txSeq: number }> = [
      { delta: { pool: "sapling", txid: h(7000), height: 100, deltaZat: -1_000_000n }, txSeq: 0 },
      { delta: { pool: "sapling", txid: h(7001), height: 103, deltaZat: -500_000n }, txSeq: 0 },
      { delta: { pool: "sapling", txid: h(7002), height: 105, deltaZat: -(2n ** 40n) }, txSeq: 0 },
      { delta: { pool: "sapling", txid: h(7003), height: 108, deltaZat: 100_000n }, txSeq: 0 },
      { delta: { pool: "sapling", txid: h(7004), height: 109, deltaZat: -10n }, txSeq: 0 },
      { delta: { pool: "sapling", txid: h(7004), height: 109, deltaZat: 5n }, txSeq: 1 },
    ];
    for (const { delta, txSeq } of deltas) {
      original.value.apply(delta);
      await writePoolBoundaryFlow(delta, txSeq, sql);
    }

    // Replay into a fresh empty state
    const fresh = new PoolState<"sapling">("sapling");
    await replayInto(fresh, sql);

    // Topline: snapshots match
    expect(fresh.snapshot(999)).toEqual(original.snapshot(999));

    // Commitments: every record reachable by both accessors with identical shape
    for (let i = 0; i < commitmentInputs.length; i++) {
      const inp = commitmentInputs[i]!;
      const byId = fresh.commitments.byCmId(inp.cmId);
      const byPos = fresh.commitments.atPosition(BigInt(i));
      expect(byId).toBeDefined();
      expect(byPos).toBeDefined();
      expect(byId!.cmId).toBe(inp.cmId);
      expect(byId!.position).toBe(BigInt(i));
      expect(byId!.height).toBe(inp.height);
      expect(byId!.txid).toBe(inp.txid);
      expect(byPos).toEqual(byId);
    }

    // Anchors: maxPositionFor returns the same value
    for (const a of anchors) {
      expect(fresh.anchors.maxPositionFor(a.root)).toBe(a.maxPosition);
      expect(fresh.anchors.hasRoot(a.root)).toBe(true);
    }

    // Nullifiers: isSpent + spendingTx
    for (const n of nullifiers) {
      expect(fresh.nullifiers.isSpent(n.nfId)).toBe(true);
      expect(fresh.nullifiers.spendingTx(n.nfId)).toEqual({
        txid: n.spentTxid,
        height: n.spentHeight,
      });
    }

    // Boundary flows: the same-tx tx_seq=0,1 pair is reachable via deltasFor
    const tx7004 = fresh.value.deltasFor(h(7004));
    expect(tx7004).toHaveLength(2);
    expect(tx7004.map((d) => d.deltaZat)).toEqual([-10n, 5n]);

    // Balance: identical
    expect(fresh.value.balance()).toBe(original.value.balance());
  });

  it("replay does not cross pools (orchard replay sees no sapling data)", async () => {
    const sapling = new PoolState<"sapling">("sapling");
    const position = sapling.commitments.append({
      pool: "sapling",
      cmId: h(1),
      txid: h(11),
      height: 100,
    });
    await writePoolCommitment(
      { pool: "sapling", cmId: h(1), position, txid: h(11), height: 100 },
      sql,
    );

    const orchard = new PoolState<"orchard">("orchard");
    await replayInto(orchard, sql);

    expect(orchard.commitments.size()).toBe(0n);
    expect(orchard.value.balance()).toBe(0n);
  });
});
