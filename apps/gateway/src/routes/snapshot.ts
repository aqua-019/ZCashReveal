/**
 * `GET /api/snapshot` - a stub until HANDOFF-09.
 *
 * HANDOFF-05 section 3 says so in as many words, and this is what a stub should
 * look like: it answers, it says what it is, and it names the handoff that
 * fills it. A 404 would be wrong (the resource exists and is planned) and a 200
 * carrying an empty object would be worse - `apps/web`'s snapshot store falls
 * back through four sources in order, and an empty 200 would satisfy the
 * gateway source and stop it falling through to the bundled fixture.
 *
 * 501 is the honest code: the route is understood and not implemented.
 */

import type { GatewayApp, RouteDeps } from "./deps.js";

export function registerSnapshotRoute(app: GatewayApp, _deps: RouteDeps): void {
  app.get("/snapshot", (_req, reply) => {
    reply.code(501);
    return {
      error: "the snapshot is not produced yet",
      detail:
        "HANDOFF-09 adds the publisher that writes zecreveal:snapshot:* and this endpoint then serves it. Until it does, a client must fall through to its next source rather than treat this as an empty snapshot.",
      owner: "HANDOFF-09",
    };
  });
}
