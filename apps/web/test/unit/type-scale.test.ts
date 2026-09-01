/**
 * ASSERTIONS A2 AND A3 - the type scale, computed rather than asserted.
 *
 * HANDOFF-04a was commissioned by a reader who said "half the text is basically
 * 9px gray-on-charcoal punishment". Two things were true at once: the palette
 * had ALREADY been fixed - HANDOFF-01 raised `--ink-mute` and `--ink-faint`
 * until every ink used for text cleared WCAG AA - and the page still read as
 * punishment. The reason is that a ratio which clears AA at 9.5px is legal and
 * unreadable. So the remaining work was never colour, and these two assertions
 * are the pair that says so:
 *
 *   A2 - every rendered text style meets AA AT ITS OWN SIZE, with the ratio
 *        COMPUTED from the token and the ground in this file rather than read
 *        off a palette comment. A comment cannot fail.
 *   A3 - nothing rendered as text is below the floor, checked over the BUILT
 *        stylesheet rather than the source, because a rung could resolve to
 *        anything and a `var()` in the source proves nothing about the pixel.
 *
 * WHY THE BUILT CSS AND NOT THE SOURCE. `globals.css` names sizes as
 * `var(--t-label)`; the value lives in `tokens.css`. Reading only the source
 * would check that a token was USED, which is the shape of check this project
 * has shipped three times and had come back green on a hole. Reading the built
 * output would be better still, and is what A3's e2e half does; here the two
 * files are resolved against each other, which catches the case a build cannot:
 * a rung declared at a value under the floor.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = readFileSync(resolve(HERE, "../../src/styles/tokens.css"), "utf8");
const CSS = readFileSync(resolve(HERE, "../../src/app/globals.css"), "utf8");

/* ------------------------------------------------------------------ colour */

/** sRGB channel to linear, per WCAG 2.1 relative-luminance. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio. Order-independent by construction. */
export function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Read a hex-valued custom property out of a stylesheet's `:root`. */
function token(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS);
  if (m === null) throw new Error(`token ${name} is not declared as a hex value in tokens.css`);
  return m[1] as string;
}

/** Read a px-valued custom property out of `tokens.css`. */
function pxToken(name: string): number {
  const m = new RegExp(`${name}:\\s*([\\d.]+)px`).exec(TOKENS);
  if (m === null) throw new Error(`token ${name} is not declared as a px value in tokens.css`);
  return Number(m[1]);
}

/* -------------------------------------------------------------------- A2 */

/**
 * The two grounds text is painted on, and the third it is not.
 *
 * `--surface-2` is the darkest of the three and is included deliberately:
 * `tokens.css` records that `--ink-mute` was chosen to clear AA on it, and a
 * check that only tested the two lighter grounds would pass while the token's
 * own justification went unverified.
 */
const GROUNDS = ["--bg", "--surface", "--surface-2"] as const;

/**
 * Every ink this stylesheet paints TEXT in.
 *
 * `--ink-faint` is deliberately absent, and its absence is asserted below
 * rather than assumed: `tokens.css` reserves it for non-text - "hairline rules
 * and inactive marks" - which is a claim about the stylesheet that the
 * stylesheet has to keep.
 */
const TEXT_INKS = ["--ink", "--ink-dim", "--ink-mute", "--gold"] as const;

/** AA for normal text. Large text (>= 18.66px bold, >= 24px) would be 3:1. */
const AA_NORMAL = 4.5;

