/**
 * A9, first half - each of the three collapsed patterns appears exactly once.
 *
 * The screenshot half of A9 (test/e2e/css-dedup.spec.ts) proves the pass changed
 * no pixel. It cannot prove the pass actually happened: a stylesheet that still
 * carries three copies of one treatment renders exactly like one that carries a
 * single copy, which is the whole reason the duplication survived three
 * handoffs. So this file reads globals.css as text and counts.
 *
 * The counting is structural rather than by class name, because a name check
 * would pass the moment somebody wrote a fourth block under a fourth name. What
 * is counted is the DECLARATION SET that defines each pattern:
 *
 *   - the preformatted block: a rule that draws a bordered, radiused,
 *     horizontally-scrolling monospace panel;
 *   - the compact cell: a rule that sets the mono 11px / 1.55 / --ink-dim
 *     register;
 *   - the card inset: any panel padding, which must now be a rung of the
 *     five-step ladder and never a literal.
 *
 * The parser splits on `}` in the same way test/unit/fonts.test.ts does. It is
 * crude and it is deliberate: a real CSS parser would be a dependency, and this
 * stylesheet is written by hand in one house style with one declaration per
 * line, so the crude split is exact on it.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, "../../src/app/globals.css"), "utf8");
const TOKENS = readFileSync(resolve(HERE, "../../src/styles/tokens.css"), "utf8");

/** Rule blocks as `[selector, body]`, comments stripped. */
function rules(): readonly (readonly [string, string])[] {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: (readonly [string, string])[] = [];
  for (const chunk of bare.split("}")) {
    const at = chunk.indexOf("{");
    if (at === -1) continue;
    const selector = chunk.slice(0, at).trim();
    // Skip at-rule preambles (@media, @supports): their opening brace has no
    // declarations of its own, and the nested rules split out separately.
    if (selector.startsWith("@")) continue;
    out.push([selector, chunk.slice(at + 1)] as const);
  }
  return out;
}

const RULES = rules();

describe("A9 (a): one preformatted-mono treatment", () => {
  /**
   * The four declarations that, together, make a block of preformatted text a
   * panel rather than bare text. HANDOFF-03 shipped three rules carrying all
   * four - `.formula`, `.bw-code`, `.fl-code`.
   */
  const DEFINING = ["font-family: var(--f-mono)", "border: 1px solid var(--line)", "border-radius: var(--radius)", "overflow-x: auto"];

  const treatments = RULES.filter(([, body]) => DEFINING.every((d) => body.includes(d)));

  it("declares the treatment in exactly one rule", () => {
    expect(treatments.map(([sel]) => sel)).toEqual([".code"]);
  });

  it("leaves the retired names with no rule of their own", () => {
    const selectors = RULES.map(([sel]) => sel);
    expect(selectors).not.toContain(".formula");
    expect(selectors).not.toContain(".bw-code");
    expect(selectors).not.toContain(".mt-posterior");
  });

  it("keeps `.fl-code` as a modifier of one declaration, not a second treatment", () => {
    // /flows is pinned by the screenshot half of A9, so the ledger's 0.1 of
    // extra leading survives - but as one line, on top of the shared block.
    const [, body] = RULES.find(([sel]) => sel === ".fl-code") ?? ["", ""];
    const declarations = body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    expect(declarations).toEqual(["line-height: 1.7"]);
  });

  it("re-parents the diff colours onto the surviving block", () => {
    const selectors = RULES.map(([sel]) => sel);
    expect(selectors).toContain(".code .bw-c");
    expect(selectors).toContain(".code .bw-del");
    expect(selectors).toContain(".code .bw-add");
  });

  it("has no second element in the tree still calling itself a code block", () => {
    // `.ledgerfoot .code` was a flex column of footer lines, not a code block,
    // and it shadowed the name. Renamed so `.code` means one thing.
    expect(CSS).not.toContain(".ledgerfoot .code");
    expect(RULES.map(([sel]) => sel)).toContain(".ledgerfoot .lines");
  });
});

