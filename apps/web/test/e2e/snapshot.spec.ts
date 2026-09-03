import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { NAV_ENTRIES } from "@/lib/nav";

/**
 * HANDOFF-11's live wiring, against two real production builds.
 *
 * THE FIXTURE BUILD (the suite's `baseURL`) and THE SNAPSHOT BUILD - the second
 * `webServer` in `playwright.config.ts`, whose managed-store credentials point
 * at `support/mock-store.mjs` and whose gateway URL points at a closed port.
 * The second exists because three of this handoff's assertions are about the
 * RESOLUTION ORDER and none of them can be observed on a build that resolved to
 * the fixture.
 *
 * The mock is not the real store, and that is rule 5 of `docs/2.0/SNAPSHOT.md`
 * rather than convenience: the managed Redis is shared with an unrelated
 * production project, and a Playwright run against it is the mistake section
 * 4.5 forbids by name.
 */

/** Every route the system bar renders on. Eleven since HANDOFF-04a, not the nine of 22 Aug. */
const ROUTES = NAV_ENTRIES.map((s) => s.href);

test.describe("A2/A13 - the staleness indicator, on every route", () => {
  test("PASS STATE: the fixture build reads `source: fixture` with no fault, on all eleven routes", async ({ page }) => {
    // A9's second half, and the half this handoff owes: the config blanking is
    // shipped, and this is the assertion that it WORKED. A build started with a
    // populated ambient environment must still resolve to the bundled document.
    expect(ROUTES.length).toBe(11);
    for (const route of ROUTES) {
      await page.goto(route);
      const stale = page.locator('[data-ui="staleness"]');
      await expect(stale, route).toHaveCount(1);
      await expect(stale, route).toHaveAttribute("data-source", "fixture");
      await expect(stale, route).toHaveAttribute("data-faults", "0");
      // `unknown`, NOT A DIGIT, AND THIS ASSERTION USED TO SAY THE OPPOSITE
      // (HANDOFF-14 deliverable 4). It required `/snapshot age: [\d,]+ blocks?/`
      // on a FIXTURE build - which is to say it required the page to print a
      // number for a quantity it cannot measure, and passed because the number
      // was structurally zero.
      //
      // THE DIGIT RULE IS UNCHANGED FOR A MEASUREMENT AND IS ASSERTED AT UNIT
      // LEVEL, NOT ON A SECOND BUILD HERE. There is no second `webServer` in
      // this file - the note below records that one was written and removed
      // because a custom `distDir` rewrites the tracked tsconfig - so the
      // measured case lives in `test/unit/status-affordances.test.tsx` (a
      // `redis-rest`, `redis` or `gateway` document reads `0 blocks`; a fixture
      // reads a number as soon as a frame arrives) and in
      // `test/unit/format.test.ts` (the regex, at every known age).
      await expect(stale, route).toHaveAttribute("data-age", "unknown");
      await expect(stale, route).toContainText("snapshot age: unknown");
      await expect(stale, route).not.toContainText(/snapshot age: [\d,]+ blocks?/);
    }
  });

  test("PASS STATE: the indicator is inside the system bar, which is where fold 2 puts it", async ({ page }) => {
    await page.goto("/");
    // A property of the DOCUMENT, not of any panel, and the bar is the one
    // surface every route carries.
    await expect(page.locator('[data-ui="sysbar"] [data-ui="staleness"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="epochclock"] [data-ui="staleness"]')).toHaveCount(1);
  });

  test("FAIL STATE, BY DATA: the string the shipped code rendered before this handoff does not satisfy the check", async ({ page }) => {
    // `fmtBlockAge` returned `tip` at a zero age - a string with no digit in it
    // - and that is the member of A2's exclusion set the fail side names. The
    // page is asserted NOT to render it, so the check discriminates on the
    // value rather than on the element's existence.
    await page.goto("/");
    const text = (await page.locator('[data-ui="staleness"]').innerText()).trim();
    // ON A FIXTURE BUILD THE AGE IS `unknown`, so the digit half of A2's check
    // is made where there IS a measurement - the unit cases named above, not a
    // second build in this file. What is still asserted here, unchanged, is
    // that neither string A2 excludes is rendered, which is what this case was
    // written to discriminate.
    expect(text).toContain("snapshot age: unknown");
    expect(text).not.toMatch(/^tip\b/);
    expect(text).not.toMatch(/blocks behind/);
    // AND THE FALSE ZERO IS NAMED AS AN EXCLUDED VALUE IN ITS OWN RIGHT. It is
    // the string this build actually rendered until HANDOFF-14, and a check that
    // did not name it would go green again the moment the unknown regressed.
    expect(text).not.toContain("snapshot age: 0 blocks");
  });
});

