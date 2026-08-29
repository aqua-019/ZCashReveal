/**
 * Container healthcheck for the gateway.
 *
 * Unlike the indexer, the gateway HAS a health surface - `GET /healthz`, served
 * by `apps/gateway/src/server.ts` - so this check exercises it rather than
 * opening a bare socket. That distinction is the point: a TCP connect to the
 * listening port proves the process bound a socket, and a request through
 * `/healthz` proves Fastify is routing. A gateway that has bound its port and
 * wedged before the route table came up passes the first and fails the second,
 * and that is a real failure mode for a server that builds its routes
 * asynchronously at boot.
 *
 * WHAT IT DOES NOT MEASURE: whether the DATA the gateway would serve is fresh.
 * `/healthz` answers `{ok: true}` from the process itself; it says nothing
 * about Postgres, Zebra or snapshot age, all of which can be broken behind a
 * 200. That is deliberate - liveness and correctness are different questions,
 * and conflating them gives an operator a green tick over a stale API. Snapshot
 * age is the freshness alert and lives in `docs/2.0/RUNBOOK-VPS.md`.
 *
 * Exit 0 healthy, exit 1 unhealthy. Node's own http module only, so it runs in
 * the production image with nothing added - notably without curl or wget, which
 * are the usual reason a healthcheck drags a package manager into a runtime
 * image.
 */

import { request } from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 8080);
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 3000);

// 127.0.0.1 rather than GATEWAY_HOST. The server binds 0.0.0.0 in production so
// the tunnel can reach it, and a healthcheck that dialled 0.0.0.0 would be
// asking the kernel to route to "every address", which is not a destination.
// The check runs INSIDE the container, so loopback is both correct and the only
// address that cannot be affected by the compose network.
const HOST = "127.0.0.1";

const req = request(
  { host: HOST, port: PORT, path: "/healthz", method: "GET", timeout: TIMEOUT_MS },
  (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (res.statusCode !== 200) {
        console.error(`healthcheck: /healthz answered ${res.statusCode}`);
        process.exit(1);
      }
      // The status code alone is not enough. A reverse proxy, a catch-all route
      // or a static 200 would satisfy it, so the body is checked for the shape
      // this gateway's own handler returns.
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        console.error(`healthcheck: /healthz answered 200 with a body that is not JSON: ${body.slice(0, 120)}`);
        process.exit(1);
      }
      if (parsed?.ok !== true) {
        console.error(`healthcheck: /healthz answered 200 without ok:true: ${body.slice(0, 120)}`);
        process.exit(1);
      }
      console.log(`healthcheck: /healthz ok on ${HOST}:${PORT}`);
      process.exit(0);
    });
  },
);

req.on("timeout", () => {
  console.error(`healthcheck: /healthz timed out after ${TIMEOUT_MS}ms`);
  req.destroy();
  process.exit(1);
});

req.on("error", (err) => {
  console.error(`healthcheck: /healthz unreachable on ${HOST}:${PORT} (${err.message})`);
  process.exit(1);
});

req.end();
