/**
 * `GET /v2/mempool` - the live mempool, from the indexer's own reports.
 *
 * Reads `zcashreveal:mempool:live` on the VPS-LOCAL Redis. If that Redis is
 * absent the view is EMPTY rather than an error: an empty mempool and an
 * unreachable indexer look the same to a reader, so the summary says which it
 * is in words.
 */
import { REDIS_KEYS, mempoolViewSchema, reviveWireZatoshi, type LeakReport } from "@zcashreveal/types";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { toStatus } from "./errors.js";
import { respond } from "../serialize.js";
import { buildMempoolView } from "../views/mempool.js";

export function registerMempoolRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get("/mempool", async (_req, reply) => {
    try {
      const info = await deps.rpc.getBlockchainInfoFull();
      const reports = await readLiveReports(deps);
      // One extra call, and it is what makes `summary.bytes` a measurement:
      // getrawmempool verbose returns a size per entry in a single request.
      // A failure here degrades the byte total to zero rather than failing the
      // whole view, and the summary says the mempool is empty only when it is.
      const sizes = await readSizes(deps);
      const view = buildMempoolView(reports, info.blocks, Date.now(), sizes);
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
      // REVIVED, NOT CAST, AND THE CAST WAS A LIVE 500. `apps/indexer` writes
      // every zatoshi through a `bigint -> string` replacer, so
      // `JSON.parse(raw) as LeakReport` asserted a shape the value did not
      // have and `buildMempoolView`'s first `%` on one threw
      // `TypeError: Cannot mix BigInt and other types`. Every gateway suite
      // built its reports with real bigints, so nothing here had ever seen the
      // form the indexer actually stores.
      out.push(reviveWireZatoshi<LeakReport>(JSON.parse(raw)));
    } catch {
      // One malformed entry must not empty the table. The indexer wrote it and
      // the indexer's own logs are where that belongs; here it is one row.
      deps.log.warn("skipped a malformed mempool entry");
    }
  }
  return out;
}

async function readSizes(deps: RouteDeps): Promise<Record<string, { size: number }>> {
  try {
    return await deps.rpc.getRawMempoolVerbose();
  } catch (err) {
    deps.log.warn({ err: String(err) }, "mempool sizes unavailable; the byte total will be zero");
    return {};
  }
}
