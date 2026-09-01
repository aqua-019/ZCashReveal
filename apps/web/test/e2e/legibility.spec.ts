import { expect, test, type Page } from "@playwright/test";

import { NAV_ENTRIES } from "@/lib/nav";

/**
 * HANDOFF-04a LEGIBILITY - the assertions that can only be read off a rendered
 * page: A5 (every screen renders its dek), A7 (three ways into the index and
 * one way out, touch included), A10 (reduced motion by architecture), A1's
 * rendered half (one source per quantity, on the turnstile plane) and A4's
 * rendered half (every summary carries its finding).
 *
 * `NAV_ENTRIES` IS IMPORTED FROM `@/lib/nav` RATHER THAN PARSED OUT OF IT, and
 * the choice was checked before it was made. `apps/web/tsconfig.json` maps
 * the `@` alias onto its own `src` directory and includes every TypeScript file
 * under the package, this one among them, so the alias typechecks here; the
 * Playwright loader reads the same tsconfig, so it also resolves at runtime.
 * The sibling specs import from `@zcashreveal/content` rather than from `src`
 * only because that is where their fixtures live - there is no rule against the
 * alias, and parsing `nav.ts` with a regular expression would put a SECOND
 * reading of the screen table beside the one the page renders, which is the
 * defect A1 is about in a different coat.
 *
 * EVERY CHECK IN THIS FILE IS A NAMED FUNCTION THAT RETURNS ITS PROBLEMS, and
 * the pass and fail describes call THE SAME FUNCTION. That is deliberate: a
 * fail side that re-implements the check proves nothing about the check that
 * ran on the pass side. So `dekProblems`, `planeProblems` and `digitlessSummaries`
 * each run twice - once against the page as shipped, once against a page with
 * the defect planted into the DOM - and the second run is required to report
 * the plant. Without that half, "no problems" is also what a probe that matches
 * nothing returns.
 *
 * TWO OF THE FAIL SIDES BELOW REPRODUCE DEFECTS THAT WERE ACTUALLY MEASURED IN
 * THIS COMPONENT, not defects that were imagined for the test:
 *   - THE ESCAPE DEFECT. `ScreenDisclosure.tsx` records it: the first version
 *     of the disclosure set `aria-expanded="false"` on Escape while the
 *     computed `grid-template-rows` stayed at its open value, because Escape
 *     must return focus to the toggle and `:focus-within` scoped to the BAR
 *     re-opened what Escape had just closed. Both attributes reported success
 *     and the picture did not move. The fail side re-plants the pre-fix rule as
 *     a stylesheet and requires the SAME computed-rows probe to catch it - and
 *     asserts that `aria-expanded` still reads "false" while it does, which is
 *     the whole reason the attribute alone is not the assertion.
 *   - THE TOUCH DEFECT. The toggle was inside `.sysbar-in`, which wraps: on a
 *     390px viewport the full-width panel wrapped ABOVE the button and buried
 *     it, so the one disclosure path a touch device has was unreachable by
 *     touch. It was found because Playwright could not tap the button. The fail
 *     side plants an interceptor over the toggle and requires the same tap to
 *     become impossible again.
 *
 * The suite's own config supplies the baseURL (127.0.0.1:3210), one chromium
 * project and workers:1 against a production build; nothing here overrides it.
 */

/* -------------------------------------------------------------------------- */
/* shared probes                                                              */
/* -------------------------------------------------------------------------- */

const TOGGLE = '[data-ui="nav-toggle"]';
const SYSBAR = '[data-ui="sysbar"]';

/** Open enough to be an index rather than a rounding error on a collapsed box. */
const OPEN_PX = 300;

/**
 * Park the pointer well off the bar.
 *
 * The coordinates are outside the 1280x720 Desktop Chrome viewport on purpose:
 * an emulated pointer that has never moved parks at the origin, which is INSIDE
 * the bar, so a resting-state assertion taken without this is measuring a
 * hovered bar and calling it resting. The stylesheet carries the same warning
 * for the phone case.
 */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(1300, 850);
}

/**
 * The panel's computed `grid-template-rows`.
 *
 * THIS IS THE PROBE THE WHOLE OF A7 TURNS ON. `aria-expanded` and `data-open`
 * are what the component BELIEVES; this is what the reader sees. The measured
 * Escape defect had the two disagreeing, so every open/closed claim below is
 * made against this and the attributes are checked beside it, never instead.
 */
async function panelRows(page: Page): Promise<string> {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".navwrap");
    return wrap === null ? "no-navwrap" : getComputedStyle(wrap).gridTemplateRows;
  });
}

/** The same probe as a number. `0px` collapses to 0; `none` and a miss to NaN. */
async function panelRowsPx(page: Page): Promise<number> {
  return Number.parseFloat(await panelRows(page));
}

