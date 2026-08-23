import { expect, test } from "@playwright/test";

import { getTimeline, timelineCategorySchema } from "@zcashreveal/content";

/**
 * ASSERTIONS A7 and A11 - the strand filter, and dates the corpus can support.
 *
 * A7 has two halves and both are checked here. First, `/timeline?category=EXPLOIT`
 * renders only the exploit rows - which is a claim about the SERVER, because
 * the filter is server-first: the search parameter sets the `hidden` attribute
 * on every row outside the category, so the URL works with JavaScript off.
 * Second, the island never throws when `history.replaceState` is stubbed to
 * throw, which is what happens in a sandboxed iframe without
 * `allow-same-origin`.
 *
 * A11 is the dateText rule (LEDGER-02 Q3, fold 5): no rendered row may print a
 * day for a row the corpus dates only to a month, a year or a span. The check
 * compares every rendered date string against that row's own `dateText`, which
 * is the only string that may appear.
 */

const EXPLOIT_COUNT = getTimeline().filter((e) => e.category === "EXPLOIT").length;
const TOTAL = getTimeline().length;

test.describe("A7 pass state - the category filter", () => {
  test("?category=EXPLOIT shows the exploit rows and hides the rest, before any script runs", async ({ page }) => {
    await page.goto("/timeline?category=EXPLOIT");

    const all = page.locator(".tl .ev[data-cat]");
    await expect(all, "the spine did not render every row").toHaveCount(TOTAL);

    const visible = page.locator(".tl .ev[data-cat]:visible");
    await expect(visible, "the visible row count is not the EXPLOIT count").toHaveCount(EXPLOIT_COUNT);

    // Every visible row is an exploit row. Counting alone would pass if the
    // right NUMBER of wrong rows were showing.
    const cats = await visible.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset["cat"]));
    expect(new Set(cats)).toEqual(new Set(["EXPLOIT"]));

    // Year numerals are never hidden: a strand's silent years are information.
    expect(await page.locator(".tl .yr").count(), "the year rail was filtered away").toBeGreaterThan(5);
  });

  test("the unfiltered page shows everything", async ({ page }) => {
    await page.goto("/timeline");
    await expect(page.locator(".tl .ev[data-cat]:visible")).toHaveCount(TOTAL);
  });

  test("an unrecognised category falls back to the whole record rather than an empty page", async ({ page }) => {
    await page.goto("/timeline?category=NOT_A_STRAND");
    await expect(page.locator(".tl .ev[data-cat]:visible")).toHaveCount(TOTAL);
  });

  test("the island switches strands and syncs the URL", async ({ page }) => {
    await page.goto("/timeline");
    await page.locator('.tl-filters a[href="/timeline?category=GOV"]').click();

    const govCount = getTimeline().filter((e) => e.category === "GOV").length;
    await expect(page.locator(".tl .ev[data-cat]:visible")).toHaveCount(govCount);
    await expect(page).toHaveURL(/category=GOV/);
  });

  test("the island does not throw when history.replaceState throws", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/timeline");

    // Exactly the failure a sandboxed iframe produces. The platform throws it;
    // nothing but a try/catch at the call site can contain it.
    await page.evaluate(() => {
      window.history.replaceState = () => {
        throw new DOMException("stubbed by the A7 fail-side check", "SecurityError");
      };
    });

    await page.locator('.tl-filters a[href="/timeline?category=EXPLOIT"]').click();

    // The filter still applied, which is the point: URL sync is the part that
    // may be lost, not the filtering.
    await expect(page.locator(".tl .ev[data-cat]:visible")).toHaveCount(EXPLOIT_COUNT);
    expect(errors, `the island threw: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("A7 fail state - an unguarded replaceState", () => {
  test("the same stub does throw when the call is not wrapped", async ({ page }) => {
    await page.goto("/timeline");

    const threw = await page.evaluate(() => {
      window.history.replaceState = () => {
        throw new DOMException("stubbed", "SecurityError");
      };
      try {
        // The unwrapped form the island deliberately does not use.
        window.history.replaceState(null, "", "/timeline?category=EXPLOIT");
        return false;
      } catch {
        return true;
      }
    });

    expect(threw, "the stub did not throw - the A7 fail side proves nothing").toBe(true);
  });
});

test.describe("A11 pass state - rendered dates are the corpus's own", () => {
  test("every row prints its dateText verbatim, and no coarse row prints a day", async ({ page }) => {
    await page.goto("/timeline");

    const rendered = await page.locator(".tl .ev[data-cat]").evaluateAll((els) =>
      els.map((el) => ({
        id: el.id,
        // The visible date cell, minus the precision qualifier that sits inside it.
        date: (el.querySelector(".d")?.childNodes[0]?.textContent ?? "").trim(),
      })),
    );

    expect(rendered.length).toBe(TOTAL);

    const byId = new Map(getTimeline().map((e) => [e.id, e]));
    const coarse: string[] = [];

    for (const row of rendered) {
      const event = byId.get(row.id);
      expect(event, `rendered a row with id ${row.id} that is not in the corpus`).toBeDefined();
      if (event === undefined) continue;

      expect(row.date, `${row.id} does not print its own dateText`).toBe(event.dateText);

      if (event.datePrecision !== "day") {
        coarse.push(row.id);
        // The sort key formatted as a day, in any of the shapes a formatter
        // would produce. None of them may appear.
        const [y, m, d] = event.date.split("-");
        const asDay = new Date(`${event.date}T00:00:00Z`).getUTCDate();
        expect(row.date, `${row.id} is ${event.datePrecision}-precise but printed the sort key`).not.toBe(event.date);
        expect(
          row.date === `${d} ${m} ${y}` || row.date === `${asDay}/${m}/${y}`,
          `${row.id} is ${event.datePrecision}-precise but printed a formatted day`,
        ).toBe(false);
      }
    }

    // The rule is only worth checking because a good number of rows are coarse.
    expect(coarse.length, "no coarse-precision rows rendered - A11 would be vacuous").toBeGreaterThan(20);
  });

  test("a coarse row says how coarse it is", async ({ page }) => {
    await page.goto("/timeline");
    const coarse = getTimeline().find((e) => e.datePrecision === "year");
    expect(coarse, "the corpus has no year-precise row to check").toBeDefined();
    if (coarse === undefined) return;
    await expect(page.locator(`#${CSS.escape(coarse.id)} .d .approx`)).toHaveText("year only");
  });
});

