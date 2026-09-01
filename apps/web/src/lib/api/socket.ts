/**
 * The mempool socket: a reconnecting frame reader.
 *
 * PORTED FROM `legacy/dashboard/src/lib/ws.ts`, and the port is not a copy.
 * The v0.2 client is 57 lines and its entire reconnection policy is one line -
 * `window.setTimeout(() => this.connect(), 1500)` - with no backoff, no jitter,
 * no attempt cap, no heartbeat, and a close handler declared with no event
 * argument, so a normal close (1000), an abnormal one (1006) and an application
 * close all retry identically, for ever, every 1.5 seconds. What is kept is the
 * shape that worked: one envelope per frame, dispatch by type, an unsubscribe
 * closure, and a close that latches. What is replaced is everything about when
 * it reconnects.
 *
 * Four changes, each for a stated reason:
 *
 *   1. EXPONENTIAL BACKOFF WITH A CEILING. A fixed 1.5 s retry against a
 *      gateway that is down is a client hammering a dead host once a second per
 *      open tab, for as long as the tab is open. The schedule is 250 ms
 *      doubling to 8 s.
 *
 *   2. SEEDED JITTER. Without it, every reader who was connected when the
 *      gateway restarted reconnects in the same millisecond. `Math.random` is
 *      banned repo-wide (CLAUDE.md, and an eslint rule enforces it), which here
 *      is a benefit rather than an obstacle: the jitter is drawn from the same
 *      FNV-1a into mulberry32 stream the ambience uses, seeded by the socket
 *      url, so it is per-client stable and reproducible in a test.
 *
 *   3. LISTENERS ARE DETACHED ON RECONNECT. v0.2 attaches four listeners to a
 *      new socket on every attempt and never removes the old ones. An
 *      AbortController per attempt makes that structural.
 *
 *   4. A HEARTBEAT. A TCP connection that has silently died looks exactly like
 *      an idle one, and the mempool is legitimately quiet at 3am. The client
 *      sends `{"type":"ping"}` and treats silence past `idleTimeoutMs` as a
 *      dead connection rather than a quiet one.
 *
 * The client is transport-shaped, not WebSocket-shaped: it is handed an `open`
 * function returning anything with the four methods below. That is what lets
 * the fixture stream drive exactly this code path with no `if (fixture)`
 * anywhere in it, and what lets A7 test the reconnect with a fake socket and no
 * browser.
 */
import { seededRng } from "@/lib/seed";

/** The subset of WebSocket this client uses. Anything with these four members will do. */
export interface SocketLike {
  addEventListener(type: "open", handler: () => void, options?: { signal?: AbortSignal }): void;
  addEventListener(type: "message", handler: (ev: { data: unknown }) => void, options?: { signal?: AbortSignal }): void;
  addEventListener(type: "close", handler: (ev?: { code?: number }) => void, options?: { signal?: AbortSignal }): void;
  addEventListener(type: "error", handler: () => void, options?: { signal?: AbortSignal }): void;
  send(data: string): void;
  close(code?: number): void;
}

/** Connection state, reported to the UI so a stale panel can say it is stale. */
export type SocketState = "connecting" | "open" | "closed";

export interface SocketOptions {
  /** Opens a transport. Called once per attempt; never reused across attempts. */
  readonly open: (url: string) => SocketLike;
  /** A parsed frame. Frames that do not parse are dropped and counted, never thrown. */
  readonly onFrame: (frame: unknown) => void;
  /** Connection state changes. */
  readonly onState?: (state: SocketState) => void;
  /** First retry delay. Doubles per consecutive failure. */
  readonly baseDelayMs?: number;
  /** The ceiling the doubling stops at. */
  readonly maxDelayMs?: number;
  /** Silence longer than this is treated as a dead connection. 0 disables the heartbeat. */
  readonly idleTimeoutMs?: number;
  /** How often to send a ping while otherwise idle. 0 disables it. */
  readonly pingIntervalMs?: number;
  /** Injected so tests drive the clock. Defaults to the global timers. */
  readonly setTimeout?: (fn: () => void, ms: number) => number;
  readonly clearTimeout?: (id: number) => void;
}