/** Wait out the `grid-template-rows` transition rather than sampling into it. */
async function expectOpen(page: Page, why: string): Promise<void> {
  await expect.poll(() => panelRowsPx(page), { message: why, timeout: 5_000 }).toBeGreaterThan(OPEN_PX);
}

/** Every Web Animations object the document is currently running, by class. */
async function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => document.getAnimations().map((a) => a.constructor.name));
}

interface Zr {
  readonly rafCalls: number;
  readonly tidePulses: number;
  readonly constructed: readonly string[];
  readonly refused: Readonly<Record<string, string>>;
}

/** Snapshot the diagnostics store, or null if it was never installed. Same read as reduced-motion.spec.ts. */
async function readZr(page: Page): Promise<Zr | null> {
  return page.evaluate(() => (window.__zr === undefined ? null : { ...window.__zr }));
}

/** The nav entry a route is supposed to light. Throws rather than silently skipping. */
function entryFor(href: string): (typeof NAV_ENTRIES)[number] {
  const entry = NAV_ENTRIES.find((e) => e.href === href);
  if (entry === undefined) throw new Error(`nav.ts carries no NAV_ENTRIES member for ${href}`);
  return entry;
}

const SPLASH = entryFor("/");

/** Open the index by the button, from a parked pointer, and wait for it. */
async function openIndex(page: Page): Promise<void> {
  await parkPointer(page);
  await page.locator(TOGGLE).click();
  await expectOpen(page, "the button did not open the index");
}

/* -------------------------------------------------------------------------- */
/* A5 - every screen renders its dek                                          */
/* -------------------------------------------------------------------------- */

/** Every `.screendek` the page renders, in document order. */
async function readDeks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".screendek")].map((n) => n.innerText.trim()),
  );
}

/**
 * A5 stated as a predicate over what the page rendered.
 *
 * TWO CLAUSES, AND THE SECOND IS NOT REDUNDANT. Containment alone is satisfied
 * by a bar that renders every dek twice, or that renders eleven deks and a
 * twelfth belonging to nothing; the count clause pins the rendering to the
 * table. The defect this exists against - F-04a-1 - was a `ScreenNav` that
 * rendered `idx` and `label` and nothing else, so both clauses failed at once,
 * but a partial regression would trip only one and both are worth having.
 */
function dekProblems(rendered: readonly string[]): string[] {
  const problems: string[] = [];
  if (rendered.length !== NAV_ENTRIES.length) {
    problems.push(`.screendek count is ${String(rendered.length)}, NAV_ENTRIES.length is ${String(NAV_ENTRIES.length)}`);
  }
  for (const entry of NAV_ENTRIES) {
    if (!rendered.includes(entry.dek)) {
      problems.push(`${entry.idx} ${entry.label}: its dek reaches no rendered node - "${entry.dek}"`);
    }
  }
  return problems;
}

test.describe("HANDOFF-04a A5 pass state - every screen renders its dek", () => {
  test("the open index carries one dek node per NAV_ENTRIES member, with that member's exact text", async ({ page }) => {
    await page.goto("/");
    await openIndex(page);

    const rendered = await readDeks(page);
    expect(dekProblems(rendered), "a NAV_ENTRIES dek is missing from the open index").toEqual([]);

    // ATTACHED IS NOT RENDERED. The panel is an `overflow: hidden` box that is
    // zero-height at rest, so every dek is in the DOM whether the index is open
    // or shut and a text-only assertion would pass against a bar that never
    // opens. This is the clause that says the reader can actually see them.
    await expect(page.locator(".screendek").first(), "the deks are attached but not painted").toBeVisible();
  });
});

test.describe("HANDOFF-04a A5 fail state - the same query against a stripped index", () => {
  test("dekProblems reports every entry once the dek nodes are removed", async ({ page }) => {
    await page.goto("/");
    await openIndex(page);
    expect(dekProblems(await readDeks(page)), "the page did not pass before the plant").toEqual([]);

    // Plant the exclusion set's own member: "a NAV_ENTRIES member whose dek
    // string reaches no rendered node", for all eleven at once. React owns this
    // subtree but does not re-render it unhandled, and the assertion below that
    // the nodes are gone is what makes that explicit rather than hopeful.
    await page.evaluate(() => {
      for (const node of document.querySelectorAll(".screendek")) node.remove();
    });
    await expect(page.locator(".screendek"), "the removed nodes came back").toHaveCount(0);

    const problems = dekProblems(await readDeks(page));
    expect(problems.length, "the same query saw nothing wrong with an index that has no deks at all").toBe(
      NAV_ENTRIES.length + 1,
    );
    expect(problems[0], "the count clause did not fire").toContain(".screendek count is 0");
    expect(problems.join("\n"), "the containment clause did not name the splash entry").toContain(SPLASH.dek);
  });
});

/* -------------------------------------------------------------------------- */
/* A7 - three ways in, one way out, and touch is asserted                     */
/* -------------------------------------------------------------------------- */

