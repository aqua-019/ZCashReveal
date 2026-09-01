/**
 * `GET /v2/pools` and `GET /v2/pools/balances`.
 *
 * See `views/pools.ts` for why there are two. In short: `poolsViewSchema`
 * requires four structures no chain query can produce, two of them analysis
 * that HANDOFF-08 ships and two of them published through the snapshot that
 * HANDOFF-09 ships. `/v2/pools` therefore answers 503 with the blocks it is
 * missing NAMED, and `/v2/pools/balances` serves the chain-derived half now.
 *
 * A 503 that says exactly what is absent and which handoff owns it is a better
 * answer than a 200 carrying four fabricated distributions, and it is the only
 * answer this project can give: a plausible N_eff histogram invented to satisfy
 * a required field is precisely the fabricated precision the site documents in
 * others.
 */

import type { GatewayApp, RouteDeps } from "./deps.js";
import { toStatus } from "./errors.js";
import { ledgerSchema, zatSchema } from "@zcashreveal/types";
import { z } from "zod";

import { respond, toJsonSafe } from "../serialize.js";
import { buildPoolBalances, POOLS_VIEW_GAPS } from "../views/pools.js";

/**
 * The chain-derived half's own DTO.
 *
 * `packages/zec-types` has no shape for this - it is not a view the Tracking
 * pages render, it is what HANDOFF-09's publisher will read - so the shape is
 * declared here rather than being the one 200 that leaves without validation.
 */
const poolBalancesSchema = z.object({
  atHeight: z.number().int().nonnegative(),
  source: z.string().min(1),
  lanes: z
    .array(
      z.object({
        lane: ledgerSchema,
        zat: zatSchema,
        share: z.number().min(0).max(1),
        rule: z.string().min(1),
      }),
    )
    .length(5),
  lockboxZat: zatSchema.nullable(),
  totalZat: zatSchema,
  note: z.string().min(1),
});

export function registerPoolsRoutes(app: GatewayApp, deps: RouteDeps): void {
  app.get("/pools/balances", async (_req, reply) => {
    try {
      const info = await deps.rpc.getBlockchainInfoFull();
      return respond("/pools/balances", poolBalancesSchema, buildPoolBalances(info.valuePools ?? [], info.blocks));
    } catch (err) {
      deps.log.warn({ err: String(err) }, "pool balances failed");
      return toStatus(err, reply);
    }
  });

  app.get("/pools", async (_req, reply) => {
    try {
      const info = await deps.rpc.getBlockchainInfoFull();
      const balances = buildPoolBalances(info.valuePools ?? [], info.blocks);
      reply.code(503);
      return {
        error: "the full pools view needs blocks this gateway cannot compute yet",
        detail:
          "The chain-derived half is served at /pools/balances and is included below. The rest arrives with the snapshot.",
        missing: POOLS_VIEW_GAPS,
        balances: toJsonSafe(balances),
      };
    } catch (err) {
      deps.log.warn({ err: String(err) }, "pools view failed");
      return toStatus(err, reply);
    }
  });
}
