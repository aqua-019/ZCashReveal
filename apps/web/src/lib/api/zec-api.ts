/**
 * `ZecApi` - the one interface every Tracking surface reads through.
 *
 * HANDOFF-04 section 3 fixes the nine members. The point of naming them now,
 * before a gateway exists, is that the pages are written against a contract
 * rather than against a fixture: `FixtureApi` and `HttpApi` both implement this,
 * the pages import neither, and HANDOFF-11's cutover changes one line in
 * `index.ts` and nothing else in `src/app`.
 *
 * Every method is async even where the fixture answers synchronously. A method
 * that is sync today and async tomorrow is a rewrite of every caller; a method
 * that is async today costs one `await` and is already correct when the
 * gateway arrives.
 *
 * `null` means "this identifier has no answer here" and is a normal outcome the
 * pages render as a stated gap. A thrown error means the transport failed, and
 * that is a different thing which a page must not present as an empty result.
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

export interface ZecApi {
  /**
   * What a query string is, by shape alone. Synchronous and pure on purpose:
   * classification must never involve a request, because one of the six answers
   * is a viewing key and the whole promise around those is that nothing is sent.
   */
  searchKind(q: string): SearchKind;

  getAddress(address: string): Promise<AddressView | null>;
  getTx(txid: string): Promise<TxView | null>;
  getBlock(height: number): Promise<BlockView | null>;
  getPools(): Promise<PoolsView>;
  getMempool(): Promise<MempoolView>;
  getFlows(): Promise<FlowsView>;
  getLabels(): Promise<readonly LabelView[]>;

  /**
   * Subscribe to mempool frames. Returns an unsubscribe function, which is the
   * only way to stop: there is no `unsubscribe(handler)`, so a caller cannot
   * accidentally detach a handler it does not own.
   *
   * In fixture mode the frames come from a committed stream on a timer; in live
   * mode from the gateway's socket. The consumer cannot tell which, and that is
   * the property that makes the mempool panel's reconnect logic testable
   * without a browser and shippable without a gateway.
   */
  subscribe(onFrame: (frame: ZecFrame) => void): () => void;
}
