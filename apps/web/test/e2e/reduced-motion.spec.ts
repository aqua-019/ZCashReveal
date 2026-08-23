import { expect, test, type Page } from "@playwright/test";

/**
 * ASSERTION A5 - prefers-reduced-motion is honoured architecturally.
 *
 * The contract in CLAUDE.md is "do not construct animation systems", not "damp
 * them to zero". Those two are indistinguishable from the outside: a stopped
 * loop and an absent loop paint the same pixels. So src/lib/diagnostics.ts
 * exposes `window.__zr` and the ambience components report what they scheduled,
 * and this file reads the report.
 *
 * TWO POLARITIES, ONE FILE. The first describe is the pass state: reduce is
 * requested, nothing is constructed, the ceremony never fires. The second is
 * the fail state for the same checks: without the preference the rAF loop DOES
 * run and the tide DOES pulse. Without that second half, "rafCalls === 0" and
 * "the class never appears" would both be satisfied by a page that simply
 * failed to hydrate, and the assertion would be vacuous.
 *
 * A NOTE ON THE CLOCK. `page.clock.install()` is called before `goto` so the
 * Tide interval (75 s) is created against the fake clock and can be
 * fast-forwarded instead of waited out. Playwright's clock does fake the timer
 * family, but it does not *drive* requestAnimationFrame the way a real
 * compositor does - fast-forwarding is not a substitute for frames elapsing.
 * The rAF assertion therefore uses a real short wait, page.waitForTimeout(300),
 * which is served by the Playwright driver in Node and is unaffected by the
 * page's fake clock. Only the tide assertions use fastForward.
 */

/** One block interval is 75 s; 90 s is comfortably past exactly one pulse. */
const PAST_ONE_BLOCK_MS = 90_000;

interface Zr {
  readonly rafCalls: number;
  readonly tidePulses: number;
  readonly constructed: readonly string[];
  readonly refused: Readonly<Record<string, string>>;
}

/** Snapshot the diagnostics store, or null if it was never installed. */
async function readZr(page: Page): Promise<Zr | null> {
  return page.evaluate(() => (window.__zr === undefined ? null : { ...window.__zr }));
}

/** The class list of the single shell-level tide element, as an array. */
async function tideClasses(page: Page): Promise<string[]> {
  const raw = (await page.locator(".tide").getAttribute("class")) ?? "";
  return raw.split(/\s+/).filter((c) => c.length > 0);
}

test.describe("A5 pass state - reduced motion requested", () => {
  // Playwright 1.56 carries the media preference on contextOptions rather
  // than as a top-level test option, so the whole context is created with it
  // and the preference is in force before the first script runs.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no animation system is constructed and the ceremony never fires", async ({ page }) => {
    await page.clock.install();
    // The splash is the one surface carrying the fog; the tide is shell-level.
    await page.goto("/");

    // Hydration has to land before the report exists. Poll from Node rather
    // than page.waitForFunction, whose default rAF polling would itself be
    // subject to the page's fake clock.
    await expect
      .poll(async () => (await readZr(page))?.refused["FogCanvas"] ?? null, {
        message: "window.__zr.refused.FogCanvas was never set - did the page hydrate?",
        timeout: 20_000,
      })
      .not.toBeNull();

    const zr = await readZr(page);
    expect(zr, "window.__zr is missing; NEXT_PUBLIC_ENABLE_DEV_SURFACES should be on").not.toBeNull();

    const refusal = zr?.refused["FogCanvas"] ?? "";
    expect(typeof refusal, "refused.FogCanvas is not a string").toBe("string");
    expect(refusal.length, "refused.FogCanvas is empty; the refusal must carry its reason").toBeGreaterThan(0);

    expect(zr?.rafCalls, "a frame was scheduled under prefers-reduced-motion: reduce").toBe(0);
    expect(zr?.constructed ?? [], "an ambience system constructed itself under reduce").toHaveLength(0);

    // Ninety seconds of virtual time - more than one block interval - and the
    // ceremony still must not exist.
    await page.clock.fastForward(PAST_ONE_BLOCK_MS);

    expect(await tideClasses(page), "the tide applied its .on class under reduce").not.toContain("on");

    const after = await readZr(page);
    expect(after?.tidePulses, "the tide ceremony fired under reduce").toBe(0);
    expect(after?.rafCalls, "a frame was scheduled after fast-forwarding under reduce").toBe(0);
  });
});

test.describe("A5 fail state - the same checks, no preference", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the animation system IS constructed and the ceremony DOES fire", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");

    await expect
      .poll(async () => [...((await readZr(page))?.constructed ?? [])], {
        message: "FogCanvas never reported itself constructed without the preference",
        timeout: 20_000,
      })
      .toContain("FogCanvas");

    // Real elapsed time, not virtual: frames are driven by the compositor.
    await page.waitForTimeout(300);

    const zr = await readZr(page);
    expect(zr?.rafCalls, "no frame was scheduled without the preference").toBeGreaterThan(0);
    expect(zr?.refused["FogCanvas"], "FogCanvas refused to construct without the preference").toBeUndefined();

    await page.clock.fastForward(PAST_ONE_BLOCK_MS);

    const after = await readZr(page);
    expect(after?.tidePulses, "the block-arrival ceremony did not fire without the preference").toBeGreaterThanOrEqual(1);

    await expect
      .poll(() => tideClasses(page), { message: "the tide never applied its .on class", timeout: 10_000 })
      .toContain("on");
  });
});
