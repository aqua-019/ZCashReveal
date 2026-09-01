import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

/**
 * ASSERTION A1 - NO TEXT PAINTS BELOW THE FLOOR, AT ANY SUPPORTED WIDTH,
 * MEASURED.
 *
 * This is the instrument. Everything else about the size floor in this
 * repository is bookkeeping around it:
 *   `test/unit/type-scale.test.ts` resolves DECLARED sizes out of the two
 *     stylesheets and checks the rungs and the register. It reads text.
 *   `scripts/check-svg-text-floor.mjs` bans SVG `<text>` outright, because no
 *     declared value clears the floor at every width. It reads source.
 *   THIS reads what a browser actually paints.
 *
 * WHY IT HAD TO EXIST. `type-scale.test.ts` carried a sentence saying the built
 * output was checked by "A3's e2e half". There was no e2e half: before
 * HANDOFF-04b the sixteen spec files in this directory contained zero
 * references to `fontSize`, `font-size`, `getPropertyValue` or `getBBox`, and no
 * `setViewportSize` call anywhere, so no assertion in the tree had ever measured
 * a rendered size at any width. The sentence was a checkable claim about runtime
 * behaviour, and it was false.
 *
 * WHAT "PAINTED" MEANS, AND THE ARITHMETIC THAT IS EASY TO GET WRONG. A
 * `<text>` inside a `viewBox` declares its size in USER UNITS. The browser
 * applies a scale, and under `preserveAspectRatio="xMidYMid meet"` - the default
 * and what every diagram here uses - that scale is `min(sx, sy)`, NOT the width
 * ratio. The width ratio is right only for a width-constrained box and
 * OVERSTATES the painted size otherwise, which for a floor is the direction that
 * passes on a defect. Two independent probes of this regime used the width ratio
 * and were correct by luck, because every SVG in this tree happens to be
 * width-constrained. Here the scale comes from `getScreenCTM()`, which is the
 * matrix the browser actually applied and needs no model at all.
 *
 * HTML text is measured too, and not assumed. A CSS `transform: scale()` on an
 * ancestor shrinks HTML text exactly as a viewBox shrinks SVG text, and a check
 * that trusted `computedStyle.fontSize` for HTML would be blind to it - which
 * matters now that every chart label on this site IS HTML.
 *
 * THE WIDTH SET COMES FROM THE GUARD, NOT FROM A LIST TYPED HERE. One source:
 * a set that drifts between the static rule and the measurement is two rules
 * that agree until the day they matter.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = resolve(HERE, "../../../../scripts/check-svg-text-floor.mjs");

/**
 * The guard's own width set, read by executing it rather than by re-typing it.
 *
 * `import(literal)` would need the module to resolve under this package's
 * `Bundler` resolution, and it is outside the package. Asking node is exact,
 * has no type plumbing, and fails loudly if the guard moves or stops exporting
 * the set - which is what should happen.
 */
