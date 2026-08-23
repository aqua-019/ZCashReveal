import { expect, test } from "@playwright/test";

/**
 * ASSERTION A3 - every chart has a table twin.
 *
 * The structure is fixed by `src/components/record/Chart.tsx`: one
 * `<figure data-chart>`, containing exactly one `<svg>` and exactly one
 * `<table>`, as siblings. This counts them per page and requires the counts to
 * match, which is what makes the assertion binary rather than a judgement about
 * whether a given chart "has" a twin somewhere on the page.
 *
 * WHY THE SCOPE IS `figure[data-chart]` AND NOT `svg`. The design system is
 * SVG-icons-only, so a bare `svg` count would sweep up every arrow and every
 * swatch and could never match a table count. The claim under test is about
 * charts - drawings that carry data - and `data-chart` is what marks one.
 *
 * The pool bar on the splash is not an SVG at all: it is a flex row of coloured
 * bands, because HANDOFF-01 lost a gate round to that bar collapsing to 2px
 * slivers when it was implemented any other way. It carries its own table twin
 * anyway, and the last test here checks it, because the contract is that a
 * reader who cannot see a picture can still read its numbers - not that the
 * picture is an `<svg>`.
 */

const CHART_ROUTES = ["/", "/beware", "/contradictions", "/timeline", "/network", "/method", "/flows"];

test.describe("A3 pass state - one svg, one table twin, per chart", () => {
  for (const route of CHART_ROUTES) {
    test(`${route}: chart svg count equals chart table count`, async ({ page }) => {
      await page.goto(route);

      const figures = page.locator("figure[data-chart]");
      const n = await figures.count();

      const svgs = await page.locator("figure[data-chart] > svg").count();
      const tables = await page.locator("figure[data-chart] > table").count();

      expect(svgs, `${route}: ${n} charts but ${svgs} svg elements`).toBe(n);
      expect(tables, `${route}: ${n} charts but ${tables} table twins`).toBe(n);
      expect(tables, `${route}: svg count and table count differ`).toBe(svgs);

      // Each twin must be a real table with a caption and headers, not an empty
      // element placed to satisfy a counter.
      for (let i = 0; i < n; i += 1) {
        const fig = figures.nth(i);
        const id = (await fig.getAttribute("data-chart")) ?? String(i);
        await expect(fig.locator("> table > caption"), `chart ${id} has a twin with no caption`).toHaveCount(1);
        expect(await fig.locator("> table th").count(), `chart ${id} has a twin with no headers`).toBeGreaterThan(0);
        expect(await fig.locator("> table tbody tr").count(), `chart ${id} has a twin with no rows`).toBeGreaterThan(0);
      }
    });
  }

  test("the twins are announced but not painted", async ({ page }) => {
    await page.goto("/timeline");
    const twin = page.locator("figure[data-chart] > table").first();
    await expect(twin).toHaveClass(/sr-only/);
    // Visually hidden, still in the accessibility tree: a `display: none` twin
    // would satisfy the count and help nobody.
    await expect(twin).toBeAttached();
    const display = await twin.evaluate((el) => getComputedStyle(el).display);
    expect(display).not.toBe("none");
  });

  test("the svg is hidden from assistive technology, because the table is the reading", async ({ page }) => {
    await page.goto("/timeline");
    const svg = page.locator("figure[data-chart] > svg").first();
    await expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  test("the splash pool bar carries a twin even though it is not an svg", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator('[data-testid="poolbar"]');
    await expect(bar).toHaveCount(1);
    // Five bands, five rows.
    expect(await bar.locator("[data-pool]").count()).toBe(5);
    const twin = page.locator("table.sr-only").filter({ hasText: "Supply by pool" });
    await expect(twin).toHaveCount(1);
    expect(await twin.locator("tbody tr").count()).toBe(5);
  });
});

test.describe("A3 fail state - the same count on a figure with its twin removed", () => {
  test("removing a twin makes the counts differ", async ({ page }) => {
    await page.goto("/timeline");

    const before = await page.locator("figure[data-chart] > table").count();
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => {
      document.querySelector("figure[data-chart] > table")?.remove();
    });

    const svgs = await page.locator("figure[data-chart] > svg").count();
    const after = await page.locator("figure[data-chart] > table").count();
    expect(after).toBe(before - 1);
    expect(after, "the counts still match after a twin was removed - the check is vacuous").not.toBe(svgs);
  });
});
