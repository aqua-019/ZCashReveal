/**
 * A9 - the `globals.css` de-duplication pass changed no pixel.
 *
 * HANDOFF-03 folded four route stylesheets into `globals.css` to buy back a
 * render-blocking request, and the fold made three duplications visible in one
 * file for the first time: three preformatted-mono treatments, two compact-cell
 * registers, and seven card insets that should have been sitting on the
 * five-step inset ladder. LEDGER-03 Q5 assigns the collapse to the START of
 * this handoff, before the tracking CSS is written, because 04 adds the largest
 * CSS surface in the project.
 *
 * A refactor of a stylesheet is only safe if it is provably invisible. So the
 * baselines committed beside this file were captured on the PRE-PASS tree
 * (commit cdbd858, the RECONCILE commit, before a single declaration moved) and
 * the pass is required to reproduce them byte-for-byte.
 *
 * `maxDiffPixels: 0` is deliberate and is the whole point: a tolerance would
 * let a one-pixel inset change through, and a one-pixel inset change is exactly
 * the defect this assertion exists to catch. `animations: "disabled"` freezes
 * the two ambience layers; neither Record page runs the block-arrival ceremony
 * (it is scoped to `/`), so there is nothing else in motion to settle.
 *
 * `/beware` and `/flows` are named by the assertion because between them they
 * use every one of the collapsed patterns: /beware carries the deep dive's
 * preformatted blocks and the citation disclosures, /flows carries the ledger
 * lines, the compact cells and the widest span of card insets.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/beware", "/flows"] as const;

for (const path of PAGES) {
  test(`A9: ${path} renders identically to the pre-pass baseline`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(path, { waitUntil: "networkidle" });

    // The epoch clock advances its height on a 75 s interval, so a screenshot
    // taken promptly after load is stable. Waiting on the wordmark rather than
    // on a timeout keeps that true without pinning a duration.
    await page.locator("[data-ui='sysbar']").first().waitFor({ state: "visible" });

    await expect(page).toHaveScreenshot(`${path.slice(1)}-full.png`, {
      fullPage: true,
      animations: "disabled",
      maxDiffPixels: 0,
    });

    expect(errors, `console errors on ${path}`).toEqual([]);
  });
}
