/**
 * In-memory canonical view of the current mempool with diff emission.
 */

import { EventEmitter } from "node:events";
import type { Logger } from "pino";
import type { LeakReport } from "@zcashreveal/types";

export type MempoolDiff =
  | { kind: "added"; report: LeakReport }
  | { kind: "removed"; txid: string; reason: "confirmed" | "evicted" | "replaced" };

export class MempoolState extends EventEmitter {
  private reports = new Map<string, LeakReport>();

  constructor(private readonly log: Logger) {
    super();
  }

  has(txid: string): boolean { return this.reports.has(txid); }
  get(txid: string): LeakReport | undefined { return this.reports.get(txid); }
  all(): LeakReport[] { return [...this.reports.values()]; }
  size(): number { return this.reports.size; }

  upsert(report: LeakReport): void {
    const existed = this.reports.has(report.txid);
    this.reports.set(report.txid, report);
    if (!existed) {
      this.emit("diff", { kind: "added", report } satisfies MempoolDiff);
    }
  }

  reconcile(currentTxids: string[], reason: "confirmed" | "evicted" | "replaced"): void {
    const authoritative = new Set(currentTxids);
    for (const txid of this.reports.keys()) {
      if (!authoritative.has(txid)) {
        this.reports.delete(txid);
        this.emit("diff", { kind: "removed", txid, reason } satisfies MempoolDiff);
      }
    }
  }
}
