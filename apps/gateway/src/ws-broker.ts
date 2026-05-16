import type { WebSocket } from "ws";
import type { Logger } from "pino";
import {
  REDIS_CHANNELS,
  type MempoolChannelPayload,
  type TipChannelPayload,
  type WsServerMessage,
} from "@zcashreveal/types";

export type OutboundFrame =
  | WsServerMessage
  | { channel: string; payload: unknown };

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
   * Map a Redis pub/sub message into a typed WsServerMessage when we recognize
   * the channel and payload shape; otherwise fall back to a generic envelope.
   */
  translate(channel: string, raw: string): OutboundFrame {
    const parsed = safeJsonParse(raw);

    if (channel === REDIS_CHANNELS.mempool && isMempoolPayload(parsed)) {
      if (parsed.type === "tx_added") {
        return { type: "tx_added", report: parsed.report };
      }
      return { type: "tx_removed", txid: parsed.txid, reason: parsed.reason };
    }

    if (channel === REDIS_CHANNELS.tip && isTipPayload(parsed)) {
      return { type: "tip", height: parsed.height, hash: parsed.hash };
    }

    return { channel, payload: parsed };
  }
}

function isMempoolPayload(v: unknown): v is MempoolChannelPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.type === "tx_added") return typeof o.report === "object" && o.report !== null;
  if (o.type === "tx_removed") {
    return (
      typeof o.txid === "string" &&
      (o.reason === "confirmed" || o.reason === "evicted" || o.reason === "replaced")
    );
  }
  return false;
}

function isTipPayload(v: unknown): v is TipChannelPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.type === "tip" &&
    typeof o.height === "number" &&
    typeof o.hash === "string"
  );
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