test.describe("HANDOFF-04a A7 pass state - three ways in, one way out", () => {
  test("resting - the index is collapsed and the bar still names the current screen", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);

    // The resting claim is made against the computed rows, not the attribute.
    await expect.poll(() => panelRows(page), { message: "the index is not collapsed at rest" }).toBe("0px");
    await expect(page.locator(TOGGLE)).toHaveAttribute("aria-expanded", "false");

    // HIDING THE INDEX MUST NOT COST ORIENTATION. The complaint HANDOFF-04a
    // answers was disorientation, and a bar that hides the index AND stops
    // saying where you are answers it by making it worse. So the resting state
    // is `00 Splash`, from the table, not a hamburger.
    const idx = (await page.locator(".here-idx").innerText()).trim();
    const label = (await page.locator(".here-label").innerText()).trim();
    expect(idx, "the collapsed bar does not carry the current screen's index").toBe(SPLASH.idx);
    expect(label, "the collapsed bar does not name the current screen").toBe(SPLASH.label);
    expect(idx.length, "the index is empty").toBeGreaterThan(0);
    expect(label.length, "the label is empty").toBeGreaterThan(0);

    // The other polarity of the touch context's own media probe: a pointer
    // exists here, so `(hover: hover)` is true, and the pointer path below is
    // reachable. In the touch context the same call returns false.
    expect(
      await page.evaluate(() => matchMedia("(hover: hover)").matches),
      "the desktop project reports no hover pointer, so the pointer path cannot be measured here",
    ).toBe(true);
  });

  test("pointer - hovering the bar opens the index", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);
    await expect.poll(() => panelRows(page), { message: "not collapsed before the hover" }).toBe("0px");

    await page.hover(TOGGLE);
    await expectOpen(page, "hovering the bar left the index collapsed");
  });

  test("keyboard - tabbing INTO the panel opens it, and focusing the toggle does not", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);
    await expect.poll(() => panelRows(page), { message: "not collapsed before the tab walk" }).toBe("0px");

    // Bounded: eight presses is comfortably past the skip link, the wordmark
    // and the toggle on this page, and an unbounded loop against a focus trap
    // is a hang rather than a failure.
    let landedInPanel = false;
    let sawToggleFocused = false;
    for (let i = 0; i < 8 && !landedInPanel; i += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>(".navwrap");
        const active = document.activeElement;
        return {
          insidePanel: wrap !== null && active !== null && wrap.contains(active),
          isToggle: active instanceof HTMLElement && active.dataset["ui"] === "nav-toggle",
          rows: wrap === null ? "no-navwrap" : getComputedStyle(wrap).gridTemplateRows,
        };
      });
      if (where.isToggle) {
        sawToggleFocused = true;
        // THE SCOPING CLAUSE. `:focus-within` is on `.navwrap` and deliberately
        // NOT on `.sysbar`: scoped to the bar it also fired on the TOGGLE, and
        // that is the second form of the Escape defect - focusing a shut
        // disclosure's own button re-opened it. If this reads anything but 0px
        // the selector has drifted back onto the bar.
        expect(where.rows, "focusing the toggle opened the panel - :focus-within has drifted onto the bar").toBe("0px");
      }
      landedInPanel = where.insidePanel;
    }

    expect(sawToggleFocused, "the tab walk never focused the toggle, so the scoping clause never ran").toBe(true);
    expect(landedInPanel, "eight Tab presses never reached a control inside .navwrap").toBe(true);

    await expectOpen(page, "focus inside the panel did not open it");

    // AND IT IS THE PANEL DOING THE WORK, NOT THE BUTTON. The button's own
    // state is still shut: no `data-open`, `aria-expanded` still false. A
    // keyboard user never has to know the button exists.
    await expect(page.locator(TOGGLE), "the button claims it opened this").toHaveAttribute("aria-expanded", "false");
    expect(await page.locator(SYSBAR).getAttribute("data-open"), "the bar was forced open rather than focused open").toBeNull();
  });

  test("button and Escape - the index opens, and Escape closes the PICTURE and not only the attribute", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);

    await page.locator(TOGGLE).click();
    await expectOpen(page, "the button did not open the index");
    await expect(page.locator(TOGGLE)).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator(SYSBAR).getAttribute("data-open"), "data-open is absent on a forced-open bar").not.toBeNull();

    // THE POINTER IS LEFT WHERE THE CLICK PUT IT - on the toggle, inside the
    // bar - on purpose. Escape has to beat `:hover` as well as `:focus-within`,
    // and parking the mouse first would quietly remove half of what is being
    // tested.
    await page.keyboard.press("Escape");

    await expect(page.locator(TOGGLE)).toHaveAttribute("aria-expanded", "false");
    expect(await page.locator(SYSBAR).getAttribute("data-closed"), "data-closed is absent after Escape").not.toBeNull();

    // THIS CLAUSE IS THE POINT OF THE TEST. The first version of this component
    // shipped with `aria-expanded="false"`, `data-open` gone and the computed
    // `grid-template-rows` still at 546.844px, because Escape returns focus to
    // the toggle and `:focus-within` on the bar re-opened it. Both attribute
    // assertions above passed on that defect. Only this one caught it.
    await expect
      .poll(() => panelRows(page), { message: "Escape cleared the attributes and left the index open" })
      .toBe("0px");
  });

  test("touch - the panel is collapsed on load, one tap opens it and a second closes it", async ({ browser }) => {
    // A SEPARATE CONTEXT, BECAUSE TOUCH IS NOT A SETTING ON THE DESKTOP ONE.
    // On a phone there is no hover and no Tab, so two of the three entry paths
    // do not exist at all and the button is the whole disclosure. A7 says touch
    // is asserted rather than assumed; this is that assertion.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage();
      await page.goto("/");

      // THE RECORD THAT THE POINTER PATH GENUINELY DOES NOT EXIST HERE. Without
      // it, a tap that "worked" could be an emulated pointer opening the bar by
      // hover and the button doing nothing at all - which is exactly the
      // sticky-hover bug the `(hover: hover)` media gate in globals.css was
      // added to close, measured with `.sysbar:hover` matching on a phone.
      expect(
        await page.evaluate(() => matchMedia("(hover: hover)").matches),
        "the touch context reports a hover pointer, so this proves nothing about touch",
      ).toBe(false);

      await expect
        .poll(() => panelRows(page), { message: "the index was already open on a fresh touch load" })
        .toBe("0px");

      await page.locator(TOGGLE).tap();
      await expectOpen(page, "a tap on the toggle did not open the index");
      await expect(page.locator(TOGGLE)).toHaveAttribute("aria-expanded", "true");

      await page.locator(TOGGLE).tap();
      await expect
        .poll(() => panelRows(page), { message: "a second tap did not close the index" })
        .toBe("0px");
      await expect(page.locator(TOGGLE)).toHaveAttribute("aria-expanded", "false");
    } finally {
      await context.close();
    }
  });
});

