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

import { ADDRESS_VIEWS } from "./fixtures/address";
import { BLOCK_VIEWS } from "./fixtures/block";
import { FLOWS_VIEW } from "./fixtures/flows";
import { labelViews } from "./fixtures/labels";
import { MEMPOOL_VIEW } from "./fixtures/mempool";
import { POOLS_VIEW } from "./fixtures/pools";
import { TX_VIEWS } from "./fixtures/tx";
import { searchKind } from "./kind";
import type { SocketLike } from "./socket";
import { subscribeFrames } from "./stream";
import type { ZecApi } from "./zec-api";

export interface FixtureApiOptions {
  /** Milliseconds between simulated arrivals. */
  readonly tickMs?: number;
  /** Overrides the transport. Only tests pass this. */
  readonly open?: (url: string) => SocketLike;
}

export class FixtureApi implements ZecApi {
  readonly #tickMs: number;
  readonly #open: ((url: string) => SocketLike) | undefined;

  constructor(options: FixtureApiOptions = {}) {
    this.#tickMs = options.tickMs ?? 4_000;
    this.#open = options.open;
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
    // Delegated so the client panel can import the subscription WITHOUT
    // importing this class - see the note at the head of stream.ts. Reaching
    // for `api().subscribe` from a client component pulled the whole fixture
    // corpus and the content seeds into the browser bundle and took /track to
    // 217 kB of first-load JavaScript.
    return subscribeFrames(onFrame, { tickMs: this.#tickMs, ...(this.#open === undefined ? {} : { open: this.#open }) });
  }
}
