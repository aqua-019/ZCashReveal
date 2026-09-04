/**
 * One iteration of the mempool poll loop, as a thing an assertion can call.
 *
 * WHY IT IS OUT OF `main()`, AND IT IS HANDOFF-14'S ARGUMENT REUSED RATHER THAN
 * A NEW ONE. `main` reads the environment, opens sockets and exits the process,
 * so nothing can call it; behaviour living inside it is behaviour no assertion
 * can reach. A1 says "at a configured ceiling of 5/min the loop runs, never
 * exceeds it, and publishes real reports", and the only honest way to check
 * that is to RUN the loop against an endpoint that counts. `chainAccessFor` is
 * the same shape for the same reason, one file over.
 *
 * WHAT STAYS IN `main`: the interval, the sockets, the shutdown. This file is
 * the tick's decisions - budget, refusal, reconciliation, staleness - and it
 * holds the two pieces of state that outlive one tick.
 *
 * THE ORDER INSIDE A TICK IS THE CONTRACT AND IT IS NOT ARBITRARY:
 *   1. tip, then txid list. Both are overhead the plan has already paid for.
 *   2. fetch the unseen, up to the budget, STOPPING at the first refusal.
 *   3. reconcile against the FULL txid list, never against what was fetched.
 *   4. fold the counts, move `completeAtMs` only on a complete drain, publish.
 * Step 3 before step 4 because `reconcile` changes `state.size()`, which is the
 * `analysed` count step 4 reads. Step 3 against the full list because
 * `reconcile` evicts everything absent from the set it is handed.
 */
import type { Logger } from "pino";
import type { Hex, MempoolDrainState } from "@zcashreveal/types";
import { RpcRateLimitError } from "@zcashreveal/zebra-rpc";

import { drainOutcome, type MempoolPlan } from "./mempool-plan.js";

/** What analysing one transaction ended in. Nothing here throws. */
export type AnalyzeOutcome = "analysed" | "failed" | "rate-limited";

/** The narrowest view of the RPC client this tick needs. */
export interface TickRpc {
  getBlockchainInfo(): Promise<{ blocks: number }>;
  getRawMempool(): Promise<Hex[]>;
}

/** The narrowest view of `MempoolState` this tick needs. */
export interface TickState {
  has(txid: string): boolean;
  size(): number;
  reconcile(txids: string[], reason: "confirmed" | "evicted" | "replaced"): void;
}

export interface MempoolTickDeps {
  readonly rpc: TickRpc;
  readonly state: TickState;
  /** Fetch and analyse one transaction. Must not throw; returns its outcome. */
  readonly analyzeOne: (txid: Hex) => Promise<AnalyzeOutcome>;
  readonly plan: MempoolPlan;
  /** Write the drain state where the gateway can read it. */
  readonly publish: (state: MempoolDrainState) => Promise<void>;
  /** Called with each tick's tip height, so `main` can keep its own. */
  readonly onTip: (height: number) => void;
  readonly log: Logger;
  /** The ceiling, carried into the published state for the reader. */
  readonly ceilingPerMinute: number | null;
  readonly now?: () => number;
}

export class MempoolTicker {
  readonly #deps: MempoolTickDeps;
  readonly #now: () => number;
  /**
   * The last COMPLETE drain, or null because there has not been one.
   *
   * NULL IS NOT "ZERO SECONDS AGO". A cold start under a ceiling reaches its
   * first tick long before its first complete view, and rendering that as
   * "complete just now" is the `snapshot age: 0 blocks` defect HANDOFF-14 took
   * off the system bar, arriving on a second surface.
   */
  #lastCompleteAtMs: number | null = null;
  /**
   * The node's count at the last tick that got one, or null before the first.
   *
   * HELD SO A REFUSED TICK CAN STILL PUBLISH A DENOMINATOR. Publishing
   * "0 of 0 analysed" for a tick that never reached `getrawmempool` is a worse
   * lie than a stale denominator: it reads as an empty mempool.
   */
  #lastObserved: number | null = null;
  /** True while a tick is in flight, so a slow tick cannot overlap the next. */
  #ticking = false;

