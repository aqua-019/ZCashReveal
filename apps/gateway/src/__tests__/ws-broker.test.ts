import { describe, it, expect } from "vitest";
import pino from "pino";
import type { LeakReport } from "@zcashreveal/types";
import { WsBroker, snapshotFrame, type OutboundFrame } from "../ws-broker.js";

/**
 * Module 7Z — gateway WS envelope contract.
 *
 * Every frame the gateway emits must be a `{ channel, payload }` envelope so the
 * dashboard's WsClient (which dispatches on `msg.channel`) can route it. These
 * tests pin both emission sites: WsBroker.translate() (Redis pub/sub fan-out)
 * and snapshotFrame() (the on-connect snapshot).
 *
 * translate() never touches instance state, but it is a method, so we hand the
 * broker a silenced pino logger. The report payloads are pass-throughs — the
 * functions copy them verbatim — so minimal `{ txid }` stubs cast to LeakReport
 * are sufficient.
 */
const broker = new WsBroker(pino({ level: "silent" }));

const MEMPOOL = "zcashreveal:mempool";
const TIP = "zcashreveal:tip";

describe("WsBroker.translate — { channel, payload } envelope", () => {
  it("(a) wraps a mempool tx_added message, preserving the raw payload", () => {
    const report = { txid: "abcd" } as unknown as LeakReport;
    const raw = JSON.stringify({ type: "tx_added", report });
    expect(broker.translate(MEMPOOL, raw)).toEqual({
      channel: MEMPOOL,
      payload: { type: "tx_added", report },
    });
  });

  it("(b) wraps a mempool tx_removed message", () => {
    const raw = JSON.stringify({
      type: "tx_removed",
      txid: "dead",
      reason: "confirmed",
    });
    expect(broker.translate(MEMPOOL, raw)).toEqual({
      channel: MEMPOOL,
      payload: { type: "tx_removed", txid: "dead", reason: "confirmed" },
    });
  });

  it("(c) wraps a tip message in its real { height, hash } shape (no type field)", () => {
    // The indexer publishes tip without a `type` discriminator; the dashboard's
    // tip listener only reads payload.height, so the bare shape is correct.
    const raw = JSON.stringify({ height: 1_700_000, hash: "00ff" });
    expect(broker.translate(TIP, raw)).toEqual({
      channel: TIP,
      payload: { height: 1_700_000, hash: "00ff" },
    });
  });

  it("(d) wraps any unrecognized channel through the same envelope", () => {
    const raw = JSON.stringify({ anything: 1 });
    expect(broker.translate("zcashreveal:links", raw)).toEqual({
      channel: "zcashreveal:links",
      payload: { anything: 1 },
    });
  });

  it("(e) swallows malformed JSON and yields payload: null without throwing", () => {
    expect(() => broker.translate(MEMPOOL, "not json")).not.toThrow();
    expect(broker.translate(MEMPOOL, "not json")).toEqual({
      channel: MEMPOOL,
      payload: null,
    });
  });
});

describe("snapshotFrame — on-connect snapshot envelope", () => {
  it("(f) envelopes an empty report list", () => {
    expect(snapshotFrame([])).toEqual({
      channel: MEMPOOL,
      payload: { type: "mempool_snapshot", reports: [] },
    });
  });

  it("(g) envelopes a populated report list", () => {
    const reports = [
      { txid: "aa" } as unknown as LeakReport,
      { txid: "bb" } as unknown as LeakReport,
    ];
    expect(snapshotFrame(reports)).toEqual({
      channel: MEMPOOL,
      payload: { type: "mempool_snapshot", reports },
    });
  });
});

/**
 * (h) Compile-time guard — NOT a runtime test.
 *
 * OutboundFrame is narrowed to `{ channel; payload }`, so a bare
 * WsServerMessage-style frame (`{ type, ... }`) must no longer be assignable.
 * This is enforced by `tsc` during `pnpm typecheck` / `pnpm build`, not by the
 * vitest runner: if the narrowing regresses (the WsServerMessage arm creeps
 * back), the assignment stops erroring, the @ts-expect-error directive becomes
 * "unused", and tsc fails the build. That failure IS the regression alarm.
 */
// @ts-expect-error — bare { type, ... } frames are not assignable to OutboundFrame
const _bareFrameRejected: OutboundFrame = { type: "tx_added", report: null };
void _bareFrameRejected;
