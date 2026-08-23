/**
 * The previous-output resolver that makes the fee real on the live path.
 *
 * `computeFeeZat` is pure and takes its lookups as an argument; this is the
 * implementation of that argument backed by an actual node. Keeping the two
 * apart is what lets the fee arithmetic be tested against a three-line Map
 * without a Zebra instance anywhere near it.
 *
 * WHY A CACHE IS NOT AN OPTIMISATION HERE. Computing one transaction's fee
 * costs one `getrawtransaction` per input, and the transactions this project
 * watches are exactly the ones with many inputs. Worse, inputs cluster: a
 * wallet consolidating change spends several outputs of the SAME parent, so the
 * naive resolver fetches one parent repeatedly within a single fee. Caching by
 * parent transaction rather than by outpoint collapses that to one call, which
 * is the difference between a mempool loop that keeps up and one that does not.
 *
 * A MISS IS NOT CACHED. A transaction absent now - a parent still propagating,
 * a node mid-sync - may be present in a second, and a negative entry would
 * freeze `feeZat: null` onto every transaction that spends it for the lifetime
 * of the process. Refusing to answer is cheap; refusing to answer forever is a
 * silent outage in the fee column.
 */

import type { Hex, RpcTransaction, Zatoshi } from "@zcashreveal/types";
import type { PrevOutResolver } from "./fee.js";

/** The subset of the RPC client this needs. Narrow so tests can supply a function. */
export interface TransactionSource {
  getRawTransaction(txid: Hex): Promise<RpcTransaction>;
}

export interface PrevOutCacheOptions {
  /**
   * How many parent transactions to hold. Each entry is one array of output
   * values, so the memory cost is a few hundred bytes per entry rather than a
   * whole transaction - the ciphertexts and proofs are dropped on insert.
   */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 4_096;

/**
 * A bounded, insertion-ordered cache of parent-transaction output values.
 *
 * Eviction is oldest-first rather than least-recently-used, which is the right
 * shape for this access pattern and not merely the simpler one: parents are
 * consulted in a burst while their children are analysed and then never again,
 * so recency of USE carries almost no information that recency of INSERT does
 * not. `Map` preserves insertion order, so the oldest key is the first one the
 * iterator yields.
 */
export class PrevOutCache {
  private readonly byTxid = new Map<string, readonly Zatoshi[]>();
  private readonly maxEntries: number;
  private hits = 0;
  private misses = 0;
  private notFound = 0;

  constructor(
    private readonly source: TransactionSource,
    options?: PrevOutCacheOptions,
  ) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * A `PrevOutResolver` bound to this cache.
   *
   * Returns `null` - never zero - when the parent cannot be fetched or the
   * index is out of range. `computeFeeZat` turns a single null into a refused
   * fee, which is the behaviour that keeps an unresolvable input from being
   * quietly counted as an input worth nothing.
   */
  readonly resolve: PrevOutResolver = async (txid: Hex, vout: number) => {
    const cached = this.byTxid.get(txid);
    if (cached !== undefined) {
      this.hits += 1;
      return cached[vout] ?? null;
    }

    this.misses += 1;
    let parent: RpcTransaction;
    try {
      parent = await this.source.getRawTransaction(txid);
    } catch {
      // Unknown parent: not an error worth propagating, because the caller's
      // whole question is "can this be resolved" and the answer is no.
      this.notFound += 1;
      return null;
    }

    const values: Zatoshi[] = [];
    for (const out of parent.vout) values[out.n] = BigInt(out.valueZat);
    this.put(txid, values);
    return values[vout] ?? null;
  };

  private put(txid: string, values: readonly Zatoshi[]): void {
    if (this.byTxid.size >= this.maxEntries) {
      const oldest = this.byTxid.keys().next();
      if (!oldest.done) this.byTxid.delete(oldest.value);
    }
    this.byTxid.set(txid, values);
  }

  /** Diagnostic counters. `notFound` is a subset of `misses`. */
  snapshot(): {
    readonly entries: number;
    readonly hits: number;
    readonly misses: number;
    readonly notFound: number;
  } {
    return {
      entries: this.byTxid.size,
      hits: this.hits,
      misses: this.misses,
      notFound: this.notFound,
    };
  }
}