  constructor(deps: MempoolTickDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
  }

  /** Exposed so an assertion can read the staleness without a Redis. */
  get lastCompleteAtMs(): number | null {
    return this.#lastCompleteAtMs;
  }

  /**
   * Run one tick. Never throws.
   *
   * Returns `"skipped"` when a previous tick is still running, so a caller can
   * tell "did nothing because it was busy" from "did nothing because the
   * mempool was empty" - two states that look identical from the counts.
   */
  async tick(): Promise<"ran" | "skipped"> {
    const { rpc, state, analyzeOne, plan, publish, onTip, log, ceilingPerMinute } = this.#deps;

    // NON-REENTRANT, AND THIS IS NEW IN HANDOFF-15. `setInterval` does not await
    // an async callback, so a tick that outran the interval simply overlapped
    // the next one - which under a ceiling is the worst possible behaviour: two
    // ticks in flight both spend the budget, both get refused, and the refusals
    // extend the window that made them slow. Section 6's standing question,
    // "does the retry re-enter a mutated state", answered at the loop rather
    // than at the retry.
    if (this.#ticking) {
      log.debug("previous tick still running; skipping this interval rather than overlapping it");
      return "skipped";
    }
    this.#ticking = true;
    let refused = false;
    let analysedThisTick = 0;
    let failedThisTick = 0;
    try {
      // SEQUENTIAL, NOT `Promise.all`. Two concurrent requests against a
      // five-per-minute gate both wait on the same tail, so the parallelism
      // buys nothing and costs the ability to stop after the first refusal.
      // Unmetered, the gate resolves immediately and the two are equivalent, so
      // there is one code path rather than two.
      const info = await rpc.getBlockchainInfo();
      onTip(info.blocks);
      const txids = await rpc.getRawMempool();

      const unseen = txids.filter((txid) => !state.has(txid));
      const budget = plan.txBudget;
      const toFetch = budget === null ? unseen : unseen.slice(0, budget);

      for (const txid of toFetch) {
        // A 429 STOPS THE DRAIN RATHER THAN BEING SWALLOWED PER TRANSACTION.
        // `analyzeOne` catches its own failures so one bad transaction does not
        // stop the tick, and that is right for a decode error and wrong for a
        // refusal: continuing spends the rest of the budget on requests that
        // will all be refused, and each refusal pushes the gate's penalty
        // further out.
        const outcome = await analyzeOne(txid);
        if (outcome === "rate-limited") {
          refused = true;
          break;
        }
        if (outcome === "analysed") analysedThisTick += 1;
        else failedThisTick += 1;
      }

      // COUNTED AFTER THE LOOP, BECAUSE THE LOOP CAN STOP EARLY, AND SPLIT SO
      // THAT THE FIGURES ACCOUNT FOR EVERY ROW. `deferred + failed` must equal
      // `observed - analysed`, and derived from the budget slice before the
      // loop it did not: a 429 on the first of a hundred published
      // `deferred: 97` with three transactions in no bucket at all, and an
      // unmetered tick published `deferred: 0` for a drain that analysed two of
      // eight, because `txBudget` is null so the slice is the whole list. That
      // is the harm `mempool-summary.ts` names for the header counts, one field
      // over. Found by a gate reviewer.
      const deferred = unseen.length - analysedThisTick - failedThisTick;

      // RECONCILED AGAINST THE FULL TXID LIST, NEVER AGAINST WHAT WAS FETCHED.
      // `reconcile` deletes every tracked report absent from the set it is
      // given and emits a `removed` diff for each, so handing it a partial
      // drain would evict the whole mempool from the live hash and publish a
      // removal for every transaction. The authoritative set is what the node
      // said, whether or not this tick got to all of it.
      state.reconcile(txids, "evicted");

      const outcome = drainOutcome({
        observed: txids.length,
        analysed: state.size(),
        deferred,
        failed: failedThisTick,
        refused,
      });
      const now = this.#now();
      this.#lastObserved = txids.length;
      if (outcome.complete) this.#lastCompleteAtMs = now;
      await publish({
        observed: outcome.observed,
        analysed: outcome.analysed,
        complete: outcome.complete,
        deferred: outcome.deferred,
        failed: outcome.failed,
        refused: outcome.refused,
        completeAtMs: this.#lastCompleteAtMs,
        updatedAtMs: now,
        ceilingPerMinute,
        txPerMinute: plan.txPerMinute,
      });
      if (!outcome.complete) {
        // AT `info` AND ON EVERY INCOMPLETE TICK. Section 3: the back-off must
        // be visible in the log and in the staleness the reader sees. A partial
        // drain that logs nothing is the silently thinner mempool that clause
        // forbids.
        log.info(
          {
            observed: outcome.observed,
            analysed: outcome.analysed,
            deferred: outcome.deferred,
            failed: outcome.failed,
            refused: outcome.refused,
            analysedThisTick,
          },
          refused
            ? "drain cut short by a 429: the view is thinner than the mempool and says so"
            : "drain incomplete: the per-tick budget ran out before every transaction was analysed",
        );
      }
      return "ran";
    } catch (err) {
      if (err instanceof RpcRateLimitError) {
        // A REFUSAL ON THE TICK'S OWN OVERHEAD - the tip or the txid list -
        // rather than on a transaction. Reported at `warn` rather than `error`
        // because nothing is broken: the endpoint is healthy and this process
        // asked too often. The gate has already been penalised inside the
        // client, so the next tick waits rather than asking straight back in.
        log.warn(
          { retryAfterMs: err.retryAfterMs, method: err.method },
          "rate limited before the drain began; the mempool view is now aging",
        );
        // AND THE AGING IS PUBLISHED, NOT ONLY LOGGED. `publish` sits inside
        // the `try` above the throw point, so falling out of here without a
        // write left the LAST SUCCESSFUL tick's record standing - and the
        // gateway re-ages that record on every request. A quiet mempool
        // followed by an endpoint refusing every `getblockchaininfo` had
        // /track rendering `data-complete="true"` and "4 of 4 analysed - every
        // transaction the node reported has been analysed, 47 min ago" while
        // the real mempool was four hundred and nothing could reach it. The log
        // line one statement up already asserted the view was aging; nothing
        // made it true. Found by a gate reviewer.
        await this.#publishRefusal();
      } else {
        log.error({ err }, "poll loop iteration failed");
      }
      return "ran";
    } finally {
      this.#ticking = false;
    }
  }

