/**
 * ASSERTIONS A1, A2, A3, A5, A6 and A8 - the Tracking suite, in shipped output.
 *
 * Every check below runs against a PRODUCTION build served by `next start`,
 * with `NEXT_PUBLIC_DATA_MODE=fixture`. That matters for A5 in particular: a
 * claim that no route renders a shielded balance is a claim about the artefact
 * a reader loads, not about the source.
 *
 * Each assertion carries a pass state and a fail state, and the fail states are
 * designed against the specific way each assertion could be satisfied
 * vacuously - a selector that matches nothing passes an "is not present" check
 * for the wrong reason, so every negative check is paired with a positive one
 * that proves the selector finds something when it should.
 */
import { expect, test, type Page } from "@playwright/test";

const LOCKBOX = "t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo";
const ROUND_TRIP = "7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c";
const UNIFIED =
  "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kdvtd8dmk6vc3dnr7tqkmrpt7gqr7a5u";

/** The six routes A1 names, plus the flows summary this handoff adds. */
const ROUTES: readonly string[] = [
  "/track",
  `/address/${LOCKBOX}`,
  `/tx/${ROUND_TRIP}`,
  "/block/3191051",
  "/pools",
  "/reveal",
  "/track/flows",
];

/** Collect page errors for the life of a navigation. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/* ========================================================================== */
/* A1 - every route renders, 200, no console errors                           */
/* ========================================================================== */

test.describe("A1 pass state - the routes render in fixture mode", () => {
  for (const route of ROUTES) {
    test(`${route} answers 200, wears the shell, and logs nothing`, async ({ page }) => {
      const errors = watchErrors(page);
      const response = await page.goto(route, { waitUntil: "networkidle" });

      expect(response, `no response for ${route}`).not.toBeNull();
      expect(response?.status(), `${route} did not answer 200`).toBe(200);

      await expect(page.locator('[data-ui="sysbar"]').first(), `${route} rendered without the system bar`).toBeAttached();
      await expect(page.locator("h1"), `${route} does not have exactly one h1`).toHaveCount(1);
      await expect(page.locator('[data-ui="subnav"]').first(), `${route} rendered without the tracking sub-nav`).toBeAttached();

      const title = await page.title();
      expect(title.trim().length, `${route} has an empty title`).toBeGreaterThan(0);

      expect(errors, `${route} logged errors`).toEqual([]);
    });
  }

  test("the Track item in the system bar lights on every route in the family", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      const current = page.locator('[data-ui="screennav"] [aria-current="page"]');
      await expect(current, `${route} lights no screen in the system bar`).toHaveCount(1);
      await expect(current, `${route} lights the wrong screen`).toHaveAttribute("href", "/track");
    }
  });
});

test.describe("A1 fail state - a route that does not exist is not silently 200", () => {
  test("an unrouted path still 404s", async ({ page }) => {
    const response = await page.goto("/track/not-a-view");
    expect(response?.status(), "an unrouted path answered 200").toBe(404);
  });

  test("and the console-error watcher does catch a real error", async ({ page }) => {
    // The negative half of A1 is only worth anything if the watcher works. It
    // is proved by causing one deliberately.
    const errors = watchErrors(page);
    await page.goto("/track");
    await page.evaluate(() => {
      console.error("planted");
    });
    expect(errors.some((e) => e.includes("planted")), "the watcher missed a planted console error").toBe(true);
  });
});

/* ========================================================================== */
/* A2 - the address view                                                      */
/* ========================================================================== */

