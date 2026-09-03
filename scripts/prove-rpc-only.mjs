#!/usr/bin/env node
/**
 * Prove rung 1 against a REAL node: two RPC calls, a real tip, five real lanes.
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST, AND THE REASON IS MEASURED RATHER THAN
 * PREFERRED. A session in this project's execution environment cannot reach a
 * public Zcash RPC endpoint at all: the egress proxy refuses the CONNECT tunnel
 * with 403 before TLS, for every host tried. That is the same wall CLAUDE.md
 * records between a session and a Vercel preview, the VPS, a live gateway and
 * `upstash.com`, and no operator toggle moves it. So the half of HANDOFF-14's
 * deliverable 2 that needs a live endpoint is the OPERATOR's to run, and this is
 * the thing they run.
 *
 * WHAT IT DOES NOT DO. It opens no database, writes to no Redis, and touches the
 * managed store in no way whatsoever. It makes two GET-shaped POSTs to one node
 * and prints what the publisher would have published. Rule 5 of
 * `docs/2.0/SNAPSHOT.md` - tests, local development and builds never point at
 * the shared store - is satisfied by construction here: there is no store client
 * in this file.
 *
 * IT CHECKS THE HTTP STATUS, AND THAT IS THE WHOLE OF WHY THE CHECK IS SPELLED
 * OUT. L2's first harness did not. A 429 returned a body with no `result`, the
 * helper returned `undefined`, and the failure surfaced three frames later as
 * `Cannot read properties of undefined (reading 'time')` - a rate limit wearing
 * the costume of a missing field. A keyless public endpoint rate-limits at five
 * requests a minute, so this is the ordinary case rather than the exotic one.
 *
 *   node scripts/prove-rpc-only.mjs [url]
 *
 * Exit 0 and the document is what rung 1 publishes. Exit 1 and the message says
 * which of the four claims failed.
 */

const URL_ = process.argv[2] ?? process.env["ZEBRAD_RPC_URL"];
if (URL_ === undefined || URL_.length === 0) {
  console.error(
    "usage: node scripts/prove-rpc-only.mjs <rpc-url>\n" +
      "   or: ZEBRAD_RPC_URL=https://... node scripts/prove-rpc-only.mjs\n\n" +
      "Any endpoint serving getblockchaininfo and getblockheader. A keyless\n" +
      "public gateway is enough: this makes two calls.",
  );
  process.exit(2);
}

const USER = process.env["ZEBRAD_RPC_USER"] ?? "";
const PASSWORD = process.env["ZEBRAD_RPC_PASSWORD"] ?? "";
const ZAT_PER_ZEC = 100_000_000n;
const RATE_LIMIT_WAIT_MS = 14_000;
const ATTEMPTS = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The five site lanes. The ZIP 271 lockbox is on the wire and is not one. */
const LANES = ["transparent", "sprout", "sapling", "orchard", "ironwood"];

async function rpc(method, params = []) {
  const headers = { "content-type": "application/json" };
  if (USER.length > 0 || PASSWORD.length > 0) {
    headers["authorization"] = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
  }

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const res = await fetch(URL_, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "1.0", id: "prove-rung1", method, params }),
    });

    // THE STATUS IS READ BEFORE THE BODY. A 429 with a bodyless 200-shaped
    // response is indistinguishable from a node that answered with no result,
    // and the two want opposite responses: wait, or fail loudly.
    if (res.status === 429) {
      process.stderr.write(`  ${method}: rate limited, waiting ${RATE_LIMIT_WAIT_MS / 1000}s\n`);
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${res.statusText}`);

    const body = await res.json();
    if (body.error !== undefined && body.error !== null) {
      throw new Error(`${method}: the node answered an error: ${body.error.message ?? "(no message)"}`);
    }
    if (body.result === undefined) {
      throw new Error(`${method}: HTTP ${res.status} with no \`result\` field - not a rate limit, a malformed answer`);
    }
    return body.result;
  }
  throw new Error(`${method}: still rate limited after ${ATTEMPTS} attempts`);
}

