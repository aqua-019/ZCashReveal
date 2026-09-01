/**
 * `GET /v2/labels` and the address-label contract.
 *
 * Served from `packages/content`, which is the only place a label is written
 * down. Every label carries its labeller and its precedence rank, because
 * CLAUDE.md requires the precedence to be displayed and a label without it is
 * an identity claim.
 */
import { labelViewSchema } from "@zcashreveal/types";
import { z } from "zod";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { respond } from "../serialize.js";
import { labelViews } from "../views/labels.js";

export function registerLabelsRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get("/labels", () =>
    respond(
      "/labels",
      z.array(labelViewSchema),
      labelViews().filter((l) => l.network === deps.cfg.GATEWAY_NETWORK),
    ),
  );
}
