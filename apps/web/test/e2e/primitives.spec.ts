import { expect, test } from "@playwright/test";

/**
 * ASSERTION A4 - every primitive in the HANDOFF-01 deliverable list renders.
 *
 * The gallery at /dev/primitives is the only surface that mounts all of them at
 * once, which is what makes a single page load a complete inventory. Each
 * component tags itself with `data-primitive="<Name>"`; the walk below is
 * therefore checking the shipped DOM, not an import graph.
 *
 * The list is driven from a const array and each name gets its own test.step,
 * so a failure names the missing primitive in the reporter output rather than
 * pointing at a line number.
 */

const PRIMITIVES: readonly string[] = [
  "SysBar",
  "ScreenNav",
  "EpochClock",
  "Block",
  "Glass",
  "Metric",
  "Chip",
  "Conf",
  "Pill",
  "KV",
  "Eyebrow",
  "Quote",
  "LedgerRow",
  "DataTable",
  "Reason",
  "InferenceChain",
  "SubNav",
  "SearchBar",
  "Tooltip",
  "FogCanvas",
  "Tide",
  "Grain",
];

/** Chip carries the whole accent budget; all four tones must be reachable. */
const CHIP_TONES: readonly string[] = ["gold", "danger", "ok", "blue"];

/** Confidence is always displayed, so all three levels must be renderable. */
const CONF_LEVELS: readonly string[] = ["high", "med", "low"];

/** The epistemic control. "undefined" is a real kind: the honest refusal. */
const PILL_KINDS: readonly string[] = ["exact", "bounded", "label", "undefined"];

test.describe("A4 primitive gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/primitives");
  });

  test("mounts every primitive at least once", async ({ page }) => {
    for (const name of PRIMITIVES) {
      await test.step(`primitive ${name}`, async () => {
        const locator = page.locator(`[data-primitive="${name}"]`);
        await expect(locator.first(), `no [data-primitive="${name}"] on /dev/primitives`).toBeAttached();
      });
    }
  });

  test("mounts all four Chip tones", async ({ page }) => {
    for (const tone of CHIP_TONES) {
      await test.step(`Chip tone ${tone}`, async () => {
        const locator = page.locator(`[data-primitive="Chip"][data-tone="${tone}"]`);
        await expect(locator.first(), `no Chip with data-tone="${tone}"`).toBeAttached();
      });
    }
  });

  test("mounts all three Conf levels", async ({ page }) => {
    for (const level of CONF_LEVELS) {
      await test.step(`Conf level ${level}`, async () => {
        const locator = page.locator(`[data-primitive="Conf"][data-level="${level}"]`);
        await expect(locator.first(), `no Conf with data-level="${level}"`).toBeAttached();
      });
    }
  });

  test("mounts all four Pill kinds", async ({ page }) => {
    for (const kind of PILL_KINDS) {
      await test.step(`Pill kind ${kind}`, async () => {
        const locator = page.locator(`[data-primitive="Pill"][data-kind="${kind}"]`);
        await expect(locator.first(), `no Pill with data-kind="${kind}"`).toBeAttached();
      });
    }
  });
});
