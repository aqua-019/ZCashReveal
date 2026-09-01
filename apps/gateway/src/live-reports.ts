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
import { REDIS_KEYS, reviveWire, type LeakReport } from "@zcashreveal/types";

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