/*
 * A3, A7 AND A2's "API UNREACHABLE" LEG ARE NOT HERE, AND WHERE THEY WENT IS
 * RECORDED RATHER THAN LEFT TO BE NOTICED.
 *
 * All three describe a build whose managed-store credentials are SET and whose
 * gateway is not answering, and none is observable on a build that resolved to
 * the fixture. A second `webServer` with its own `distDir` was written, run and
 * removed: building with a custom `distDir` makes Next REWRITE the tracked
 * `apps/web/tsconfig.json`, after which tsc type-checks the route validators in
 * both output directories and a clean build fails in a route file nobody
 * touched. A suite that dirties the working tree as a side effect is worse than
 * the coverage it buys. `playwright.config.ts` carries the measurement.
 *
 * They are covered instead where they are decidable without a second build:
 *   - `test/unit/snapshot-store.test.ts` - thirteen cases over the four rungs,
 *     asserted by VALUE (which document, which key, which bearer token);
 *   - `test/unit/snapshot-store.integration.test.ts` - the same rung against a
 *     real listening server, so the URL, the header and the key are observed by
 *     the server rather than by a spy;
 *   - `test/unit/status-affordances.test.tsx` - the rendered indicator, the
 *     named fault, the UNVERIFIED chip and its collapse rule.
 * Section 7 states which legs are unit-level and why.
 */

test.describe("A4 - no managed-store variable reaches the browser", () => {
  test("PASS STATE: the built client bundle carries no managed-store name and no token value", async () => {
    // WEAKER THAN IT LOOKS, AND SAYING SO IS THE POINT. This build blanks all
    // five variables in `webServer.env`, so nothing could have been inlined
    // from them and the grep is close to true by construction. What makes A4
    // meaningful is `test/unit/client-graph.test.ts`, which walks the import
    // graph from every `'use client'` entry and proves the store module is
    // unreachable from all of them - a property of the CODE rather than of one
    // build's environment. This leg is the artefact-level backstop.
    const dir = resolve(process.cwd(), ".next", "static");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(dir);
    // The walker is checked against a member already known to be in the set,
    // because an empty file list satisfies every grep below.
    expect(files.length, "the built client bundle is not empty").toBeGreaterThan(5);

    const needle = ["SNAPSHOT", "REDIS"].join("_");
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(offenders).toEqual([]);
    // The token VALUE, not only the variable name - the mock's token is the one
    // value a misconfigured run could plausibly have inlined.
    const leaked = files.filter((f) => readFileSync(f, "utf8").includes("e2e-read-only-token"));
    expect(leaked, "no token value may reach the browser").toEqual([]);
  });

  test("A8 PASS STATE: the same bundle DOES carry the snapshot fallback marker", async () => {
    // The pair of constraints A8 and A4 impose together: the marker must reach
    // `.next/static` - it is what the post-deploy job greps - while no
    // credential may. So the marker lives in the client-visible fallback branch
    // and the credentials in a module the client graph never imports.
    const dir = resolve(process.cwd(), ".next", "static");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const full = join(d, name);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(dir);
    const carrying = files.filter((f) => readFileSync(f, "utf8").includes("zr:snapshot-fallback:v1"));
    expect(carrying.length, "the marker must be in the built client bundle").toBeGreaterThan(0);
  });
});

test.describe("A1 - no page error on any of the eleven routes, and the Record still renders its claim", () => {
  test("PASS STATE: every route loads with an empty console and no page error", async ({ page }) => {
    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") failures.push(`console: ${m.text()}`);
    });
    for (const route of ROUTES) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(200);
    }
    expect(failures).toEqual([]);
  });

  test("PASS STATE: /track renders at least one mempool row", async ({ page }) => {
    await page.goto("/track");
    const rows = page.locator('[data-ui="mempool-row"], table tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });
});

test.describe("A8 - the post-deploy smoke script, in both polarities", () => {
  /**
   * THE SCRIPT THAT CHECKS THE DEPLOYED BUNDLE, CHECKED HERE.
   *
   * `.github/workflows/post-deploy-smoke.yml` runs
   * `scripts/post-deploy-smoke.mjs` against the URL Vercel reports when a
   * production deployment finishes. **Nobody in this repository can watch that
   * happen**: no session can reach a preview or production host (LEDGER-04 Q3),
   * so the job's only execution would be somewhere none of us can see - which
   * is a check shipped unproven, and this project has a rule about those.
   *
   * The script takes a base URL for exactly that reason. Pointed at the
   * production build this suite already serves, it exercises every line of
   * itself against a real server and a real bundle.
   */
  const run = async (url: string) => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("node", ["../../scripts/post-deploy-smoke.mjs", url], { encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  test("PASS STATE: it passes against this build, and says what it read", async () => {
    const { code, out } = await run("http://127.0.0.1:3210");
    expect(out).toContain("post-deploy-smoke: OK");
    expect(out).toMatch(/\d+ script\(s\) fetched/);
    expect(code).toBe(0);
  });

  test("FAIL STATE, BY DATA: a page that loads no script is a FAILURE, not a pass", async () => {
    // The member of the exclusion set that matters most, because it is the one
    // a broken check produces silently: if the script cannot enumerate the
    // page's scripts it finds no marker, and "no marker" and "could not look"
    // are the same output unless the instrument says otherwise. `/beware.xml`
    // is a real route on this server that serves RSS and loads no script.
    const { code, out } = await run("http://127.0.0.1:3210/beware.xml");
    expect(code).toBe(1);
    expect(out).toContain("loaded no script at all");
  });

  test("FAIL STATE, BY DATA: an unreachable host fails rather than passing quietly", async () => {
    const { code, out } = await run("http://127.0.0.1:9");
    expect(code).not.toBe(0);
    expect(out).toContain("post-deploy-smoke");
  });
});
