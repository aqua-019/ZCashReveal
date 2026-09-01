import type { WebSocket } from "ws";
import type { Logger } from "pino";
import {
  REDIS_CHANNELS,
  reviveWireZatoshi,
  zecFrameSchema,
  type LeakReport,
  type SnapshotV1,
  type ZecFrame,
} from "@zcashreveal/types";

import { buildMempoolView, mempoolRow } from "./views/mempool.js";

import { toJsonSafe } from "./serialize.js";

/**
 * Every frame the gateway emits is a `{ channel, payload }` envelope. The
 * v0.2 dashboard's WsClient dispatches on `channel` (the REDIS_CHANNELS
 * values), so this shape is the contract - see `legacy/dashboard/src/lib/ws.ts`.
 *
 * That path is where the file actually is. It read `apps/dashboard/src/lib/ws.ts`
 * until HANDOFF-05: HANDOFF-00 moved the dashboard under `legacy/` and its own
 * assertion A8 forbade touching this file in the same breath, so the reference
 * was left stale and deferred here (LEDGER-00, deliverable 5).
 *
 * THE RECONCILIATION HAPPENED HERE, IN HANDOFF-11, AND THIS IS WHAT IT DECIDED.
 * The ENVELOPE stays and the PAYLOAD becomes a `ZecFrame`. Two things were
 * wrong before it, and the second is the one nothing would have reported:
 *
 *   1. `apps/web` reads a flat top-level `type` - `stream.ts`'s `asFrame`
 *      switches on it and `zecFrameSchema` is a discriminated union on it - so
 *      an enveloped frame hit the `default` arm and was DROPPED. Silently:
 *      `ZecSocket` counts a dropped frame and never throws, so the panel reads
 *      "live" while receiving nothing.
 *   2. Even unwrapped, the payloads did not match. The indexer publishes
 *      `{type: "tx_added", report: LeakReport}` and `ZecFrame` wants
 *      `{type: "tx_added", entry: MempoolRow}`; the connect frames were typed
 *      `mempool_snapshot` and `snapshot_v1`, neither a member of the union.
 *
 * WHY THE PROJECTION MOVED HERE RATHER THAN INTO THE BROWSER. A `LeakReport` is
 * not renderable: turning one into a `MempoolRow` is `views/mempool.ts`, six
 * hundred lines of flow text, pool arithmetic and claim levels, already written
 * and already validated against `mempoolRowSchema` for `GET /v2/mempool`. A
 * second copy in the browser would be the same projection maintained twice and
 * would double `/track`'s bundle. So the relay applies the projection the REST
 * route applies, and the socket and the route now carry the same rows by
 * construction rather than by agreement.
 *
 * WHY THE ENVELOPE STAYS. `channel` says which producer a frame came from, and
 * the gateway builds one frame (`gateway:snapshot`) that no Redis channel
 * carries. Deleting it would put that distinction into the payload type, which
 * is the union apps/web narrows on - a client would then have to know that one
 * arm is not from the chain.
 */
export type OutboundFrame = { channel: string; payload: unknown };

/** Why a client was refused or dropped. `capacity` is the only one that closes with 1013. */
export type CloseReason = "capacity";

/**
 * RFC 6455 close code 1013, "Try Again Later".
 *
 * The right code for a server that is temporarily over capacity: it tells a
 * client to back off and retry rather than to give up (1008, policy violation)
 * or to treat the endpoint as broken (1011, internal error). `apps/web`'s
 * socket reconnects with a seeded backoff, so a 1013 is a delay and not a dead
 * panel.
 */
export const WS_CLOSE_TRY_AGAIN_LATER = 1013;

export class WsBroker {
  private readonly clients = new Set<WebSocket>();

  /**
   * @param maxConnections the cap, from `GATEWAY_WS_MAX_CONNECTIONS`. The
   * connection that would exceed it is closed with 1013 and never added, so a
   * refused client costs one close frame and no ongoing fan-out work.
   */
  constructor(
    private readonly log: Logger,
    private readonly maxConnections = 500,
  ) {}

