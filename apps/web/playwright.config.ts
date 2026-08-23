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
 * Two build-time variables in `webServer.env` carry the suite. Both are read by
 * src/lib/env.ts at build time, and they do different jobs:
 * NEXT_PUBLIC_DATA_MODE=fixture pins the page to committed sample values so no
 * assertion depends on a live feed, and NEXT_PUBLIC_ENABLE_DEV_SURFACES=1 is
 * the explicit opt-in that makes DEV_SURFACES true in a production build -
 * which is what makes `/dev/primitives` reachable (A4) and `window.__zr`
 * installed (A5). The switch is deliberately its own variable rather than a
 * side effect of the data mode: a deployment that forgot a Vercel setting must
 * not be able to publish the gallery by accident. Nothing outside this file
 * sets it.
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
    // Never reuse. The usual `reuseExistingServer: !CI` is a trap here, because
    // this command BUILDS before it serves: a reused server keeps answering
    // from whatever was compiled last time, so an edit under src/ is invisible
    // and the suite reports a pass for code that is not on disk. Found while
    // collecting the A4 fail-state transcript - deleting a primitive from the
    // gallery still passed against the stale server. Rebuilding every run costs
    // about thirty seconds and is what makes the gate mean anything.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_DATA_MODE: "fixture",
      // The only place this is ever set. It is what makes /dev/primitives
      // reachable (A4) and window.__zr installed (A5) in a PRODUCTION build,
      // so those assertions test shipped output. Never set on Vercel.
      NEXT_PUBLIC_ENABLE_DEV_SURFACES: "1",
    },
  },
});
