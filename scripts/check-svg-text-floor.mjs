// Guards the SVG half of the type-size floor: the half HANDOFF-04a measured,
// registered as an exception, and could not enforce.
//
// WHY THIS EXISTS, AND WHY IT IS A STRUCTURAL RULE RATHER THAN AN ARITHMETIC ONE.
//
// A `<text>` inside a scaled `viewBox` is not CSS pixels. Its declared size is
// in USER UNITS, and a user unit is whatever the browser divides the rendered
// box by, so the painted size is
//
//     painted = declared x scale,  scale = min(sx, sy) under `meet`
//
// where `sx` and `sy` are the box's width and height over the viewBox's - see
// `viewBoxScale` for `slice` and `none`, and for why the width ratio alone is
// wrong. It moves with the viewport. `--t-floor` is a rule about CSS pixels. There
// is no declared value that satisfies it at every width, because there is no
// width at which the scaling stops. HANDOFF-04a derived that from the source;
// L2 reproduced it on the served build; HANDOFF-04b measured every SVG on the
// site at ten viewport widths and found the same regime everywhere:
//
//     painted CSS px          1440    1024     760     390
//     TwoWindows      (12u)  16.10   11.11    7.94    3.79
//     ShieldedShare   (12u)   5.95    3.95    7.94    3.79
//     NetworkLoop sub (9.5u) 13.15    9.20    6.84    6.84
//     PoolSankey      (12u)  13.77    9.35    4.79    2.00
//
// TWO ROWS OF THAT TABLE REFUTE THE OBVIOUS MODEL and are why the rule is
// structural. `ShieldedShare` paints at 5.95px on a 1440px DESKTOP - it sits in
// a 0.8fr column of the `.record-head` grid, so the widest viewport gives it the
// narrowest box. And it is NON-MONOTONE: 3.95px at 1024, 9.62px at 900, because
// the head collapses to one column at 900 and the chart gets WIDER as the window
// gets smaller. A guard that assumed "narrower viewport, smaller text" and
// sampled the narrow end would have found neither.
//
// So the enforceable rule is not "compute the painted size of every `<text>`" -
// that needs the rendered width, which is a layout result and not a fact about
// the source. It is: **an SVG `<text>` must not exist**, unless a row of the
// REGISTER below accounts for it with its own measurement. The label goes to
// HTML positioned over the drawing, which is what `TurnstilePlane` has always
// done and what `components/record/ChartLabels.tsx` now does for every chart.
//
// THE BOUNDARY OF THIS GUARD, STATED HERE AND ECHOED IN THE OK LINE.
//   R1 is decided from the SOURCE and is exact: an element either exists or it
//     does not.
//   R2 is decided from the source and the register together.
//   R3 is ARITHMETIC OVER NUMBERS THE REGISTER ITSELF CARRIES. It computes the
//     painted size from a row's declared size, its viewBox width and the
//     rendered widths that row RECORDS, and it names the viewport width at
//     which the floor is broken. **It does not measure anything.** A register
//     row whose recorded rendered widths are wrong produces a confident wrong
//     answer, and nothing here can tell. The measurement lives in
//     `apps/web/test/e2e/painted-floor.spec.ts`, which resolves computed styles and
//     screen CTMs in a real browser at every supported width; that is the
//     instrument, and this is the bookkeeping around it.
//   The register is EMPTY as of HANDOFF-04b, because every label moved. R3
//     therefore has nothing live to run on and is driven only by the self-test.
//     That is stated rather than hidden: a green R3 today is evidence the
//     arithmetic is right, not evidence about the tree.
//
// Self-tested in both directions on every run. The self-test drives the REAL
// detectors, iterates the REGISTER's own rows, and drives R1 over the real
// `apps/web/src` tree as well as over a fixture - three of this project's
// guards have shipped with a self-test that certified a hole, and eleven of the
// twelve holes in `check-instrument-deps.mjs` were found by executing a probe
// rather than by reading one.

import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

/**
 * THE ROOTS SCANNED, and the two that are deliberately not.
 *
 * `src` is where every rendered component lives. `public` is scanned because a
 * static `.svg` served from there is painted by the same browser under the same
 * rules, and it does not exist today - which is exactly when a hole is cheapest
 * to close, and exactly the shape of the "new workspace member arrives without
 * inheriting a convention" origin CLAUDE.md tracks. A root that is absent is
 * skipped rather than failing, so adding one later needs no edit here.
 *
 * NOT SCANNED, and each for a stated reason rather than by omission:
 *   `apps/web/test` - a probe that PLANTS an SVG `<text>` to prove a detector
 *     fires is a legitimate use of the construct, and banning it there would
 *     forbid testing the rule. `test/e2e/painted-floor.spec.ts` does exactly
 *     that, through `createElementNS` rather than markup.
 *   `legacy/dashboard` - v0.2, read-only, retired at the HANDOFF-11 cutover.
 */
