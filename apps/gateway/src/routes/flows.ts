/** `GET /api/flows` - the Tracking side of the Record's /flows, as a summary. */
import { flowsViewSchema } from "@zcashreveal/types";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { respond } from "../serialize.js";
import { buildFlowsView } from "../views/flows.js";

export function registerFlowsRoute(app: GatewayApp, _deps: RouteDeps): void {
  app.get("/flows", () => respond("/flows", flowsViewSchema, buildFlowsView()));
}
