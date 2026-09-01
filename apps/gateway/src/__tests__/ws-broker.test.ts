import { describe, it, expect } from "vitest";
import pino from "pino";
import { serializeWire } from "@zcashreveal/types";
import { NOW as FIXTURE_NOW, TIP, report } from "./leak-report-fixture.js";
import { WsBroker, snapshotFrame, snapshotFrameAt, type OutboundFrame } from "../ws-broker.js";

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

const NOW = FIXTURE_NOW;
const MEMPOOL = "zcashreveal:mempool";
const TIP_CHANNEL = "zcashreveal:tip";

describe("WsBroker.translate - the relay maps a wire shape onto the client's union", () => {
  it("(a) PASS STATE: a tx_added message becomes {type: tx_added, entry: MempoolRow}, not the raw report", () => {
    // THROUGH THE REAL PRODUCER. This line carried its own bigint replacer -
    // the indexer's, copied - until HANDOFF-12 changed the wire form and the
    // copy silently kept the old one: a test building its own input, which is
    // the seam shape CLAUDE.md records. `serializeWire` is what index.ts calls.
    const raw = JSON.stringify(
      serializeWire({ type: "tx_added", report: report({ txid: "ab", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] }) }),
    );
    const frame = broker.translate(MEMPOOL, raw, NOW);

    expect(frame).not.toBeNull();
    expect(frame?.channel).toBe(MEMPOOL);
    const payload = frame?.payload as { type: string; entry: Record<string, unknown> };
    expect(payload.type).toBe("tx_added");
    // THE FIELD IS `entry` AND NOT `report`, WHICH IS THE WHOLE DEFECT.
    // `zecFrameSchema` is a discriminated union on `type` whose `tx_added` arm
    // carries `entry: MempoolRow`; the relay used to forward `report`, so the
    // browser's guard hit its default arm and dropped every live frame without
    // a throw - a panel reading "live" while receiving nothing.
    expect(payload).not.toHaveProperty("report");
    expect(payload.entry).toHaveProperty("txid");
    expect(payload.entry).toHaveProperty("flow");
    expect(payload.entry).toHaveProperty("valueBalanceText");
  });

  it("(b) PASS STATE: a tx_removed message passes through, since it is already the client's shape", () => {
    const raw = JSON.stringify({ type: "tx_removed", txid: "de".repeat(32), reason: "confirmed" });
    expect(broker.translate(MEMPOOL, raw, NOW)).toEqual({
      channel: MEMPOOL,
      payload: { type: "tx_removed", txid: "de".repeat(32), reason: "confirmed" },
    });
  });

  it("(c) PASS STATE: a tip message maps WITH the discriminator the indexer now sends", () => {
    const raw = JSON.stringify({ type: "tip", height: 1_700_000, hash: "00".repeat(32) });
    expect(broker.translate(TIP_CHANNEL, raw, NOW)).toEqual({
      channel: TIP_CHANNEL,
      payload: { type: "tip", height: 1_700_000, hash: "00".repeat(32) },
    });
  });

  it("(c2) PASS STATE: and WITHOUT it, which is the shape every deployed indexer has ever sent", () => {
    // `TipChannelPayload` declared `{type: "tip", height, hash}` from the day it
    // was written and `apps/indexer` published the last two fields only, so the
    // one shared type describing this channel was FALSE ABOUT IT. A relay
    // narrowing on `type` would have dropped every tip frame in silence -
    // taking the epoch clock and the block-arrival redraw with it. This case is
    // the deploy window: an indexer that has not been restarted still works.
    const raw = JSON.stringify({ height: 1_700_000, hash: "00".repeat(32) });
    expect(broker.translate(TIP_CHANNEL, raw, NOW)).toEqual({
      channel: TIP_CHANNEL,
      payload: { type: "tip", height: 1_700_000, hash: "00".repeat(32) },
    });
  });

  it("(d) FAIL STATE, BY DATA: an unrecognised channel maps to nothing and is DROPPED, not forwarded", () => {
    // Until HANDOFF-12 this probe used the round-trip links channel, which the
    // indexer really published on and the gateway never subscribed to - a
    // member of the excluded set rather than an invented one. HANDOFF-12
    // removed that publish (A5, LEDGER-12 Q1), so the name is now one nothing
    // in the tree emits, and a probe naming it would be a channel from nowhere
    // dressed as a real one. The shape under test is unchanged: the old relay
    // forwarded every unrecognised channel, and every consumer dropped it one
    // layer further on where nothing could name the channel.
    const raw = JSON.stringify({ type: "links_detected", txid: "aa", links: [] });
    expect(broker.translate("zcashreveal:no-such-channel", raw, NOW)).toBeNull();
  });

  it("(e) FAIL STATE, BY DATA: a tip payload whose height is not a height is refused by the schema, not sent", () => {
    // The boundary the socket never had. Every REST route here validates its
    // own output before sending; this one did not, which is how a payload the
    // client could not read reached the wire at all.
    const raw = JSON.stringify({ type: "tip", height: -1, hash: "00".repeat(32) });
    expect(broker.translate(TIP_CHANNEL, raw, NOW)).toBeNull();
  });

  it("(f) malformed JSON is dropped without throwing", () => {
    expect(() => broker.translate(MEMPOOL, "not json", NOW)).not.toThrow();
    expect(broker.translate(MEMPOOL, "not json", NOW)).toBeNull();
  });
});

describe("snapshotFrame - the on-connect mempool table", () => {
  it("(g) PASS STATE: an empty report list is a MempoolView, not a bare report array", () => {
    const frame = snapshotFrameAt([], TIP, NOW);
    expect(frame.channel).toBe(MEMPOOL);
    const payload = frame.payload as { type: string; view: { tipHeight: number; entries: unknown[] } };
    // `snapshot` AND NOT `mempool_snapshot`: the old type named no member of
    // the client's union, so the one frame that exists to fill the table on
    // connect filled nothing.
    expect(payload.type).toBe("snapshot");
    expect(payload.view.tipHeight).toBe(TIP);
    expect(payload.view.entries).toEqual([]);
  });

  it("(h2) PASS STATE: the height is DERIVED from the reports, needing neither the node nor the snapshot", () => {
    // `tipHeightAtSeen` is what every LeakReport carries, and the newest of them
    // is the newest block this table knows about. Two other sources were tried
    // and both were couplings this frame must not have; `snapshotFrame` records
    // which and why.
    const frame = snapshotFrame([report({ txid: "cc", vin: 1 })], NOW);
    const payload = frame.payload as { view: { tipHeight: number } };
    expect(payload.view.tipHeight).toBe(TIP);
    // Empty list, no height to claim - and the client refuses to lower its own
    // tip on a snapshot frame, so this cannot move a reader backwards.
    expect((snapshotFrame([], NOW).payload as { view: { tipHeight: number } }).view.tipHeight).toBe(0);
  });

  it("(h) PASS STATE: a populated list becomes rows the client can render", () => {
    const frame = snapshotFrameAt([report({ txid: "aa", vin: 1, orchardActions: 2, perPoolZat: [{ pool: "orchard", deltaZat: 100_000_000n }] }), report({ txid: "bb", vin: 1, saplingOutputs: 1, perPoolZat: [{ pool: "sapling", deltaZat: 50_000_000n }] })], TIP, NOW);
    const payload = frame.payload as { type: string; view: { entries: Array<Record<string, unknown>> } };
    expect(payload.view.entries).toHaveLength(2);
    expect(payload.view.entries[0]).toHaveProperty("valueBalanceText");
    expect(payload.view.entries[0]).not.toHaveProperty("leakClass");
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
