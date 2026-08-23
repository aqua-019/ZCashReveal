/**
 * Every read route, registered under BOTH prefixes.
 *
 * TWO PREFIXES, AND THE REASON IS A REAL DISAGREEMENT BETWEEN TWO HANDOFFS.
 * HANDOFF-05 section 3 names the endpoints as `/api/address/:addr`,
 * `/api/tx/:txid` and so on, and HANDOFF-11 section 3 reads
 * `${NEXT_PUBLIC_API_URL}/api/snapshot`. But `apps/web`'s `HttpApi`, written and
 * shipped by HANDOFF-04, requests `/v2/address/...`, `/v2/tx/...`, `/v2/pools`,
 * `/v2/mempool`, `/v2/flows` and `/v2/labels`. Serving only `/api` would mean
 * the client that exists cannot reach the gateway that exists, and renaming the
 * client's paths would be editing another track's shipped code to match a
 * sentence in this one's spec.
 *
 * Both are served, from one registration, so they cannot drift. `/api` is the
 * documented contract; `/v2` is the alias the shipped client already uses. The
 * disagreement is recorded in the section 8 ledger for L2 to rule on, and
 * whichever survives, one line here removes the other.
 *
 * The union of the two lists is what is served: search, address, tx, block,
 * pools, mempool, flows, labels, cases and snapshot. Nothing is narrowed on the
 * grounds that one handoff did not name it.
 */

import type { GatewayApp, RouteDeps } from "./deps.js";
import { registerAddressRoute } from "./address.js";
import { registerBlockRoute } from "./block.js";
import { registerCasesRoute } from "./cases.js";
import { registerFlowsRoute } from "./flows.js";
import { registerLabelsRoute } from "./labels.js";
import { registerMempoolRoute } from "./mempool.js";
import { registerPoolsRoutes } from "./pools.js";
import { registerSearchRoute } from "./search.js";
import { registerSnapshotRoute } from "./snapshot.js";
import { registerTxRoute } from "./tx.js";

/** The prefixes every read route is mounted under. */
export const API_PREFIXES = ["/api", "/v2"] as const;

export async function registerReadRoutes(app: GatewayApp, deps: RouteDeps): Promise<void> {
  for (const prefix of API_PREFIXES) {
    await app.register(
      async (scope) => {
        registerSearchRoute(scope, deps);
        registerAddressRoute(scope, deps);
        registerTxRoute(scope, deps);
        registerBlockRoute(scope, deps);
        registerPoolsRoutes(scope, deps);
        registerMempoolRoute(scope, deps);
        registerFlowsRoute(scope, deps);
        registerLabelsRoute(scope, deps);
        registerCasesRoute(scope, deps);
        registerSnapshotRoute(scope, deps);
      },
      { prefix },
    );
  }
}
