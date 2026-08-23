/**
 * `GET /api/block/:height`.
 *
 * A negative height is a 400, not a 404: assertion A3's third case. The node
 * would answer -8 for a height above the tip, which IS a 404 - "the chain does
 * not have that block yet" - and the two must not be merged, because one is a
 * malformed request and the other is a true statement about the chain.
 */
import { blockViewSchema } from "@zcashreveal/types";
import { z } from "zod";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { badRequest, toStatus } from "./errors.js";
import { respond } from "../serialize.js";
import { buildBlockView } from "../views/block.js";

const heightSchema = z.coerce
  .number({ invalid_type_error: "a block height is a number" })
  .int("a block height is a whole number")
  .nonnegative("a block height is not negative");

export function registerBlockRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get<{ Params: { height: string } }>("/block/:height", async (req, reply) => {
    const parsed = heightSchema.safeParse(req.params.height);
    if (!parsed.success) {
      return badRequest(
        reply,
        "not a block height",
        parsed.error.issues.map((i) => ({ path: "height", message: i.message })),
      );
    }
    try {
      const block = await deps.rpc.getBlock({ height: parsed.data });
      return respond("/block", blockViewSchema, buildBlockView(block));
    } catch (err) {
      deps.log.warn({ err: String(err) }, "block view failed");
      return toStatus(err, reply);
    }
  });
}