test.describe("HANDOFF-04a A7 fail state - the same probes against the defects that were measured", () => {
  test("the rows probe catches the Escape defect when the pre-fix rule is planted back", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);
    await page.locator(TOGGLE).click();
    await expectOpen(page, "the button did not open the index");
    await page.keyboard.press("Escape");
    await expect.poll(() => panelRows(page), { message: "the page did not pass before the plant" }).toBe("0px");

    // THE MEASURED DEFECT, RESTORED. The pre-fix stylesheet had no rule that
    // let an explicit close beat an implicit open, so a bar that was hovered or
    // that held focus stayed at `1fr` after Escape. Planting the same effect as
    // a stylesheet rather than editing the component is what keeps this a
    // reproduction of the defect instead of a test of a code change.
    await page.evaluate(() => {
      const planted = document.createElement("style");
      planted.id = "planted-prefix-disclosure-rule";
      planted.textContent = ".sysbar[data-closed] .navwrap { grid-template-rows: 1fr; }";
      document.head.append(planted);
    });

    await expect
      .poll(() => panelRowsPx(page), { message: "the planted pre-fix rule did not re-open the panel - the plant is inert" })
      .toBeGreaterThan(OPEN_PX);

    // AND THIS IS WHY THE ATTRIBUTE IS NOT THE ASSERTION. Both attributes still
    // report a closed disclosure while the index stands wide open. A version of
    // this test written against `aria-expanded` alone would be green right now.
    await expect(page.locator(TOGGLE), "the plant changed the attribute too, so it is not the defect").toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(await page.locator(SYSBAR).getAttribute("data-closed"), "data-closed vanished under the plant").not.toBeNull();
  });

  test("the collapsed-bar probe catches an emptied label", async ({ page }) => {
    await page.goto("/");
    await parkPointer(page);
    expect((await page.locator(".here-label").innerText()).trim(), "the bar did not name the screen before the plant").toBe(
      SPLASH.label,
    );

    await page.evaluate(() => {
      const label = document.querySelector<HTMLElement>(".here-label");
      if (label !== null) label.textContent = "";
    });

    const after = (await page.locator(".here-label").innerText()).trim();
    expect(after.length, "the same read still saw a screen name on a bar that has none").toBe(0);
    expect(after, "the same read still matched the table entry").not.toBe(SPLASH.label);
  });

  test("the touch path fails again once the toggle is buried, which is how it was found", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect.poll(() => panelRows(page), { message: "not collapsed before the plant" }).toBe("0px");

      // THE DEFECT AS IT WAS MEASURED: the toggle was inside `.sysbar-in`,
      // which wraps, so on a 390px viewport the full-width panel wrapped above
      // the button and buried it - and the way that was found was that
      // Playwright could not tap the button. An interceptor over the toggle
      // reproduces the reader's situation exactly.
      await page.evaluate(() => {
        const interceptor = document.createElement("div");
        interceptor.id = "planted-toggle-interceptor";
        interceptor.style.cssText = "position:fixed;inset:0;z-index:99999;background:transparent";
        document.body.append(interceptor);
      });

      let tapFailed = false;
      try {
        await page.locator(TOGGLE).tap({ timeout: 3_000 });
      } catch {
        tapFailed = true;
      }
      expect(tapFailed, "the tap reached a buried toggle, so the interceptor is inert and this proves nothing").toBe(true);

      // The SAME open probe, re-run: the one disclosure path a touch device has
      // is gone, and the index stays shut.
      await expect
        .poll(() => panelRows(page), { message: "the index opened without a tap reaching the toggle" })
        .toBe("0px");
    } finally {
      await context.close();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* A10 - reduced motion by architecture                                       */
/* -------------------------------------------------------------------------- */

/**
 * TIMING IS THE WHOLE DIFFICULTY OF THIS ASSERTION.
 *
 * `document.getAnimations()` reports RUNNING animations, and a CSS transition
 * that has already finished is not one. So a probe taken after a settle wait
 * returns an empty array on a page that transitioned perfectly happily a moment
 * earlier, and "no animation system was constructed" would be indistinguishable
 * from "the animation finished before anyone looked". Every sample below is
 * therefore taken IMMEDIATELY after the state change that would start one, with
 * no wait in between. Measured against this build: the same immediate sample
 * under `no-preference` returns three `CSSTransition` objects, and under
 * `reduce` returns none - which is the fail side of the same probe, taken with
 * the input the predicate excludes rather than with a code change.
 */
async function openByEveryPath(page: Page, sample: (step: string, running: readonly string[]) => void): Promise<void> {
  sample("at rest", await runningAnimations(page));

  await page.hover(TOGGLE);
  sample("pointer", await runningAnimations(page));
  await parkPointer(page);

  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>(".navwrap");
      return wrap !== null && document.activeElement !== null && wrap.contains(document.activeElement);
    });
    if (inside) break;
  }
  sample("keyboard", await runningAnimations(page));

  await page.locator(TOGGLE).click();
  sample("button", await runningAnimations(page));
}

