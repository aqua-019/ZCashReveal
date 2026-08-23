import { expect, test, type Locator } from "@playwright/test";

/**
 * ASSERTION A6 - one hover verb, and the verb is dim.
 *
 * The design law (CLAUDE.md, Design system) is that hovering changes light, not
 * position: what recedes is what the proof hides, and receding is a change in
 * luminance. Concretely, no ScreenNav link may carry a transform in any state.
 *
 * "transform: none" on its own is a weak assertion - it also passes on a page
 * where the hover never registered, or where the nav failed to render its
 * rules. So this file pairs it with the positive half: a sibling link's
 * computed colour must CHANGE when the group is hovered. Only then does
 * "and nothing moved" mean anything.
 *
 * The dim rule is `.screens:hover a:not(:hover):not([aria-current="page"])` in
 * globals.css, with a 180 ms colour transition, so the colour read after hover
 * is polled rather than sampled once.
 */

interface Box {
  readonly color: string;
  readonly backgroundColor: string;
  readonly transform: string;
}

function readBox(link: Locator): Promise<Box> {
  return link.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, backgroundColor: cs.backgroundColor, transform: cs.transform };
  });
}

test.describe("A6 hover grammar", () => {
  test("the hover verb is dim, and nothing is ever displaced", async ({ page }) => {
    await page.goto("/");

    const links = page.locator('[data-primitive="ScreenNav"] a');
    const count = await links.count();
    expect(count, "the screen nav rendered fewer than two links").toBeGreaterThan(1);

    // Every link, before any pointer is anywhere near the bar.
    const before: Box[] = [];
    for (let i = 0; i < count; i += 1) {
      const box = await readBox(links.nth(i));
      expect(box.transform, `ScreenNav link ${i} carries a transform at rest`).toBe("none");
      before.push(box);
    }

    // The sibling to watch: neither the link about to be hovered (index 0) nor
    // the active one, since the dim rule deliberately exempts both.
    let siblingIdx = -1;
    for (let i = 1; i < count; i += 1) {
      const current = await links.nth(i).getAttribute("aria-current");
      if (current === null) {
        siblingIdx = i;
        break;
      }
    }
    expect(siblingIdx, "no ScreenNav link is both un-hovered and inactive").toBeGreaterThan(0);

    const sibling = links.nth(siblingIdx);
    const siblingBefore = before[siblingIdx];
    expect(siblingBefore, "sibling snapshot missing").toBeDefined();
    const siblingColorBefore = siblingBefore?.color ?? "";

    await links.nth(0).hover();

    // The positive half: the dim verb actually fires. Polled, because the
    // colour transition is 180 ms.
    await expect
      .poll(async () => (await readBox(sibling)).color, {
        message: `sibling link ${siblingIdx} did not dim on hover; the "no transform" pass would be vacuous`,
        timeout: 5_000,
      })
      .not.toBe(siblingColorBefore);

    const siblingAfter = await readBox(sibling);
    expect(siblingAfter.transform, `sibling link ${siblingIdx} was displaced on hover`).toBe("none");
    expect(
      siblingAfter.backgroundColor,
      `sibling link ${siblingIdx} gained a fill on hover; the verb is colour only`,
    ).toBe(siblingBefore?.backgroundColor);

    // And the whole bar, in every hover state: hover each link in turn and
    // require that no link anywhere has moved.
    for (let hovered = 0; hovered < count; hovered += 1) {
      await links.nth(hovered).hover();
      for (let i = 0; i < count; i += 1) {
        const box = await readBox(links.nth(i));
        expect(box.transform, `ScreenNav link ${i} carries a transform while link ${hovered} is hovered`).toBe("none");
      }
    }

    // Pointer away from the bar: back to rest, still nothing transformed.
    await page.mouse.move(0, 400);
    for (let i = 0; i < count; i += 1) {
      const box = await readBox(links.nth(i));
      expect(box.transform, `ScreenNav link ${i} carries a transform after the pointer left`).toBe("none");
    }
  });
});
