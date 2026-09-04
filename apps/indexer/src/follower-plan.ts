/**
 * How fast the confirmed-block follower may poll a METERED endpoint
 * (HANDOFF-16, deliverable 2).
 *
 * WHY THE MEMPOOL PLAN CANNOT ANSWER THIS, AND WHY THE ABSENCE WAS A LIVE
 * DEFECT. `planMempoolPoll` sizes a mempool tick: two overhead requests plus a
 * transaction budget, against the WHOLE ceiling. The composition root then
 * passed `plan.pollIntervalMs` to the mempool loop and
 * `cfg.INDEXER_POLL_INTERVAL_MS` - the RAW value, default 2000 - to the
 * follower. So on a five-a-minute endpoint the follower asked for
 * `getblockchaininfo` every two seconds, THIRTY requests a minute against a
 * ceiling of five, on the same client and therefore the same `RateGate` the
 * mempool tick was planned against.
 *
 * The gate holds the ceiling by SLEEPING, so nothing exceeds it on the wire and
 * no test could see this by counting requests. What happens instead is that the
 * follower's queued takes occupy the whole window, every mempool call waits
 * behind them, and a plan that promised three transactions a minute delivers
 * approximately none - while the log line prints the three. That is this
 * project's own recurring shape: a degradation that renders and reports no
 * fault.
 *
 * THE ANSWER IS THE CHAIN'S OWN CADENCE, NOT AN ARBITRARY FRACTION. A tip poll
 * faster than the block target learns nothing: at `BLOCK_TARGET_MS` there is at
 * most one new block to find. So a metered follower polls at the block target or
 * slower, which costs about `60000 / BLOCK_TARGET_MS` tip reads a minute - 0.8 -
 * plus one `getblock` per block found, plus a `z_gettreestate` on the blocks
 * that append Ironwood commitments. That is the ~2 a minute {@link FOLLOWER_RESERVED_RPM}
 * reserves, and the mempool plan is then given what is left rather than the whole
 * ceiling.
 *
 * AN OPERATOR ASKING FOR SLOWER IS HONOURED, for `planMempoolPoll`'s stated
 * reason: asking for less traffic is a request no ceiling objects to. What no
 * setting buys is a FASTER metered follower, because a tip poll inside one block
 * time spends budget to learn nothing.
 */
import { BLOCK_TARGET_MS } from "./analysis/constants.js";

/**
 * The requests one block costs the follower beyond its tip poll: one `getblock`,
 * and at most one `z_gettreestate` on a block that appends Ironwood commitments.
 *
 * IRREDUCIBLE BY ANY SETTING, WHICH IS THE WHOLE REASON IT IS A NAMED CONSTANT.
 * Slowing the poll reduces tip reads and nothing else: the follower must fetch
 * every block on the chain to follow it, so this part of the cost is set by the
 * chain's spacing rather than by configuration. An endpoint whose ceiling cannot
 * afford it cannot follow the chain at all, and {@link FollowerPlan.feasible}
 * is how that is said out loud instead of being discovered from a tip that never
 * moves.
 */
export const REQUESTS_PER_BLOCK = 2;

export interface FollowerPlanInput {
  /** The endpoint's ceiling in requests per minute, or null when unmetered. */
  readonly perMinute: number | null;
  /** What the operator asked for, `INDEXER_POLL_INTERVAL_MS`. */
  readonly requestedIntervalMs: number;
  /** The chain's target block spacing. Injected only so a test can shorten it. */
  readonly blockTargetMs?: number;
}

