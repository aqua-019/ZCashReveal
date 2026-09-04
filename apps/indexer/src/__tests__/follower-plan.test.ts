/**
 * `planConfirmedFollow` - the follower's share of a metered endpoint
 * (HANDOFF-16, deliverable 2).
 *
 * THE PROPERTY THAT MATTERS IS AN AGGREGATE ONE AND IT IS ASSERTED AS ONE.
 * The defect this module fixes was invisible per-field: the mempool plan was
 * correct about the mempool tick, `INDEXER_POLL_INTERVAL_MS` was correct about
 * what the operator asked for, and their SUM was six times the ceiling. So the
 * assertion below sums the two loops' requests per minute and compares that to
 * the ceiling, which is the quantity the endpoint actually counts. A per-field
 * check passes on the pre-fix code - that is what makes it worth writing this
 * way, and it is the same lesson `mempool-plan.test.ts` records about its own
 * overhead floor.
 */
import { describe, expect, it } from "vitest";

import { BLOCK_TARGET_MS } from "../analysis/constants.js";
import { REQUESTS_PER_BLOCK, REQUESTS_PER_CATCHUP_STEP, planConfirmedFollow } from "../follower-plan.js";
import { planMempoolPoll } from "../mempool-plan.js";

/** Requests a minute the follower's tip poll alone costs at an interval. */
const tipPollsPerMinute = (intervalMs: number) => 60_000 / intervalMs;

describe("planConfirmedFollow", () => {
  it("unmetered: the operator's interval is honoured exactly and nothing is reserved", () => {
    const p = planConfirmedFollow({ perMinute: null, requestedIntervalMs: 2000 });
    expect(p).toEqual({
      pollIntervalMs: 2000,
      reservedPerMinute: null,
      catchUpIntervalMs: null,
      remainingPerMinute: null,
      feasible: true,
      metered: false,
    });
  });

  it("metered: the interval floors at the block target, because a faster tip poll learns nothing", () => {
    const p = planConfirmedFollow({ perMinute: 5, requestedIntervalMs: 2000 });
    expect(p.pollIntervalMs).toBe(BLOCK_TARGET_MS);
    expect(p.metered).toBe(true);
    expect(p.feasible).toBe(true);
    // DERIVED, AND THE ARITHMETIC IS RESTATED HERE SO THE READER CAN CHECK IT BY
    // EYE: 0.8 tip reads a minute at a 75-second interval, plus 2 requests per
    // block at 0.8 blocks a minute, is 2.4 - which rounds up to 3, not to the 2
    // a hand-picked constant said.
    expect(p.reservedPerMinute).toBe(3);
    expect(60_000 / BLOCK_TARGET_MS + REQUESTS_PER_BLOCK * (60_000 / BLOCK_TARGET_MS)).toBeCloseTo(2.4);
    expect(p.remainingPerMinute).toBe(2);
  });

  it("an operator asking for SLOWER is honoured, because less traffic is a request no ceiling objects to", () => {
    const p = planConfirmedFollow({ perMinute: 5, requestedIntervalMs: 300_000 });
    expect(p.pollIntervalMs).toBe(300_000);
  });

  it("a ceiling too small says so with `feasible`, and never leaves a REMAINDER of zero", () => {
    // THE TITLE SAID "never leaves zero FOR THE MEMPOOL" AND CHECKED SOMETHING
    // ELSE. What it pins is `remainingPerMinute`, which is the input to
    // `planMempoolPoll`; what the mempool actually gets to spend on transactions
    // is `txBudget`, and that is ZERO at every ceiling from 1 to 5 because two
    // of the remainder go on the tick's own overhead. The floor exists to stop
    // an Infinity interval, not to buy throughput, and the corrected title says
    // so. The throughput fact itself is measured in section 10.7 of
    // CUTOVER-1.0.md and is the reason a five-a-minute endpoint cannot run both
    // rungs. Found by a gate reviewer.
    // `remainingPerMinute` of 0 would make `planMempoolPoll`'s overhead floor
    // Infinity, and `setInterval(fn, Infinity)` runs every ONE MILLISECOND on
    // Node - measured, not supposed. The floor of one is what stops that.
    const p = planConfirmedFollow({ perMinute: 1, requestedIntervalMs: 2000 });
    expect(p.feasible).toBe(false);
    expect(p.reservedPerMinute).toBe(3);
    expect(p.remainingPerMinute).toBe(1);
    expect(p.pollIntervalMs).toBe(BLOCK_TARGET_MS);
    expect(Number.isFinite(planMempoolPoll({ perMinute: p.remainingPerMinute, requestedIntervalMs: 2000 }).pollIntervalMs)).toBe(true);
  });

  it("planMempoolPoll never returns a non-finite interval, for any ceiling including zero and a negative", () => {
    // THE SECOND GUARD, AT THE OTHER END. `planConfirmedFollow` stops a zero
    // arriving; this stops it mattering if a future caller finds another route.
    for (const perMinute of [-5, 0, 1, 2, 5, 60]) {
      const q = planMempoolPoll({ perMinute, requestedIntervalMs: 2000 });
      expect(Number.isFinite(q.pollIntervalMs), `ceiling ${String(perMinute)}`).toBe(true);
      expect(q.pollIntervalMs, `ceiling ${String(perMinute)}`).toBeGreaterThan(0);
    }
  });
});

