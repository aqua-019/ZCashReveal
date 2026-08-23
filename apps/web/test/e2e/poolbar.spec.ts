import { expect, test } from "@playwright/test";

/**
 * Regression guard for the splash pool bar.
 *
 * Not one of the section 5 assertions - it exists because the bar shipped
 * broken once and nothing caught it. Wrapping each segment in <Tooltip> put a
 * shrink-to-fit span between the flex container and the sized element, so the
 * percentage width resolved against a zero-width box and all five pools
 * rendered as identical 2px slivers: transparent at 74 per cent of supply drawn
 * the same size as sprout at 0.13 per cent. The build passed, the types passed,
 * every assertion passed, and the primary data visualisation on the landing
 * page was meaningless.
 *
 * A stacked bar whose segments are not proportional is worse than no bar. This
 * measures the rendered geometry rather than the markup.
 */

/** Fixture pool balances in ZEC, from src/app/page.tsx. */
const POOL_ZEC: Record<string, number> = {
  transparent: 12_500_223,
  sprout: 22_621,
  sapling: 529_015,
  orchard: 708_841,
  ironwood: 3_129_287,
};
const SUPPLY = Object.values(POOL_ZEC).reduce((a, b) => a + b, 0);

test.describe("splash pool bar", () => {
  test("segment widths are proportional to pool balances", async ({ page }) => {
    await page.goto("/");

    const bar = page.getByTestId("poolbar");
    await expect(bar).toBeVisible();

    const barBox = await bar.boundingBox();
    expect(barBox, "the pool bar has no layout box").not.toBeNull();
    const barWidth = barBox?.width ?? 0;
    expect(barWidth, "the pool bar is too narrow to measure").toBeGreaterThan(400);

    const segments = bar.locator(".seg");
    await expect(segments).toHaveCount(5);

    for (const [pool, zec] of Object.entries(POOL_ZEC)) {
      const seg = bar.locator(`.seg[data-pool="${pool}"]`);
      const box = await seg.boundingBox();
      expect(box, `${pool} segment has no layout box`).not.toBeNull();

      const actualShare = (box?.width ?? 0) / barWidth;
      const expectedShare = zec / SUPPLY;

      // Two percentage points of slack absorbs the 2px gaps between segments
      // and the min-width floor on the smallest pool.
      expect(
        Math.abs(actualShare - expectedShare),
        `${pool}: rendered ${(actualShare * 100).toFixed(2)}% of the bar, expected ${(expectedShare * 100).toFixed(2)}%`,
      ).toBeLessThan(0.02);
    }
  });

  test("the largest pool is drawn far wider than the smallest", async ({ page }) => {
    // The collapse failure made every segment the same width, so a ratio test
    // catches it even if the tolerance above is ever loosened.
    await page.goto("/");
    const bar = page.getByTestId("poolbar");
    const transparent = await bar.locator('.seg[data-pool="transparent"]').boundingBox();
    const sprout = await bar.locator('.seg[data-pool="sprout"]').boundingBox();

    expect(transparent?.width ?? 0).toBeGreaterThan((sprout?.width ?? 0) * 50);
  });
});