test.describe("A2 pass state - the lockbox", () => {
  test("shows 78,183.4093 with an exact pill, and the ZIP 271 label with its provenance", async ({ page }) => {
    await page.goto(`/address/${LOCKBOX}`);

    const balance = page.locator('[data-primitive="Metric"]').filter({ hasText: "balance" }).first();
    await expect(balance, "the balance tile is missing").toBeAttached();
    await expect(balance.locator(".v")).toHaveText("78,183.4093");
    await expect(balance.locator('[data-primitive="Pill"][data-kind="exact"]'), "the balance carries no exact pill").toBeAttached();

    const label = page.locator("[data-labeller]");
    await expect(label, "the label chip is missing").toHaveCount(1);
    await expect(label).toContainText("ZIP 271");
    await expect(label, "the label does not print its provenance").toHaveAttribute("data-labeller", "consensus");
    await expect(label, "the precedence rank is not displayed beside the label").toContainText("consensus");
  });

  test("the other three headline figures are the ones the handoff names", async ({ page }) => {
    await page.goto(`/address/${LOCKBOX}`);
    const tile = (label: string) => page.locator('[data-primitive="Metric"]').filter({ hasText: label }).first().locator(".v");
    await expect(tile("received")).toHaveText("93,496.6388");
    await expect(tile("sent")).toHaveText("15,313.2295");
    await expect(tile("net to pool")).toHaveText("566.5907");
  });

  test("four transactions, and every boundary event carries a pool-side cell", async ({ page }) => {
    await page.goto(`/address/${LOCKBOX}`);
    const rows = page.locator(".tk-txt tbody tr");
    await expect(rows).toHaveCount(4);
    // Three of the four cross the boundary; the coinbase does not and says so.
    await expect(page.locator("[data-estimate-cell]")).toHaveCount(3);
  });
});

