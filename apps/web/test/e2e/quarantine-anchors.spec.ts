import { expect, test } from "@playwright/test";
import { getUnverified, permalink } from "@zcashreveal/content";

/**
 * LEDGER-04 Q4, fold 5 - `Unverified.surface` is nullable and `permalink()`
 * refuses rather than emitting a dead anchor.
 *
 * The property under test is not "the field has a plausible value". It is that
 * the SEED AGREES WITH THE RENDERED PAGES, in both directions:
 *
 *   - a record whose `surface` names a page must have an element with its id on
 *     that page, or the permalink is a lie of the kind the fold exists to
 *     remove;
 *   - a record whose `surface` is null must have no such element on EITHER
 *     Record surface, or the seed is hiding a claim the site actually renders.
 *
 * Both halves matter and neither is implied by the other. HANDOFF-04 shipped
 * the field required, which made the first half unsatisfiable for 22 of the 32
 * records; the count of six on /flows rather than four is what the two
 * allegation rows that own their anchors add, and it is measured here rather
 * than asserted from a ledger.
 *
 * This runs against the production build the Playwright config serves, so it
 * reads the HTML a reader is actually sent.
 */
const SURFACES = ["/flows", "/network"] as const;

test.describe("the quarantine's permalinks resolve, or say they do not", () => {
  test("every record with a surface is anchored on it, and every record without one is anchored nowhere", async ({
    page,
  }) => {
    const records = getUnverified();
    expect(records.length, "the quarantine seed is empty").toBeGreaterThan(0);

    // One load per surface, then every assertion reads from the same DOM. The
    // alternative - a goto per record - is 32 builds' worth of navigation for a
    // property that is about one page each.
    const idsOn = new Map<string, Set<string>>();
    for (const surface of SURFACES) {
      await page.goto(surface);
      const ids = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[id]"), (el) => el.id),
      );
      idsOn.set(surface, new Set(ids));
    }

    const anchored: Record<string, string[]> = { "/flows": [], "/network": [] };
    const unrendered: string[] = [];

    for (const u of records) {
      const found = SURFACES.filter((s) => idsOn.get(s)?.has(u.id) === true);
      if (u.surface === null) {
        expect(found, `${u.id} has surface null but renders on ${found.join(", ")}`).toEqual([]);
        expect(permalink(u.id), `${u.id} renders nowhere, so permalink must refuse`).toBeNull();
        unrendered.push(u.id);
      } else {
        expect(found, `${u.id} claims ${u.surface} and is anchored on ${found.join(", ") || "no page"}`).toEqual([
          u.surface,
        ]);
        expect(permalink(u.id)).toBe(`${u.surface}#${u.id}`);
        anchored[u.surface]?.push(u.id);
      }
    }

    // The partition itself, so a record silently losing its anchor is a failure
    // rather than a quieter pass.
    expect(anchored["/flows"]).toHaveLength(6);
    expect(anchored["/network"]).toHaveLength(4);
    expect(unrendered).toHaveLength(22);
    expect(anchored["/flows"]!.length + anchored["/network"]!.length + unrendered.length).toBe(records.length);
  });

  test("a citation to an unrendered record renders as text, not as a link to a page without it", async ({ page }) => {
    // /sources is where the citation index surfaces, and it is the one page
    // that renders an id for every collection including the quarantine. An
    // unrendered record's id must appear there WITHOUT an href.
    const unrendered = getUnverified().filter((u) => u.surface === null);
    expect(unrendered.length, "no unrendered record to check").toBeGreaterThan(0);

    await page.goto("/sources");
    const ids = unrendered.map((u) => u.id);
    const linked = await page.evaluate(
      (candidates: string[]) =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => a.textContent?.trim() ?? "")
          .filter((text) => candidates.includes(text)),
      ids,
    );
    expect(linked, "an unrendered quarantine record is still rendered as a link").toEqual([]);
  });
});