test.describe("HANDOFF-04a A10 pass state - reduced motion by architecture", () => {
  test("opening the index by all three paths constructs no animation and schedules no frame", async ({ page }) => {
    // Set before `goto`, so the preference is in force before the first script
    // runs and the components see it at hydration rather than after it.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await parkPointer(page);

    // The report only exists once the page has hydrated. Poll for it from Node
    // rather than waiting a fixed time.
    await expect
      .poll(async () => (await readZr(page))?.refused["FogCanvas"] ?? null, {
        message: "window.__zr.refused.FogCanvas was never set - did the page hydrate?",
        timeout: 20_000,
      })
      .not.toBeNull();

    const seen: string[] = [];
    await openByEveryPath(page, (step, running) => {
      if (running.length > 0) seen.push(`${step}: ${running.join(", ")}`);
    });
    expect(seen, "an animation object was running under prefers-reduced-motion: reduce").toEqual([]);

    // The index really did open, or the four samples above measured nothing.
    await expectOpen(page, "none of the three paths opened the index, so the animation samples are vacuous");
    expect(await runningAnimations(page), "an animation is running with the index open under reduce").toEqual([]);

    // NOTHING CANCELLED, NOTHING CONSTRUCTED. `getAnimations()` cannot see a
    // rAF loop at all, so the architectural half of the claim is read off the
    // components' own report.
    const zr = await readZr(page);
    expect(zr, "window.__zr is missing; NEXT_PUBLIC_ENABLE_DEV_SURFACES should be on for the suite").not.toBeNull();
    expect(zr?.rafCalls, "a frame was scheduled under prefers-reduced-motion: reduce").toBe(0);
    expect(zr?.constructed ?? [], "an ambience system constructed itself under reduce").toHaveLength(0);
  });
});

test.describe("HANDOFF-04a A10 fail state - the same probe, given something to see", () => {
  test("a planted Web Animations object is reported by the same getAnimations() probe", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await parkPointer(page);
    expect(await runningAnimations(page), "the page did not pass before the plant").toEqual([]);

    // The member of the exclusion set the assertion names: "a Web Animations
    // object created on the splash under reduce", planted with `element.animate`
    // exactly as HANDOFF-04a section 5 specifies. Five seconds so it is still
    // running when the probe reads it.
    await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(".here-label");
      target?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 5_000 });
    });

    const running = await runningAnimations(page);
    expect(running.length, "the same probe cannot see a real animation, so zero was never evidence").toBeGreaterThan(0);
  });

  test("the same probe sees the disclosure's own transition when the preference is not set", async ({ page }) => {
    // A DATA MUTATION, NOT A CODE ONE: the input drawn from outside the
    // predicate's accepted set is a reader who did not ask for reduced motion.
    // If this returned an empty array too, the pass above would be a statement
    // about the probe's timing rather than about the stylesheet.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await parkPointer(page);

    await page.locator(TOGGLE).click();
    const running = await runningAnimations(page);
    expect(
      running,
      "no transition was running immediately after the click without the preference - the sample is taken too late to discriminate",
    ).toContain("CSSTransition");
  });
});

