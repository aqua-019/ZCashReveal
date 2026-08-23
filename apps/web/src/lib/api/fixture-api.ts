/**
 * `FixtureApi` - the whole Tracking suite, answered from committed values.
 *
 * This is what `NEXT_PUBLIC_DATA_MODE=fixture` selects, and it is the only
 * implementation wired in HANDOFF-04. It makes no network request of any kind,
 * which is what lets every page below be complete, prerendered and tested
 * before the gateway from HANDOFF-05 exists.
 *
 * THE FIXTURE STREAM. `subscribe` does not fake a socket; it drives the real
 * one. `ZecSocket` is handed an `open` function that returns a committed
 * stream instead of a WebSocket, so the reconnect logic, the frame parsing and
 * the state machine that the mempool panel depends on are the same code in both
 * modes - and A7 can test the reconnect against a fake transport for the same
 * reason. The stream replays a snapshot, then emits one arrival every few
 * seconds, then closes and reopens, so the panel's reconnect path is exercised
 * by simply leaving the page open.
 */
import type {
  AddressView,
  BlockView,
  FlowsView,
  LabelView,
  MempoolView,
  PoolsView,
  SearchKind,
  TxView,
  ZecFrame,
} from "@zcashreveal/types";
import { zecFrameSchema } from "@zcashreveal/types";

import { ADDRESS_VIEWS } from "./fixtures/address";
import { BLOCK_VIEWS } from "./fixtures/block";
import { FLOWS_VIEW } from "./fixtures/flows";
import { labelViews } from "./fixtures/labels";
import { MEMPOOL_VIEW } from "./fixtures/mempool";
import { POOLS_VIEW } from "./fixtures/pools";
import { TX_VIEWS } from "./fixtures/tx";
import { searchKind } from "./kind";
import { ZecSocket, type SocketLike } from "./socket";
import type { ZecApi } from "./zec-api";

/**
 * A committed stream that behaves like a socket.
 *
 * It emits the mempool snapshot on open, then one arrival every `tickMs`,
 * cycling through the twelve committed rows with their ages advanced, and
 * closes itself after a full cycle so the client's reconnect path runs in
 * normal operation rather than only under fault.
 */
class FixtureStream {
  readonly #handlers = new Map<string, Set<(ev?: unknown) => void>>();
  #timers: number[] = [];
  #closed = false;

  constructor(private readonly tickMs: number) {
    // Open on the next turn of the loop, so a caller that attaches its
    // listeners synchronously after construction still sees the open event.
    this.#later(() => { this.#emit("open"); this.#pump(); }, 0);
  }

  // Typed loosely on purpose: `SocketLike`'s overloads exist so `ZecSocket`'s
  // call sites are checked, and a stream that satisfies them structurally is
  // what the cast at the construction site asserts.
  addEventListener(type: string, handler: (ev?: unknown) => void): void {
    let set = this.#handlers.get(type);
    if (set === undefined) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler as (ev?: unknown) => void);
  }

  send(): void {
    // A ping. There is nothing on the other end to answer it, and the client's
    // idle timer is reset by the frames below, so this is deliberately inert.
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const t of this.#timers) globalThis.clearTimeout(t);
    this.#timers = [];
    this.#emit("close");
  }

  #later(fn: () => void, ms: number): void {
    this.#timers.push(globalThis.setTimeout(fn, ms) as unknown as number);
  }

  #emit(type: string, data?: unknown): void {
    for (const h of this.#handlers.get(type) ?? []) h(data as never);
  }

  #frame(frame: ZecFrame): void {
    if (this.#closed) return;
    this.#emit("message", { data: JSON.stringify(frame, jsonReplacer) });
  }

  #pump(): void {
    this.#frame({ type: "hello", tipHeight: MEMPOOL_VIEW.tipHeight });
    this.#frame({ type: "snapshot", view: MEMPOOL_VIEW });

    MEMPOOL_VIEW.entries.forEach((entry, i) => {
      this.#later(() => {
        // A fresh arrival: the same committed row, at the front of the queue
        // with its age reset. Nothing here is generated - the corpus is fixed
        // and the stream is a replay of it.
        this.#frame({ type: "tx_added", entry: { ...entry, ageSeconds: 0 } });
      }, this.tickMs * (i + 1));
    });

    // One full cycle, then drop the connection. The panel reconnects, the
    // snapshot replays, and the reconnect path is exercised by ordinary use.
    this.#later(() => { this.close(); }, this.tickMs * (MEMPOOL_VIEW.entries.length + 2));
  }
}

/** JSON cannot carry a bigint; the wire format is a decimal string, per `zatSchema`. */
function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export interface FixtureApiOptions {
  /** Milliseconds between simulated arrivals. */
  readonly tickMs?: number;
  /** Overrides the transport. Only tests pass this. */
  readonly open?: (url: string) => SocketLike;
}

export class FixtureApi implements ZecApi {
  readonly #tickMs: number;
  readonly #open: (url: string) => SocketLike;

  constructor(options: FixtureApiOptions = {}) {
    this.#tickMs = options.tickMs ?? 4_000;
    this.#open = options.open ?? (() => new FixtureStream(this.#tickMs) as unknown as SocketLike);
  }

  searchKind(q: string): SearchKind {
    return searchKind(q);
  }

  getAddress(address: string): Promise<AddressView | null> {
    return Promise.resolve(ADDRESS_VIEWS.get(address) ?? null);
  }

  getTx(txid: string): Promise<TxView | null> {
    return Promise.resolve(TX_VIEWS.get(txid.toLowerCase()) ?? null);
  }

  getBlock(height: number): Promise<BlockView | null> {
    return Promise.resolve(BLOCK_VIEWS.get(height) ?? null);
  }

  getPools(): Promise<PoolsView> {
    return Promise.resolve(POOLS_VIEW);
  }

  getMempool(): Promise<MempoolView> {
    return Promise.resolve(MEMPOOL_VIEW);
  }

  getFlows(): Promise<FlowsView> {
    return Promise.resolve(FLOWS_VIEW);
  }

  getLabels(): Promise<readonly LabelView[]> {
    return Promise.resolve(labelViews());
  }

  subscribe(onFrame: (frame: ZecFrame) => void): () => void {
    const socket = new ZecSocket("fixture://mempool", {
      open: this.#open,
      onFrame: (raw) => {
        // Validated on the way in even though this end wrote it. The fixture
        // stream and the gateway are the same code path to the consumer, and a
        // consumer that trusts one and validates the other is a consumer that
        // has two code paths again.
        const parsed = zecFrameSchema.safeParse(raw);
        if (parsed.success) onFrame(parsed.data);
      },
      // The committed stream closes after each cycle by design, so the retry
      // has to be brisk enough that the panel does not visibly stall between
      // cycles, and jittered so it is not a metronome.
      baseDelayMs: 400,
      maxDelayMs: 2_000,
      // No heartbeat against a stream that has no other end to answer one.
      idleTimeoutMs: 0,
      pingIntervalMs: 0,
    });
    socket.connect();
    return () => { socket.close(); };
  }
}
