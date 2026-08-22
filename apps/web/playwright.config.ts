import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for @zcashreveal/web.
 *
 * The suite runs against a PRODUCTION build, not `next dev`. Assertions A4-A7
 * are claims about shipped output: a dev bundle carries extra hydration
 * scaffolding, unminified class names and React's development warnings, so a
 * pass there would not be a pass for the artefact a reviewer actually loads.
 * `webServer.command` therefore builds first and then serves.
 *
 * NEXT_PUBLIC_DATA_MODE=fixture is the load-bearing part of `webServer.env`.
 * It is read at build time (src/lib/env.ts) and it is what makes DEV_SURFACES
 * true in a production build, which in turn is what makes `/dev/primitives`
 * reachable (A4) and `window.__zr` installed (A5). A deployed site sets
 * snapshot or live, and both of those surfaces disappear.
 *
 * Serial, single worker, no retries: A5 and A6 assert on a shared browser
 * clock and on CSS :hover state, and A7 counts headings. A retry that hides an
 * intermittent failure here would be hiding exactly the kind of defect these
 * assertions exist to catch.
 *
 * Browsers are pre-installed at PLAYWRIGHT_BROWSERS_PATH. No executablePath is
 * set and `playwright install` is never invoked.
 */

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  forbidOnly: process.env.CI !== undefined,
  // A5 waits on hydration before reading the diagnostics store; 60 s leaves
  // room for that on a cold first paint without masking a hang.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 240_000,
    env: { NEXT_PUBLIC_DATA_MODE: "fixture" },
  },
});
