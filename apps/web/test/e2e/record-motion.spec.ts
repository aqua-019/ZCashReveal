import { expect, test, type Page } from "@playwright/test";

/**
 * ASSERTION A6 - a Record page registers no animations under reduced motion.
 *
 * `document.getAnimations()` returns every CSSAnimation, CSSTransition and
 * script-driven animation currently registered on the document. On a Record
 * page it must be empty after load, with `prefers-reduced-motion: reduce` in
 * force. That is a stronger and more literal claim than "we damped the
 * ambience": it says the page did not build one.
 *
 * THE SPLASH IS EXCLUDED, deliberately and by the handoff's own words ("Record
 * pages (not /)"). The splash carries the fog and the tide, which are the one
 * ceremony the design system allows. Assertion A5 of HANDOFF-01 already governs
 * their behaviour under the same preference, from the other direction: the
 * components refuse to construct rather than running damped.
 *
 * The fail state re-runs the identical check after injecting a keyframe
 * animation. Without it, "getAnimations() is empty" would also be the result of
 * a page that failed to load.
 */

const RECORD_ROUTES = ["/beware", "/contradictions", "/timeline", "/network", "/method", "/flows", "/sources"];

async function animationCount(page: Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().length);
}

test.describe("A6 pass state - reduced motion, no animations registered", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  for (const route of RECORD_ROUTES) {
    test(`${route} registers no animations`, async ({ page }) => {
      await page.goto(route);
      // Settle: a transition registered during hydration would still be running
      // for its duration, and the longest declared duration on the site is 500ms.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(700);

      const running = await page.evaluate(() =>
        document.getAnimations().map((a) => {
          const target = (a as unknown as { effect?: { target?: Element | null } }).effect?.target;
          return `${a.constructor.name} on ${target?.tagName ?? "?"}.${target?.className ?? ""}`;
        }),
      );

      expect(running, `${route} registered animations: ${running.join(", ")}`).toHaveLength(0);
    });
  }

  test("the shell's tide is not merely stopped, it is not painted", async ({ page }) => {
    await page.goto("/beware");
    const display = await page.locator(".tide").evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe("none");
  });
});

test.describe("A6 fail state - the same check catches a planted animation", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("injecting a keyframe animation makes getAnimations non-empty", async ({ page }) => {
    await page.goto("/beware");
    await page.waitForTimeout(700);
    expect(await animationCount(page)).toBe(0);

    await page.evaluate(() => {
      const el = document.querySelector("main");
      // Web Animations API, so the global reduced-motion CSS override in
      // globals.css cannot suppress it: the point is to prove the check reads
      // the real registry, not that CSS can be defeated.
      el?.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 60_000, iterations: Infinity });
    });

    expect(await animationCount(page), "the planted animation was not seen - the check is vacuous").toBeGreaterThan(0);
  });
});

test.describe("A6 context - the splash is the one surface that may animate", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("without the preference, / does construct its ceremony and a Record page still does not", async ({ page }) => {
    await page.goto("/beware");
    await page.waitForTimeout(700);
    expect(await animationCount(page), "a Record page animated even without the preference").toBe(0);

    // The splash's fog is a canvas rAF loop rather than a registered animation,
    // so this asserts the architectural report HANDOFF-01 built for exactly this
    // question rather than re-reading getAnimations.
    await page.goto("/");
    await expect
      .poll(async () => page.evaluate(() => [...(window.__zr?.constructed ?? [])]), { timeout: 20_000 })
      .toContain("FogCanvas");
  });
});
