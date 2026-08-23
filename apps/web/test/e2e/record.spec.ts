import { expect, test, type Page } from "@playwright/test";

import { getBeware, getContradictions, getNetwork, getSources, getTimeline } from "@zcashreveal/content";

/**
 * ASSERTIONS A1 and A2 - the Record renders, and its permalinks resolve.
 *
 * A1: all eight routes answer 200 from `next start`, and each page's first
 * claim id is present in the HTML. The expected ids are DERIVED FROM THE
 * CONTENT PACKAGE rather than typed here, which is deliberate and is not the
 * tautology the route walk in routes.spec.ts warns about: the content package
 * is the data source, and the claim under test is that the page renders it. A
 * page that silently stopped rendering its first entry would pass a hand-typed
 * list only if someone remembered to edit the list too.
 *
 * A2: `/beware#B2` scrolls to an element with `id="B2"` containing the text
 * `CVE-2026-54496`. Both halves matter. The id must exist as a scroll target,
 * and the element it names must actually carry the CVE - an anchor that lands
 * on an empty div is a permalink that has stopped meaning anything.
 */

/** The eight Record routes, and the first claim each one must render. */
function expectations(): readonly { readonly route: string; readonly firstClaimId: string }[] {
  const network = getNetwork();
  return [
    // The splash renders the two-windows diagram, drawn from B1 and B2.
    { route: "/", firstClaimId: "B1" },
    { route: "/beware", firstClaimId: getBeware()[0]?.id ?? "B1" },
    { route: "/contradictions", firstClaimId: getContradictions()[0]?.id ?? "C1" },
    { route: "/timeline", firstClaimId: getTimeline()[0]?.id ?? "" },
    { route: "/network", firstClaimId: network.entities[0]?.id ?? "" },
    { route: "/method", firstClaimId: "" },
    { route: "/flows", firstClaimId: "" },
    { route: "/sources", firstClaimId: getSources()[0]?.id ?? "" },
  ];
}

/** Every claim on every Record page carries a citation disclosure. */
async function citeCount(page: Page): Promise<number> {
  return page.locator("details.cite").count();
}

test.describe("A1 pass state - the eight Record routes", () => {
  for (const { route, firstClaimId } of expectations()) {
    test(`${route} answers 200 and renders its claims`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response, `no response for ${route}`).not.toBeNull();
      expect(response?.status(), `${route} did not answer 200`).toBe(200);

      await expect(page.locator("h1"), `${route} does not have exactly one h1`).toHaveCount(1);

      // Every Record surface carries at least one citable claim. A page with
      // none is a page asserting things with no apparatus behind them, which is
      // the failure this whole site exists to argue against.
      expect(await citeCount(page), `${route} renders no citation apparatus at all`).toBeGreaterThan(0);

      if (firstClaimId !== "") {
        const html = await page.content();
        expect(html.includes(firstClaimId), `${route} does not mention its first claim id ${firstClaimId}`).toBe(true);
      }
    });
  }

  test("the exports answer 200 too", async ({ request }) => {
    for (const path of ["/beware.xml", "/api/content/beware.json", "/api/content/stats.json"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} did not answer 200`).toBe(200);
    }
  });
});

test.describe("A1 fail state - the same check on a route that does not exist", () => {
  test("an unknown route answers 404 and the check would fail on it", async ({ page }) => {
    const response = await page.goto("/beware-but-misspelled");
    expect(response?.status()).toBe(404);
    // And it carries no claim apparatus, which is the property A1 measures.
    expect(await citeCount(page)).toBe(0);
  });
});

test.describe("A2 pass state - /beware#B2", () => {
  test("the fragment resolves to an element carrying the CVE", async ({ page }) => {
    await page.goto("/beware#B2");

    const target = page.locator("#B2");
    await expect(target, "no element with id B2 on /beware").toHaveCount(1);
    await expect(target, "the element at #B2 does not carry the CVE").toContainText("CVE-2026-54496");

    // The fragment must actually bring it into view. The shell's system bar is
    // fixed, so `scroll-margin-top` is what makes this true rather than the
    // heading landing underneath the bar.
    await expect(target).toBeInViewport();
  });

  test("B2 is a claim, not just an anchor: it carries its confidence and its sources", async ({ page }) => {
    await page.goto("/beware#B2");
    const target = page.locator("#B2");
    await expect(target.locator(".conf")).toHaveCount(1);

    const cite = target.locator("details.cite").first();
    await expect(cite).toHaveCount(1);
    await cite.locator("summary").click();
    // The canonical URL is absolute: a citation that only resolves relative to
    // the page it was copied from is not a citation.
    await expect(cite.locator(".cite-body a").first()).toHaveAttribute("href", /.+/);
    await expect(cite.locator(".cite-body")).toContainText("https://");
  });
});

test.describe("A2 fail state - a fragment with no target", () => {
  test("an id the ledger does not contain resolves to nothing", async ({ page }) => {
    await page.goto("/beware#B99");
    await expect(page.locator("#B99")).toHaveCount(0);
  });
});