  /**
   * Admit a client, or refuse it.
   *
   * Returns the client count after the decision. A refusal returns the count
   * unchanged, which is the cap - so a caller logging the return value logs the
   * truth either way, and cannot report a connection that was closed.
   */
  add(ws: WebSocket): { admitted: boolean; count: number } {
    if (this.clients.size >= this.maxConnections) {
      this.log.warn({ cap: this.maxConnections }, "ws connection refused: at capacity");
      try {
        ws.close(WS_CLOSE_TRY_AGAIN_LATER, "at capacity");
      } catch (err) {
        this.log.warn({ err }, "ws close failed");
      }
      return { admitted: false, count: this.clients.size };
    }
    this.clients.add(ws);
    return { admitted: true, count: this.clients.size };
  }

  remove(ws: WebSocket): number {
    this.clients.delete(ws);
    return this.clients.size;
  }

  size(): number {
    return this.clients.size;
  }

  /** The configured cap, so a route can report it without reaching into config twice. */
  capacity(): number {
    return this.maxConnections;
  }

  broadcast(frame: OutboundFrame): void {
    const text = JSON.stringify(frame);
    for (const ws of this.clients) {
      try {
        ws.send(text);
      } catch (err) {
        this.log.warn({ err }, "ws send failed");
      }
    }
  }

  /**
   * Turn a Redis pub/sub message into the frame `apps/web` reads.
   *
   * IT IS A SWITCH NOW AND IT USED TO BE ONE LINE, and the one line was the
   * defect. It read "no per-channel shaping: every channel maps identically",
   * which was true and was the problem: the indexer's wire shapes are not the
   * client's DTOs, so mapping them identically meant handing the browser a
   * `LeakReport` where it expects a `MempoolRow` and a `type` it has never
   * heard of. See this module's header for both halves.
   *
   * A MESSAGE THAT DOES NOT MAP IS DROPPED, NOT FORWARDED. Forwarding an
   * unusable payload is how the previous shape failed: every consumer dropped
   * it anyway, one layer further on, where nothing could log which channel it
   * came from. `null` here is a decision this side made, with a reason.
   */
  translate(channel: string, raw: string, now: number): OutboundFrame | null {
    const payload = toZecFrame(channel, safeJsonParse(raw), now);
    if (payload === null) {
      this.log.warn({ channel }, "dropped a relayed message that maps to no client frame");
      return null;
    }
    return { channel, payload };
  }
}

/**
 * One relayed Redis message to one `ZecFrame`, or null.
 *
 * PURE, AND EXPORTED, so the mapping is testable without a socket, a Redis or a
 * server. Every arm is a shape this repository actually publishes:
 * `apps/indexer/src/index.ts` writes `tx_added` and `tx_removed` on
 * `zcashreveal:mempool`, and `TipChannelPayload` is the `zcashreveal:tip`
 * contract in `packages/zec-types/src/realtime.ts`.
 *
 * THE RESULT IS VALIDATED BY `zecFrameSchema` BEFORE IT LEAVES, which is what
 * every REST route here does with `respond`. The socket had no such boundary,
 * and that is how a payload the client could not read got onto the wire in the
 * first place: nothing on this side had ever asserted that what it sent was
 * what the client's union describes.
 */
