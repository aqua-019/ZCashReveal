import type { WebSocket } from "ws";
import type { Logger } from "pino";
import { REDIS_CHANNELS, type LeakReport } from "@zcashreveal/types";

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

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
