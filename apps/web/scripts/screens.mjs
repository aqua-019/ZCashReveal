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

/** The Record surfaces, then the Instrument's - HANDOFF-04 deliverable 8. */
const SCREENS = [
  { route: "/", name: "record-00-splash" },
  { route: "/beware", name: "record-01-beware" },
  { route: "/contradictions", name: "record-02-contradictions" },
  { route: "/timeline", name: "record-03-timeline" },
  { route: "/network", name: "record-04-network" },
  { route: "/method", name: "record-05-method" },
  { route: "/flows", name: "record-06-flows" },
  { route: "/sources", name: "record-07-sources" },
  // The Tracking suite. `track-` rather than `record-`, because these are the
  // Instrument: they read a chain rather than a corpus, and the mempool one
  // carries a live panel whose badge is part of what the screenshot is for.
  { route: "/track", name: "track-00-search" },
  { route: "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo", name: "track-01-address" },
  { route: "/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c", name: "track-02-tx" },
  { route: "/block/3191051", name: "track-03-block" },
  { route: "/pools", name: "track-04-pools" },
  {
    route:
      "/reveal?addr=u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kdvtd8dmk6vc3dnr7tqkmrpt7gqr7a5u",
    name: "track-05-reveal",
  },
  { route: "/track/flows", name: "track-06-flows" },
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
