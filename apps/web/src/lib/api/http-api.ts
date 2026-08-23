/**
 * `HttpApi` - the gateway client. WRITTEN, NOT SELECTED.
 *
 * HANDOFF-04 section 1 puts this explicitly out of scope for wiring: "No HTTP
 * calls yet (the `HttpApi` class exists but is not selected)." It exists now
 * anyway, and that is deliberate. Writing the client against the DTOs while the
 * server is still unwritten is what makes the DTOs a contract rather than a
 * description of whatever the fixture happens to contain - every field below is
 * parsed, so a gateway that omits one fails here, at the boundary, with the
 * field named, instead of rendering `undefined` into a table three components
 * later.
 *
 * `index.ts` never constructs this. HANDOFF-11's cutover is the commit that
 * changes that, and by then the shape it parses will have been fixed for two
 * handoffs.
 *
 * EVERY RESPONSE IS PARSED. Not cast. The gateway is a different process
 * written by a different handoff against a spec, and a spec is not a guarantee.
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
import {
  addressViewSchema,
  blockViewSchema,
  flowsViewSchema,
  labelViewSchema,
  mempoolViewSchema,
  poolsViewSchema,
  txViewSchema,
  zecFrameSchema,
} from "@zcashreveal/types";
import { z } from "zod";

import { searchKind } from "./kind";
import { ZecSocket, type SocketLike } from "./socket";
import type { ZecApi } from "./zec-api";

export interface HttpApiOptions {
  /** Gateway REST base, e.g. `https://api.zecreveal.com`. No trailing slash. */
  readonly baseUrl: string;
  /** Gateway WebSocket, e.g. `wss://api.zecreveal.com/ws`. */
  readonly wsUrl: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Injected for tests. Defaults to a real WebSocket. */
  readonly open?: (url: string) => SocketLike;
}

export class HttpApi implements ZecApi {
  readonly #base: string;
  readonly #wsUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #open: (url: string) => SocketLike;

  constructor(options: HttpApiOptions) {
    this.#base = options.baseUrl.replace(/\/+$/, "");
    this.#wsUrl = options.wsUrl;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#open = options.open ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  }

  searchKind(q: string): SearchKind {
    // Never a request. The same classifier the fixture uses, for the same
    // reason: one of the six answers is a viewing key, and the promise is that
    // recognising one involves no network at all.
    return searchKind(q);
  }

  /**
   * A GET that parses.
   *
   * 404 is `null`, which is a real answer: the gateway knows the chain and the
   * chain does not have that address. Any other non-2xx, or a body that does
   * not match the schema, throws - a page must be able to tell "there is no
   * such transaction" from "the gateway is broken", and it cannot if both
   * arrive as an empty result.
   */
  async #get<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T | null> {
    const res = await this.#fetch(`${this.#base}${path}`, { headers: { accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`gateway ${res.status} for ${path}`);
    const body: unknown = await res.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`gateway returned an unexpected shape for ${path}: ${first?.path.join(".") ?? "?"} - ${first?.message ?? "invalid"}`);
    }
    return parsed.data;
  }

  /** The same, for endpoints where absence is not a valid answer. */
  async #need<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
    const value = await this.#get(path, schema);
    if (value === null) throw new Error(`gateway has no ${path}, which it must always have`);
    return value;
  }

  getAddress(address: string): Promise<AddressView | null> {
    return this.#get(`/v2/address/${encodeURIComponent(address)}`, addressViewSchema);
  }

  getTx(txid: string): Promise<TxView | null> {
    return this.#get(`/v2/tx/${encodeURIComponent(txid.toLowerCase())}`, txViewSchema);
  }

  getBlock(height: number): Promise<BlockView | null> {
    return this.#get(`/v2/block/${height}`, blockViewSchema);
  }

  getPools(): Promise<PoolsView> {
    return this.#need("/v2/pools", poolsViewSchema);
  }

  getMempool(): Promise<MempoolView> {
    return this.#need("/v2/mempool", mempoolViewSchema);
  }

  getFlows(): Promise<FlowsView> {
    return this.#need("/v2/flows", flowsViewSchema);
  }

  getLabels(): Promise<readonly LabelView[]> {
    return this.#need("/v2/labels", z.array(labelViewSchema));
  }

  subscribe(onFrame: (frame: ZecFrame) => void): () => void {
    const socket = new ZecSocket(this.#wsUrl, {
      open: this.#open,
      onFrame: (raw) => {
        const parsed = zecFrameSchema.safeParse(raw);
        // A frame the client does not recognise is dropped, not thrown. A
        // gateway one version ahead will send frames this build has never heard
        // of, and the mempool panel going blank is a worse answer than the
        // panel ignoring them.
        if (parsed.success) onFrame(parsed.data);
      },
    });
    socket.connect();
    return () => { socket.close(); };
  }
}
