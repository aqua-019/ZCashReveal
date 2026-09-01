#!/usr/bin/env node
/**
 * The post-deploy smoke check: did the snapshot fallback actually ship?
 *
 * HANDOFF-11 section 4.1 asks for "a post-deploy smoke job that fetches the
 * production bundle and fails if the snapshot fallback marker is absent", and
 * assertion A8 (the second of that pair) names the marker: the built JavaScript
 * must contain the literal `zr:snapshot-fallback:v1`.
 *
 * WHY A MARKER AT ALL. A deployment can be green, serve every route and still
 * have shipped without the fallback - which is the failure that emptied v0.2
 * production, where the page had nothing to render when the VPS was
 * unreachable. The marker is emitted by the staleness indicator, which is the
 * fallback's visible half: if the machinery is in the bundle the marker is too,
 * and if it is not, neither is.
 *
 * IT TAKES A BASE URL SO A SESSION CAN RUN IT, and that is deliberate rather
 * than incidental. No session can reach a preview or production host
 * (LEDGER-04 Q3), so a check that only ever ran in a post-deploy job would have
 * no positive side anybody here could execute - it would be shipped unproven,
 * which is the shape this project keeps finding. Pointed at a locally served
 * production build it exercises every line of itself; pointed at the deployed
 * site by CI it is the same code against the real artefact.
 *
 *   node scripts/post-deploy-smoke.mjs http://127.0.0.1:3210
 *   node scripts/post-deploy-smoke.mjs https://zecreveal.example
 *
 * IT CHECKS TWO THINGS AND THEY PULL IN OPPOSITE DIRECTIONS. The marker MUST be
 * in the client bundle; no managed-store variable name or token value may be.
 * That pair is exactly what A8 and A4 impose together, and checking only the
 * first would pass on a build that shipped the fallback and the credentials.
 */
import { argv, exit } from "node:process";

const MARKER = "zr:snapshot-fallback:v1";
/** Assembled rather than written, so this file is not itself a match for its own grep. */
const FORBIDDEN_PREFIX = ["SNAPSHOT", "REDIS"].join("_");

const base = (argv[2] ?? "").replace(/\/+$/, "");
if (base === "") {
  process.stderr.write("usage: node scripts/post-deploy-smoke.mjs <base-url>\n");
  exit(2);
}

/** Every script the document loads, as absolute URLs. */
function scriptUrls(html, origin) {
  const urls = [];
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const src = m[1];
    if (src === undefined) continue;
    urls.push(src.startsWith("http") ? src : `${origin}${src.startsWith("/") ? "" : "/"}${src}`);
  }
  return [...new Set(urls)];
}

async function main() {
  const res = await fetch(`${base}/`, { headers: { accept: "text/html" } });
  if (!res.ok) {
    process.stderr.write(`post-deploy-smoke: FAIL - ${base}/ answered ${res.status}\n`);
    exit(1);
  }
  const html = await res.text();
  const urls = scriptUrls(html, base);

  // THE INSTRUMENT IS CHECKED BEFORE ANY FINDING IS BUILT ON IT. A page whose
  // scripts could not be enumerated yields an empty list, and an empty list
  // makes "the marker is absent" true for the wrong reason - a false failure
  // that reads exactly like a real one.
  if (urls.length === 0) {
    process.stderr.write("post-deploy-smoke: FAIL - the document loaded no script at all, so the bundle could not be read\n");
    exit(1);
  }

  let markerFound = false;
  const leaks = [];
  for (const url of urls) {
    const r = await fetch(url);
    if (!r.ok) continue;
    const body = await r.text();
    if (body.includes(MARKER)) markerFound = true;
    if (body.includes(FORBIDDEN_PREFIX)) leaks.push(url);
  }

  const problems = [];
  if (!markerFound) {
    problems.push(
      `the marker ${MARKER} is in none of the ${urls.length} script(s) this page loads. ` +
        "The snapshot fallback did not ship, so a reader has nothing to render when the store and the gateway are both unreachable.",
    );
  }
  for (const url of leaks) {
    problems.push(`${url} contains a managed-store variable name. A credential name reached the browser; rotate the token.`);
  }

  if (problems.length > 0) {
    process.stderr.write(`post-deploy-smoke: FAIL - ${problems.length} finding(s).\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    exit(1);
  }

  process.stdout.write(
    `post-deploy-smoke: OK - ${urls.length} script(s) fetched from ${base}; ` +
      `the fallback marker is present and no managed-store name is.\n`,
  );
}

await main();