const ROOTS = ["apps/web/src", "apps/web/public"];
const TOKENS = "apps/web/src/styles/tokens.css";

/**
 * THE SUPPORTED VIEWPORT WIDTHS, derived from the stylesheet's own breakpoints
 * rather than chosen.
 *
 * `globals.css` declares seven max-width breakpoints - 1600, 1100, 1000, 900,
 * 760, 720, 700 - and a layout changes at each. A width is sampled on BOTH
 * sides of every breakpoint, because the `ShieldedShare` case is a chart that
 * gets larger as the window gets smaller and a one-sided sample steps over it.
 * The three widths outside the breakpoint set are the ones the two independent
 * measurements of this regime were taken at (1440, 1024, 760) plus a phone.
 */
export const BREAKPOINTS = [1600, 1100, 1000, 900, 760, 720, 700];

/**
 * THE SET IS DEFINED FROM THE CSS, NOT FROM A REVIEWER'S MEASUREMENT, and the
 * distinction is L2's own correction (interim note, 1 Sep 2026): "an assertion
 * whose width set excludes the worst case is not a weak assertion, it is one
 * that passes for the wrong reason". L2 measured at 1440, 1024 and 760 and
 * reported 7.94px as the worst case; at 390 the same diagram paints 3.79px, and
 * 390 is where most readers are.
 *
 * Both sides of every breakpoint, plus three widths outside the breakpoint set:
 * 1920 and 1440 above the widest, and 390 and 320 below the narrowest. 320 is
 * "one width below the narrowest" in the sense L2 asked for - the narrowest
 * viewport a phone in portrait actually presents.
 *
 * ONE CORRECTION TO THE NOTE THAT ASKED FOR THIS, checked before it was acted
 * on, and then a reason to do the thing anyway. L2 wrote that the stylesheet
 * "declares max-width breakpoints at 300, 520 and 700". `globals.css` declares
 * seven `@media (max-width: Npx)` preludes - 700, 720, 760, 900, 1000, 1100,
 * 1600 - and separately declares element `max-width` values including 300px and
 * 520px, which are box widths and not viewport conditions. A grep for
 * `max-width:` returns both, which is how the two got mixed; it is the same
 * family as this project's other list-operation probe defects, an enumeration
 * over the wrong SCOPE.
 *
 * 300 AND 520 ARE SAMPLED ANYWAY, ON A BETTER ARGUMENT THAN THE ONE THAT ASKED
 * FOR THEM. An element `max-width` is a point at which THAT BOX stops growing,
 * so a chart inside it stops scaling there even though no media query fired.
 * That is a layout change point for the quantity this guard is about, which is
 * exactly what the set should sample - the misreading pointed at real widths
 * for the wrong reason. And the consequence L2 drew is right regardless, which
 * is why 320 and 390 are here: the supported range extends below the narrowest
 * breakpoint, and a set defined only by breakpoints stops just above the worst
 * case L2 itself later measured at 3.79px.
 */
export const SUPPORTED_WIDTHS = [
  ...new Set([
    300, 301, 320, 390, 520, 521, 700, 701, 720, 721, 760, 761, 900, 901, 1000, 1001, 1024, 1100, 1101, 1440, 1600,
    1601, 1920,
  ]),
].sort((a, b) => a - b);

/**
 * THE REGISTER: SVG `<text>` this repository still ships, each with the
 * measurement that justifies it.
 *
 * IT IS EMPTY, AND THAT IS THE DELIVERABLE. HANDOFF-04a registered two
 * declarations here in prose - `.plot .edge-label` and `.plot .nw-sub`, both at
 * 9.5 user units - with the honest note that the real fix was HTML labels.
 * HANDOFF-04b did that, and the two rows went with the elements they described.
 *
 * A row must carry, as DATA rather than as prose:
 *   file          the source file the `<text>` is in, relative to the repo root
 *   marker        a substring of the JSX line, so the row is pinned to an
 *                 occurrence and cannot survive its removal
 *   declared      the declared font-size in USER UNITS
 *   viewBox       the viewBox WIDTH in user units
 *   viewBoxHeight the viewBox HEIGHT in user units - required, because the
 *                 scale under `meet` is min(sx, sy) and sy needs it
 *   par           the `preserveAspectRatio` mode: "meet", "slice" or "none"
 *   rendered      { [viewportWidth]: { width, height } } for every supported
 *                 viewport width - the row's own measurement of the rendered
 *                 BOX, which R3 does arithmetic on and which the e2e spec
 *                 checks against a browser
 *   reason        why the label cannot be HTML here, stating a measurement
 */
export const REGISTER = [];

/** Read `--t-floor` from the token file, so the guard and the CSS cannot disagree. */
export function readFloor(css) {
  const m = /--t-floor:\s*([\d.]+)px/.exec(css);
  return m === null ? null : Number(m[1]);
}