test.describe("A11 fail state - a formatted sort key is detectable", () => {
  test("the same comparison rejects a row whose date cell is replaced by its sort key", async ({ page }) => {
    await page.goto("/timeline");

    const target = getTimeline().find((e) => e.datePrecision !== "day");
    expect(target).toBeDefined();
    if (target === undefined) return;

    await page.evaluate((id) => {
      const cell = document.querySelector(`#${CSS.escape(id)} .d`);
      if (cell?.firstChild !== null && cell?.firstChild !== undefined) cell.firstChild.textContent = id.slice(1);
    }, target.id);

    const shown = await page.locator(`#${CSS.escape(target.id)} .d`).evaluate((el) => (el.childNodes[0]?.textContent ?? "").trim());
    expect(shown).toBe(target.date);
    expect(shown, "the planted sort key was not distinguishable from dateText").not.toBe(target.dateText);
  });
});

/** Kept honest: the category union the filter offers is the schema's own. */
test("the filter offers exactly the categories the schema defines", async ({ page }) => {
  await page.goto("/timeline");
  const hrefs = await page.locator(".tl-filters a").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  const offered = new Set(
    hrefs.map((h) => new URL(h, "https://example.invalid").searchParams.get("category")).filter((c): c is string => c !== null),
  );
  expect(offered).toEqual(new Set(timelineCategorySchema.options));
});
