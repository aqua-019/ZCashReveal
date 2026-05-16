/**
 * WebSocket client with reconnect + topic dispatch.
 */

type Listener = (payload: unknown) => void;

export class WsClient {
  private ws?: WebSocket;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer?: number;
  private closed = false;

  constructor(private readonly url: string) {}

  connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener("open", () => this.dispatch("__open", null));
    ws.addEventListener("close", () => {
      this.dispatch("__close", null);
      if (!this.closed) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    });
    ws.addEventListener("error", () => { /* close will follow */ });
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { channel: string; payload: unknown };
        this.dispatch(msg.channel, msg.payload);
      } catch { /* ignore malformed */ }
    });
  }

  on(channel: string, l: Listener): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(l);
    return () => set!.delete(l);
  }

  private dispatch(channel: string, payload: unknown) {
    const set = this.listeners.get(channel);
    if (!set) return;
    for (const l of set) l(payload);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