describe("A9 (b): one compact-cell register", () => {
  // `font-size: 11px` until HANDOFF-04a. The compact-cell register is still one
  // rule; what moved is that its size is now a named rung rather than a
  // literal, so the defining set names the rung. Leaving the literal here would
  // have made this check pass vacuously - no rule declares 11px any more, so
  // `registers` would be empty and `[]` would never equal `[".cp"]`, which is
  // exactly how this test failed when the scale landed.
  const DEFINING = [
    "font-family: var(--f-mono)",
    "font-size: var(--t-label)",
    "line-height: 1.55",
    "color: var(--ink-dim)",
  ];

  const registers = RULES.filter(([, body]) => DEFINING.every((d) => body.includes(d)));

  it("declares the register in exactly one rule", () => {
    expect(registers.map(([sel]) => sel)).toEqual([".cp"]);
  });

  it("reduces `.mt-lineage` to the one declaration that is genuinely its own", () => {
    const [, body] = RULES.find(([sel]) => sel === ".mt-lineage") ?? ["", ""];
    const declarations = body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d !== "");
    expect(declarations).toEqual(["max-width: 34ch"]);
  });

  it("keeps the descendant rule that made `.mt-lineage` un-deletable", () => {
    expect(RULES.map(([sel]) => sel)).toContain(".mt-lineage .mt-internal");
  });

  it("drops the duplicated emphasis child", () => {
    expect(RULES.map(([sel]) => sel)).not.toContain(".mt-lineage b");
    expect(RULES.map(([sel]) => sel)).toContain(".cp b");
  });
});

describe("A9 (c): every card inset is a rung of the five-step ladder", () => {
  it("names exactly five steps, each vertical / vertical + 2px", () => {
    const steps = [...TOKENS.matchAll(/--inset-(\d+):\s*([^;]+);/g)].map((m) => [m[1], m[2]?.trim()] as const);
    expect(steps).toEqual([
      ["1", "10px 12px"],
      ["2", "12px 14px"],
      ["3", "14px 16px"],
      ["4", "16px 18px"],
      ["5", "18px 20px"],
    ]);
  });

  it("leaves no card inset written as a literal", () => {
    // A card inset is a two- or three-value px padding whose VERTICAL step is
    // at least 10px - the ladder's first rung, and the scale at which a padded
    // box reads as a panel rather than as a badge. That floor is what excludes
    // `.entry .letter` (1px 9px), `.chip` (3px 8px) and `.pill` (2px 6px)
    // without naming them. Single-value paddings are excluded by the shape of
    // the pattern. What is left is the chrome: frames rather than panels, whose
    // insets are set by the layout around them and not by this ladder, and they
    // are named here so that anything NOT on the list has to use a rung.
    const CHROME = new Set([
      ".skip",
      // HANDOFF-04a: `.sysbar` no longer carries padding - the bar became a
      // wrapper so the disclosure could grow inside it, and the row that holds
      // the wordmark and the clock is `.sysbar-in`. Same chrome, one level in.
      ".sysbar-in",
      ".screens",
      ".screens a",
      ".screen",
      ".block",
      ".chip",
      ".pill",
      ".tbl-wrap th",
      ".lrow",
      ".subnav a,\n.subnav button",
      ".tip",
      // `.hero .over` and `.leak` left with the hero itself in HANDOFF-04a.
      // `.beat-claim-in` is what replaced the first: a frame whose inset is set
      // by the page margin rather than by the panel ladder.
      ".beat-claim-in",
      ".record-head",
      ".ledgerfoot",
      ".srclist li",
      ".tl .ev",
      ".bw-step",
    ]);
    const offenders = RULES.filter(([sel, body]) => {
      if (CHROME.has(sel.replace(/\s+/g, " ").trim()) || CHROME.has(sel)) return false;
      const m = /padding:\s*(\d+)px\s+\d+px(?:\s+\d+px)?\s*;/.exec(body);
      return m !== null && Number(m[1]) >= 10;
    }).map(([sel, body]) => `${sel} -> ${/padding:\s*([^;]+);/.exec(body)?.[1] ?? "?"}`);
    expect(offenders).toEqual([]);
  });

  it("puts every panel on a named rung", () => {
    const used = new Set(
      [...CSS.matchAll(/padding:\s*var\((--inset-\d)\)/g)].map((m) => m[1] as string),
    );
    expect([...used].sort()).toEqual(["--inset-1", "--inset-2", "--inset-3", "--inset-4", "--inset-5"]);
  });
});
