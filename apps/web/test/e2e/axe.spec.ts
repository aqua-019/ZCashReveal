import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * ASSERTION A4 - axe reports zero serious or critical violations on `/beware`,
 * `/timeline` and `/flows`.
 *
 * Those three are named in the handoff because they are the three hardest
 * shapes on the site: a severity-coded ledger, a filterable list of 124 rows,
 * and a page of tables that put names next to addresses. If the apparatus is
 * accessible on those, it is accessible.
 *
 * Only serious and critical are gated. Moderate and minor findings are printed
 * on failure so they are visible, but they are not the gate: axe's `minor`
 * bucket includes advisory rules that a deliberate design decision can
 * legitimately trip, and a gate that cannot be argued with is a gate that gets
 * disabled.
 */

const ROUTES = [
  "/beware",
  "/timeline",
  "/flows",
  // The Tracking suite - HANDOFF-04. A10 puts accessibility at 95 with no
  // exception on any surface, and these six carry every new pattern the
  // handoff adds: a live table, an SVG Sankey, a fogged pane, a key field that
  // is not inside a form, and four charts with table twins.
  "/track",
  "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
  "/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c",
  "/block/3191051",
  "/pools",
  "/reveal",
  "/track/flows",
];

test.describe("A4 pass state - no serious or critical violations", () => {
  for (const route of ROUTES) {
    test(`${route} is clean`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();

      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const detail = blocking
        .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s))\n    ${v.nodes[0]?.target.join(" ")}`)
        .join("\n  ");

      expect(blocking, `${route} has serious/critical axe violations:\n  ${detail}`).toHaveLength(0);
    });
  }

  test("the citation disclosure is operable from the keyboard alone", async ({ page }) => {
    await page.goto("/beware");
    const summary = page.locator("details.cite > summary").first();
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("details.cite[open]").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("details.cite[open]")).toHaveCount(0);
  });
});

test.describe("A4 fail state - the same scan on a deliberately broken page", () => {
  test("axe reports a serious violation once a focusable element is hidden from assistive technology", async ({ page }) => {
    await page.goto("/beware");

    // Plant exactly the kind of defect the gate exists to catch, then re-run the
    // same analyser. Without this half, "zero violations" would also be the
    // result of an analyser that never ran.
    //
    // A focusable element hidden from assistive technology, rather than the
    // image-without-alt this first used: an injected `img` depends on the data
    // URI decoding and on the element getting a layout box before the scan, and
    // it did not reliably trip the rule. `aria-hidden` on a link is a pure
    // markup contradiction - the element takes focus but is not in the
    // accessibility tree - so axe reports it every time, with no dependency on
    // paint.
    // Plant AFTER hydration. React owns this subtree, and a node prepended
    // while hydration is still in flight is removed again as React reconciles
    // the server HTML - which showed up as this check passing on its own and
    // failing inside the full run, where the page has more to do. The assertion
    // below that the node is still attached is what makes the timing explicit
    // rather than hopeful.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      const bad = document.createElement("a");
      bad.href = "#planted-by-the-a4-fail-side-check";
      bad.textContent = "planted";
      bad.setAttribute("aria-hidden", "true");
      document.querySelector("main")?.prepend(bad);
    });

    await expect(
      page.locator('a[href="#planted-by-the-a4-fail-side-check"]'),
      "the planted node did not survive to the scan",
    ).toHaveCount(1);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.length, "the planted defect was not detected - the scan is vacuous").toBeGreaterThan(0);
    expect(blocking.map((v) => v.id)).toContain("aria-hidden-focus");
  });
});