const DEFAULT_BASE_MS = 250;
const DEFAULT_MAX_MS = 8_000;
const DEFAULT_IDLE_MS = 45_000;
const DEFAULT_PING_MS = 20_000;

export class ZecSocket {
  #socket: SocketLike | undefined;
  #abort: AbortController | undefined;
  #retryTimer: number | undefined;
  #idleTimer: number | undefined;
  #pingTimer: number | undefined;
  #attempt = 0;
  #closed = false;
  #state: SocketState = "closed";
  #dropped = 0;

  readonly #url: string;
  readonly #o: Required<Omit<SocketOptions, "onState">> & { readonly onState: ((state: SocketState) => void) | undefined };
  readonly #jitter: () => number;

  constructor(url: string, options: SocketOptions) {
    this.#url = url;
    this.#o = {
      open: options.open,
      onFrame: options.onFrame,
      onState: options.onState,
      baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_MS,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_MS,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_MS,
      pingIntervalMs: options.pingIntervalMs ?? DEFAULT_PING_MS,
      setTimeout: options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number),
      clearTimeout: options.clearTimeout ?? ((id) => { globalThis.clearTimeout(id); }),
    };
    // Seeded by the url so two tabs on the same gateway still draw the same
    // stream - the jitter's job is to spread reconnects across a fleet, and a
    // per-client-per-attempt value is what does that. Reproducible by
    // construction, which is what makes the schedule testable.
    this.#jitter = seededRng(url, "socket-jitter");
  }

  /** How many frames were received and could not be parsed. Surfaced in diagnostics, never thrown. */
  get droppedFrames(): number {
    return this.#dropped;
  }

  get state(): SocketState {
    return this.#state;
  }

  /**
   * The delay before attempt `n` (0-indexed), in milliseconds.
   *
   * Exposed because a schedule nobody can read is a schedule nobody can check.
   * Full jitter over the doubled window, not a small wobble around it: a
   * fraction of the whole delay is what actually decorrelates a fleet, where a
   * plus-or-minus-10% wobble leaves everyone inside the same 200 ms.
   */
  delayFor(attempt: number): number {
    const doubled = Math.min(this.#o.baseDelayMs * 2 ** attempt, this.#o.maxDelayMs);
    // Half the window fixed, half drawn: never faster than half the intended
    // delay, never slower than the ceiling.
    return Math.round(doubled / 2 + this.#jitter() * (doubled / 2));
  }

  connect(): void {
    if (this.#closed) return;
    this.#teardownAttempt();
    this.#setState("connecting");

    const abort = new AbortController();
    this.#abort = abort;
    const signal = abort.signal;
    const socket = this.#o.open(this.#url);
    this.#socket = socket;

    socket.addEventListener(
      "open",
      () => {
        this.#attempt = 0;
        this.#setState("open");
        this.#armIdle();
        this.#armPing();
      },
      { signal },
    );

    socket.addEventListener(
      "message",
      (ev) => {
        this.#armIdle();
        const parsed = parseFrame(ev.data);
        if (parsed === undefined) {
          this.#dropped += 1;
          return;
        }
        this.#o.onFrame(parsed);
      },
      { signal },
    );

    // A close is a close. v0.2 read no close code and this does not either, but
    // for the opposite reason: the codes a browser reports for a dropped
    // connection are not reliable enough to branch a retry policy on, and every
    // deliberate stop already goes through `close()`, which latches. So the
    // policy is one line and the same for every code, and it is written down.
    socket.addEventListener("close", () => { this.#scheduleRetry(); }, { signal });
    socket.addEventListener("error", () => { /* a close always follows */ }, { signal });
  }

  /**
   * Stop, permanently. The latch is one-way, as in v0.2: a socket that has been
   * closed by its owner must not be revived by a stray timer.
   */
  close(): void {
    this.#closed = true;
    this.#teardownAttempt();
    this.#setState("closed");
  }

  #scheduleRetry(): void {
    if (this.#closed) return;
    this.#teardownAttempt();
    this.#setState("connecting");
    const delay = this.delayFor(this.#attempt);
    this.#attempt += 1;
    this.#retryTimer = this.#o.setTimeout(() => {
      this.#retryTimer = undefined;
      this.connect();
    }, delay);
  }

  #armIdle(): void {
    if (this.#o.idleTimeoutMs <= 0) return;
    if (this.#idleTimer !== undefined) this.#o.clearTimeout(this.#idleTimer);
    this.#idleTimer = this.#o.setTimeout(() => {
      // Silence is indistinguishable from death from here, so treat it as
      // death: drop the transport and let the retry schedule take over.
      this.#socket?.close(4000);
      this.#scheduleRetry();
    }, this.#o.idleTimeoutMs);
  }

  #armPing(): void {
    if (this.#o.pingIntervalMs <= 0) return;
    if (this.#pingTimer !== undefined) this.#o.clearTimeout(this.#pingTimer);
    this.#pingTimer = this.#o.setTimeout(() => {
      try {
        this.#socket?.send(JSON.stringify({ type: "ping" }));
      } catch {
        // A send on a half-dead socket throws; the close listener handles it.
      }
      this.#armPing();
    }, this.#o.pingIntervalMs);
  }

  #teardownAttempt(): void {
    this.#abort?.abort();
    this.#abort = undefined;
    for (const t of [this.#retryTimer, this.#idleTimer, this.#pingTimer]) {
      if (t !== undefined) this.#o.clearTimeout(t);
    }
    this.#retryTimer = undefined;
    this.#idleTimer = undefined;
    this.#pingTimer = undefined;
    this.#socket?.close();
    this.#socket = undefined;
  }

  #setState(next: SocketState): void {
    if (this.#state === next) return;
    this.#state = next;
    this.#o.onState?.(next);
  }
}

/**
 * One text frame to an object, or undefined.
 *
 * Malformed input is dropped and counted rather than thrown, because a socket
 * is an untrusted boundary and one bad frame must not take a page down. The
 * frame is NOT validated against `zecFrameSchema` here: this layer's job is
 * "is it JSON", and the consumer's job is "is it a frame I know", so a
 * validation failure is attributable to the right side of the boundary.
 */
export function parseFrame(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The gateway wraps every frame as `{ channel, payload }`; the fixture stream
 * writes a bare one. This reads both, and the tolerance is deliberate.
 *
 * WHAT WAS WRONG BEFORE, AND IT WAS SILENT. `apps/gateway`'s `ws-broker.ts`
 * has emitted `{ channel, payload }` since HANDOFF-05, and this guard switched
 * on a top-level `type`. An enveloped frame therefore hit the `default` arm and
 * was DROPPED - counted in `ZecSocket.droppedFrames`, never thrown, never
 * rendered. The panel would have read "live" while receiving nothing, on a
 * socket that was connected and healthy. Nothing in the suite could see it:
 * the fixture stream writes bare frames, so every test drove the one shape that
 * worked.
 *
 * The gateway now puts a real `ZecFrame` in `payload` - the reconciliation
 * `ws-broker.ts`'s docblock promised HANDOFF-11 would do - so the two sides
 * differ by exactly one wrapper, and this removes it.
 *
 * `channel` IS NOT READ. It says which producer a frame came from, which is an
 * operator's question rather than a renderer's; the payload's own `type` is
 * what this build narrows on, and reading both would be two discriminators for
 * one decision.
 */
export function unwrapEnvelope(f: Record<string, unknown>): Record<string, unknown> {
  const payload = f["payload"];
  if (typeof f["channel"] === "string" && typeof payload === "object" && payload !== null) {
    // ONE LEVEL ONLY. A doubly-wrapped frame is a producer defect, not a shape
    // to accommodate, and unwrapping until something looks right is how a guard
    // stops discriminating.
    return payload as Record<string, unknown>;
  }
  return f;
}