export function toZecFrame(channel: string, payload: unknown, now: number): ZecFrame | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  let candidate: unknown = null;

  if (channel === REDIS_CHANNELS.tip) {
    // Already the client's shape. Passed through rather than rebuilt, so a
    // future field on the tip payload does not need an edit here to survive.
    // WITH OR WITHOUT THE DISCRIMINATOR, AND THAT IS NOT TOLERANCE FOR ITS OWN
    // SAKE. `TipChannelPayload` declares `{type: "tip", height, hash}` and
    // `apps/indexer` published the last two fields only - the declared type was
    // false about the wire from the day it was written, and a relay narrowing
    // on `type` would have dropped every tip frame silently. The indexer now
    // sends it; this accepts both, because during a deploy the two processes
    // are different versions and a cutover that needs them upgraded in step is
    // a cutover with a window in it. The CHANNEL is the discriminator here.
    candidate =
      p["type"] === undefined || p["type"] === "tip"
        ? { type: "tip", height: p["height"], hash: p["hash"] }
        : null;
  } else if (channel === REDIS_CHANNELS.mempool) {
    if (p["type"] === "tx_added") {
      // THE PROJECTION, AND IT IS THE ROW FUNCTION RATHER THAN THE VIEW ONE.
      // `mempoolRow` is exactly what `GET /v2/mempool` maps each report
      // through, so the table a reader sees after a socket update and the table
      // a refresh would have given them are the same rows from the same
      // function. Going through `buildMempoolView` here would have needed a
      // tip height for a VIEW this arm then discards - a number invented to
      // satisfy a signature, which is how a fabricated measurement gets its
      // first reader.
      candidate = { type: "tx_added", entry: mempoolRow(reviveWireZatoshi<LeakReport>(p["report"]), now) };
    } else if (p["type"] === "tx_removed") {
      candidate = { type: "tx_removed", txid: p["txid"], reason: p["reason"] };
    }
  }

  if (candidate === null) return null;
  const parsed = zecFrameSchema.safeParse(candidate);
  // VALIDATE, THEN SERIALISE, IN THAT ORDER - which is exactly what `respond`
  // does at the REST boundary. `MempoolRow` carries `bigint` zatoshi and
  // `JSON.stringify` throws on one, so the frame that leaves here goes through
  // `toJsonSafe` for the same reason `snapshotV1Frame` does. Serialising first
  // would validate the wire form rather than the value, which is the weaker
  // check of the two.
  return parsed.success ? (toJsonSafe(parsed.data) as ZecFrame) : null;
}

/**
 * The initial snapshot frame sent to each client on connect. Uses the same
 * `{ channel, payload }` envelope as translate() so the dashboard handles the
 * snapshot through its `zcashreveal:mempool` listener alongside live diffs.
 */
export function snapshotFrame(reports: LeakReport[], now: number): OutboundFrame {
  // THE TIP HEIGHT COMES FROM THE REPORTS THEMSELVES, which is the only source
  // here that needs neither the node nor the snapshot. Every `LeakReport`
  // carries `tipHeightAtSeen` - the tip when the indexer saw it - so the newest
  // of them is the newest block this table knows about, which is exactly what
  // the caption "N in the pool at height H" claims.
  //
  // TWO SOURCES WERE TRIED FIRST AND BOTH WERE COUPLINGS THIS FRAME MUST NOT
  // HAVE. The snapshot document's height broke A9's fail state, which asserts
  // that a missing snapshot file does not cost the client its mempool frame -
  // the sinks-independence rule of `docs/2.0/SNAPSHOT.md` section 8.5. A
  // `getblockchaininfo` call replaced one coupling with another, and a worse
  // one: the mempool table's whole point is that it comes from the indexer's
  // Redis rather than from the node.
  //
  // ZERO ONLY WHEN THERE ARE NO REPORTS, and then the table is empty, so the
  // caption states a height for nothing. `apps/web` refuses to lower its own
  // tip on a snapshot frame for that case - the same only-forward rule the tip
  // bus applies - so an empty connect frame cannot move a reader's height
  // backwards.
  const tipHeight = reports.reduce((h, r) => (r.tipHeightAtSeen > h ? r.tipHeightAtSeen : h), 0);
  return snapshotFrameAt(reports, tipHeight, now);
}