/* -------------------------------------------------------------------------- */
/* A1 (rendered half) - one source per quantity, on the turnstile plane       */
/* -------------------------------------------------------------------------- */

interface PlaneReadout {
  readonly head: string;
  readonly marks: number;
  readonly labels: readonly { readonly lane: string; readonly kind: string; readonly traffic: string }[];
  readonly legend: readonly { readonly lane: string; readonly traffic: string }[];
}

/** Everything the plane renders as text, read off the page and never recomputed. */
async function readPlane(page: Page): Promise<PlaneReadout> {
  return page.evaluate(() => {
    const head = document.querySelector<HTMLElement>('[data-ui="turnstile-reading"]');
    const labels = [...document.querySelectorAll<HTMLElement>(".tplane-label")].map((li) => ({
      lane: li.querySelector<HTMLElement>(".tl-name")?.innerText.trim() ?? "",
      kind: li.getAttribute("data-traffic") ?? "",
      traffic: li.querySelector<HTMLElement>(".tl-traffic")?.innerText.trim() ?? "",
    }));
    const legend = [...document.querySelectorAll<HTMLElement>(".tplane-legend .tlg")].map((li) => {
      const copy = li.cloneNode(true) as HTMLElement;
      copy.querySelector("b")?.remove();
      return {
        lane: (copy.textContent ?? "").trim(),
        traffic: li.querySelector<HTMLElement>("b")?.innerText.trim() ?? "",
      };
    });
    return {
      head: head === null ? "" : head.innerText,
      marks: document.querySelectorAll(".tmark").length,
      labels,
      legend,
    };
  });
}

