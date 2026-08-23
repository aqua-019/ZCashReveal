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

/**
 * A block height, validated as a STRING before it is a number.
 *
 * `z.coerce.number().int().nonnegative()` validates the RESULT of `Number()`,
 * not what arrived. `"999999999999999999999"` coerces to 1e21, passes `.int()`,
 * and would then be sent to the node as the JSON-RPC parameter `"1e+21"` - a
 * height the chain does not have, so the node's -8 becomes a 404 saying "the
 * chain does not have that". That is exactly the conflation this file's header
 * comment says must not happen: a malformed request would be reported as a true
 * statement about the chain.
 *
 * Nine digits is the same ceiling `search-kind.ts` uses, and for the same
 * reason: Zcash is at 3.4 million, so a longer run of digits is junk rather
 * than a height beyond any chain that will exist.
 */
const heightSchema = z
  .string()
  .regex(/^[0-9]{1,9}$/, "a block height is up to nine digits, with no sign, decimal point or exponent")
  .transform((s) => Number(s));

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