export interface FollowerPlan {
  readonly pollIntervalMs: number;
  /**
   * Requests a minute this plan reserves at the endpoint, or null when unmetered.
   *
   * DERIVED, NOT DECLARED. It is the tip rate this plan's own interval implies
   * plus {@link REQUESTS_PER_BLOCK} per block time, rounded up. A hand-picked
   * constant here was wrong on its first run: two looked reasonable and the real
   * figure at a 75-second target is 0.8 + 1.6 = 2.4, so the aggregate property
   * below failed by 0.4 of a request a minute - which is exactly the size of gap
   * a per-field check cannot see.
   */
  readonly reservedPerMinute: number | null;
  /**
   * How long a METERED follower waits after applying a block before fetching the
   * next one, or null when unmetered.
   *
   * WITHOUT IT THE RESERVATION IS A STEADY-STATE FIGURE THE LOOP DOES NOT
   * HONOUR, and a gate reviewer measured exactly that: `ChainFollower.loop`
   * sleeps only when a step comes back `idle`, so while the chain state is
   * BEHIND the tip every iteration returns `applied` and the loop re-enters
   * `step()` immediately - twenty blocks applied, forty-one wire calls, and
   * ZERO sleeps. `pollIntervalMs` bounds the idle rate and nothing else.
   *
   * The gate still holds the ceiling, so nothing exceeds it on the wire. What it
   * costs is the mempool tick, which waits behind the follower's queued takes
   * for the whole of the catch-up - and in `INDEXER_CHAIN_STORE=memory` mode
   * catch-up is the state after EVERY restart, because the store is the process.
   *
   * `60000 * REQUESTS_PER_BLOCK / reservedPerMinute` is the interval at which
   * the follower spends exactly its reservation while catching up. At a
   * reservation of three that is one block every forty seconds, which still
   * gains on a chain producing one every seventy-five.
   */
  readonly catchUpIntervalMs: number | null;
  /**
   * What is left for every other caller on the same client, or null when
   * unmetered.
   *
   * FLOORED AT ONE RATHER THAN AT ZERO, AND THE REASON IS A MEASURED FOOTGUN.
   * `planMempoolPoll` divides the window by this figure to size its overhead
   * floor, so a zero makes `pollIntervalMs` `Infinity` - and `setInterval(fn,
   * Infinity)` does not mean "never": Node coerces a non-finite delay to **1
   * millisecond** and warns. The mempool loop would then run a thousand times a
   * second against the most rate-limited endpoint this project has ever
   * measured. That is HANDOFF-15's `Retry-After` spin arriving through a
   * different arithmetic, and the floor here is what stops it before
   * `planMempoolPoll` ever sees a zero.
   */
  readonly remainingPerMinute: number | null;
  /**
   * Whether the ceiling can afford the follower at all.
   *
   * FALSE IS NOT AN ERROR AND DOES NOT STOP THE PROCESS. It means the endpoint
   * cannot keep up with the chain, which is a fact the operator needs stated at
   * startup rather than inferred later from a tip that falls further behind
   * every hour. The tip and the lane balances are still worth having.
   */
  readonly feasible: boolean;
  readonly metered: boolean;
}

/**
 * Plan the follower's poll.
 *
 * A CEILING TOO SMALL STILL PRODUCES A PLAN, on `planMempoolPoll`'s precedent
 * and for its reason: a process that refused to start would take the tip and the
 * lane balances with it. What it does instead is set `feasible` to false, which
 * the composition root logs.
 */
export function planConfirmedFollow(input: FollowerPlanInput): FollowerPlan {
  const blockTargetMs = input.blockTargetMs ?? BLOCK_TARGET_MS;
  if (input.perMinute === null) {
    return {
      pollIntervalMs: input.requestedIntervalMs,
      reservedPerMinute: null,
      // NULL, NOT ZERO. Unmetered catch-up is a tight loop against a node you
      // own and that is the right behaviour: there is no budget to protect and
      // pacing it would only make a restart take longer.
      catchUpIntervalMs: null,
      remainingPerMinute: null,
      feasible: true,
      metered: false,
    };
  }
  const perMinute = Math.floor(input.perMinute);
  const pollIntervalMs = Math.max(input.requestedIntervalMs, blockTargetMs);
  const blocksPerMinute = 60_000 / blockTargetMs;
  const tipReadsPerMinute = 60_000 / pollIntervalMs;
  const reserved = Math.ceil(tipReadsPerMinute + REQUESTS_PER_BLOCK * blocksPerMinute);
  return {
    pollIntervalMs,
    reservedPerMinute: reserved,
    catchUpIntervalMs: Math.ceil((60_000 * REQUESTS_PER_BLOCK) / reserved),
    // The floor of one is documented on the field above; it is a footgun guard,
    // not a claim that one request a minute is enough for anything.
    remainingPerMinute: Math.max(1, perMinute - reserved),
    // FEASIBLE MEANS THE CEILING AFFORDS THE FOLLOWER **AND LEAVES SOMETHING**,
    // not merely that it covers the follower exactly. The remainder floors at
    // one for the footgun reason above, so a ceiling equal to the reservation
    // still hands the mempool a request a minute it has no budget for - and the
    // aggregate property then exceeds the ceiling by exactly that one request.
    // Found by the property, at a ceiling of 3, overspending by 0.4.
    feasible: perMinute >= reserved + 1,
    metered: true,
  };
}
