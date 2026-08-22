import { expect, test } from "@playwright/test";

/**
 * ASSERTION A7 - every shipped route answers 200 and wears the shell.
 *
 * The list below is a deliberate mirror of `ROUTES` in src/lib/nav.ts, written
 * out by hand rather than imported. An import would make the assertion
 * tautological: a route silently dropped from the screen table would also
 * silently drop out of the walk. The unit suite (test/unit/nav.test.ts) owns
 * the shape of the table; this suite owns the claim that each of these nine
 * URLs is actually reachable in shipped output.
 *
 * Keep the two in step by hand. If they diverge, one of them is a bug.
 */
const ROUTES: readonly string[] = [
  "/",
  "/beware",
  "/contradictions",
  "/timeline",
  "/network",
  "/track",
  "/method",
  "/flows",
  "/sources",
];

test.describe("A7 route walk", () => {
  for (const route of ROUTES) {
    test(`${route} serves 200 inside the shell`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response, `no response for ${route}`).not.toBeNull();
      expect(response?.status(), `${route} did not answer 200`).toBe(200);

      // The system bar is the shell's signature: present on every route.
      await expect(page.locator('[data-ui="sysbar"]').first(), `${route} rendered without the system bar`).toBeAttached();

      // Exactly one h1 per document. Two would make the page ambiguous to a
      // screen reader and to a citation; zero would make it unnameable.
      await expect(page.locator("h1"), `${route} does not have exactly one h1`).toHaveCount(1);

      const title = await page.title();
      expect(title.trim().length, `${route} has an empty <title>`).toBeGreaterThan(0);
    });
  }

  /**
   * The dev-only surface. It answers 200 here because webServer.env sets
   * NEXT_PUBLIC_DATA_MODE=fixture, which makes DEV_SURFACES true in this
   * production build. On a deployed site NEXT_PUBLIC_DATA_MODE is snapshot or
   * live, DEV_SURFACES is false, and the page calls notFound() - it answers 404
   * and the primitive gallery is not published.
   */
  test("/dev/primitives serves 200 in fixture mode", async ({ page }) => {
    const response = await page.goto("/dev/primitives");

    expect(response, "no response for /dev/primitives").not.toBeNull();
    expect(response?.status(), "/dev/primitives did not answer 200 in fixture mode").toBe(200);
    await expect(page.locator('[data-primitive="SysBar"]').first()).toBeAttached();
  });
});
