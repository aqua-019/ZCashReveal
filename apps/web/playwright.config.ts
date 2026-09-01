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

/**
 * ONE PRODUCTION BUILD, AND THE SECOND ONE WAS BUILT, MEASURED AND REMOVED.
 *
 * Three of HANDOFF-11's assertions are about the RESOLUTION ORDER - A3 ("with a
 * mocked REST endpoint returning a valid SnapshotV1 ... /pools renders the
 * mocked snapshot's balances"), A2 ("snapshot mode with the API unreachable")
 * and A9's fail side - and none is observable on a build that resolved to the
 * fixture. So a second `webServer` was added: its own port, its own `distDir`,
 * managed-store credentials pointed at `test/e2e/support/mock-store.mjs`, and a
 * gateway URL on a closed port.
 *
 * IT WAS REMOVED BECAUSE OF WHAT NEXT DOES TO A TRACKED FILE. Building with a
 * custom `distDir` makes Next REWRITE `apps/web/tsconfig.json`, appending
 * `<distDir>/types/**\/*.ts` to its `include`. Two consequences, and the second
 * is the disqualifying one:
 *
 *   1. tsc then type-checks the route validators in BOTH output directories.
 *      They disagree whenever the two builds are not in lockstep, and the
 *      failure surfaces as a type error in a route file nobody touched:
 *      `"COLLECTION_NAMES" is not a valid Route export field` in
 *      `src/app/api/content/[collection]/route.ts`. Measured: a clean build with
 *      the committed tsconfig passes and leaves the file unmodified; the same
 *      build after one custom-distDir run fails.
 *   2. **A test run would dirty the working tree.** A suite that edits a
 *      tracked file as a side effect is a suite whose output a session must
 *      then sweep out of its own commit, and this project's post-fan-out rule
 *      exists because carrying such a write forward has cost it twice.
 *
 * WHAT COVERS THOSE ASSERTIONS INSTEAD. The store's four rungs, its fault
 * record and its read count are `test/unit/snapshot-store.test.ts` - thirteen
 * cases against a mocked REST endpoint, asserted BY VALUE (the document's
 * height, the bearer token actually sent, the key actually requested) rather
 * than by the indicator's own say-so. The rendered affordances are
 * `test/unit/status-affordances.test.tsx`. What this file still proves against
 * a real production build is everything a fixture build can prove, which is
 * most of it - and section 7 says which legs are unit-level and why.
 *
 * `support/mock-store.mjs` IS KEPT AND HAS A REAL CONSUMER. It is not started by
 * this config any more - a server nothing connects to is a probe that proves
 * nothing, which this project counts as a finding in its own right. It is
 * driven instead by `test/unit/snapshot-store.integration.test.ts`, over a real
 * socket, which is a stronger leg than the mocked `fetch` beside it: the URL
 * this build constructs, the bearer header it actually sends and the key it
 * actually asks for are all observed by the server rather than by a spy. That
 * is also what makes A9's
 * fail side runnable at all: that assertion's own wording says "remove the
 * blanking and watch the indicator read `source: redis-rest`", which is only
 * reachable on a machine holding the real credentials - and running it there IS
 * the read `docs/2.0/SNAPSHOT.md` rule 5 forbids, against a store shared with
 * another project's production. The mock is the address that discriminates
 * identically and touches nothing shared.
 */
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
  webServer: [
    {
      // `rm -rf .next` first. NEXT_PUBLIC_* values are inlined at BUILD time, so a
      // `.next` left over from a build with different env (a plain `pnpm build`,
      // say) can be reused and the suite then measures the wrong configuration:
      // observed as /dev/primitives answering 404 under a run whose webServer env
      // sets NEXT_PUBLIC_ENABLE_DEV_SURFACES=1. Only generated output is removed,
      // and a cold build costs about ten seconds.
      command: `rm -rf .next && pnpm build && pnpm start --port ${PORT}`,
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

        /*
         * THE MANAGED STORE IS BLANKED FOR THIS BUILD, DELIBERATELY.
         *
         * docs/2.0/SNAPSHOT.md rule 5 says tests, local development and BUILDS never
         * point at the Vercel-managed Redis, because it is shared with an unrelated
         * production project. This is the one config in the repository that starts a
         * real Next.js build, so it is the one place where that rule needs a
         * mechanism rather than a promise: a developer or a CI runner with the five
         * variables in its ambient environment would otherwise produce a build whose
         * SnapshotStore resolves to `redis-rest` and reads the live shared store on
         * every render of the suite.
         *
         * Empty strings rather than `undefined`, because Playwright merges this over
         * process.env and only a present-but-empty value reliably overrides an
         * inherited one. HANDOFF-11's resolution order treats empty as absent and
         * falls through to the bundled fixture, which is what an e2e run should read.
         */
        SNAPSHOT_REDIS_KV_REST_API_URL: "",
        SNAPSHOT_REDIS_KV_REST_API_TOKEN: "",
        SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN: "",
        SNAPSHOT_REDIS_KV_URL: "",
        SNAPSHOT_REDIS_REDIS_URL: "",
      },
    },

  ],
});