describe("the CATCH-UP rate, which the reservation does not bound on its own", () => {
  /**
   * THE RESERVATION IS A STEADY-STATE FIGURE AND `loop()` DOES NOT HONOUR IT
   * WHILE BEHIND THE TIP. A gate reviewer measured twenty blocks applied with
   * ZERO sleeps and forty-one wire calls: `loop()` sleeps only on `idle`, so
   * catch-up spends as fast as the gate allows. The gate holds the ceiling, so
   * nothing exceeds it on the wire; what it costs is every other caller on the
   * same client, for the whole catch-up - and in memory mode catch-up is the
   * state after every restart.
   */
  it("a metered plan paces catch-up at exactly its reservation", () => {
    const p = planConfirmedFollow({ perMinute: 5, requestedIntervalMs: 2000 });
    expect(p.catchUpIntervalMs).not.toBeNull();
    // Two requests a block at this interval is the reservation, per minute.
    // THREE PER STEP, NOT TWO: `step()` polls the tip every time, and while
    // behind the tip every step also fetches a block, so the tip poll is not
    // amortised over an interval. Paced on two, a reviewer measured the follower
    // running at 4.5 requests a minute against a reservation of 3.
    const stepsPerMinute = 60_000 / (p.catchUpIntervalMs as number);
    expect(stepsPerMinute * REQUESTS_PER_CATCHUP_STEP).toBeLessThanOrEqual(p.reservedPerMinute as number);
    expect(REQUESTS_PER_CATCHUP_STEP).toBe(REQUESTS_PER_BLOCK + 1);
  });

  it("and it still GAINS on the chain, or catch-up would never end", () => {
    // The pace has to be faster than the chain produces blocks. At a reservation
    // of three that is one block every forty seconds against one every
    // seventy-five, which closes the gap at about 0.7 blocks a minute.
    const p = planConfirmedFollow({ perMinute: 5, requestedIntervalMs: 2000 });
    // Narrowly, at a ceiling of five: one step a minute against a chain
    // producing a block every seventy-five seconds. That is the honest
    // consequence of a small ceiling, and it is asserted rather than assumed.
    expect(p.catchUpIntervalMs as number).toBeLessThan(BLOCK_TARGET_MS);
  });

  it("FAIL SIDE, BY DATA: an UNMETERED plan paces nothing, because there is no budget to protect", () => {
    expect(planConfirmedFollow({ perMinute: null, requestedIntervalMs: 2000 }).catchUpIntervalMs).toBeNull();
  });

  it("the paced catch-up stays inside the reservation across DISTINCT plans, not 197 copies of one", () => {
    // A SWEEP OVER 197 CEILINGS PRODUCED ONE PLAN, AND THE CENSUS READ AS
    // COVERAGE IT DID NOT HAVE. `reservedPerMinute` does not depend on the
    // ceiling at all - it is derived from the poll interval and the block target
    // - so every R from 4 to 200 gave the identical `{reserved: 3, catchUp:
    // 40000}`. A gate reviewer counted the distinct plans and found ONE. The
    // sweep now varies the quantity the plan actually depends on, and asserts
    // how many distinct plans it saw rather than how many inputs it fed.
    const plans = new Map<string, ReturnType<typeof planConfirmedFollow>>();
    for (const blockTargetMs of [15_000, 30_000, 75_000, 150_000, 600_000]) {
      for (const R of [4, 5, 8, 13, 60, 200]) {
        const p = planConfirmedFollow({ perMinute: R, requestedIntervalMs: 2000, blockTargetMs });
        if (!p.feasible) continue;
        plans.set(JSON.stringify([p.reservedPerMinute, p.catchUpIntervalMs, p.pollIntervalMs]), p);
        const cost = (60_000 / (p.catchUpIntervalMs as number)) * REQUESTS_PER_CATCHUP_STEP;
        expect(cost, `R=${String(R)} target=${String(blockTargetMs)}`).toBeLessThanOrEqual(p.reservedPerMinute as number);
      }
    }
    // THE CENSUS IS OF DISTINCT PLANS. A number here that fell to one would mean
    // the sweep had gone degenerate again, which is exactly what happened.
    expect(plans.size).toBeGreaterThanOrEqual(4);
  });
});