/** Thousands separators the way `fmtInt` and `toLocaleString("en")` both write them. */
function group(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function ungroup(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/**
 * A1 stated as a predicate over the rendered plane.
 *
 * FOUR RENDERINGS, ONE DERIVATION. The header's crossing count, the orchard and
 * ironwood traffic lines, the five legend rows and the number of marks on the
 * board are four renderings of one `Plane` object, and every number below is
 * PARSED OUT OF THE PAGE rather than compared against a literal - a hardcoded
 * 1,284 would pin the fixture and say nothing about whether the four agree.
 *
 * The three defects this is written against were all shipped into the study and
 * caught with a screenshot: a board drawing 17 marks under a reading that said
 * 1,284; a legend computed from the fixture beside arcs computed from the live
 * board; and a mempool row claiming three crossings the plane did not draw.
 */
function planeProblems(r: PlaneReadout): string[] {
  const problems: string[] = [];

  const reading = /([\d,]+)\s+crossings measured over\s+([\d,]+)\s+blocks/.exec(r.head);
  if (reading === null || reading[1] === undefined || reading[2] === undefined) {
    problems.push(`the header states no crossing count and no window: "${r.head.replace(/\n/g, " / ")}"`);
    return problems;
  }
  const counted = ungroup(reading[1]);
  const windowBlocks = ungroup(reading[2]);
  if (!Number.isFinite(counted) || counted < 0) problems.push(`the header's crossing count is not a count: "${reading[1]}"`);
  if (!Number.isFinite(windowBlocks) || windowBlocks < 1) {
    problems.push(`the header's window is not a block span: "${reading[2]}"`);
  }

  // Capped or not, the DRAWN figure is the one the board is claiming to hold.
  const drawnMatch = /board drawing ([\d,]+) of them/.exec(r.head);
  const everyOne = r.head.includes("every one drawn");
  if (drawnMatch === null && !everyOne) {
    problems.push(`the header says neither how many marks were drawn nor that every one was: "${r.head.replace(/\n/g, " / ")}"`);
  }
  const drawn = drawnMatch?.[1] === undefined ? counted : ungroup(drawnMatch[1]);

  // ONE MARK PER DRAWN CROSSING, AND NEVER MORE THAN WERE COUNTED.
  if (r.marks !== drawn) {
    problems.push(`the header says the board draws ${group(drawn)} marks and the board holds ${group(r.marks)} .tmark nodes`);
  }
  if (drawn > counted) {
    problems.push(`the board claims to draw ${group(drawn)} of ${group(counted)} counted crossings`);
  }

  // THE MEASURED RELATION IS ORCHARD -> IRONWOOD AND NOTHING ELSE, so the two
  // lanes in it must carry the header's count, in the header's notation.
  const byLane = new Map(r.labels.map((l) => [l.lane, l]));
  const expected: readonly (readonly [string, string])[] = [
    ["orchard", `${group(counted)} out / 0 in`],
    ["ironwood", `0 out / ${group(counted)} in`],
  ];
  for (const [lane, want] of expected) {
    const label = byLane.get(lane);
    if (label === undefined) {
      problems.push(`the plane renders no ${lane} label`);
      continue;
    }
    if (label.kind !== "measured") {
      problems.push(`${lane} is rendered as data-traffic="${label.kind}" while the header states a measured count`);
    }
    if (label.traffic !== want) {
      problems.push(`${lane} label says "${label.traffic}" and the header says "${want}"`);
    }
  }

  // THE LEGEND AND THE LABELS ARE THE SAME SENTENCE TWICE. Compared row by row
  // in rendered order, so a legend that drifts out of LANE_ORDER is a finding
  // as well as one that drifts in its numbers.
  if (r.legend.length !== r.labels.length) {
    problems.push(`the legend has ${String(r.legend.length)} rows and the board has ${String(r.labels.length)} labels`);
  }
  const rows = Math.min(r.legend.length, r.labels.length);
  for (let i = 0; i < rows; i += 1) {
    const legend = r.legend[i];
    const label = r.labels[i];
    if (legend === undefined || label === undefined) continue;
    if (legend.lane !== label.lane) {
      problems.push(`legend row ${String(i)} names "${legend.lane}" and label row ${String(i)} names "${label.lane}"`);
      continue;
    }
    if (legend.traffic !== label.traffic) {
      problems.push(`${legend.lane}: legend says "${legend.traffic}" and its label says "${label.traffic}"`);
    }
  }

  return problems;
}

test.describe("HANDOFF-04a A1 pass state - one source per quantity on the plane", () => {
  test("the header, both traffic lines, the legend and the marks are one derivation", async ({ page }) => {
    await page.goto("/");
    const readout = await readPlane(page);

    // A plane with no reading at all would make every comparison below vacuous.
    expect(readout.head, "the plane rendered no reading, so there is nothing to cross-check").toContain("crossings measured");
    expect(readout.labels.length, "the plane rendered no lane labels").toBeGreaterThan(0);
    expect(readout.legend.length, "the plane rendered no legend rows").toBeGreaterThan(0);
    expect(readout.marks, "the board drew no marks").toBeGreaterThan(0);

    expect(planeProblems(readout), "two renderings of one quantity disagree").toEqual([]);
  });
});

test.describe("HANDOFF-04a A1 fail state - the same comparison against a rewritten legend row", () => {
  test("planeProblems names the pair when one legend row is given a different count", async ({ page }) => {
    await page.goto("/");
    expect(planeProblems(await readPlane(page)), "the page did not pass before the plant").toEqual([]);

    // The member of the exclusion set A1 names: a pair of renderings of one
    // quantity that disagree. The count is perturbed by one, not replaced by
    // nonsense, because a legend fed from a stale source is off by a plausible
    // number rather than by an obvious one - which is why the study's version
    // of this defect survived a reading and was caught with a screenshot.
    const planted = await page.evaluate(() => {
      const orchard = [...document.querySelectorAll<HTMLElement>(".tplane-legend .tlg")].find((li) =>
        (li.textContent ?? "").trim().startsWith("orchard"),
      );
      const bold = orchard?.querySelector("b");
      if (bold === null || bold === undefined) return null;
      const before = bold.textContent ?? "";
      const digits = /^([\d,]+) out/.exec(before);
      if (digits?.[1] === undefined) return null;
      const bumped = String(Number(digits[1].replace(/,/g, "")) + 1).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      bold.textContent = before.replace(digits[1], bumped);
      return { before, after: bold.textContent };
    });
    expect(planted, "the orchard legend row could not be found or carried no count - the plant is inert").not.toBeNull();
    expect(planted?.after, "the rewrite did not change the row").not.toBe(planted?.before);

    const problems = planeProblems(await readPlane(page));
    expect(problems.length, "the same comparison saw nothing wrong with a legend that contradicts its own label").toBeGreaterThan(0);
    expect(
      problems.join("\n"),
      "the finding does not name the pair - a disagreement that does not say which two renderings disagree is not actionable",
    ).toContain("orchard: legend says");
  });
});

/* -------------------------------------------------------------------------- */
/* A4 (rendered half) - every summary carries its finding                     */
/* -------------------------------------------------------------------------- */

/**
 * A4's exclusion set is "any summary text with no digit in it" and its named
 * counter-example is the bare word `Sources`. A disclosure whose closed line
 * says only what is behind it makes a reader open it to find out whether it is
 * worth opening; a digit in the summary is the finding arriving before the
 * click.
 *
 * `/track` CARRIES NO `summary` AT ALL ON A FRESH LOAD, AND THAT IS RECORDED
 * RATHER THAN HIDDEN. Its only disclosure is `EstimatePanel`'s, which exists
 * once an estimate does - on `/tx/...` and `/address/...`, not on the search
 * page. So this route's leg of the sweep is VACUOUS, its floor is 0, and the
 * count is pinned at 0 so that the day a disclosure lands on `/track` this test
 * fails and says to raise the floor. A vacuous check that announces itself is a
 * different thing from one that passes quietly.
 */
const SUMMARY_ROUTES: readonly { readonly route: string; readonly floor: number }[] = [
  { route: "/", floor: 1 },
  { route: "/beware", floor: 1 },
  { route: "/track", floor: 0 },
];

/** Every summary on the page whose rendered text carries no digit. */
async function digitlessSummaries(page: Page): Promise<string[]> {
  // A SUMMARY INSIDE A CLOSED `<details>` RENDERS NO TEXT, so its `innerText` is
  // the empty string and it reads as digitless. "Not on screen" and "says
  // nothing" produce the same output, which is precisely the reading this
  // project's rule about probes forbids - a probe that does not discriminate and
  // a page that is wrong are indistinguishable from the result alone.
  //
  // It was latent until HANDOFF-04b: no page nested one disclosure inside
  // another, so every summary was rendered when the sweep ran. /beware now puts
  // nine citation disclosures inside the collapsed B2 register, and the pass
  // state would have reported nine empty strings for summaries that all carry
  // their finding. Found by a worker measuring its own page rather than by this
  // suite failing, and reported against the PROBE rather than repaired quietly.
  //
  // Every disclosure is opened, read, and restored to the state it was found in
  // - the sweep must not leave the page in a configuration a later assertion
  // reads as the shipped one.
  return page.evaluate(() => {
    const details = [...document.querySelectorAll("details")];
    const wasOpen = details.map((d) => d.open);
    for (const d of details) d.open = true;
    const found = [...document.querySelectorAll<HTMLElement>("summary")]
      .map((s) => s.innerText.replace(/\s+/g, " ").trim())
      .filter((text) => !/[0-9]/.test(text));
    details.forEach((d, i) => {
      d.open = wasOpen[i] ?? false;
    });
    return found;
  });
}

async function countSummaries(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("summary").length);
}

test.describe("HANDOFF-04a A4 pass state - every summary carries its finding", () => {
  for (const { route, floor } of SUMMARY_ROUTES) {
    test(`${route} - every summary's text contains at least one digit`, async ({ page }) => {
      await page.goto(route);
      const count = await countSummaries(page);
      expect(count, `${route} rendered fewer than ${String(floor)} summaries, so the sweep under-covers it`).toBeGreaterThanOrEqual(
        floor,
      );
      if (route === "/track") {
        expect(
          count,
          "/track has gained a disclosure: raise its floor above 0 and delete this pin - the leg is no longer vacuous",
        ).toBe(0);
      }
      expect(await digitlessSummaries(page), `${route} has a summary with no digit in it`).toEqual([]);
    });
  }
});

test.describe("HANDOFF-04a A4 fail state - the same sweep against a summary with its digits removed", () => {
  test("digitlessSummaries reports a summary once its digits are stripped", async ({ page }) => {
    await page.goto("/beware");
    expect(await countSummaries(page), "/beware rendered no summary, so there is nothing to strip").toBeGreaterThan(0);
    expect(await digitlessSummaries(page), "the page did not pass before the plant").toEqual([]);

    // The member the assertion names: a summary reduced to the bare word
    // `Sources`. `textContent` is set rather than a child edited, so the plant
    // replaces the element's nested spans instead of only its first child.
    //
    // THE PLANT COMES BACK UPPERCASED, AND THAT IS THE SWEEP TELLING THE TRUTH
    // ABOUT ITSELF. `innerText` is the RENDERED text, so it carries
    // `text-transform`, and the citation disclosures on this page are
    // uppercased in CSS. The first version of this fail side asserted the
    // string it had planted, failed, and the finding was in the probe rather
    // than in the page - so the expectation is now case-insensitive and the
    // reason is written down. It also settles what A4 is a claim about: the
    // digits a reader can see, not the digits in the markup.
    const planted = await page.evaluate(() => {
      const summary = document.querySelector<HTMLElement>("summary");
      if (summary === null) return null;
      summary.textContent = "Sources";
      return summary.innerText.replace(/\s+/g, " ").trim();
    });
    expect(planted ?? "", "no summary was found to strip").toMatch(/^sources$/i);
    expect(planted ?? "", "the plant still carries a digit, so it is not a member of the exclusion set").not.toMatch(/[0-9]/);

    const found = await digitlessSummaries(page);
    expect(found.length, "the same sweep saw nothing wrong with a summary that carries no digit").toBe(1);
    expect(found[0] ?? "", "the sweep reported a different summary than the one that was planted").toMatch(/^sources$/i);
  });
});