/**
 * Element `max-width` values that are layout change points even though no media
 * query fires at them, sampled for the reason set out on `SUPPORTED_WIDTHS`.
 */
export const ELEMENT_WIDTH_STOPS = [300, 520];

/** Every `.tsx`/`.ts`/`.svg` file under a directory, recursively. */
export function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries.sort()) {
      const p = join(d, e);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (e === "node_modules" || e === ".next") continue;
        walk(p);
      } else if (/\.(tsx|ts|svg)$/.test(e)) {
        out.push(p);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Every SVG text element in a file, with its line.
 *
 * COMMENTS ARE MASKED LENGTH-PRESERVINGLY, and that is not fussiness. Six files
 * in this tree now carry docblocks that QUOTE `<text>` while explaining why they
 * no longer contain one - `ChartLabels.tsx` does it four times. A sweep that
 * counted those would fire on the record of the fix instead of on the defect,
 * which is the exact shape `check-ledger-structure.mjs` avoids by tracking
 * fences. Masking rather than deleting keeps `m.index` the real file offset, so
 * the reported line is the real line.
 */
export function textElements(source) {
  const masked = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  const out = [];
  for (const m of masked.matchAll(/<(text|tspan)[\s/>]/g)) {
    const line = masked.slice(0, m.index).split("\n").length;
    // The real source for the excerpt, so a reader sees what is actually there.
    const raw = source.split("\n")[line - 1] ?? "";
    out.push({ tag: m[1], line, excerpt: raw.trim().slice(0, 90) });
  }
  return out;
}

/**
 * R1 and R2, over a set of files.
 *
 * @param {{path: string, source: string}[]} files
 * @param {typeof REGISTER} register
 */
export function textFindings(files, register) {
  const findings = [];
  const covered = new Set();

  for (const f of files) {
    for (const el of textElements(f.source)) {
      const row = register.find(
        (r) => r.file === f.path && (f.source.split("\n")[el.line - 1] ?? "").includes(r.marker),
      );
      if (row === undefined) {
        findings.push(
          `${f.path}:${String(el.line)}  R1: an SVG <${el.tag}> with no REGISTER row. Text in a scaled ` +
            "viewBox paints at declared x min(sx, sy), so no declared value clears --t-floor at every " +
            "supported width; the label belongs in a ChartLabels layer over the drawing. Found: " +
            `${el.excerpt}`,
        );
      } else {
        covered.add(row);
      }
    }
  }

  // R2 - a row that covers nothing is itself a finding. The `check-nav-routes`
  // precedent: an exception nobody has to justify is an exception that outlives
  // the thing it excused, and the next reader takes it for a rule.
  for (const r of register) {
    if (!covered.has(r)) {
      findings.push(
        `${r.file}  R2: a REGISTER row for marker ${JSON.stringify(r.marker)} matches no <text> in the ` +
          "tree. Either the element moved to HTML and the row should go with it, or the marker has " +
          "drifted and the row is silently excusing nothing.",
      );
    }
    if (typeof r.reason !== "string" || r.reason.trim().length < 40) {
      findings.push(
        `${r.file}  R2: the REGISTER row for ${JSON.stringify(r.marker)} carries no reason. A registered ` +
          "exception states the measurement that justifies it, or it is a preference wearing a rule's coat.",
      );
    }
  }

  return findings;
}

/**
 * THE SCALE A `viewBox` ACTUALLY APPLIES, which is not the width ratio.
 *
 * L2 caught this in its own probe before this guard inherited it (interim note,
 * 1 Sep 2026): it computed `rect.width / viewBox.width`, which is right only
 * when the element is WIDTH-constrained. Under `preserveAspectRatio="xMidYMid
 * meet"` - the default and what every diagram here uses - the applied scale is
 * `min(sx, sy)`; under `slice` it is `max(sx, sy)`; under `none` the axes scale
 * independently and a glyph's HEIGHT, which is what a floor is about, follows
 * `sy`. Every SVG in this tree happens to be width-constrained, so the width
 * ratio agreed with the truth at every width on every diagram - it held BY
 * LUCK. The first height-constrained SVG the site gains would make the width
 * ratio OVERSTATE the painted size, and a floor guard that overstates is a
 * floor guard that passes on the defect. The self-test drives a deliberately
 * height-constrained fixture for exactly that reason: the real tree cannot
 * produce one today, so that arm would go vacuous if driven from the tree.
 */
export function viewBoxScale(row, rendered) {
  const sx = rendered.width / row.viewBox;
  const sy = rendered.height / row.viewBoxHeight;
  const par = row.par ?? "meet";
  if (par === "none") return sy;
  if (par === "slice") return Math.max(sx, sy);
  return Math.min(sx, sy);
}

/**
 * R3 - the painted-size arithmetic, over the numbers a REGISTER row records.
 *
 * NAMES THE WIDTH. A finding that says only "too small" sends the reader to
 * measure the thing again; the width is the whole diagnostic, because this
 * regime is non-monotone and the failing width is not guessable from the
 * passing ones.
 */
export function paintedFindings(register, floor, widths = SUPPORTED_WIDTHS) {
  const findings = [];
  for (const r of register) {
    const bad = [];
    for (const w of widths) {
      const rendered = r.rendered?.[w];
      if (rendered === undefined) {
        findings.push(
          `${r.file}  R3: the REGISTER row for ${JSON.stringify(r.marker)} records no rendered width at ` +
            `${String(w)}px. A row that skips a supported width is a row whose worst case is unmeasured.`,
        );
        continue;
      }
      const painted = r.declared * viewBoxScale(r, rendered);
      // A ROW MISSING A FIELD MUST NOT PASS QUIETLY. `NaN < floor` is false, so
      // an absent `viewBoxHeight` or a malformed `rendered` entry would make
      // this row silently clear the floor at every width - a guard satisfied by
      // the one input it cannot judge. Reported as a finding rather than as a
      // pass, because the register is data a human types and this is the shape
      // that data goes wrong in.
      if (!Number.isFinite(painted)) {
        findings.push(
          `${r.file}  R3: the REGISTER row for ${JSON.stringify(r.marker)} does not resolve to a number at ` +
            `${String(w)}px (declared ${String(r.declared)}, viewBox ${String(r.viewBox)}x${String(r.viewBoxHeight)}, ` +
            `rendered ${JSON.stringify(rendered)}). A row this guard cannot judge must not read as a row it cleared.`,
        );
        continue;
      }
      if (painted < floor - 1e-9) bad.push({ w, painted });
    }
    if (bad.length > 0) {
      const worst = bad.reduce((a, b) => (a.painted <= b.painted ? a : b));
      findings.push(
        `${r.file}  R3: ${JSON.stringify(r.marker)} paints below the ${String(floor)}px floor at ` +
          `${bad.map((b) => `${String(b.w)}px (${b.painted.toFixed(2)}px)`).join(", ")}. ` +
          `Worst at ${String(worst.w)}px.`,
      );
    }
  }
  return findings;
}

/* ==========================================================================
   R4 - a custom property consumed inside `calc()` must be declared as a LENGTH
   ==========================================================================

   THE DEFECT THIS CLOSES, MEASURED RATHER THAN IMAGINED. The HTML label layer
   this guard's R1 exists to send text into composes its anchor, its baseline and
   its pixel nudge through one `transform`, because a second `transform` rule
   would REPLACE the first rather than add to it:

       transform: translate(calc(var(--plabel-tx) + var(--plabel-dx)), ...)

   `calc(<number> + <length>)` is INVALID CSS. `--plabel-tx: 0` is a NUMBER, so
   for every label with the default anchor the expression failed to parse and the
   browser dropped the WHOLE declaration - anchor, baseline and both nudges with
   it. Measured on the served production build: **86 of the site's 155 labels
   resolved `transform: none`**, 34 of them on charts that had already been
   converted, screenshotted and called done. Typecheck, lint, `next build` and
   this guard's own R1 were all green on it.

   IT IS F-04a-7's SHAPE, ONE HANDOFF LATER. That defect was `var(o)` - POOL_SW
   mapping a pool to a CSS CLASS rather than to a custom property, so every arc
   painted `none`. Same family: a value that is syntactically fine and
   semantically empty, invisible to every type-level check, visible only on the
   render. A shape that has now recurred is answered with a check rather than
   with more care.

   WHAT IT CHECKS AND WHAT IT CANNOT. It checks that every custom property
   REACHED BY A `calc()` in this stylesheet is declared as a length everywhere it
   is declared - a bare number is a finding. It cannot tell whether the resulting
   arithmetic is meaningful, and it says nothing about `calc()` outside this
   file. */

/** A number with no unit: the value that poisons a `calc()` sum with a length. */
const BARE_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

/**
 * Every custom property a `calc()` in this stylesheet reads, and every value
 * each one is declared with.
 */
export function calcVarDeclarations(css) {
  const consumed = new Set();
  for (const m of css.matchAll(/calc\(([^;]*?)\)/g)) {
    for (const v of (m[1] ?? "").matchAll(/var\(\s*(--[\w-]+)/g)) consumed.add(v[1]);
  }
  const declared = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    const name = m[1];
    if (!consumed.has(name)) continue;
    if (!declared.has(name)) declared.set(name, []);
    declared.get(name).push((m[2] ?? "").trim());
  }
  return { consumed, declared };
}

export function calcUnitFindings(css, file) {
  const findings = [];
  const { consumed, declared } = calcVarDeclarations(css);
  for (const name of consumed) {
    const values = declared.get(name);
    if (values === undefined) continue;
    for (const v of values) {
      if (BARE_NUMBER.test(v) && v !== "0px") {
        findings.push(
          `${file}  R4: ${name} is read inside a calc() and declared as the bare number ${JSON.stringify(v)}. ` +
            "`calc(<number> + <length>)` is invalid, so the whole declaration that reads it is dropped - " +
            "silently, and green on typecheck, lint and the build. Give it a unit (`0px`, not `0`).",
        );
      }
    }
  }
  return findings;
}

/** The guard cannot run, as distinct from the tree being wrong. */
export function vacuity(files, floor) {
  const out = [];
  if (files.length === 0) out.push(`V1: no source file found under ${ROOTS.join(", ")}. A clean scan would prove nothing.`);
  if (floor === null) out.push(`V2: --t-floor is not declared as a px value in ${TOKENS}.`);
  return out;
}

/* ------------------------------------------------------------------ self-test */

function withFixtureTree(fn) {
  const root = mkdtempSync(join(tmpdir(), "svgtext-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * ACCUMULATOR STYLE, so every broken probe reports in one run. An early return
 * hides probes two through twenty behind the first failure, and the run that
 * matters most is the one where several are broken at once.
 */
function selfTest(realFiles, floor) {
  let ok = true;
  const fail = (m) => {
    console.error(`[svg-text-floor] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  // ---- 1. R1 over a FIXTURE, with the data mutation the rule exists for -----
  withFixtureTree((root) => {
    const dir = join(root, "components");
    mkdirSync(dir, { recursive: true });
    const clean = join(dir, "Clean.tsx");
    writeFileSync(clean, 'export const C = () => <svg viewBox="0 0 100 50"><line x1="0" /></svg>;\n');
    const dirty = join(dir, "Dirty.tsx");
    // THE DATA MUTATION: a member of the set the predicate excludes - an SVG
    // text element in a scaled viewBox - rather than a change to the detector.
    writeFileSync(dirty, 'export const D = () => <svg viewBox="0 0 1000 320"><text x="1" y="2">tick</text></svg>;\n');

    const files = sourceFiles(root).map((p) => ({ path: relative(root, p), source: readFileSync(p, "utf8") }));
    if (files.length !== 2) fail(`sourceFiles found ${String(files.length)} file(s) in the fixture, expected 2`);

    const found = textFindings(files, []);
    if (!found.some((f) => f.includes("Dirty.tsx") && f.includes("R1"))) {
      fail(`a planted <text> in the fixture produced no R1 finding: ${JSON.stringify(found)}`);
    }
    // ANTI-PROBE: the clean file must stay silent, or the detector is a
    // stopped clock and its finding on the dirty file means nothing.
    if (found.some((f) => f.includes("Clean.tsx"))) {
      fail(`a file with no <text> was reported: ${JSON.stringify(found)}`);
    }

    // A `<tspan>` is the same defect wearing a different tag, and the tree has
    // none today - so it is exactly the member that could arrive unnoticed.
    writeFileSync(dirty, 'export const D = () => <svg viewBox="0 0 100 50"><tspan>x</tspan></svg>;\n');
    const files2 = sourceFiles(root).map((p) => ({ path: relative(root, p), source: readFileSync(p, "utf8") }));
    if (!textFindings(files2, []).some((f) => f.includes("tspan"))) {
      fail("a planted <tspan> produced no finding; the rule covers one of its two tags");
    }

    // A `<text>` inside a COMMENT is the false positive this guard would
    // otherwise fire on across six real files, so it is probed rather than
    // trusted to the mask.
    writeFileSync(dirty, "/* the old <text> is gone */\n// and <tspan> with it\nexport const D = () => null;\n");
    const files3 = sourceFiles(root).map((p) => ({ path: relative(root, p), source: readFileSync(p, "utf8") }));
    if (textFindings(files3, []).length !== 0) {
      fail(`a <text> quoted inside a comment was reported: ${JSON.stringify(textFindings(files3, []))}`);
    }
  });

  // ---- 2. R1 over the REAL tree ---------------------------------------------
  // A parser tuned to a synthetic fixture that would not survive the real files
  // is the silent-vacuous-pass shape. The real tree has 21 docblock mentions of
  // `<text>` across six files; if the mask were wrong this would light up.
  const realFindings = textFindings(realFiles, REGISTER);
  const realCommentMentions = realFiles.filter((f) => /<text[\s/>]/.test(f.source)).length;
  if (realCommentMentions === 0) {
    fail(
      "no file under the real tree mentions `<text>` at all, in code or in a comment. This guard's " +
        "comment mask is then untested against reality, which is the case it exists for.",
    );
  }

  // ---- 3. THE REGISTER'S OWN ROWS, ITERATED --------------------------------
  // Every row is driven twice: with the row, its site must be silent; without
  // it, its site must be a finding. A row added later cannot arrive untested.
  for (const r of REGISTER) {
    const without = REGISTER.filter((x) => x !== r);
    const found = textFindings(realFiles, without);
    if (!found.some((f) => f.includes(r.file) && f.includes("R1"))) {
      fail(
        `removing the REGISTER row for ${JSON.stringify(r.marker)} did not make ${r.file} an R1 finding ` +
          "over the real tree, so the row is not covering the element it claims to",
      );
    }
    if (realFindings.some((f) => f.includes(r.file) && f.includes("R1") && f.includes(r.marker))) {
      fail(`${r.file} ${JSON.stringify(r.marker)} is reported even though the REGISTER names it`);
    }
  }
  // A row whose marker matches nothing must be an R2 finding - probed with a
  // marker no file carries, because the register is empty and the arm would
  // otherwise never run.
  const orphan = [
    {
      file: "apps/web/src/components/record/Plot.tsx",
      marker: "className=\"a-marker-no-file-carries\"",
      declared: 12,
      viewBox: 1000,
      rendered: Object.fromEntries(SUPPORTED_WIDTHS.map((w) => [w, w])),
      reason: "a probe row, forty characters of reason so the reason arm does not fire on it instead",
    },
  ];
  if (!textFindings(realFiles, orphan).some((f) => f.includes("R2"))) {
    fail("a REGISTER row matching no <text> in the tree produced no R2 finding");
  }
  // And the reason arm, driven on its own: a row with a reason too short.
  const noReason = [{ ...orphan[0], marker: "<text", reason: "too short" }];
  if (!textFindings(realFiles, noReason).some((f) => f.includes("R2") && f.includes("no reason"))) {
    fail("a REGISTER row with no reason produced no R2 finding");
  }

  // ---- 4. R3 IN BOTH POLARITIES, with the fail side L2 specified ------------
  // "declare a value that clears the floor at 1440 and not at 760, and watch
  // the assertion name the width". These numbers are not invented: 1342 and 662
  // are the measured rendered widths of a full-width `.glass.card` chart at
  // those two viewports, taken from a browser on the production build.
  const CLEARS = {
    file: "fixture",
    marker: "<text",
    declared: 12,
    viewBox: 1000,
    viewBoxHeight: 320,
    par: "meet",
    // The rendered BOX at each width, not just its width - `viewBoxScale` needs
    // both. 1342x429.4 and 662x211.8 are a full-width `.glass.card` chart with
    // a 1000x320 viewBox, measured in a browser on the production build.
    rendered: { 1440: { width: 1342, height: 429.44 }, 760: { width: 662, height: 211.84 } },
    reason: "a probe row; the reason arm needs forty characters and this is them, measured on the build",
  };
  const at1440 = 12 * viewBoxScale(CLEARS, CLEARS.rendered[1440]);
  const at760 = 12 * viewBoxScale(CLEARS, CLEARS.rendered[760]);
  if (!(at1440 >= floor && at760 < floor)) {
    fail(
      `the R3 probe does not discriminate: 12 units paints ${at1440.toFixed(2)}px at 1440 and ` +
        `${at760.toFixed(2)}px at 760 against a floor of ${String(floor)}. A probe whose two polarities ` +
        "fall on the same side of the predicate proves nothing about the predicate.",
    );
  }
  const painted = paintedFindings([CLEARS], floor, [1440, 760]);
  if (!painted.some((f) => f.includes("760px") && f.includes("R3"))) {
    fail(`R3 did not name 760px for a declaration that clears at 1440 and fails at 760: ${JSON.stringify(painted)}`);
  }
  if (painted.some((f) => f.includes("1440px ("))) {
    fail(`R3 reported 1440px, where the same declaration paints ${at1440.toFixed(2)}px and clears the floor`);
  }
  // ANTI-PROBE: a row that clears everywhere must be silent, or R3 is a
  // predicate satisfied by every value it was written to exclude.
  const CLEAR_EVERYWHERE = {
    ...CLEARS,
    rendered: { 1440: { width: 1342, height: 429.44 }, 760: { width: 1342, height: 429.44 } },
  };
  if (paintedFindings([CLEAR_EVERYWHERE], floor, [1440, 760]).length !== 0) {
    fail("R3 fired on a row that clears the floor at every width it records");
  }
  // And the missing-width arm.
  if (!paintedFindings([CLEARS], floor, [1440, 760, 390]).some((f) => f.includes("records no rendered width at 390px"))) {
    fail("R3 did not report a REGISTER row that skips a supported width");
  }
  // AND THE ARM THAT WOULD OTHERWISE PASS VACUOUSLY. A row with no
  // `viewBoxHeight` makes `sy` NaN, `min(sx, NaN)` NaN and `NaN < floor` FALSE,
  // so before this arm existed such a row cleared the floor at every width
  // silently. Found by reading the guard against this project's own standing
  // question - what input can this predicate not judge, and what does it do
  // then - rather than by a failing run.
  const { viewBoxHeight: _dropped, ...NO_HEIGHT } = CLEARS;
  const nan = paintedFindings([NO_HEIGHT], floor, [1440, 760]);
  if (!nan.some((f) => f.includes("does not resolve to a number"))) {
    fail("a REGISTER row with no viewBoxHeight produced no finding; it would have cleared the floor by NaN");
  }
  // The anti-probe: the same row WITH its height is judged normally, so the arm
  // above is detecting the missing field rather than firing on everything.
  if (paintedFindings([CLEARS], floor, [1440]).some((f) => f.includes("does not resolve to a number"))) {
    fail("the NaN arm fired on a complete row");
  }

  // ---- 4b. THE SCALE FORMULA, ON A HEIGHT-CONSTRAINED FIXTURE --------------
  // L2's correction, and the arm that cannot be driven from the real tree: every
  // SVG here is width-constrained, so `rect.width / viewBox.width` agrees with
  // the truth at every width on every diagram and would look correct forever.
  // A box that is WIDER than its viewBox's aspect ratio is `meet`-scaled by its
  // HEIGHT, and a guard using the width ratio would report 2x the painted size
  // - overstating, which for a floor is the direction that passes on a defect.
  const TALL = {
    file: "fixture",
    marker: "<text",
    declared: 12,
    viewBox: 1000,
    viewBoxHeight: 320,
    par: "meet",
    // A 2000x320 box for a 1000x320 viewBox: sx = 2.0, sy = 1.0.
    rendered: { 1440: { width: 2000, height: 320 } },
    reason: "a probe row for the height-constrained case, forty characters of reason to satisfy R2",
  };
  const byWidth = TALL.declared * (TALL.rendered[1440].width / TALL.viewBox);
  const byBoth = TALL.declared * viewBoxScale(TALL, TALL.rendered[1440]);
  if (byWidth === byBoth) {
    fail(
      "the height-constrained probe does not discriminate: the width ratio and min(sx, sy) agree on it, " +
        "so it cannot show the difference it exists to show",
    );
  }
  if (Math.abs(byBoth - 12) > 1e-9) {
    fail(`min(sx, sy) gave ${String(byBoth)} on a box scaled 2.0 by width and 1.0 by height; expected 12`);
  }
  if (byWidth <= byBoth) {
    fail("the width ratio did not OVERSTATE the painted size on a height-constrained box, which is the risk");
  }
  // `slice` takes the other branch, and `none` follows the vertical alone.
  if (Math.abs(12 * viewBoxScale({ ...TALL, par: "slice" }, TALL.rendered[1440]) - 24) > 1e-9) {
    fail("`slice` did not take max(sx, sy)");
  }
  if (Math.abs(12 * viewBoxScale({ ...TALL, par: "none" }, TALL.rendered[1440]) - 12) > 1e-9) {
    fail("`none` did not follow the vertical scale, which is the axis a size floor is about");
  }

  // ---- 5. THE WIDTH SET ITSELF ---------------------------------------------
  // Every breakpoint must be sampled on BOTH sides. The non-monotone case -
  // ShieldedShare, 3.95px at 1024 and 9.62px at 900 - is invisible to a one-
  // sided sample, and it is the case that motivated this rule.
  for (const b of BREAKPOINTS) {
    if (!SUPPORTED_WIDTHS.includes(b)) fail(`breakpoint ${String(b)} is not in SUPPORTED_WIDTHS`);
    if (!SUPPORTED_WIDTHS.includes(b + 1)) fail(`breakpoint ${String(b)} is sampled on one side only`);
  }
  // And below the narrowest breakpoint, which is where L2's own measurement
  // stopped and where the worst case lives.
  if (!SUPPORTED_WIDTHS.some((w) => w < Math.min(...BREAKPOINTS))) {
    fail("no sampled width is below the narrowest breakpoint, so the phone case is outside the set");
  }
  if (!SUPPORTED_WIDTHS.includes(390)) fail("390px, the common phone, is not sampled");
  for (const s of ELEMENT_WIDTH_STOPS) {
    if (!SUPPORTED_WIDTHS.includes(s)) fail(`element width stop ${String(s)}px is not sampled`);
    // Each element max-width is checked to still EXIST in the stylesheet, so a
    // stop that is removed does not linger here as a sample of nothing.
    try {
      if (!readFileSync("apps/web/src/app/globals.css", "utf8").includes(`max-width: ${String(s)}px`)) {
        fail(`ELEMENT_WIDTH_STOPS carries ${String(s)}px, which globals.css no longer declares as an element max-width`);
      }
    } catch {
      fail("globals.css could not be read while checking ELEMENT_WIDTH_STOPS");
    }
  }
  // THE BREAKPOINT LIST ITSELF IS CHECKED AGAINST THE STYLESHEET, because a
  // hand-kept copy of the CSS's breakpoints is a second source for one fact and
  // this project has been bitten by that shape five times.
  try {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const declared = [...new Set([...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1])))];
    for (const d of declared) {
      if (!BREAKPOINTS.includes(d)) fail(`globals.css declares a @media breakpoint at ${String(d)}px that BREAKPOINTS omits`);
    }
    for (const b of BREAKPOINTS) {
      if (!declared.includes(b)) fail(`BREAKPOINTS carries ${String(b)}px, which globals.css no longer declares`);
    }
  } catch {
    fail("globals.css could not be read, so BREAKPOINTS is an unchecked copy of the stylesheet");
  }

  // ---- 5b. R4, IN BOTH POLARITIES, over the REAL stylesheet ----------------
  try {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const { consumed } = calcVarDeclarations(css);
    // Vacuity first: a stylesheet with no calc() at all would make every R4 run
    // below a pass over nothing.
    if (consumed.size === 0) {
      fail("no custom property is read inside a calc() in globals.css, so R4 is checking nothing");
    }
    if (calcUnitFindings(css, "globals.css").length !== 0) {
      fail(`R4 fires on the real stylesheet: ${JSON.stringify(calcUnitFindings(css, "globals.css"))}`);
    }
    // THE DATA MUTATION: the exact value that shipped, spliced back in. `0` is a
    // member of the set R4 excludes, and it is not invented - it is what
    // `--plabel-tx` was declared as when 86 of 155 labels lost their transform.
    const mutated = css.replace("--plabel-tx: 0px;", "--plabel-tx: 0;");
    if (mutated === css) {
      fail("the R4 splice did not apply; this probe would prove nothing");
    } else if (!calcUnitFindings(mutated, "globals.css").some((f) => f.includes("--plabel-tx"))) {
      fail("a bare `0` on a custom property read inside calc() produced no R4 finding");
    }
    // ANTI-PROBE: a property NOT read by any calc() may be a bare number - many
    // are, legitimately (opacity, z-index, line-height). R4 must not fire on one.
    const unrelated = `${css}\n:root { --not-in-a-calc: 0; }\n`;
    if (calcUnitFindings(unrelated, "globals.css").some((f) => f.includes("--not-in-a-calc"))) {
      fail("R4 fired on a bare number that no calc() reads, so it is not a rule about calc() at all");
    }
  } catch (e) {
    fail(`R4 could not read globals.css: ${String(e)}`);
  }

  // ---- 6. THE VACUITY GATE, driven ------------------------------------------
  if (vacuity([], floor).length === 0) fail("vacuity did not fire on an empty file list");
  if (vacuity(realFiles, null).length === 0) fail("vacuity did not fire on an unreadable floor");
  if (vacuity(realFiles, floor).length !== 0) fail("vacuity fired on the real, readable inputs");

  return ok;
}

/* ----------------------------------------------------------------------- run */

const files = ROOTS.flatMap((r) => sourceFiles(r)).map((p) => ({ path: p, source: readFileSync(p, "utf8") }));
/**
 * `null` when the token file is unreadable OR declares no floor. Both are the
 * same condition for this guard - it has no number to check against - and both
 * land in the vacuity gate below rather than in a finding, because the guard is
 * broken rather than the tree.
 */
const floor = (() => {
  try {
    return readFloor(readFileSync(TOKENS, "utf8"));
  } catch {
    return null;
  }
})();

const blocked = vacuity(files, floor);
if (blocked.length > 0) {
  for (const b of blocked) console.error(`[svg-text-floor] ${b}`);
  console.error("[svg-text-floor] the guard cannot run; a clean scan would prove nothing.");
  process.exit(2);
}

if (!selfTest(files, floor)) {
  console.error("[svg-text-floor] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

const cssForR4 = (() => {
  try {
    return readFileSync("apps/web/src/app/globals.css", "utf8");
  } catch {
    return "";
  }
})();
const findings = [
  ...textFindings(files, REGISTER),
  ...paintedFindings(REGISTER, floor),
  ...calcUnitFindings(cssForR4, "apps/web/src/app/globals.css"),
];
if (findings.length > 0) {
  console.error(`[svg-text-floor] FAIL: ${String(findings.length)} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `[svg-text-floor] OK: ${String(files.length)} source file(s) under ${ROOTS.join(", ")} carry 0 SVG <text>/<tspan> ` +
    `outside the REGISTER, which has ${String(REGISTER.length)} row(s); ${String(SUPPORTED_WIDTHS.length)} ` +
    `viewport width(s) sampled, both sides of all ${String(BREAKPOINTS.length)} stylesheet breakpoints, ` +
    `and every custom property reached by a calc() in globals.css (${String(calcVarDeclarations(cssForR4).consumed.size)} ` +
    "of them) is declared as a length. The rule is that SVG text must not EXIST in a scaled viewBox - R3's " +
    "painted-size arithmetic runs on widths a REGISTER row records and measures nothing itself, so with an " +
    "empty register it is driven by the self-test alone; the measurement is " +
    "apps/web/test/e2e/painted-floor.spec.ts (detectors self-tested in both directions, over the real " +
    "apps/web tree and a fixture).",
);