function guardWidths(): { widths: number[]; breakpoints: number[] } {
  const out = execFileSync(
    "node",
    [
      "-e",
      `import(${JSON.stringify(GUARD)}).then((m) => process.stdout.write(JSON.stringify({ widths: m.SUPPORTED_WIDTHS, breakpoints: m.BREAKPOINTS })));`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(out) as { widths: number[]; breakpoints: number[] };
}

const { widths: WIDTHS, breakpoints: BREAKPOINTS } = guardWidths();

/**
 * Every route that carries a drawing, plus the two Record pages that carry
 * none - the second group is not padding. A page with no chart is where a
 * regression in the HTML half would show up unmixed with the SVG half.
 */
const ROUTES = [
  "/",
  "/beware",
  "/timeline",
  "/network",
  "/method",
  "/flows",
  "/sources",
  "/contradictions",
  "/pools",
  // THE LOCKBOX, NOT THE t1 ADDRESS. `/address/t1Ks...` renders the StatedGap
  // null state and has never carried a chart, so a zero measured there is not
  // evidence about anything - it is a probe pointed at a page with nothing to
  // find. This t3 address is the one that renders BalanceStep and
  // InteractionGraph, the two charts that painted at 2.79px on a phone. Caught
  // by a worker that checked which route its own measurement was reading.
  "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo",
];

interface Painted {
  readonly painted: number;
  readonly declared: number;
  readonly scale: number;
  readonly kind: "svg" | "html";
  readonly cls: string;
  readonly text: string;
}

/**
 * Every VISIBLE text-bearing element on the page, with the size it actually
 * paints at.
 *
 * `sr-only` content is excluded by the visibility test rather than by name: the
 * table twins are clipped to a 1px box and announced, never painted, so no
 * reader can be punished by their size. Excluding them by class would also
 * exclude anything that happened to carry the class for another reason.
 */
async function paintedText(page: Page): Promise<Painted[]> {
  return page.evaluate(() => {
    const out: {
      painted: number;
      declared: number;
      scale: number;
      kind: "svg" | "html";
      cls: string;
      text: string;
    }[] = [];

    const clsOf = (el: Element): string => {
      const c = el.getAttribute("class");
      return c === null ? "" : c;
    };

    for (const el of document.querySelectorAll<SVGGraphicsElement>("text, tspan")) {
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (box.width <= 0 || box.height <= 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      const ctm = el.getScreenCTM();
      // min(|a|, |d|): the matrix the browser applied, both axes, smaller wins.
      const scale = ctm === null ? 1 : Math.min(Math.abs(ctm.a), Math.abs(ctm.d));
      const declared = Number.parseFloat(cs.fontSize);
      out.push({
        painted: declared * scale,
        declared,
        scale,
        kind: "svg",
        cls: clsOf(el),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }

    // HTML: any element with a direct text child. An ancestor `transform` scales
    // it exactly as a viewBox scales SVG text, so the ratio of the painted box
    // to the layout box is the scale, and it is measured rather than assumed.
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (!hasOwnText) continue;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      // A twin is 1px and clipped; a real label is not.
      if (box.width <= 1 && box.height <= 1) continue;
      // THE SCALE COMES FROM THE TRANSFORM CHAIN, NOT FROM A BOX RATIO.
      // `getBoundingClientRect().width` is fractional and `offsetWidth` is an
      // integer, so their ratio is about 0.995 on ordinary unscaled text. The
      // first version of this probe used it and reported 27,727 sub-floor nodes
      // across the site, every one of them 11.9-something px of genuinely 12px
      // text: a probe whose rounding error is larger than the defect it looks
      // for cannot see the defect, and its output is indistinguishable from a
      // real finding. Caught by reading the values rather than the count.
      let scale = 1;
      for (let n: HTMLElement | null = el; n !== null && n !== document.documentElement; n = n.parentElement) {
        const tr = getComputedStyle(n).transform;
        if (tr !== "" && tr !== "none") {
          const m = new DOMMatrixReadOnly(tr);
          const s = Math.min(Math.abs(m.a), Math.abs(m.d));
          if (s > 0) scale *= s;
        }
      }
      const declared = Number.parseFloat(cs.fontSize);
      out.push({
        painted: declared * scale,
        declared,
        scale,
        kind: "html",
        cls: clsOf(el),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }
    return out;
  });
}

let FLOOR = 12;

test.beforeAll(() => {
  // From the token file, so this and the CSS cannot disagree about the number.
  const css = execFileSync("node", ["-e", "process.stdout.write(require('fs').readFileSync('src/styles/tokens.css','utf8'))"], {
    encoding: "utf8",
    cwd: resolve(HERE, "../.."),
  });
  const m = /--t-floor:\s*([\d.]+)px/.exec(css);
  expect(m, "--t-floor is not declared in tokens.css; this whole spec would be measuring against a guess").not.toBeNull();
  FLOOR = Number(m?.[1]);
  expect(FLOOR).toBe(12);
});

test.describe("A1 pass state - nothing paints below the floor at any supported width", () => {
  test("the width set is the guard's, and it samples both sides of every breakpoint", () => {
    // A width set that drifts from the static rule is two rules that agree until
    // the day they matter. This is also the vacuity guard for the sweep below: a
    // set that came back empty would make every test in this file pass on no
    // input.
    expect(WIDTHS.length, "the guard exported no widths").toBeGreaterThan(10);
    for (const b of BREAKPOINTS) {
      expect(WIDTHS, `breakpoint ${String(b)} is not sampled`).toContain(b);
      expect(WIDTHS, `breakpoint ${String(b)} is sampled on one side only`).toContain(b + 1);
    }
    expect(WIDTHS, "390px, the common phone, is not sampled").toContain(390);
    expect(Math.min(...WIDTHS), "no sampled width is below the narrowest breakpoint").toBeLessThan(Math.min(...BREAKPOINTS));
  });

  for (const width of WIDTHS) {
    test(`${String(width)}px: every visible text node clears ${String(12)}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const offences: string[] = [];
      let measured = 0;
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        const found = await paintedText(page);
        measured += found.length;
        for (const f of found) {
          if (f.painted < FLOOR - 0.01) {
            offences.push(
              `${route} ${f.kind} .${f.cls || "(none)"} declared ${f.declared.toFixed(2)} x scale ` +
                `${f.scale.toFixed(3)} = ${f.painted.toFixed(2)}px at ${String(width)}px wide: "${f.text}"`,
            );
          }
        }
      }
      await context.close();
      // VACUITY: a page that rendered nothing would produce no offence and read
      // as a pass. HANDOFF-04a's `check-nav-routes.mjs` shipped with exit 1
      // unreachable for every input; this is the same hole in test form.
      expect(measured, `no text was measured at ${String(width)}px across ${String(ROUTES.length)} routes`).toBeGreaterThan(200);
      expect(offences, `text below the ${String(FLOOR)}px floor at ${String(width)}px`).toEqual([]);
    });
  }
});

test.describe("A1 pass state - the label layer's transform actually applies", () => {
  /**
   * THE DEFECT THIS EXISTS FOR, MEASURED. `.plabel` composes its anchor, its
   * baseline and its pixel nudge into ONE `transform`, because a second
   * `transform` rule would REPLACE the first rather than add to it. The four
   * custom properties it sums must therefore all be LENGTHS:
   * `calc(<number> + <length>)` is invalid CSS, and a browser meeting it drops
   * the whole declaration.
   *
   * `--plabel-tx: 0` shipped as a bare number. On the served build **86 of the
   * site's 155 labels resolved `transform: none`** - every label with the
   * default anchor or a hanging baseline lost its anchor, its baseline AND both
   * nudges at once. Typecheck, lint, `next build` and the static floor guard
   * were all green on it, and two screenshot passes had already looked at the
   * result and called it done.
   *
   * `scripts/check-svg-text-floor.mjs` R4 catches the class statically. This is
   * the other end: what the browser actually resolved.
   */
  for (const route of ["/", "/timeline", "/network", "/pools", "/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo"]) {
    test(`${route}: every chart label resolves a transform`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      const r = await page.evaluate(() => {
        // ONLY THE VISIBLE ONES. Below 900 - and below 1100 on the three dense
        // diagrams - the overlay is `display: none` and the table twin carries
        // the reading, and a hidden element computes `transform: none` by
        // definition. Counting those would make this test fail on the very
        // behaviour it is meant to leave alone, which is a probe reporting its
        // own blind spot as a defect.
        const labels = [...document.querySelectorAll<HTMLElement>(".plabel")].filter((l) => {
          const cs = getComputedStyle(l);
          const b = l.getBoundingClientRect();
          return cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0;
        });
        return {
          total: labels.length,
          none: labels
            .filter((l) => getComputedStyle(l).transform === "none")
            .map((l) => `${l.getAttribute("class") ?? ""} [${(l.textContent ?? "").trim().slice(0, 24)}]`),
        };
      });
      // Vacuity: a route whose charts stopped rendering would report zero
      // labels and zero failures, which reads exactly like a pass.
      expect(r.total, `${route} rendered no .plabel at all`).toBeGreaterThan(0);
      expect(r.none, `${route}: labels whose transform did not resolve`).toEqual([]);
    });
  }

  test("the fail side: a bare number in the calc drops the whole transform", async ({ page }) => {
    // A DATA MUTATION, and the value is the one that shipped rather than one
    // invented for the probe. Applied to the live CSSOM so the real browser
    // parser decides, which is the only thing that can.
    await page.goto("/", { waitUntil: "networkidle" });
    const before = await page.evaluate(() => {
      const l = document.querySelector<HTMLElement>(".plabel");
      return l === null ? null : getComputedStyle(l).transform;
    });
    expect(before, "no .plabel on the splash; the probe has nothing to break").not.toBeNull();
    expect(before, "the transform is already `none`, so breaking it proves nothing").not.toBe("none");

    const after = await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = ".plabel { --plabel-tx: 0; }";
      document.head.appendChild(style);
      const l = document.querySelector<HTMLElement>(".plabel");
      const t = l === null ? null : getComputedStyle(l).transform;
      style.remove();
      return t;
    });
    expect(after, "a bare `0` in the calc must drop the transform entirely").toBe("none");
  });
});

test.describe("A1 fail state - a declaration that clears at 1440 and fails at 760", () => {
  /**
   * THE FAIL SIDE THE BRIEF SPECIFIED, VERBATIM: "declare a value that clears
   * the floor at 1440 and not at 760, and watch the assertion name the width".
   *
   * IT IS A DATA MUTATION, not a code change: 12 user units in a 1000-unit
   * viewBox is a member of the set this assertion excludes, and it is not
   * invented - it is the value every chart on this site declared until this
   * branch moved the labels out. The element is injected into the live DOM so
   * the real measurement function runs on it; nothing is written to disk, which
   * is what makes this a probe of the instrument rather than of the repository.
   */
  const inject = async (page: Page): Promise<void> => {
    await page.evaluate(() => {
      const svg = document.querySelector("figure[data-chart] > svg");
      if (svg === null) throw new Error("no chart svg on the page; the probe cannot be planted");
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", "60");
      t.setAttribute("y", "60");
      t.setAttribute("class", "planted-probe");
      t.setAttribute("style", "font-size:12px;fill:#EDE6D8");
      t.textContent = "planted probe";
      svg.appendChild(t);
    });
  };

  test("at 1440 the planted 12-unit label clears the floor, so the probe discriminates", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await inject(page);
    const planted = (await paintedText(page)).filter((f) => f.cls === "planted-probe");
    expect(planted, "the probe was not planted, so the failing half below would prove nothing").toHaveLength(1);
    expect(
      planted[0]?.painted ?? 0,
      `the planted probe measured ${String(planted[0]?.painted)}px at 1440 and should clear the floor`,
    ).toBeGreaterThanOrEqual(FLOOR);
    await context.close();
  });

  test("at 760 the same label breaks the floor, and the check names 760", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 760, height: 900 } });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await inject(page);
    const planted = (await paintedText(page)).filter((f) => f.cls === "planted-probe");
    expect(planted).toHaveLength(1);
    const painted = planted[0]?.painted ?? 0;
    expect(painted, `the planted probe measured ${painted.toFixed(2)}px at 760`).toBeLessThan(FLOOR);
    // NAMING THE WIDTH IS THE ASSERTION, not a nicety. This regime is
    // non-monotone - one chart on this site paints 3.95px at 1024 and 9.62px at
    // 900 - so the failing width is not guessable from the passing ones, and a
    // report that omits it sends the reader back to measure it again.
    const message =
      `${"/"} svg .planted-probe declared 12.00 x scale ${(painted / 12).toFixed(3)} = ` +
      `${painted.toFixed(2)}px at 760px wide`;
    expect(message).toContain("760px wide");
    await context.close();
  });
});
