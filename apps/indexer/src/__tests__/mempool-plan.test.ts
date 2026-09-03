/**
 * The poll arithmetic, and the fold that decides whether a drain was complete.
 *
 * THIS FILE AND `docs/2.0/RUNTIME.md` SECTION 8 MUST AGREE, and the numbers are
 * written out here rather than computed, so a change to the formula fails a
 * test rather than silently making the document wrong. The document quotes
 * these cases by name.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_OVERHEAD_PER_TICK, drainOutcome, planMempoolPoll } from "../mempool-plan.js";

describe("planMempoolPoll", () => {
  it("leaves an unmetered poll exactly as it was", () => {
    // Every deployment of this project before HANDOFF-15 is this case, and
    // making one of them slower would be a regression rather than a feature.
    const plan = planMempoolPoll({ perMinute: null, requestedIntervalMs: 2_000 });
    expect(plan.pollIntervalMs).toBe(2_000);
    expect(plan.txBudget).toBeNull();
    expect(plan.txPerMinute).toBeNull();
    expect(plan.metered).toBe(false);
  });

  it("at the measured ceiling of 5/minute: one tick a minute, three transactions", () => {
    // THE WORKED CASE THE WHOLE HANDOFF IS SIZED AGAINST. R=5, overhead=2, so
    // 5 - 2 = 3 transactions a minute. The 2000 ms request is overridden
    // because it is 30 ticks a minute at two requests each - six times the
    // ceiling before a transaction is fetched.
    const plan = planMempoolPoll({ perMinute: 5, requestedIntervalMs: 2_000 });
    expect(plan.pollIntervalMs).toBe(60_000);
    expect(plan.txBudget).toBe(3);
    expect(plan.txPerMinute).toBe(3);
    expect(plan.overheadPerTick).toBe(DEFAULT_OVERHEAD_PER_TICK);
    expect(plan.metered).toBe(true);
  });

  it("honours a SLOWER request, and a slower tick analyses more", () => {
    // Asking for less traffic is a request no ceiling objects to, and the
    // overhead is per tick, so it amortises: a two-minute tick affords
    // 10 - 2 = 8 transactions, which is 4 a minute against the 3 above.
    const plan = planMempoolPoll({ perMinute: 5, requestedIntervalMs: 120_000 });
    expect(plan.pollIntervalMs).toBe(120_000);
    expect(plan.txBudget).toBe(8);
    expect(plan.txPerMinute).toBe(4);
  });

  it("a ceiling too small to afford its own overhead still produces a runnable plan", () => {
    // A budget of zero and a tick that still reads the tip and the txid list.
    // Legible degenerate state rather than a throw at startup: the two things
    // it can still fetch are worth having, and the staleness figure says the
    // rest.
    const plan = planMempoolPoll({ perMinute: 2, requestedIntervalMs: 2_000 });
    expect(plan.txBudget).toBe(0);
    expect(plan.txPerMinute).toBe(0);
    expect(plan.pollIntervalMs).toBe(60_000);

    // AND AT R=1 THE TICK STRETCHES PAST ONE PER WINDOW, which is the case the
    // aggregate property below found: one tick a minute costs two requests
    // against a ceiling of one, twice over, every minute. The third floor -
    // ceil(W * overhead / R) - is what closes it.
    const one = planMempoolPoll({ perMinute: 1, requestedIntervalMs: 2_000 });
    expect(one.txBudget).toBe(0);
    expect(one.pollIntervalMs).toBe(120_000);
  });

  it("never plans a FASTER tick than one per window when metered", () => {
    // The floor, checked across the range rather than at one point: a faster
    // metered tick spends budget re-reading a txid list instead of reading a
    // transaction, so there is no ceiling at which asking for 100 ms wins.
    for (const perMinute of [1, 2, 5, 10, 60, 600]) {
      const plan = planMempoolPoll({ perMinute, requestedIntervalMs: 100 });
      expect(plan.pollIntervalMs).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("the plan's own arithmetic never exceeds the ceiling, over the whole range", () => {
    // THE PROPERTY, WITH ITS WORKED CASE ABOVE (LEDGER-08 fold 3). Quantified
    // over the AGGREGATE the ceiling is about - requests per window - rather
    // than over any one field, because a per-field check would pass on a plan
    // whose overhead and budget are each small and together too big.
    for (const perMinute of [1, 2, 3, 5, 8, 13, 21, 60, 100, 601]) {
      for (const requested of [100, 2_000, 30_000, 60_000, 90_000, 600_000]) {
        const plan = planMempoolPoll({ perMinute, requestedIntervalMs: requested });
        const ticksPerWindow = 60_000 / plan.pollIntervalMs;
        const requestsPerWindow = ticksPerWindow * (plan.overheadPerTick + (plan.txBudget ?? 0));
        expect(requestsPerWindow).toBeLessThanOrEqual(perMinute);
      }
    }
  });
});

describe("drainOutcome", () => {
  it("is complete when every observed transaction has a report", () => {
    expect(drainOutcome({ observed: 9, analysed: 9, deferred: 0, refused: false }).complete).toBe(true);
    expect(drainOutcome({ observed: 0, analysed: 0, deferred: 0, refused: false }).complete).toBe(true);
  });

  it("is NOT complete when a 429 cut the tick short, even with the counts level", () => {
    // THE MEMBER OF THE EXCLUSION SET. A tick refused after analysing
    // everything it had left still saw a mempool it could not confirm, and
    // `analysed >= observed` alone would call that complete - which is how a
    // reader gets shown a thinner mempool with a fresh timestamp on it.
    expect(drainOutcome({ observed: 9, analysed: 9, deferred: 0, refused: true }).complete).toBe(false);
  });

  it("is decided by the COUNTS and not by the reason, so a tick that deferred nothing is complete", () => {
    expect(drainOutcome({ observed: 4, analysed: 4, deferred: 0, refused: false }).complete).toBe(true);
    expect(drainOutcome({ observed: 4, analysed: 1, deferred: 3, refused: false }).complete).toBe(false);
  });
});
