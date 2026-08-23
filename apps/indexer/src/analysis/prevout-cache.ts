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
 * AND WHY IT IS BOUNDED BY OUTPUTS RATHER THAN BY ENTRIES. The same clustering
 * decides the size of an entry: the parents a consolidating child spends are
 * mining-pool payouts and exchange sweeps, which carry thousands of outputs
 * each, and an entry is that whole vout array. An entry count therefore bounds
 * nothing that matters - it hands the steady-state memory of the indexer to the
 * chain's output-count distribution. Measured with `node --expose-gc`, 4,096
 * entries of 3,000 outputs retained 421 MB. See `PrevOutCacheOptions`.
 *
 * A MISS IS NOT CACHED, AND THE COST OF THAT IS UNBOUNDED. A transaction absent
 * now - a parent still propagating, a node mid-sync - may be present in a
 * second, and a negative entry would freeze `feeZat: null` onto every
 * transaction that spends it for the lifetime of the process. Refusing to
 * answer is cheap; refusing to answer forever is a silent outage in the fee
 * column. That reasoning is still the reason, but its price is stated here
 * rather than left to be discovered: there is no negative entry, no backoff and
 * no cap, so an unresolvable parent is refetched on EVERY resolve that names
 * it. Measured: 500 resolves of one unresolvable parent issue 500
 * `getrawtransaction` calls. A child consolidating N outputs of one missing
 * parent costs N calls per analysis, and costs them again every time that child
 * is re-analysed; `notFound` in `snapshot()` is what makes it visible. A
 * short-TTL negative entry would bound the cost without defeating the reasoning
 * - a parent arriving a second later would still be picked up - but it trades a
 * cost problem for a freshness one, and there is no unit suite over this class
 * to hold that trade in place. It is left undone deliberately, not overlooked.
 */

import type { Hex, RpcTransaction, Zatoshi } from "@zcashreveal/types";
import type { PrevOutResolver } from "./fee.js";

/** The subset of the RPC client this needs. Narrow so tests can supply a function. */
export interface TransactionSource {
  getRawTransaction(txid: Hex): Promise<RpcTransaction>;
}

export interface PrevOutCacheOptions {
  /**
   * How many parent transactions to hold.
   *
   * This bounds only the FIXED cost of an entry - the `Map` node and the
   * 64-character txid key - measured at roughly 480 bytes, so 4,096 entries
   * cost about 2 MB whatever they hold. It does not bound the payload, which is
   * what `maxOutputs` is for.
   */
  readonly maxEntries?: number;
  /**
   * How many output values to hold across all entries. This is the bound that
   * decides the process's memory.
   *
   * An entry is the parent's whole vout array, and a `bigint` is a heap object
   * rather than an immediate, so an output costs roughly 36 bytes - measured,
   * not estimated. This file previously claimed "a few hundred bytes per entry"
   * and bounded entries alone, which was wrong by about three hundred times on
   * the parents that matter: 4,096 entries of 3,000 outputs retained 421 MB.
   * The ciphertexts and proofs really are dropped on insert; the output values
   * are not, and they were the cost all along.
   */
  readonly maxOutputs?: number;
}

const DEFAULT_MAX_ENTRIES = 4_096;

/**
 * 262,144 outputs at roughly 36 bytes is about 9 MB, and 4,096 entries at
 * roughly 480 bytes about 2 MB, so the cache costs at most ~11 MB however wide
 * the parents it meets are.
 *
 * Chosen so the ordinary case is unchanged and only the pathological one moves.
 * A two- or three-output parent is the common shape, and 4,096 of those is
 * ~12,000 outputs - the entry bound still binds first, exactly as before. The
 * output bound engages only on wide parents, where it holds roughly 87
 * three-thousand-output ones. That is far more than the handful a single
 * consolidating child re-reads, which is the locality this cache exists to
 * serve, so the hit rate that justifies the cache survives the bound.
 */
const DEFAULT_MAX_OUTPUTS = 262_144;

/**
 * A bounded, insertion-ordered cache of parent-transaction output values.
 *
 * Eviction is oldest-first rather than least-recently-used, which is the right
 * shape for this access pattern and not merely the simpler one: parents are
 * consulted in a burst while their children are analysed and then never again,
 * so recency of USE carries almost no information that recency of INSERT does
 * not. `Map` preserves insertion order, so the oldest key is the first one the
 * iterator yields. Both bounds evict through that same order.
 */
export class PrevOutCache {
  private readonly byTxid = new Map<string, readonly Zatoshi[]>();
  private readonly maxEntries: number;
  private readonly maxOutputs: number;
  private retainedOutputs = 0;
  private hits = 0;
  private misses = 0;
  private notFound = 0;

  constructor(
    private readonly source: TransactionSource,
    options?: PrevOutCacheOptions,
  ) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxOutputs = options?.maxOutputs ?? DEFAULT_MAX_OUTPUTS;
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
    // Unreachable from `resolve`, which only calls this on a miss, but a
    // size-counting bound that can be told the same key twice is a bound that
    // drifts. Deleting first keeps `retainedOutputs` equal to what is held and
    // keeps the eviction test below independent of whether the key is new.
    const existing = this.byTxid.get(txid);
    if (existing !== undefined) {
      this.byTxid.delete(txid);
      this.retainedOutputs -= existing.length;
    }

    // `values.length` and not `parent.vout.length`: `out.n` is what indexes the
    // array, so its length is what was allocated, and the allocation is what
    // costs. The two agree for any well-formed response.
    while (
      this.byTxid.size > 0 &&
      (this.byTxid.size >= this.maxEntries ||
        this.retainedOutputs + values.length > this.maxOutputs)
    ) {
      const oldest = this.byTxid.keys().next();
      if (oldest.done) break;
      const evicted = this.byTxid.get(oldest.value);
      this.byTxid.delete(oldest.value);
      this.retainedOutputs -= evicted?.length ?? 0;
    }

    // An entry wider than the whole output budget is held ALONE rather than
    // refused. Refusing it would drop exactly the parent the cache exists for -
    // the wide one a consolidating child reads over and over - and would turn
    // one fetch into one per input. It is over budget only until the next
    // insert, which evicts it first.
    this.byTxid.set(txid, values);
    this.retainedOutputs += values.length;
  }

  /**
   * Diagnostic counters. `notFound` is a subset of `misses`, and
   * `retainedOutputs` is the number the memory bound is actually about -
   * `entries` on its own says nothing about how much is held.
   */
  snapshot(): {
    readonly entries: number;
    readonly retainedOutputs: number;
    readonly hits: number;
    readonly misses: number;
    readonly notFound: number;
  } {
    return {
      entries: this.byTxid.size,
      retainedOutputs: this.retainedOutputs,
      hits: this.hits,
      misses: this.misses,
      notFound: this.notFound,
    };
  }
}
