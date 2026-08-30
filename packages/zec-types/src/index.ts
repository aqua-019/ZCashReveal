export * from "./transactions.js";
export * from "./shielded.js";
export * from "./leaks.js";
export * from "./realtime.js";
export * from "./redis-topology.js";
export * from "./zip317.js";
export * from "./zip318.js";
export * from "./analysis.js";
export * from "./views.js";
export * from "./snapshot.js";

export type WsServerMessage =
  | { type: "hello"; version: string; tipHeight: number }
  | { type: "tx_added"; report: import("./leaks.js").LeakReport }
  | { type: "tx_removed"; txid: string; reason: "confirmed" | "evicted" | "replaced" }
  | { type: "tip"; height: number; hash: string }
  | { type: "mempool_snapshot"; reports: import("./leaks.js").LeakReport[] };

export type WsClientMessage =
  | { type: "subscribe"; topics: Array<"mempool" | "tip" | "leaks"> }
  | { type: "ping" };
