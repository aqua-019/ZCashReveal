/**
 * Container healthcheck for the indexer.
 *
 * WHY THIS FILE EXISTS RATHER THAN A ONE-LINER IN THE DOCKERFILE. The indexer
 * listens on nothing - it dials Zebra, Postgres and Redis and is reachable from
 * nowhere - so the obvious healthcheck is `node -e "process.exit(0)"`, and that
 * is a check that cannot fail. In a container whose entrypoint IS the node
 * process, "can node start" is answered by the container still existing, so
 * such a check reports healthy for a wedged process forever. CLAUDE.md makes a
 * fail-side probe that does not fail a finding in its own right; a healthcheck
 * that cannot fail is the same defect wearing an operations badge.
 *
 * WHAT THIS ACTUALLY MEASURES, stated exactly because the bound matters: that
 * from inside this container, a TCP connection can be opened to every endpoint
 * the indexer is configured to dial. It discriminates - Zebra down, Postgres
 * down, a wrong host in `.env`, a compose network that did not attach - and
 * those are the failures that actually happen on this VPS.
 *
 * WHAT IT DOES NOT MEASURE, and what does: whether the indexer is KEEPING UP.
 * A process that is connected and 900 blocks behind passes this check. Lag is
 * measured by snapshot age and is an operator alert in `docs/2.0/RUNBOOK-VPS.md`
 * (> 20 blocks), not a container healthcheck - because a node that has fallen
 * behind should page a human, and marking it unhealthy would instead invite a
 * restart that throws away the sync progress that was the only thing going
 * right.
 *
 * Exit 0 healthy, exit 1 unhealthy. No dependencies beyond node's own net
 * module, so it runs in the production image with nothing added.
 */

import { connect } from "node:net";

const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 3000);

/**
 * Host and port for one endpoint, from a URL in the environment.
 *
 * `postgres://` and `redis://` carry no default port in the WHATWG URL parser -
 * `url.port` is the empty string unless one is written - so each caller supplies
 * the default its scheme implies. Reading it back as `undefined` and letting
 * `connect` guess is how a healthcheck ends up probing port 0.
 */
function endpoint(name, raw, defaultPort) {
  if (raw === undefined || raw === "") return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { name, error: `${name} is not a URL` };
  }
  const port = url.port === "" ? defaultPort : Number(url.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { name, error: `${name} has no usable port` };
  }
  return { name, host: url.hostname, port };
}

function probe({ name, host, port }) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok, why) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ name, host, port, ok, why });
    };
    socket.setTimeout(TIMEOUT_MS, () => done(false, `timeout after ${TIMEOUT_MS}ms`));
    socket.once("connect", () => done(true, "connected"));
    socket.once("error", (err) => done(false, err.message));
  });
}

const targets = [
  endpoint("ZEBRAD_RPC_URL", process.env.ZEBRAD_RPC_URL ?? "http://zebrad:8232", 8232),
  endpoint("DATABASE_URL", process.env.DATABASE_URL, 5432),
  endpoint("REDIS_URL", process.env.REDIS_URL, 6379),
].filter((t) => t !== null);

// An indexer with no configured endpoints is misconfigured, not healthy. This
// is the branch that stops the check degrading into the always-passing one it
// was written to replace: if the environment is empty, say so and fail.
if (targets.length === 0) {
  console.error("healthcheck: no endpoints configured (ZEBRAD_RPC_URL, DATABASE_URL, REDIS_URL all unset)");
  process.exit(1);
}

const malformed = targets.filter((t) => t.error !== undefined);
if (malformed.length > 0) {
  for (const m of malformed) console.error(`healthcheck: ${m.error}`);
  process.exit(1);
}

const results = await Promise.all(targets.map(probe));
const failed = results.filter((r) => !r.ok);

for (const r of results) {
  console.log(`healthcheck: ${r.name} ${r.host}:${r.port} ${r.ok ? "ok" : `FAIL (${r.why})`}`);
}

process.exit(failed.length === 0 ? 0 : 1);
