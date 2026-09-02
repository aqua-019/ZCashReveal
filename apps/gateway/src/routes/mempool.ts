/**
 * `GET /v2/mempool` - the live mempool, from the indexer's own reports.
 *
 * Reads `zcashreveal:mempool:live` on the VPS-LOCAL Redis. If that Redis is
 * absent the view is EMPTY rather than an error: an empty mempool and an
 * unreachable indexer look the same to a reader, so the summary says which it
 * is in words.
 */
import { mempoolViewSchema } from "@zcashreveal/types";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { toStatus } from "./errors.js";
import { readLiveReports } from "../live-reports.js";
import { respond } from "../serialize.js";
import { buildMempoolView } from "../views/mempool.js";

export function registerMempoolRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get("/mempool", async (_req, reply) => {
    try {
      const info = await deps.rpc.getBlockchainInfoFull();
      const reports = await readLiveReports(deps.redis, deps.log);
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

// `readLiveReports` MOVED TO ../live-reports.ts IN HANDOFF-12, because the
// connect-time WebSocket frame in server.ts read the same hash with the cast
// this route had already been cured of. One reader, both callers. The history
// of the cast - a live 500 on every non-empty mempool, found in HANDOFF-11 -
// is in that file's header.

async function readSizes(deps: RouteDeps): Promise<Record<string, { size: number }>> {
  try {
    return await deps.rpc.getRawMempoolVerbose();
  } catch (err) {
    deps.log.warn({ err: String(err) }, "mempool sizes unavailable; the byte total will be zero");
    return {};
  }
}
