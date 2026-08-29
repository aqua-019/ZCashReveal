/**
 * Container healthcheck for the publisher.
 *
 * WHY THIS FILE EXISTS RATHER THAN A ONE-LINER IN THE DOCKERFILE. The publisher
 * listens on nothing - it reads the local stack and writes three keys per block
 * to the managed store - so the obvious healthcheck is
 * `node -e "process.exit(0)"`, and that is a check that cannot fail. In a container whose entrypoint IS the node
 * process, "can node start" is answered by the container still existing, so
 * such a check reports healthy for a wedged process forever. CLAUDE.md makes a
 * fail-side probe that does not fail a finding in its own right; a healthcheck
 * that cannot fail is the same defect wearing an operations badge.
 *
 * WHAT THIS ACTUALLY MEASURES: that from inside this container, a TCP
 * connection can be opened to the LOCAL endpoints the publisher reads -
 * Postgres and the VPS Redis. It discriminates: either one down, a wrong host
 * in `.env`, or a compose network that did not attach.
 *
 * IT NEVER TOUCHES THE VERCEL-MANAGED REDIS, AND THAT IS A RULE RATHER THAN AN
 * OVERSIGHT. That store is shared with an unrelated production project
 * (docs/2.0/SNAPSHOT.md). A healthcheck is the one component in a stack that
 * runs forever on a timer, so probing the managed store here would open roughly
 * 86,400 connections a month against someone else's database to answer a
 * question about ours. Whether the publisher can reach its destination is
 * answered by the publisher's own logs and by the snapshot-age alert in
 * RUNBOOK-VPS.md, both of which cost nothing when nothing is wrong.
 *
 * WHAT IT DOES NOT MEASURE: whether the snapshot being published is FRESH, or
 * whether it is arriving at the managed store at all. Snapshot age is the
 * operator alert in `docs/2.0/RUNBOOK-VPS.md` (> 20 blocks) and it is measured
 * from the reader's side, which is the only side that can tell the difference
 * between "not published" and "published somewhere else".
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

// SNAPSHOT_REDIS_* is deliberately absent from this list. See the header.
const targets = [
  endpoint("DATABASE_URL", process.env.DATABASE_URL, 5432),
  endpoint("REDIS_URL", process.env.REDIS_URL, 6379),
].filter((t) => t !== null);

// A publisher with no configured endpoints is misconfigured, not healthy. This
// is the branch that stops the check degrading into the always-passing one it
// was written to replace: if the environment is empty, say so and fail.
if (targets.length === 0) {
  console.error("healthcheck: no endpoints configured (DATABASE_URL, REDIS_URL both unset)");
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