/** The same frame with the height supplied, so a test can pin one. */
export function snapshotFrameAt(reports: LeakReport[], tipHeight: number, now: number): OutboundFrame {
  return {
    channel: REDIS_CHANNELS.mempool,
    // `{type: "snapshot", view}` AND NOT `{type: "mempool_snapshot", reports}`.
    // The old shape named a type no client union contains and carried
    // `LeakReport`s no client can render, so the one frame that exists to fill
    // the table on connect filled nothing. `zecFrameSchema`'s `snapshot` arm is
    // a `MempoolView`, which is what `/v2/mempool` serves, built here by the
    // same function.
    // `toJsonSafe` for the same reason as above: the view carries `bigint`
    // zatoshi and this frame is `JSON.stringify`d on its way to the socket.
    payload: { type: "snapshot", view: toJsonSafe(buildMempoolView(reports, tipHeight, now)) },
  };
}

/**
 * The channel the `SnapshotV1` frame rides on.
 *
 * NEITHER REDIS PREFIX, AND THAT IS THE WHOLE REASON FOR THE NAME. The other two
 * channel values are Redis pub/sub channel names (`zcashreveal:mempool`,
 * `zcashreveal:tip`) because those frames are relayed from Redis verbatim. This
 * one is not relayed: the gateway builds it on connect from the file the
 * publisher renamed into place, and nothing publishes it on any channel. Calling
 * it `zcashreveal:snapshot` would name a Redis channel that does not exist, one
 * letter from `zecreveal:snapshot:*` - the managed store's namespace, which
 * `redis-topology.ts` exists to keep from being retyped. `gateway:` says who
 * built the frame and cannot be mistaken for either store.
 *
 * The legacy dashboard's `WsClient` dispatches on `channel` and drops a channel
 * nothing listens for (`legacy/dashboard/src/lib/ws.ts`), so a client that
 * predates this frame ignores it rather than mis-routing it.
 */
export const WS_SNAPSHOT_CHANNEL = "gateway:snapshot" as const;

/**
 * The `SnapshotV1` document, as the first frame a new client receives (A9).
 *
 * THE PAYLOAD TYPE IS `snapshot_v1` AND NOT `snapshot`, BECAUSE `snapshot` IS
 * ALREADY TAKEN BY A DIFFERENT DOCUMENT. `packages/zec-types/src/views.ts`'s
 * `zecFrameSchema` has a `{ type: "snapshot", view: mempoolViewSchema }` arm and
 * that is a MEMPOOL snapshot - the table of unconfirmed rows. This is the
 * pool-level document `apps/publisher` writes every tip: residual, drain,
 * migration histogram, the N_eff series. Two documents under one discriminator
 * would be resolved by whoever read them last, which is exactly the conflation
 * HANDOFF-11 is going to have to unpick when it reconciles `ZecFrame` with this
 * envelope. Naming this one after the schema it carries means that
 * reconciliation is a mapping and not an archaeology.
 *
 * THE ENVELOPE IS NOT WIDENED. `OutboundFrame` stays `{ channel, payload }` and
 * this frame rides inside it, which is what `ws-broker.test.ts`'s
 * `@ts-expect-error` guard protects: a new bare union arm would make that
 * directive unused and fail `tsc`, and that failure IS the regression alarm.
 *
 * `toJsonSafe` RATHER THAN THE RAW DOCUMENT, because `SnapshotV1` carries
 * `bigint` zatoshi and `JSON.stringify` throws on one - the connect path
 * stringifies this frame exactly as `broadcast` stringifies every other. It is
 * the same conversion `respond` applies at the REST boundary, so `GET
 * /api/snapshot` and this frame carry the identical document, which
 * `snapshot.test.ts` asserts by comparing the two rather than by trusting that
 * one function called twice agrees with itself.
 */
export function snapshotV1Frame(snapshot: SnapshotV1): OutboundFrame {
  return {
    channel: WS_SNAPSHOT_CHANNEL,
    payload: { type: "snapshot_v1", snapshot: toJsonSafe(snapshot) },
  };
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
