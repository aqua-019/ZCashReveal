/**
 * How often to poll the mempool, and how many transactions to fetch per tick,
 * given a request ceiling the endpoint imposes.
 *
 * PURE, AND SEPARATE FROM THE GATE ON PURPOSE. `RateGate` in
 * `packages/zebra-rpc` enforces the invariant - it will not let a sixth request
 * out in a five-request minute, whatever anyone plans. This module decides what
 * to ATTEMPT, so that the loop spends its budget on transactions instead of
 * discovering the ceiling by being refused. Two different jobs: one is a
 * mechanism that cannot be argued with, the other is arithmetic that can be
 * read, checked and got wrong. Collapsing them would make the arithmetic
 * untestable without a socket.
 *
 * THE ARITHMETIC, stated here because RUNTIME.md section 8 quotes it and the
 * two must agree.
 *
 * A tick costs `overheadPerTick` requests before it fetches anything - one
 * `getblockchaininfo` for the tip and one `getrawmempool` for the txid list,
 * so two - plus one `getrawtransaction` per transaction it has not seen.
 * Over a tick of duration D against a ceiling of R requests per window W:
 *
 *     requests available to the tick = floor(R * D / W)
 *     transaction budget             = that, minus overheadPerTick, floored at 0
 *
 * SLOWER TICKS ANALYSE MORE, WHICH IS NOT OBVIOUS AND IS WHY THE FORMULA IS
 * WRITTEN OUT. The overhead is per TICK, so it is amortised over the tick's
 * duration: at R=5 a one-minute tick affords 5 - 2 = 3 transactions a minute,
 * and a two-minute tick affords 10 - 2 = 8, which is 4 a minute. The cost is
 * that the txid list is up to twice as stale, and that trade is the operator's
 * - which is why `requestedIntervalMs` is honoured when it is SLOWER than the
 * ceiling requires and overridden when it is faster.
 *
 * AT R=5 THE DEFAULT POLL IS SIX TIMES THE CEILING BEFORE A SINGLE TRANSACTION
 * IS FETCHED. `INDEXER_POLL_INTERVAL_MS` defaults to 2000, which is 30 ticks a
 * minute at two requests each. That is the measurement HANDOFF-15 section 1 is
 * sized against and it is why this module exists.
 */

/** What one tick of the mempool loop is allowed to do. */
export interface MempoolPlan {
  /** How often to run a tick, in ms. */
  readonly pollIntervalMs: number;
  /**
   * How many unseen transactions one tick may fetch, or null for no budget.
   *
   * NULL MEANS UNMETERED AND IT IS THE DEFAULT, not a degenerate case: a Zebra
   * you run over loopback has no ceiling worth modelling, and the mempool path
   * has fetched every unseen txid every tick since HANDOFF-06. A number means
   * an endpoint told us to slow down, or an operator did.
   */
  readonly txBudget: number | null;
  /** Requests a tick spends before fetching any transaction. */
  readonly overheadPerTick: number;
  /**
   * Transactions per minute this plan can analyse, or null when unmetered.
   *
   * PUBLISHED RATHER THAN LEFT TO THE READER because it is the number an
   * operator actually needs and the one the log line prints. At R=5 it is 3,
   * and 3 a minute against a mempool of hundreds is a fact the site has to
   * state rather than hide.
   */
  readonly txPerMinute: number | null;
  /** Whether a ceiling shaped this plan, so a caller can say which mode it is in. */
  readonly metered: boolean;
}

export interface PlanInput {
  /** The endpoint's ceiling in requests per window, or null when unmetered. */
  readonly perMinute: number | null;
  /** What the operator asked for, `INDEXER_POLL_INTERVAL_MS`. */
  readonly requestedIntervalMs: number;
  /** The ceiling's window, in ms. 60_000 outside a test. */
  readonly windowMs?: number;
  /** Requests a tick spends before fetching a transaction. Two. */
  readonly overheadPerTick?: number;
}

export const DEFAULT_OVERHEAD_PER_TICK = 2;

/**
 * Plan a tick.
 *
 * WHY ONE TICK PER WINDOW IS THE FASTEST A METERED PLAN RUNS, AND WHY THAT IS A
 * FLOOR RATHER THAN AN OPTIMUM. Transactions analysed per window is
 * `R - T * overhead` for T ticks per window, which DECREASES in T: every extra
 * tick spends `overhead` requests re-reading a txid list instead of reading a
 * transaction. So faster is strictly worse for throughput and there is no
 * interior maximum - the arithmetic keeps improving as the tick slows, from 3 a
 * minute at T=1 through 4 a minute at T=1/2 towards R as T approaches zero.
 *
 * The bound in the other direction is not throughput, it is the txid list going
 * stale: a tick that runs once an hour analyses nearly R transactions a minute
 * of an hour-old mempool. T=1 is where this module stops on its own, and an
 * operator who wants the other end of that trade asks for it by setting
 * `INDEXER_POLL_INTERVAL_MS` slower - which is honoured, because asking for
 * less traffic is a request no ceiling objects to. What no setting buys is a
 * FASTER metered tick, because that spends budget to learn less.
 *
 * A CEILING TOO SMALL TO AFFORD ITS OWN OVERHEAD STILL PRODUCES A PLAN, with a
 * budget of zero and a tick STRETCHED past one per window so the overhead
 * itself fits - `ceil(W * overhead / R)`, which at R=1 is one tick every two
 * minutes. That is
 * a legible degenerate state - "the loop runs and analyses nothing, because two
 * requests a tick is all your ceiling buys" - and it is better than throwing at
 * startup, because the tip and the txid list are still worth having and the
 * staleness figure will say the rest.
 */
