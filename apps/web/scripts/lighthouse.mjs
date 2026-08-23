#!/usr/bin/env node
/**
 * ASSERTION A5 - Lighthouse performance >= 95 and accessibility >= 95 on /beware.
 *
 * Runs Lighthouse against a PRODUCTION build served by `next start`, not the
 * dev server: a dev bundle carries hydration scaffolding, unminified names and
 * React's development warnings, and a performance score measured there is a
 * score for an artefact nobody loads.
 *
 * The full JSON report is written to docs/2.0/screens/lighthouse-beware.json and
 * committed, so the number in section 7 of the handoff is checkable against the
 * audits that produced it rather than taken on the session's word.
 *
 * Chromium comes from PLAYWRIGHT_BROWSERS_PATH, which is already provisioned in
 * this environment. Nothing here downloads a browser.
 *
 * Usage:
 *   node apps/web/scripts/lighthouse.mjs [url] [outfile]
 * Defaults: http://127.0.0.1:3311/beware, docs/2.0/screens/lighthouse-beware.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");

const url = process.argv[2] ?? "http://127.0.0.1:3311/beware";
const out = process.argv[3] ?? join(REPO, "docs", "2.0", "screens", "lighthouse-beware.json");

/** The floors HANDOFF-03 A5 sets. Both are gates, not targets. */
const FLOORS = { performance: 95, accessibility: 95 };

const CHROME_PATH =
  process.env.LIGHTHOUSE_CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const chrome = await chromeLauncher.launch({
  chromePath: CHROME_PATH,
  chromeFlags: [
    "--headless=new",
    // A container without a user namespace cannot use Chrome's sandbox. The
    // page under test is a local static build of this repository, so there is
    // no untrusted content in the process.
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});

let result;
try {
  result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    },
    // The mobile preset, which is Lighthouse's default and the harsher of the
    // two. HANDOFF-01 measured the webfont budget against it, so the numbers
    // stay comparable across handoffs.
    undefined,
  );
} finally {
  await chrome.kill();
}

if (result === undefined) {
  process.stderr.write("lighthouse returned nothing\n");
  process.exit(1);
}

const scores = Object.fromEntries(
  Object.entries(result.lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]),
);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(result.lhr, null, 2)}\n`);

process.stdout.write(`lighthouse ${url}\n`);
for (const [name, score] of Object.entries(scores)) {
  const floor = FLOORS[name];
  const verdict = floor === undefined ? "     " : score >= floor ? "ok   " : "FAIL ";
  process.stdout.write(`  ${verdict}${name.padEnd(16)}${String(score).padStart(3)}${floor === undefined ? "" : `  (floor ${floor})`}\n`);
}
process.stdout.write(`  report written to ${out}\n`);

const failures = Object.entries(FLOORS).filter(([name, floor]) => (scores[name] ?? 0) < floor);
if (failures.length > 0) {
  process.stdout.write(
    `\nFAIL  ${failures.map(([n, f]) => `${n} ${scores[n]} < ${f}`).join(", ")}\n`,
  );
  process.exit(1);
}
process.stdout.write("\nOK  both A5 floors cleared\n");