describe("A2: every text ink meets AA on every ground it is painted on", () => {
  for (const ink of TEXT_INKS) {
    for (const ground of GROUNDS) {
      it(`${ink} on ${ground}`, () => {
        const r = ratio(token(ink), token(ground));
        expect(r, `${ink} on ${ground} measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  it("computes the ratios the token file states, to two decimals", () => {
    // The comment in tokens.css is a claim about numbers. This is the claim,
    // checked. If the palette moves and the comment does not, this fails.
    expect(ratio(token("--ink"), token("--bg")).toFixed(2)).toBe("15.19");
    expect(ratio(token("--ink-dim"), token("--bg")).toFixed(2)).toBe("8.11");
    expect(ratio(token("--ink-mute"), token("--bg")).toFixed(2)).toBe("5.20");
    expect(ratio(token("--gold"), token("--bg")).toFixed(2)).toBe("10.46");
    // 3.11, not 3.05. tokens.css stated 3.05 at four sites through two
    // handoffs and a design review; this line is what caught it, which is the
    // argument for computing a ratio rather than reading one.
    expect(ratio(token("--ink-faint"), token("--bg")).toFixed(2)).toBe("3.11");
  });

  it("the fail side: the mockup's original ink-mute is a member of the exclusion set", () => {
    // A DATA MUTATION, drawn from inside the set the assertion excludes rather
    // than a code change. `#7c7366` is the value the source-of-truth mockup
    // carries and HANDOFF-01 removed; if the check cannot see it fail, the
    // green run above is not evidence about anything.
    const r = ratio("#7c7366", token("--bg"));
    expect(r, `the mockup value measured ${r.toFixed(2)}:1 and should not clear AA`).toBeLessThan(AA_NORMAL);
    expect(r.toFixed(2)).toBe("4.04");
  });

  it("--ink-faint is reserved for non-text, and the stylesheet keeps that reservation", () => {
    // The token fails AA and is allowed to, on the stated condition that it
    // never paints text. That condition is the thing to check - the ratio is
    // not a defect, using it on a word is.
    expect(ratio(token("--ink-faint"), token("--bg"))).toBeLessThan(AA_NORMAL);
    const textUses = [...CSS.matchAll(/(?:color|fill):\s*var\(--ink-faint\)/g)];
    expect(
      textUses.length,
      "--ink-faint paints text somewhere in globals.css; tokens.css reserves it for hairlines and inactive marks",
    ).toBe(0);
  });
});

/* -------------------------------------------------------------------- A3 */

/** The seven rungs the scale declares, resolved to pixels. */
const RUNGS = ["--t-label", "--t-micro", "--t-data", "--t-dek", "--t-sm", "--t-body", "--t-prose"] as const;

/**
 * Every `font-size` in `globals.css`, with comments blanked LENGTH-PRESERVINGLY
 * so a match's offsets are the file's offsets.
 *
 * The crude split the other CSS tests use would not do here: this needs to
 * distinguish a declaration inside a comment from one that ships, and the
 * stylesheet's comments quote sizes constantly - including the seven this
 * handoff removed.
 */
function declaredSizes(): readonly { readonly raw: string; readonly line: number }[] {
  const masked = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const out: { raw: string; line: number }[] = [];
  for (const m of masked.matchAll(/font-size:\s*([^;]+);/g)) {
    const line = masked.slice(0, m.index).split("\n").length;
    out.push({ raw: (m[1] as string).trim(), line });
  }
  return out;
}

/** Resolve a declared size to pixels, or null when it is not a fixed px value. */
function resolvePx(raw: string): number | null {
  const v = new RegExp("^var\\((--t-[a-z]+)\\)$").exec(raw);
  if (v !== null) return pxToken(v[1] as string);
  const px = /^([\d.]+)px$/.exec(raw);
  if (px !== null) return Number(px[1]);
  // `clamp(a, b, c)`: the smallest value it can take is its first argument.
  const clamp = /^clamp\(\s*([\d.]+)px/.exec(raw);
  if (clamp !== null) return Number(clamp[1]);
  return null;
}

/**
 * THE TWO DECLARATIONS BELOW THE FLOOR, EACH WITH A REASON, AND THE SELF-TEST
 * ITERATES THIS LIST.
 *
 * SVG text inside a scaled `viewBox` is not CSS pixels, and that is measured
 * rather than argued. The loop diagram's viewBox is 1000 units wide and renders
 * at 1384 CSS px on a 1440 px viewport, so the scale is 1.384 and a declared
 * 9.5 paints at 13.1 CSS px. At 1024 px the scale is 0.968; at 760 px and below
 * it is 0.72, where a declared 12 paints at 8.6 - UNDER THE FLOOR, at any
 * declared value. The floor is a rule about CSS pixels and cannot be satisfied
 * here by choosing a bigger number.
 *
 * What a bigger number DID do was break the layout. Both of these labels sit in
 * a hand-positioned diagram whose coordinate space is `PLOT.width`, shared by
 * every chart on the site so a stroke width means the same thing on all of
 * them, and so not available to widen for one of them. At 12 units the node
 * sub-line measured 223 units against a 200-unit box and the edge label 173
 * units into a 150-unit gap; both rendered straight through the boxes.
 *
 * So the exception is REGISTERED rather than silently survived, the reason is a
 * measurement, and the real fix - HTML labels positioned over the SVG, which is
 * what the turnstile plane does and why - is named in section 8 as work rather
 * than pretended away here.
 */
const SVG_EXCLUSIONS: readonly { readonly selector: string; readonly px: number; readonly reason: string }[] = [
  {
    selector: ".plot .edge-label",
    px: 9.5,
    reason:
      "SVG text in a shared 1000-unit viewBox; at 12 units '$33.33M fleet, in equity' is 173 units " +
      "into a 150-unit gap between two hand-positioned columns",
  },
  {
    selector: ".plot .nw-sub",
    px: 9.5,
    reason:
      "SVG text in the same viewBox; at 12 units 'ZODL CEO - paid CYPH advisor' is 223 units against " +
      "a 200-unit box",
  },
];

describe("A3: nothing rendered as text is below the floor", () => {
  const FLOOR = pxToken("--t-floor");

  it("declares a floor, and it is 12px", () => {
    expect(FLOOR).toBe(12);
  });

  it("puts every rung at or above the floor", () => {
    for (const rung of RUNGS) {
      expect(pxToken(rung), `${rung} is below the floor`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("resolves every font-size in the stylesheet to a value at or above the floor", () => {
    const sizes = declaredSizes();
    // Vacuity guard: a parser that matched nothing would satisfy the loop below
    // silently. The stylesheet had 157 live declarations when this was written.
    expect(sizes.length, "the parser found no font-size declarations at all").toBeGreaterThan(100);

    const excluded = new Set(SVG_EXCLUSIONS.map((e) => e.px));
    const under = sizes
      .map((s) => ({ ...s, px: resolvePx(s.raw) }))
      .filter((s) => s.px !== null && s.px < FLOOR && !excluded.has(s.px))
      .map((s) => `globals.css:${String(s.line)}  ${s.raw} resolves to ${String(s.px)}px`);
    expect(under).toEqual([]);
  });

  it("has exactly as many sub-floor declarations as the register accounts for", () => {
    // The exemption above is by VALUE, which would let a third 9.5px
    // declaration arrive unregistered and be waved through with the two that
    // are named. This is the count that closes that: the stylesheet may carry
    // exactly as many sub-floor declarations as SVG_EXCLUSIONS has rows.
    const under = declaredSizes()
      .map((s) => resolvePx(s.raw))
      .filter((px) => px !== null && px < FLOOR);
    expect(under).toHaveLength(SVG_EXCLUSIONS.length);
  });

  it("registers every sub-floor declaration at the selector and value it claims", () => {
    // THE LOOP OVER THE RULE'S OWN DATA STRUCTURE. A row added later cannot
    // arrive untested: it has to name a selector that exists, carry the size it
    // claims, and give a reason.
    for (const e of SVG_EXCLUSIONS) {
      const rule = new RegExp(`${e.selector.replace(/[.\s]/g, (c) => (c === "." ? "\\." : "\\s+"))}\\s*\\{([^}]*)\\}`).exec(CSS);
      expect(rule, `${e.selector} has no rule in globals.css`).not.toBeNull();
      expect(rule?.[1], `${e.selector} does not declare ${String(e.px)}px`).toContain(`font-size: ${String(e.px)}px`);
      expect(e.reason.length, `${e.selector} carries no reason`).toBeGreaterThan(40);
      expect(e.px, `${e.selector} is registered at or above the floor and does not need a row`).toBeLessThan(FLOOR);
    }
  });

  it("leaves no unresolvable font-size hiding a literal", () => {
    // Anything `resolvePx` returns null for is a value this check cannot judge,
    // and an unjudged value is a hole. There should be none: every size is a
    // rung, a px literal, or a clamp.
    const unresolved = declaredSizes()
      .filter((s) => resolvePx(s.raw) === null)
      .map((s) => `globals.css:${String(s.line)}  ${s.raw}`);
    expect(unresolved).toEqual([]);
  });

  it("the fail side: an UNREGISTERED sub-floor declaration is caught", () => {
    // A DATA MUTATION over the real parser: 9.5px is the size 24 declarations
    // in this stylesheet carried before HANDOFF-04a, spliced back in. The
    // detector must name it. Nothing is written to disk - the mutation is
    // applied to the text the parser reads, which is what makes this a probe of
    // the parser rather than of the file system.
    // 9.75px rather than 9.5px, so the probe cannot be satisfied by the two
    // rows the register already accounts for. A value from inside the excluded
    // set that the register does NOT name is the member this must catch.
    const mutated = CSS.replace("font-size: var(--t-label);", "font-size: 9.75px;");
    expect(mutated, "the splice did not apply; this probe would prove nothing").not.toBe(CSS);
    const masked = mutated.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    const under = [...masked.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => resolvePx((m[1] as string).trim()))
      .filter((px) => px !== null && px < FLOOR);
    const excluded = new Set(SVG_EXCLUSIONS.map((e) => e.px));
    expect(
      under.filter((px) => px !== null && !excluded.has(px)),
      "9.75px was spliced into the stylesheet and the floor check did not see it",
    ).toEqual([9.75]);
  });

  it("the fail side: a rung redefined under the floor is caught", () => {
    // The case reading the source alone would miss. The stylesheet is
    // unchanged and every declaration still says `var(--t-label)`; only the
    // rung moved. A check that verified tokens were USED would stay green.
    const label = pxToken("--t-label");
    expect(label).toBeGreaterThanOrEqual(FLOOR);
    const mutatedTokens = TOKENS.replace("--t-label: 12px;", "--t-label: 9.5px;");
    expect(mutatedTokens, "the rung splice did not apply").not.toBe(TOKENS);
    const m = /--t-label:\s*([\d.]+)px/.exec(mutatedTokens);
    expect(Number(m?.[1]), "a rung under the floor must be visible to the same resolver").toBeLessThan(FLOOR);
  });

  it("the collapse is monotone - no pair of sizes swapped order", () => {
    // The seven bands below 12px collapsed onto two rungs. A collapse may lose
    // a distinction; it may not INVERT one, or a thing that used to recede
    // would now dominate. Stated as the property rather than as a table:
    // the map is non-decreasing over its domain.
    const MAP: readonly (readonly [number, string])[] = [
      [8.5, "--t-label"],
      [9, "--t-label"],
      [9.5, "--t-label"],
      [10, "--t-label"],
      [10.5, "--t-label"],
      // The 11 band lands on the FLOOR, not above the 12 band. It mapped to
      // --t-data (13px) first, which inverted it against the sites that were
      // already at 12px: a rule that had been smaller than another became
      // larger. This property is what found that - the tokens.css comment
      // claimed the collapse was monotone and it was not.
      [11, "--t-label"],
      [11.5, "--t-label"],
      [12, "--t-label"],
      [12.5, "--t-micro"],
      [13, "--t-data"],
      [13.5, "--t-dek"],
      [14, "--t-sm"],
      [15, "--t-body"],
      [16, "--t-prose"],
    ];
    const sorted = [...MAP].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = pxToken(sorted[i - 1]?.[1] as string);
      const next = pxToken(sorted[i]?.[1] as string);
      expect(next, `${String(sorted[i - 1]?.[0])}px and ${String(sorted[i]?.[0])}px swapped order`).toBeGreaterThanOrEqual(
        prev,
      );
    }
  });
});
