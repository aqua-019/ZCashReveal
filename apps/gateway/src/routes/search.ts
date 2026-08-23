/**
 * `GET /api/search?q=` - what a query string is, by shape alone.
 *
 * A VIEWING KEY MUST NEVER REACH THIS ENDPOINT, and that is not a warning about
 * misuse - it is a constraint this route is built around.
 *
 * `ZecApi.searchKind` is synchronous and local precisely so that recognising a
 * viewing key involves no network at all, and `apps/web` classifies in the
 * browser and never calls this. HANDOFF-05 section 3 nonetheless requires the
 * endpoint, and it is right to: a non-browser consumer wants it. So it exists,
 * and it is built so that a key which arrives here anyway leaves as little
 * trace as an HTTP request can:
 *
 *   - `q` is never logged. The request logger redacts it for this route, not by
 *     truncation but by replacing it, so a key cannot survive in a log line.
 *   - the response never echoes `q`.
 *   - a `viewing-key` classification returns the routing answer and nothing
 *     derived from the key itself.
 *
 * What this cannot do is un-send it: a key in a URL is already in the client's
 * history and in any proxy's access log. That is why the browser classifies
 * locally and why `docs/2.0/API.md` says in as many words that no client of
 * this site should ever call this endpoint with one.
 */
import { searchKindSchema } from "@zcashreveal/types";
import { z } from "zod";

import type { GatewayApp, RouteDeps } from "./deps.js";
import { badRequest } from "./errors.js";
import { respond } from "../serialize.js";
import { searchKind, hrefFor } from "../search-kind.js";

const querySchema = z.object({ q: z.string().min(1, "q is required and cannot be empty") });

/**
 * This route's response DTO.
 *
 * Section 3 says every response is validated against the Zod DTOs before it is
 * sent, and `packages/zec-types` has no shape for this one - it is the only
 * endpoint whose answer is not a view the Tracking pages render. So the shape
 * is declared here rather than left as the one unvalidated 200, and `kind`
 * reuses `searchKindSchema` so the six answers cannot drift from the union the
 * client narrows on.
 */
const searchResponseSchema = z.object({ kind: searchKindSchema, href: z.string().min(1).nullable() });

export function registerSearchRoute(app: GatewayApp, _deps: RouteDeps): void {
  app.get("/search", (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return badRequest(
        reply,
        "the query is not a search",
        parsed.error.issues.map((i) => ({ path: i.path.join(".") || "q", message: i.message })),
      );
    }
    const kind = searchKind(parsed.data.q);
    // No `q` in the response, deliberately: see the header comment.
    return respond("/search", searchResponseSchema, { kind, href: hrefFor(parsed.data.q) });
  });
}
