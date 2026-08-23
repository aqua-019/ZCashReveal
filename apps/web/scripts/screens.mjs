#!/usr/bin/env node
/**
 * HANDOFF-03 deliverable 10 - the Record's screens, captured at 1440px.
 *
 * Writes docs/2.0/screens/record-<route>.png for every Record surface, against a
 * PRODUCTION build served by `next start`. The fonts are vendored as of
 * HANDOFF-03 deliverable 1, so these render with the real type with no network
 * access at all - the earlier caveat about running this "where Google Fonts
 * load" no longer applies to anything.
 *
 * Reduced motion is requested for every capture. The Record is zero-motion by
 * design (assertion A6), and asking for it means the splash's fog and tide are
 * never mid-frame when the shutter falls, so a re-run produces the same bytes
 * for the same build rather than a different cloud of motes.
 *
 * Usage:
 *   node apps/web/scripts/screens.mjs [baseUrl]
 * Default base: http://127.0.0.1:3311
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const OUT = join(REPO, "docs", "2.0", "screens");

const base = process.argv[2] ?? "http://127.0.0.1:3311";

/** The Record surfaces. The Instrument (/track) belongs to HANDOFF-04. */
const SCREENS = [
  { route: "/", name: "record-00-splash" },
  { route: "/beware", name: "record-01-beware" },
  { route: "/contradictions", name: "record-02-contradictions" },
  { route: "/timeline", name: "record-03-timeline" },
  { route: "/network", name: "record-04-network" },
  { route: "/method", name: "record-05-method" },
  { route: "/flows", name: "record-06-flows" },
  { route: "/sources", name: "record-07-sources" },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ chromiumSandbox: false });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const page = await context.newPage();

let failed = 0;
for (const { route, name } of SCREENS) {
  const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  const status = response?.status() ?? 0;
  if (status !== 200) {
    process.stdout.write(`  FAIL ${route.padEnd(18)} ${status}\n`);
    failed += 1;
    continue;
  }
  // The fonts are local, so this resolves immediately; it is here so a capture
  // can never land during the swap and ship a screenshot of the fallback stack.
  await page.evaluate(() => document.fonts.ready);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  process.stdout.write(`  ok   ${route.padEnd(18)} ${name}.png\n`);
}

await browser.close();

if (failed > 0) {
  process.stdout.write(`\nFAIL  ${failed} route(s) did not answer 200\n`);
  process.exit(1);
}
process.stdout.write(`\nOK  ${SCREENS.length} screens written to docs/2.0/screens\n`);
