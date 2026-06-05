import type { WebSocket } from "ws";
import type { Logger } from "pino";
import { REDIS_CHANNELS, type LeakReport } from "@zcashreveal/types";

/**
 * Every frame the gateway emits is a `{ channel, payload }` envelope. The
 * dashboard's WsClient dispatches on `channel` (the REDIS_CHANNELS values), so
 * this shape is the contract — see apps/dashboard/src/lib/ws.ts.
 */
export type OutboundFrame = { channel: string; payload: unknown };

export class WsBroker {
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly log: Logger) {}

  add(ws: WebSocket): number {
    this.clients.add(ws);
    return this.clients.size;
  }

  remove(ws: WebSocket): number {
    this.clients.delete(ws);
    return this.clients.size;
  }

  size(): number {
    return this.clients.size;
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