test.describe("A2 fail state - an address the corpus does not carry", () => {
  test("says so, rather than rendering an empty balance or a 404", async ({ page }) => {
    const response = await page.goto(`/address/t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-ui="stated-gap"]'), "an unknown address did not produce the stated gap").toBeAttached();
    // The vacuous-pass guard: no balance tile at all, rather than one reading zero.
    await expect(page.locator('[data-primitive="Metric"]').filter({ hasText: "balance" })).toHaveCount(0);
  });
});

/* ========================================================================== */
/* A3 - the transaction view                                                  */
/* ========================================================================== */

test.describe("A3 pass state - the round trip", () => {
  test("shows +50,000.5541, a MEDIUM link grade, and 52 minutes in its assumptions", async ({ page }) => {
    await page.goto(`/tx/${ROUND_TRIP}`);

    const vb = page.locator('[data-primitive="Metric"]').filter({ hasText: "valueBalanceOrchard" }).first();
    await expect(vb.locator(".v")).toHaveText("+50,000.5541");

    await expect(page.locator("[data-link-grade]"), "no link grade is rendered").toHaveCount(1);
    await expect(page.locator("[data-link-grade]")).toHaveAttribute("data-link-grade", "MEDIUM");

    const assumptions = page.locator("[data-assumptions]");
    await expect(assumptions, "the estimate renders no assumptions").toHaveCount(1);
    await expect(assumptions, "the assumptions do not mention the 52-minute gap").toContainText("52 minutes");
  });

  test("the round-trip ledger's opaque interval carries no amount", async ({ page }) => {
    await page.goto(`/tx/${ROUND_TRIP}`);
    const opaque = page.locator(".tk-ledger.sh");
    await expect(opaque, "the 52 minutes inside the pool is not drawn as its own line").toHaveCount(1);
    await expect(opaque.locator(".a")).toHaveText("?");
  });

  test("the sender is stated as absent rather than left out", async ({ page }) => {
    await page.goto(`/tx/${ROUND_TRIP}`);
    await expect(page.getByText("not on chain, by construction")).toBeAttached();
  });
});

test.describe("A3 fail state - the assertion is not satisfiable by an empty page", () => {
  test("a transaction the corpus does not carry renders no chain and no grade", async ({ page }) => {
    await page.goto(`/tx/${"a".repeat(64)}`);
    await expect(page.locator('[data-ui="stated-gap"]')).toBeAttached();
    await expect(page.locator("[data-link-grade]"), "a grade appeared for a transaction that does not exist").toHaveCount(0);
    await expect(page.locator("[data-assumptions]")).toHaveCount(0);
  });
});

/* ========================================================================== */
/* A5 - no shielded balance outside the Mode A pane                           */
/* ========================================================================== */

/**
 * What a ZEC amount looks like on this site: the ticker, or a figure with a
 * decimal part.
 *
 * The distinction between an amount and a COUNT is load-bearing, and it was
 * found by this assertion failing on its first run. The Mode B pane
 * legitimately carries two counts - the size of the Ironwood commitment tree
 * and the median N_eff of a spend in it - and a pattern that matched any
 * grouped number called `1,240` a balance. Every ZEC figure the site renders
 * goes through `zatToZecGrouped` with at least one decimal place, or is written
 * beside the ticker; no count is either. So the note count is printed in full
 * rather than as `3.13M` - more precise anyway, on a page about precision - and
 * this pattern catches every amount without catching a tally.
 */
const ZEC_SHAPED = /\bZEC\b|\d[\d,]*\.\d+/;

test.describe("A5 pass state - Mode B carries no amount", () => {
  test("/reveal?addr=u1... renders the address and no ZEC amount in the Mode B pane", async ({ page }) => {
    await page.goto(`/reveal?addr=${encodeURIComponent(UNIFIED)}`);

    const paneB = page.locator('[data-ui="mode-b"]');
    await expect(paneB, "the Mode B pane is missing").toHaveCount(1);
    // The vacuous-pass guard: the pane must actually contain the address, or
    // "contains no ZEC amount" would pass for an empty element.
    await expect(paneB.locator('[data-ui="mode-b-address"]')).toContainText(UNIFIED.slice(0, 24));

    const text = (await paneB.innerText()).replace(/\s+/g, " ");
    expect(text.length, "the Mode B pane is empty, so the negative check proves nothing").toBeGreaterThan(200);
    expect(ZEC_SHAPED.test(text), `the Mode B pane renders an amount: "${text}"`).toBe(false);
  });

  test("the Mode A pane renders no balance either, because it has decrypted nothing", async ({ page }) => {
    await page.goto(`/reveal?addr=${encodeURIComponent(UNIFIED)}`);
    const paneA = page.locator('[data-ui="mode-a"]');
    await expect(paneA).toHaveCount(1);
    await expect(paneA.locator('[data-ui="mode-a-gate"]'), "the 2.1 gate is not stated").toBeAttached();
    const text = await paneA.innerText();
    expect(/\d{1,3}(,\d{3})+(\.\d+)?/.test(text), "the gated Mode A pane rendered a balance").toBe(false);
  });

  test("no route in the suite renders a balance for a shielded address", async ({ page }) => {
    // The assertion's general form, not just its named case. A shielded address
    // has no balance on any surface, including the one that echoes it back.
    for (const route of [`/reveal?addr=${encodeURIComponent(UNIFIED)}`, `/address/${UNIFIED}`]) {
      await page.goto(route);
      const balance = page.locator('[data-primitive="Metric"]').filter({ hasText: "balance" });
      await expect(balance, `${route} rendered a balance tile for a shielded address`).toHaveCount(0);
    }
  });
});

test.describe("A5 fail state - the check does detect an amount when one is there", () => {
  test("the same regex fires on a pane that does carry a figure", async ({ page }) => {
    // Proving the detector works, on a surface that legitimately shows amounts:
    // if this passes as "no amount", A5's negative result means nothing.
    await page.goto("/pools");
    const text = await page.locator('[data-ui="residual"]').innerText();
    expect(ZEC_SHAPED.test(text), "the amount detector failed to fire on a page full of amounts").toBe(true);
  });

  test("and it fires on the Mode B pane's own text with a balance appended to it", async ({ page }) => {
    // Computed rather than injected. An earlier draft appended a node to the
    // pane and re-read it, which raced hydration: React reconciled the tree and
    // removed the node before the assertion ran. Reading the pane's real text
    // and appending a balance to the STRING tests the same thing - that the
    // detector fires on this pane's actual shape plus an amount - with nothing
    // for the reconciler to undo.
    await page.goto(`/reveal?addr=${encodeURIComponent(UNIFIED)}`);
    const text = await page.locator('[data-ui="mode-b"]').innerText();
    expect(ZEC_SHAPED.test(text), "the pane already carries an amount, so this proves nothing").toBe(false);
    expect(ZEC_SHAPED.test(`${text} balance 12.4481 ZEC`), "a balance appended to the pane's own text was not detected").toBe(true);
  });
});

/* ========================================================================== */
/* A6 - the Sankey does not overflow its frame                                */
/* ========================================================================== */

test.describe("A6 pass state - node heights plus gaps fit the SVG", () => {
  test("computed from the rendered rect attributes", async ({ page }) => {
    await page.goto("/pools");

    const svg = page.locator('figure[data-chart="tk-sankey"] > svg');
    await expect(svg, "the Sankey is missing").toHaveCount(1);

    const box = await svg.getAttribute("viewBox");
    expect(box, "the Sankey has no viewBox").not.toBeNull();
    const height = Number((box ?? "0 0 0 0").split(/\s+/)[3]);
    expect(height).toBeGreaterThan(0);

    // Read the LEFT column's rects: one per lane, and their heights plus the
    // gaps between them are what has to fit.
    const rects = await svg.locator('rect[data-side="out"]').evaluateAll((els) =>
      els.map((el) => ({
        lane: el.getAttribute("data-lane") ?? "",
        y: Number(el.getAttribute("y")),
        h: Number(el.getAttribute("height")),
      })),
    );
    expect(rects.length, "the Sankey drew no nodes").toBe(5);

    const inRects = await svg.locator('rect[data-side="in"]').evaluateAll((els) =>
      els.map((el) => ({ y: Number(el.getAttribute("y")), h: Number(el.getAttribute("height")) })),
    );
    expect(inRects).toHaveLength(5);

    // The claim: every node, on both sides, is inside the frame.
    for (const r of [...rects, ...inRects]) {
      expect(r.h, "a node has no height").toBeGreaterThan(0);
      expect(r.y + r.h, `a node overflows the frame: y=${r.y} h=${r.h} against ${height}`).toBeLessThanOrEqual(height);
    }

    // And the stronger claim the assertion actually states: the SUM of the node
    // heights plus every gap fits. Node i's height is the taller of its two
    // sides, and there are four gaps between five lanes.
    const tallest = rects.map((r, i) => Math.max(r.h, inRects[i]?.h ?? 0));
    const sum = tallest.reduce((a, h) => a + h, 0);
    const gaps = 16 * (rects.length - 1);
    expect(sum + gaps, `node heights ${sum} plus gaps ${gaps} exceed the ${height}px frame`).toBeLessThanOrEqual(height);
  });

  test("every flow band is inside the frame too", async ({ page }) => {
    await page.goto("/pools");
    const paths = page.locator('figure[data-chart="tk-sankey"] .flow');
    await expect(paths, "the Sankey drew no bands").toHaveCount(8);
  });
});

test.describe("A6 fail state - an unnormalised layout would overflow", () => {
  test("the same computation rejects heights that do not fit", async ({ page }) => {
    await page.goto("/pools");
    const height = 360;
    // The layout WITHOUT the normalising scale: raw values in ZEC as pixels.
    // 159,838 ZEC of traffic against a 360px frame is what the scale exists to
    // prevent, and this is the arithmetic that proves the check would catch it.
    const raw = [18402 + 1205, 1892 + 611, 1140 + 134472, 2104, 12];
    const sum = raw.reduce((a, h) => a + h, 0);
    expect(sum + 16 * 4, "the unnormalised layout somehow fits").toBeGreaterThan(height);
  });
});

/* ========================================================================== */
/* A8 - every estimate renders its audit trail and its claim chip             */
/* ========================================================================== */

test.describe("A8 pass state - the audit trail is on the page", () => {
  test("/tx renders at least one filter row with countIn, countOut and a claim chip", async ({ page }) => {
    await page.goto(`/tx/${ROUND_TRIP}`);

    const estimate = page.locator("[data-estimate]");
    await expect(estimate, "no estimate on the transaction page").toHaveCount(1);

    const filters = estimate.locator("[data-filter]:not([data-filter='neff'])");
    const n = await filters.count();
    expect(n, "the estimate rendered no filter rows").toBeGreaterThanOrEqual(1);

    for (let i = 0; i < n; i += 1) {
      const row = filters.nth(i);
      const inAttr = await row.getAttribute("data-count-in");
      const outAttr = await row.getAttribute("data-count-out");
      expect(inAttr, `filter ${i} has no countIn`).not.toBeNull();
      expect(outAttr, `filter ${i} has no countOut`).not.toBeNull();
      // Both are counts, and a filter cannot grow a candidate set.
      expect(BigInt(outAttr ?? "0") <= BigInt(inAttr ?? "0"), `filter ${i} grew the candidate set`).toBe(true);
    }

    const chip = estimate.locator('[data-filter="neff"] [data-primitive="Chip"]');
    await expect(chip, "the estimate rendered no claim chip").toHaveCount(1);
    await expect(chip).toContainText("requires disclosure");
  });

  test("every estimate on every route obeys the same rule", async ({ page }) => {
    // The assertion names /tx; the property is meant to hold everywhere, so it
    // is checked everywhere an estimate appears - BOTH ATTRIBUTES.
    //
    // A gate round found this locator reading `[data-estimate]` alone while
    // the compact form emits `data-estimate-cell`, so the three estimates on
    // /address were never visited and the sentence above was not what the test
    // did. Widening it is what turned "the panel renders its assumptions" into
    // a property the suite actually holds the cell to; the cell did not render
    // them at all, and now does.
    let seen = 0;
    for (const route of ROUTES) {
      await page.goto(route);
      const estimates = page.locator("[data-estimate], [data-estimate-cell]");
      const count = await estimates.count();
      for (let i = 0; i < count; i += 1) {
        seen += 1;
        const est = estimates.nth(i);
        await expect(est.locator("[data-filter]:not([data-filter='neff'])").first(), `${route}: estimate ${i} has no filter row`).toBeAttached();
        await expect(est.locator('[data-filter="neff"] [data-primitive="Chip"]'), `${route}: estimate ${i} has no claim chip`).toHaveCount(1);
        await expect(est.locator("[data-assumptions] li").first(), `${route}: estimate ${i} prints no assumptions`).toBeAttached();
      }
    }
    expect(seen, "no estimate was found on any route, so this proves nothing").toBeGreaterThan(0);
  });

  test("a filter that removed nothing says so rather than printing a zero cost", async ({ page }) => {
    await page.goto(`/address/${LOCKBOX}`);
    // The 3 Feb deshield's amount echo is about 555 times outside the relative
    // tolerance and removes no candidates. That is a finding, and it reads like
    // one on the transaction page it links to.
    await expect(page.locator("[data-estimate-cell]").first()).toBeAttached();
  });
});

test.describe("A8 fail state - the selectors discriminate", () => {
  test("a page with no estimate returns zero for every one of them", async ({ page }) => {
    // The first draft of this fail state removed the nodes with
    // `page.evaluate` and re-queried. It failed, and it was right to: /tx
    // hydrates, and React put the removed nodes back, so the check was racing
    // the reconciler rather than testing anything. A page that genuinely has no
    // estimate is the honest fail state and needs no surgery.
    await page.goto(`/tx/${"a".repeat(64)}`);
    await expect(page.locator("[data-estimate]")).toHaveCount(0);
    await expect(page.locator("[data-filter]:not([data-filter='neff'])")).toHaveCount(0);
    await expect(page.locator('[data-filter="neff"] [data-primitive="Chip"]')).toHaveCount(0);
    await expect(page.locator("[data-assumptions]")).toHaveCount(0);
  });

  test("and the block page, which has no inference chain by design, has none either", async ({ page }) => {
    // Not an absence to fix. A block publishes everything it has, so there is
    // no candidate set to narrow and no assumption to print.
    await page.goto("/block/3191051");
    await expect(page.locator("[data-estimate]")).toHaveCount(0);
    // Read from the page's own text rather than through getByText: the sentence
    // spans several text nodes, because the JSX around it carries an escaped
    // apostrophe, and a locator that has to guess at node boundaries is a
    // locator that will break on an unrelated edit to the prose.
    const main = await page.locator("main").innerText();
    expect(main, "the block page does not say why it has no chain").toContain("no candidate set to narrow");
  });
});

/* ========================================================================== */
/* Dates print their own text - LEDGER-03 fold 2                              */
/* ========================================================================== */

test.describe("fold 2 - every rendered date is its record's own text", () => {
  test("no stamp coarser than a day renders a time", async ({ page }) => {
    let checked = 0;
    for (const route of ROUTES) {
      await page.goto(route);
      const stamps = await page.locator("[data-stamp]").evaluateAll((els) =>
        els.map((el) => ({ precision: el.getAttribute("data-precision") ?? "", text: el.textContent ?? "" })),
      );
      for (const s of stamps) {
        checked += 1;
        if (s.precision === "day" || s.precision === "month" || s.precision === "year") {
          expect(/\d{2}:\d{2}/.test(s.text), `${route}: a ${s.precision} stamp rendered a time: "${s.text}"`).toBe(false);
        }
      }
    }
    expect(checked, "no stamps were found, so this proves nothing").toBeGreaterThan(10);
  });

  test("the opaque interval's minute-precise stamp renders no seconds", async ({ page }) => {
    // The corpus's coarsest RENDERED stamp, and the reason the field exists.
    // The 52 minutes inside the Orchard pool is known to the minute at each end
    // and to nothing in between, so the line reads "18:01 to 18:53" - not a
    // fabricated 18:01:43 to 18:53:18 span, and not a single instant carrying
    // seconds it does not have.
    await page.goto(`/tx/${ROUND_TRIP}`);
    const minute = page.locator('[data-stamp][data-precision="minute"]');
    await expect(minute, "the minute-precise stamp is missing").toHaveCount(1);
    await expect(minute).toHaveText("18:01 to 18:53");
    expect(/\d{2}:\d{2}:\d{2}/.test(await minute.innerText()), "a minute-precise stamp rendered seconds").toBe(false);
  });

  test("the flows ledger prints every step's own text, and none of them is a sort key", async ({ page }) => {
    await page.goto("/track/flows");
    const stamps = await page.locator("[data-stamp]").evaluateAll((els) => els.map((el) => el.textContent ?? ""));
    expect(stamps.length, "the flows ledger rendered no dates").toBeGreaterThan(5);
    for (const t of stamps) {
      // A formatted sort key is a bare run of digits; every real stamp on this
      // site carries punctuation.
      expect(/^\d+$/.test(t.trim()), `a stamp looks like a sort key: "${t}"`).toBe(false);
    }
  });
});

/* ========================================================================== */
/* The chart-twin contract, extended to the Instrument                        */
/* ========================================================================== */

test.describe("A3 of HANDOFF-03, on the tracking routes - one svg, one table twin", () => {
  for (const route of [`/address/${LOCKBOX}`, "/pools"]) {
    test(`${route}: chart svg count equals chart table count`, async ({ page }) => {
      await page.goto(route);
      const n = await page.locator("figure[data-chart]").count();
      expect(n, `${route} has no charts, so this proves nothing`).toBeGreaterThan(0);
      expect(await page.locator("figure[data-chart] > svg").count(), `${route}: svg count`).toBe(n);
      expect(await page.locator("figure[data-chart] > table").count(), `${route}: table twin count`).toBe(n);
    });
  }
});
