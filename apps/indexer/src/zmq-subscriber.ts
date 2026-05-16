/**
 * ZMQ subscriber for zebrad mempool / block notifications.
 * Topics: hashtx (txid added to mempool) and hashblock (chain tip change).
 */

import { Subscriber } from "zeromq";
import { EventEmitter } from "node:events";
import type { Logger } from "pino";

export type ZmqEvent =
  | { topic: "hashtx"; txid: string }
  | { topic: "hashblock"; blockhash: string };

export class ZebradZmqSubscriber extends EventEmitter {
  private sock: Subscriber;
  private url: string;
  private running = false;

  constructor(
    url: string,
    private readonly log: Logger,
  ) {
    super();
    this.url = url;
    this.sock = new Subscriber();
  }

  async start(): Promise<void> {
    this.sock.connect(this.url);
    this.sock.subscribe("hashtx");
    this.sock.subscribe("hashblock");
    this.running = true;
    this.emit("connected");
    this.log.info({ url: this.url }, "ZMQ subscriber connected");
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const [topicBuf, bodyBuf] of this.sock) {
        if (!this.running) break;
        const topic = topicBuf.toString("ascii");
        const hex = bodyBuf.toString("hex");
        if (topic === "hashtx") {
          this.emit("event", { topic: "hashtx", txid: hex });
        } else if (topic === "hashblock") {
          this.emit("event", { topic: "hashblock", blockhash: hex });
        }
      }
    } catch (err) {
      if (this.running) {
        this.emit("error", err as Error);
      }
    } finally {
      this.emit("closed");
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.sock.close();
  }
}
