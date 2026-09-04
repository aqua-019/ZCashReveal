/**
 * Publishing how complete the live mempool view is.
 *
 * WHY THE INDEXER WRITES THIS AND THE GATEWAY DOES NOT DERIVE IT: see the
 * `MempoolDrainState` docblock in `packages/zec-types/src/realtime.ts`. The
 * short form is that the gateway's version of the same subtraction means
 * something else - "reports I could not find", which a mempool that moved
 * between two calls produces on a healthy stack - and two producers of one
 * field meaning different things by it is a shape this project has paid for
 * twice in `views.ts` alone.
 *
 * VPS-LOCAL REDIS, NEVER THE MANAGED STORE. The key is `zcashreveal:` - the VPS
 * namespace, one letter different from the managed store's `zecreveal:`, which
 * is exactly the confusion `docs/2.0/SNAPSHOT.md` exists to prevent. This is
 * per-tick traffic and per-tick traffic must never leave the box; the publisher
 * remains the only writer to the shared store.
 *
 * ONE `SET` PER TICK, so the cost tracks the poll interval rather than the
 * mempool. At the metered floor of one tick a minute that is 1,440 writes a
 * day to a Redis nobody else pays for.
 */
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { REDIS_KEYS, type MempoolDrainState } from "@zcashreveal/types";

/**
 * Write the drain state.
 *
 * FAILS SOFT AND SAYS SO, because a staleness figure that could not be written
 * is not a reason to stop analysing transactions - but a reader who then sees a
 * stale figure with no fault beside it is the frozen-page shape this project
 * keeps finding. The log line is what a stale figure is diagnosed from.
 *
 * NO TTL, DELIBERATELY, AND FOR THE OPPOSITE REASON TO THE SNAPSHOT'S. The
 * snapshot key carries none because expiring the latest document produces the
 * empty dashboard the fallback exists to prevent. This one carries none because
 * an EXPIRED drain state and a STALE drain state must not look the same to the
 * gateway: an absent key means "no indexer has ever written one", and a key
 * whose `updatedAtMs` is an hour old means "the indexer stopped". The gateway
 * renders those differently, and a TTL would collapse the second into the
 * first after a while.
 */
export async function publishDrainState(
  redis: Redis,
  state: MempoolDrainState,
  log: Logger,
): Promise<void> {
  try {
    await redis.set(REDIS_KEYS.mempoolDrain, JSON.stringify(state));
  } catch (err) {
    log.warn({ err }, "could not publish the mempool drain state; the view's staleness figure will age");
  }
}

/**
 * Drop entries the live hash is holding for transactions no longer in the mempool.
 *
 * RUN ONCE AT STARTUP, BECAUSE `MempoolState.reconcile` CANNOT SEE THEM.
 * Reconciliation walks the IN-MEMORY map and emits a removal for every txid
 * absent from the node's list - and on a fresh process that map is empty, so it
 * emits nothing and every entry the previous run left behind stays in
 * `zcashreveal:mempool:live` forever. Nothing else prunes it: the only writers
 * are the `hset` and `hdel` in `publishDiff`.
 *
 * WHAT IT COSTS TO SKIP IT, MEASURED AS A CONTRADICTION ON ONE PAGE. The
 * gateway builds `summary.unconfirmed` from the hash and `drain.observed` from
 * the indexer's own count, so after a restart with 412 stale entries against a
 * mempool of 400, /track renders "412 unconfirmed" in the block header, "3 of
 * 400 analysed" in the completeness notice, and 412 rows in the table - three
 * adjacent statements about one set, the middle one wrong by 409. Under a
 * five-per-minute ceiling that stands for over two hours; on a busy mempool it
 * never closes. The leak predates HANDOFF-15; what is new is a printed number
 * that contradicts the rows beside it, which is why this handoff closes it.
 *
 * `HDEL` ON NAMED FIELDS OF ONE `zcashreveal:` KEY. No pattern delete, no
 * `KEYS`, no `SCAN` - `check-redis-safety` rule 4 permits exactly this, and the
 * managed store is not involved on any path here.
 */
export async function pruneLiveMempool(
  redis: Redis,
  authoritative: readonly string[],
  log: Logger,
): Promise<number> {
  try {
    const held = await redis.hkeys(REDIS_KEYS.mempoolLive);
    if (held.length === 0) return 0;
    const current = new Set(authoritative);
    const stale = held.filter((txid) => !current.has(txid));
    if (stale.length === 0) return 0;
    await redis.hdel(REDIS_KEYS.mempoolLive, ...stale);
    log.info(
      { dropped: stale.length, held: held.length, inMempool: authoritative.length },
      "pruned reports a previous run left in the live mempool hash; without this the gateway's unconfirmed count would have disagreed with the drain state",
    );
    return stale.length;
  } catch (err) {
    log.warn({ err }, "could not prune the live mempool hash; the unconfirmed count may exceed the drain state until the entries age out");
    return 0;
  }
}
