/**
 * `GET /v2/snapshot` - the latest snapshot the publisher wrote, or a stated
 * absence.
 *
 * WHAT REPLACED THE 501, AND AGAINST THE ARGUMENT THAT STUB MADE. The stub said
 * a 404 would be wrong (the resource exists and is planned) and that a 200
 * carrying an empty object would be WORSE, because `apps/web`'s snapshot store
 * falls through four sources in order and an empty 200 would satisfy the gateway
 * source and stop the fall-through. That argument still binds and it is the
 * reason this route has a failure branch at all. What has changed is only the
 * first half: 501 means "the route is understood and not implemented", and it is
 * now implemented - so a 501 would be a false statement about this gateway, and
 * would keep saying "HANDOFF-09 owns this" after HANDOFF-09 shipped.
 *
 * 503 IS THE HONEST CODE FOR EVERY WAY OF HAVING NO SNAPSHOT. The route works;
 * the document it serves is not there yet, or is not one this gateway can read.
 * That is temporary and retryable - the publisher writes on every new tip,
 * roughly every 75 seconds - and it is not the caller's fault, so it is neither
 * a 4xx nor a permanent refusal. It is not an empty 200, which is the whole
 * point: a client can tell 503 from a snapshot without parsing anything, and
 * falls through to its next source exactly as the stub required.
 *
 * ONE STATUS, FOUR REASONS, AND THE REASON IS IN THE BODY. `absent` (no publish
 * yet), `unreadable` (this box), `malformed` (not JSON) and `invalid` (not a V1)
 * are four different things to an operator and one thing to a client, which is
 * "there is nothing to render, try the next source". Multiplying status codes
 * would ask every client to encode that distinction in its control flow; the
 * `reason` field lets an operator read it without a log in hand.
 *
 * THE SAME SCHEMA IS APPLIED TWICE, ON PURPOSE, AND THE TWO FAILURES MEAN
 * OPPOSITE THINGS. `readSnapshotFile` validates the FILE, and a failure there is
 * the publisher's document being unservable - a 503. `respond` validates this
 * gateway's OWN output at the boundary like every other route here, and a
 * failure there is this gateway's defect - a 500 through `toStatus`. The second
 * is unreachable while the first stands, since the value handed to it came out
 * of the first, and it is written anyway because that is what makes "all
 * responses validated against the Zod DTOs before sending" true of this route
 * rather than true of the routes that happen to build their own DTOs.
 *
 * AND THE PAIR WAS MEASURED RATHER THAN ASSUMED. With `readSnapshotFile`'s
 * validation bypassed, a snapshot missing `hash` came back 500 and not 200 - the
 * boundary caught it. So the second check is a real backstop rather than
 * ceremony, and neither check alone produces the answer A9 wants: the boundary
 * alone gives a 500 that blames this gateway for the publisher's document, and
 * the file check alone would be one edit from serving it.
 *
 * `Cache-Control` IS ON THE 200 AND `no-store` IS ON THE 503. Assertion A9 names
 * `max-age=60`, which is roughly one block, so a cached copy is at worst one tip
 * behind and carries the height it was taken at. The absence is deliberately NOT
 * cacheable: a shared cache holding a 503 for sixty seconds would keep serving
 * "there is no snapshot" for a minute after the first one was published, which
 * turns a startup window into a minute of empty dashboard.
 */

import { snapshotV1Schema } from "@zcashreveal/types";

import { respond } from "../serialize.js";
import { readSnapshotFile } from "../snapshot-source.js";
import type { GatewayApp, RouteDeps } from "./deps.js";

export function registerSnapshotRoute(app: GatewayApp, deps: RouteDeps): void {
  app.get("/snapshot", async (_req, reply) => {
    const read = await readSnapshotFile(deps.cfg.SNAPSHOT_FILE);

    if (!read.ok) {
      // The path goes to the log and never to the body: which file this gateway
      // reads is a fact about this box, and `routes/errors.ts` records why a
      // failure's own words do not reach a reader.
      deps.log.warn(
        { reason: read.reason, path: deps.cfg.SNAPSHOT_FILE },
        "no snapshot to serve",
      );
      reply.code(503);
      void reply.header("cache-control", "no-store");
      return {
        error: "no snapshot is available",
        reason: read.reason,
        detail: read.detail,
        ...(read.issues.length === 0 ? {} : { issues: read.issues }),
      };
    }

    void reply.header("cache-control", "max-age=60");
    return respond("/snapshot", snapshotV1Schema, read.snapshot);
  });
}