/** zatoshi from whatever spelling the node used, without a float in the middle. */
function zat(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string") {
    // A decimal ZEC string, or an integer zatoshi string. Both occur.
    if (value.includes(".")) {
      const [whole, frac = ""] = value.split(".");
      return BigInt(whole) * ZAT_PER_ZEC + BigInt(frac.padEnd(8, "0").slice(0, 8));
    }
    return BigInt(value);
  }
  // A JSON number. Rounded once, here, where it is visible - the node reports
  // ZEC as a double for `chainValueZat` on some builds.
  return BigInt(Math.round(Number(value)));
}

const zec = (v) => (Number(v) / 1e8).toFixed(2);

async function main() {
  process.stderr.write(`Two calls to ${URL_}\n\n`);

  const info = await rpc("getblockchaininfo");
  const header = await rpc("getblockheader", [String(info.blocks)]);

  const pools = info.valuePools ?? [];
  const byId = new Map(pools.map((p) => [p.id, zat(p.chainValueZat)]));
  const laneTotal = LANES.reduce((acc, l) => acc + (byId.get(l) ?? 0n), 0n);

  const supply = info.chainSupply === undefined ? null : zat(info.chainSupply.chainValueZat);
  // U = Bal^sprout + Bal^orchard. Not every shielded pool: `turnstileResidual`'s
  // own signature is the authority.
  const sprout = byId.get("sprout");
  const orchard = byId.get("orchard");
  const unprovable = sprout === undefined || orchard === undefined ? null : sprout + orchard;

  const out = [];
  const w = (line) => {
    out.push(line);
    console.log(line);
  };

  w("=== LIVE MAINNET SNAPSHOT, AS RUNG 1 WOULD PUBLISH IT ===");
  w(`height ${info.blocks}   hash ${String(info.bestblockhash).slice(0, 20)}...`);
  w(`block time ${new Date(header.time * 1000).toISOString()}`);
  w("");
  w("  --- the five lanes, from the node's own valuePools ---");
  for (const lane of LANES) {
    const balance = byId.get(lane);
    if (balance === undefined) {
      w(`  ${lane.padEnd(12)} ${"ABSENT".padStart(16)}   the node did not report this pool`);
      continue;
    }
    const share = laneTotal > 0n ? Number((balance * 10_000n) / laneTotal) / 100 : 0;
    w(`  ${lane.padEnd(12)} ${zec(balance).padStart(16)} ZEC   share ${share.toFixed(2)}%`);
  }
  if (byId.has("lockbox")) {
    w(`  (lockbox     ${zec(byId.get("lockbox")).padStart(16)} ZEC   on the wire, NOT a site lane)`);
  }
  w("");
  w("  --- analysis panels ---");
  w(`  residual       ${unprovable === null || supply === null ? "null - NOT MEASURED (the node reported no supply)" : `MEASURED: ${zec(unprovable)} ZEC unprovable of ${zec(supply)} ZEC supply`}`);
  for (const panel of ["drain", "migrationHist", "neffSeries"]) {
    w(`  ${panel.padEnd(14)} null - NOT MEASURED (reads a table; there is no database in this mode)`);
  }

  // THE FOUR CLAIMS, CHECKED RATHER THAN PRINTED. A script that prints a
  // plausible document and exits 0 regardless has proved nothing.
  const failures = [];
  if (!(Number(info.blocks) > 0)) failures.push("the node reported no height");
  const missing = LANES.filter((l) => !byId.has(l));
  if (missing.length > 0) failures.push(`the node reported no balance for: ${missing.join(", ")}`);
  if (!(Number(header.time) > 0)) failures.push("the header carried no block time");
  if (supply === null || unprovable === null) {
    failures.push("no supply figure, so `residual` would publish as an absence rather than a measurement");
  }

  w("");
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL: ${f}`);
    process.exitCode = 1;
    return;
  }
  w("OK: two RPC calls, a real tip, five real lanes, `residual` measurable,");
  w("    three panels absent. That is rung 1. Nothing here opened a database");
  w("    and nothing here touched the managed store.");
}

main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
