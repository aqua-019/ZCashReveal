/**
 * `GET /api/mempool` - the live mempool, from the indexer's own reports.
 *
 * Reads `zcashreveal:mempool:live` on the VPS-LOCAL Redis. If that Redis is
 * absent the view is EMPTY rather than an error: an empty mempool and an
 * unreachable indexer look the same to a reader, so the summary says which it
 * is in words.
 */
import { REDIS_KEYS, mempoolViewSchema, type LeakReport } from "@zcashreveal/types";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { toStatus } from "./errors.js";
import { respond } from "../serialize.js";
import { buildMempoolView } from "../views/mempool.js";

export function registerMempoolRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get("/mempool", async (_req, reply) => {
    try {
      const info = await deps.rpc.getBlockchainInfoFull();
      const reports = await readLiveReports(deps);
      const view = buildMempoolView(reports, info.blocks, Date.now());
      return respond("/mempool", mempoolViewSchema, view);
    } catch (err) {
      deps.log.warn({ err: String(err) }, "mempool view failed");
      return toStatus(err, reply);
    }
  });
}

async function readLiveReports(deps: RouteDeps): Promise<LeakReport[]> {
  if (deps.redis === null) return [];
  const live = await deps.redis.hgetall(REDIS_KEYS.mempoolLive);
  const out: LeakReport[] = [];
  for (const raw of Object.values(live)) {
    try {
      out.push(JSON.parse(raw) as LeakReport);
    } catch {
      // One malformed entry must not empty the table. The indexer wrote it and
      // the indexer's own logs are where that belongs; here it is one row.
      deps.log.warn("skipped a malformed mempool entry");
    }
  }
  return out;
}
