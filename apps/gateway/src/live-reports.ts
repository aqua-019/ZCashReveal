/**
 * The live mempool, read back from the VPS-local Redis in the form the indexer
 * stores it.
 *
 * ONE READER FOR ONE HASH. `zcashreveal:mempool:live` had two readers until
 * HANDOFF-12: `routes/mempool.ts` revived each entry through the shared
 * reviver, because HANDOFF-11 found the cast there as a live 500, and
 * `server.ts`'s connect-time snapshot frame still read the same hash with
 * `JSON.parse(raw) as LeakReport` - the cast, one file over, on the path that
 * gives every new WebSocket client its first mempool table. Executed, with one
 * report in the hash: the REST route answered and the connect frame threw
 * `Cannot mix BigInt and other types` inside `buildMempoolView`, was caught, and
 * was logged as "failed to send snapshot" - so on a live stack with a
 * non-empty mempool every new client got no table at all, while the route
 * beside it worked. The fifth instance of the seam shape CLAUDE.md records,
 * and the first found by asking where else the same hash was read.
 *
 * One malformed entry is skipped rather than fatal: the indexer wrote it and
 * the indexer's own logs are where that belongs; here it is one row.
 */
import type { Logger } from "pino";
import type { Redis } from "ioredis";
import {
  REDIS_KEYS,
  reviveWire,
  type LeakReport,
  type MempoolDrain,
  type MempoolDrainState,
} from "@zcashreveal/types";

export async function readLiveReports(redis: Redis | null, log: Logger): Promise<LeakReport[]> {
  if (redis === null) return [];
  const live = await redis.hgetall(REDIS_KEYS.mempoolLive);
  const out: LeakReport[] = [];
  for (const raw of Object.values(live)) {
    try {
      // REVIVED, NOT CAST. `apps/indexer` writes every bigint through
      // `serializeWire`, so `JSON.parse(raw) as LeakReport` asserts a shape the
      // value does not have. See the header, and realtime.ts for the form.
      out.push(reviveWire<LeakReport>(JSON.parse(raw)));
    } catch {
      log.warn("skipped a malformed mempool entry");
    }
  }
  return out;
}

/**
 * The drain state the indexer publishes, aged to the moment of this response.
 *
 * READ FROM THE SAME REDIS AS THE REPORTS, AND IN THE SAME FILE, so the two
 * halves of one view cannot come from two places that disagree about which
 * instance they are talking to. That is the whole lesson of this file's header.
 *
 * `null` HAS THREE CAUSES AND THEY ARE ALL THE SAME ANSWER TO THE READER: no
 * Redis configured, no key (an indexer that predates HANDOFF-15, or none
 * running), or a key this gateway could not parse. In every case the honest
 * statement is "nothing here knows how complete this view is", and the renderer
 * says so rather than implying completeness. Distinguishing the three is the
 * indexer's log's job, not a chip on a public page.
 *
 * THE AGES ARE COMPUTED HERE RATHER THAN SENT AS TIMESTAMPS. A browser
 * subtracting a server clock from its own is a source of negative durations and
 * of "3 seconds ago" on a page cached for a minute; the server knows both ends.
 */
export async function readDrainState(
  redis: Redis | null,
  log: Logger,
  now: number = Date.now(),
): Promise<MempoolDrain | null> {
  if (redis === null) return null;
  try {
    const raw = await redis.get(REDIS_KEYS.mempoolDrain);
    if (raw === null) return null;
    const state = JSON.parse(raw) as MempoolDrainState;
    // FLOORED AT ZERO. A gateway whose clock is behind the indexer's would
    // otherwise publish a negative age, which `countSchema` rejects - so the
    // whole view would 500 on a clock skew of one second.
    const seconds = (at: number): number => Math.max(0, Math.floor((now - at) / 1000));
    return {
      observed: state.observed,
      analysed: state.analysed,
      complete: state.complete,
      deferred: state.deferred,
      refused: state.refused,
      completeSecondsAgo: state.completeAtMs === null ? null : seconds(state.completeAtMs),
      updatedSecondsAgo: seconds(state.updatedAtMs),
      ceilingPerMinute: state.ceilingPerMinute,
      txPerMinute: state.txPerMinute,
    };
  } catch {
    log.warn("could not read the mempool drain state; the view will not state its own completeness");
    return null;
  }
}