describe("THE AGGREGATE PROPERTY: both loops together stay inside the ceiling", () => {
  /**
   * What the two loops cost together, per minute, at a given ceiling. The
   * follower spends one tip read per interval plus, in the steady state, one
   * `getblock` per block and at most one `z_gettreestate` per block - so its
   * worst steady-state cost is its tip rate plus two per block time. The
   * mempool tick spends `overheadPerTick` plus its transaction budget, once per
   * its own interval.
   */
  function requestsPerMinute(perMinute: number | null, requestedIntervalMs: number) {
    const follow = planConfirmedFollow({ perMinute, requestedIntervalMs });
    const plan = planMempoolPoll({ perMinute: follow.remainingPerMinute, requestedIntervalMs });
    // READ FROM THE MODULE, NOT HARDCODED. This line said `2 * (...)` and the
    // module exports `REQUESTS_PER_BLOCK` - so the one instrument the property
    // exists for could not see a change to the constant it is about. A gate
    // reviewer pointed out that the two happened to agree, which is the whole
    // problem: a test that restates a constant tests its own copy of it.
    const followerCost =
      tipPollsPerMinute(follow.pollIntervalMs) + REQUESTS_PER_BLOCK * (60_000 / BLOCK_TARGET_MS);
    const mempoolTicks = 60_000 / plan.pollIntervalMs;
    const mempoolCost = mempoolTicks * (plan.overheadPerTick + (plan.txBudget ?? 0));
    return { follow, plan, followerCost, mempoolCost, total: followerCost + mempoolCost };
  }

  it("PASS SIDE: at every FEASIBLE ceiling from 1 to 200, the two loops together fit inside it", () => {
    let feasibleSeen = 0;
    for (let R = 1; R <= 200; R += 1) {
      const { follow, total } = requestsPerMinute(R, 2000);
      if (!follow.feasible) continue;
      feasibleSeen += 1;
      expect(total, `ceiling ${String(R)}`).toBeLessThanOrEqual(R);
    }
    // THE PROPERTY IS CONDITIONED, SO THE COUNT IS ASSERTED. A conditioned
    // property whose condition is never met is a green run over nothing, and
    // this is the one line that tells the two apart.
    expect(feasibleSeen).toBe(197);
    // 200 ceilings, three of them (1, 2, 3) below the follower's own cost plus one.
  });

  it("an INFEASIBLE ceiling is reported rather than silently overspent", () => {
    // Below the follower's own irreducible cost there is no plan that fits, and
    // the honest output is `feasible: false` rather than an interval that
    // pretends otherwise.
    for (const R of [1, 2, 3]) {
      const { follow } = requestsPerMinute(R, 2000);
      expect(follow.feasible, `ceiling ${String(R)}`).toBe(false);
    }
    // A ceiling EQUAL to the reservation is infeasible too, because the mempool
    // remainder floors at one and that one is not in the budget. The property
    // found this at R=3 by overspending 3.4 against 3.
    expect(requestsPerMinute(3, 2000).follow.reservedPerMinute).toBe(3);
    expect(requestsPerMinute(4, 2000).follow.feasible).toBe(true);
  });

  it("FAIL SIDE, BY DATA: the pre-fix wiring - the raw interval for the follower and the WHOLE ceiling for the mempool - does not", () => {
    // THE MEMBER OF THE EXCLUSION SET, AND IT IS THE SHIPPED CONFIGURATION AT
    // f976477: `pollIntervalMs: cfg.INDEXER_POLL_INTERVAL_MS` on the follower,
    // `planMempoolPoll({perMinute: ceiling})` on the mempool. Reconstructed here
    // rather than described, so this test would have failed before the fix.
    const R = 5;
    const preFixFollowerCost = tipPollsPerMinute(2000) + 2 * (60_000 / BLOCK_TARGET_MS);
    const preFixMempool = planMempoolPoll({ perMinute: R, requestedIntervalMs: 2000 });
    const preFixMempoolCost =
      (60_000 / preFixMempool.pollIntervalMs) * (preFixMempool.overheadPerTick + (preFixMempool.txBudget ?? 0));
    const preFixTotal = preFixFollowerCost + preFixMempoolCost;
    expect(preFixTotal).toBeGreaterThan(R);
    // Thirty tip polls a minute against a ceiling of five is where it comes from.
    expect(tipPollsPerMinute(2000)).toBe(30);

    // And the same ceiling under the shipped plan fits.
    expect(requestsPerMinute(R, 2000).total).toBeLessThanOrEqual(R);
  });
});
