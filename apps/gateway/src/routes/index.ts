/**
 * Every read route, registered under ONE prefix. `/v2` is the API.
 *
 * WHAT THIS RESOLVES. HANDOFF-05 mounted every route under BOTH `/api` and
 * `/v2`, because its own section 3 named `/api/...` while `apps/web`'s
 * `HttpApi` - written and shipped by HANDOFF-04 - requests `/v2/...`. Serving
 * only one would have broken the other at this cutover, so both were served
 * from one registration and the disagreement was raised as LEDGER-05 Q1.
 *
 * L2 RULED, AND THE ARGUMENT IS ABOUT WHAT THE WORD MEANS: "`/api` is not a
 * version, it is a category, and the moment a v3 exists the name lies." So
 * `/api` is deleted here, and a request to any path under it answers **410
 * with a body naming `/v2`** rather than 404 - a 404 says the route never
 * existed, and a client still sending `/api` needs to be told where the API
 * went rather than left to guess at a network fault. `server.ts` carries that
 * handler.
 *
 * NOTHING OUTSIDE THIS REPOSITORY IS KNOWN TO SEND `/api`, and inside it
 * nothing does: `HttpApi` has always sent `/v2`, and the only other `/api`
 * surface in the tree belongs to a different application -
 * `apps/web/src/app/api/content/[collection]` is a Next.js route handler
 * serving the content package, on a different origin, reached by no gateway
 * client. The 410 is for a caller this repository cannot see.
 *
 * What is served: search, address, tx, block, pools, mempool, flows, labels,
 * cases and snapshot.
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

/**
 * The prefixes every read route is mounted under.
 *
 * A TUPLE OF ONE, KEPT AS A TUPLE. `routes.test.ts` iterates it to assert that
 * every route answers under every prefix, and collapsing it to a bare string
 * would delete that check rather than narrow it - the test would still pass and
 * would be asserting nothing. It is also where a `/v3` would arrive.
 */
export const API_PREFIXES = ["/v2"] as const;

/**
 * The prefix that used to be served and now answers 410.
 *
 * Exported so the handler in `server.ts` and the tests that hold it to a 410
 * name the same string, rather than two string literals that can drift apart.
 */
export const RETIRED_API_PREFIX = "/api" as const;

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