  /**
   * The drain state for a tick that could not even ask. Never throws.
   *
   * `complete: false` AND `refused: true` ARE THE WHOLE POINT: a reader must
   * not be shown a positive claim of completeness for a view no process has
   * been able to refresh. `completeAtMs` does NOT move, so the "last complete"
   * age keeps growing; `updatedAtMs` does, so "last tick" stays truthful about
   * the attempt rather than about its success.
   */
  async #publishRefusal(): Promise<void> {
    const { publish, state, plan, ceilingPerMinute, log } = this.#deps;
    const analysed = state.size();
    // THE DENOMINATOR IS THE LAST ONE A NODE GAVE US, floored at what we hold.
    // A refused tick never reached `getrawmempool`, so it has no fresh count;
    // publishing 0 would read as an empty mempool, and anything below
    // `analysed` would make `deferred` negative.
    const observed = Math.max(this.#lastObserved ?? analysed, analysed);
    try {
      await publish({
        observed,
        analysed,
        complete: false,
        deferred: Math.max(0, observed - analysed),
        failed: 0,
        refused: true,
        completeAtMs: this.#lastCompleteAtMs,
        updatedAtMs: this.#now(),
        ceilingPerMinute,
        txPerMinute: plan.txPerMinute,
      });
    } catch (err) {
      log.warn({ err }, "could not publish the refusal; the view's completeness figure will stand stale");
    }
  }
}