export function planMempoolPoll(input: PlanInput): MempoolPlan {
  const windowMs = input.windowMs ?? 60_000;
  const overheadPerTick = input.overheadPerTick ?? DEFAULT_OVERHEAD_PER_TICK;

  if (input.perMinute === null) {
    return {
      pollIntervalMs: input.requestedIntervalMs,
      txBudget: null,
      overheadPerTick,
      txPerMinute: null,
      metered: false,
    };
  }

  const perMinute = Math.floor(input.perMinute);
  // THREE FLOORS, AND THE THIRD WAS MISSING UNTIL A PROPERTY FOUND IT.
  //   - what the operator asked for, honoured when it is SLOWER, because asking
  //     for less traffic is a request no ceiling objects to;
  //   - one tick per window, for the reason in the docblock above;
  //   - and enough time for the tick's OWN OVERHEAD to fit inside the ceiling,
  //     which is the one that was absent.
  //
  // At R=1 with overhead 2, the first two floors give a 60-second tick costing
  // two requests a minute against a ceiling of one - twice over, every minute,
  // forever. The docblock five lines up already claimed this case produced "a
  // tick slow enough that the overhead itself fits", and it did not; the
  // sentence was a checkable claim about runtime behaviour and it was false.
  // Found by the aggregate property in `mempool-plan.test.ts`, which quantifies
  // over requests-per-window rather than over any one field - a per-field check
  // passes here, because the overhead and the budget are each small and only
  // their sum is too big.
  const overheadFloorMs = Math.ceil((windowMs * overheadPerTick) / perMinute);
  const pollIntervalMs = Math.max(input.requestedIntervalMs, windowMs, overheadFloorMs);
  const availableThisTick = Math.floor((perMinute * pollIntervalMs) / windowMs);
  const txBudget = Math.max(0, availableThisTick - overheadPerTick);
  // Rounded DOWN to a whole transaction per minute, because a figure the loop
  // cannot achieve every minute is not a rate it has.
  const txPerMinute = Math.floor((txBudget * windowMs) / pollIntervalMs);

  return { pollIntervalMs, txBudget, overheadPerTick, txPerMinute, metered: true };
}

/**
 * What one tick achieved, for the staleness figure the reader is owed.
 *
 * `observed` IS THE NODE'S COUNT AND `analysed` IS OURS, AND THE WHOLE POINT IS
 * THAT THEY CAN DIFFER. Section 3's contract: "a reader must never be shown
 * five transactions and left to assume that is the mempool". When they are
 * equal the drain was complete and `completeAt` moves; when they are not, the
 * previous `completeAt` stands and the age computed from it grows.
 */
export interface DrainOutcome {
  /** Transactions the node says are in the mempool. */
  readonly observed: number;
  /** Transactions this process holds an analysed report for. */
  readonly analysed: number;
  /** True when every observed transaction has a report. */
  readonly complete: boolean;
  /**
   * How many the tick did not attempt - budget, or a refusal that pre-empted them.
   *
   * COUNTED AFTER THE LOOP, NOT FROM THE BUDGET SLICE, AND THE THREE FIGURES
   * MUST ACCOUNT FOR EVERY ROW: `deferred + failed === observed - analysed`, in
   * every case. Derived from the slice alone it said 97 for a tick of 100 that
   * a 429 stopped at the first transaction - the one refused and the two
   * pre-empted fell into no bucket at all - and, unmetered, it said 0 for a
   * tick that analysed two of eight, because `txBudget` is null and the slice
   * is the whole list. That is the harm `mempool-summary.ts` names for the
   * header counts, one field over: figures printed beside each other that
   * account for less than the total, silently. Found by a gate reviewer.
   */
  readonly deferred: number;
  /**
   * How many the tick attempted and could not read.
   *
   * ITS OWN COUNT RATHER THAN FOLDED INTO `deferred`, because the two have
   * opposite futures: a deferred transaction is waiting for budget and a failed
   * one has been read and refused by the decoder. Without it, a permanently
   * undecodable transaction keeps `complete` false forever while the only
   * available words are "the indexer has not finished this drain" - a claim of
   * pending-ness about work that will never finish.
   */
  readonly failed: number;
  /** True when a 429 cut the tick short. */
  readonly refused: boolean;
}

/**
 * Fold a tick's counts into an outcome.
 *
 * ONE FUNCTION RATHER THAN FOUR COMPARISONS AT THE CALL SITE, for the reason
 * `snapshotAge` in `apps/web` is one function: the predicate and the arithmetic
 * have to agree, and a caller that recomputes `complete` from `observed` and
 * `analysed` separately is a second producer of the same field. This project
 * has recorded that shape four times.
 */
export function drainOutcome(args: {
  readonly observed: number;
  readonly analysed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly refused: boolean;
}): DrainOutcome {
  return {
    observed: args.observed,
    analysed: args.analysed,
    failed: args.failed,
    // COMPLETE IS `analysed >= observed` AND NOT `deferred === 0`. A tick that
    // deferred nothing because it had nothing left to fetch is complete; a tick
    // that deferred nothing because a 429 arrived before it counted is not. The
    // counts decide, never the reason.
    complete: args.analysed >= args.observed && !args.refused,
    deferred: args.deferred,
    refused: args.refused,
  };
}
