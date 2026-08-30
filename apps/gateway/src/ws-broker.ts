import type { WebSocket } from "ws";
import type { Logger } from "pino";
import { REDIS_CHANNELS, type LeakReport, type SnapshotV1 } from "@zcashreveal/types";

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
 * The consumer is changing again. `apps/web`'s `ZecSocket` (HANDOFF-04) reads
 * the `ZecFrame` union, not this envelope, and HANDOFF-11 is where the two are
 * reconciled at the cutover. Until then this envelope is what the gateway
 * emits and the legacy client is what reads it.
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
   * Wrap a Redis pub/sub message in the `{ channel, payload }` envelope the
   * dashboard expects. The raw indexer message becomes the payload verbatim —
   * it already carries its own discriminator (`type` for mempool frames,
   * `height`/`hash` for tip), so consumers read `payload.type` / `payload.height`
   * exactly as before. No per-channel shaping: every channel maps identically,
   * which is why this is one line rather than a switch. Malformed JSON yields
   * `payload: null` (safeJsonParse swallows the parse error).
   */
  translate(channel: string, raw: string): OutboundFrame {
    return { channel, payload: safeJsonParse(raw) };
  }
}

/**
 * The initial snapshot frame sent to each client on connect. Uses the same
 * `{ channel, payload }` envelope as translate() so the dashboard handles the
 * snapshot through its `zcashreveal:mempool` listener alongside live diffs.
 */
export function snapshotFrame(reports: LeakReport[]): OutboundFrame {
  return {
    channel: REDIS_CHANNELS.mempool,
    payload: { type: "mempool_snapshot", reports },
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
