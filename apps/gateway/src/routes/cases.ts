/**
 * `GET /api/cases` - the golden cases, from `packages/content`.
 *
 * A case is a documented sequence of movements with a verdict and its sources.
 * It is served as the seed states it, with no re-derivation: HANDOFF-03's gate
 * round 4 is the record of what happens when one fact is stated in two places.
 */
import { caseViewSchema } from "@zcashreveal/types";
import { z } from "zod";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { respond } from "../serialize.js";
import { caseViews } from "../views/labels.js";

export function registerCasesRoute(app: GatewayApp, _deps: RouteDeps): void {
  app.get("/cases", () => respond("/cases", z.array(caseViewSchema), caseViews()));
}
