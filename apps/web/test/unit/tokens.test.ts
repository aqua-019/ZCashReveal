/**
 * HANDOFF-01 assertion A2 in test form. The same `checkTokens` that backs
 * `pnpm --filter @zcashreveal/web check:tokens` runs here, so the rule cannot
 * pass in the shell and fail in CI, or the reverse.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { REQUIRED, TOKENS_PATH, checkTokens } from "../../scripts/check-tokens.mjs";

/** Build a stylesheet fixture with one declaration per line, as a real token file is written. */
function css(declarations: readonly string[]): string {
  return `:root {\n${declarations.map((d) => `  ${d}`).join("\n")}\n}\n`;
}

/** Comments are prose about the tokens, not tokens. Strip them before scanning values. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("design tokens", () => {
  it("defines every contracted token with the contracted value", () => {
    const results = checkTokens();
    const failures = results
      .filter((r) => !r.ok)
      .map((r) => `${r.token}: expected ${r.expected}, found ${r.found ?? "(absent)"}`);
    expect(failures, `token contract violated:\n  ${failures.join("\n  ")}`).toEqual([]);
    expect(results).toHaveLength(REQUIRED.length);
  });

  it("checks a non-trivial number of tokens", () => {
    // Guards against an empty or accidentally emptied REQUIRED list silently
    // turning the assertion above into a no-op.
    expect(REQUIRED.length).toBeGreaterThanOrEqual(15);
  });

  it("reports a wrong value rather than passing it", () => {
    // Two-polarity evidence: the same checker must fail when handed a bad file.
    // Declarations are matched line-anchored, so the fixture is written as a
    // real stylesheet rather than folded onto one line.
    const bad = checkTokens(css(["--bg: #ffffff;", "--gold: #f4b728;"]));
    const byToken = new Map(bad.map((r) => [r.token, r]));
    expect(byToken.get("--bg")?.ok).toBe(false);
    expect(byToken.get("--bg")?.found).toBe("#ffffff");
    expect(byToken.get("--gold")?.ok).toBe(true);
    // A token that is absent entirely fails too, and says so as (absent).
    expect(byToken.get("--ease")?.ok).toBe(false);
    expect(byToken.get("--ease")?.found).toBe(null);
  });

  it("compares hex case-insensitively, so the file may keep lowercase hex", () => {
    // CLAUDE.md requires lowercase hex in the file; the contract in HANDOFF-01
    // section 3 is written uppercase. Both must satisfy the same check.
    const lower = checkTokens(css(["--gold: #f4b728;"]));
    const upper = checkTokens(css(["--gold: #F4B728;"]));
    expect(lower.find((r) => r.token === "--gold")?.ok).toBe(true);
    expect(upper.find((r) => r.token === "--gold")?.ok).toBe(true);
  });

  it("does not accept the @theme bridge re-export in place of the declaration", () => {
    // tokens.css re-exports every token as `--color-x: var(--x)` for Tailwind.
    // That must not satisfy the contract; only the :root declaration may.
    const bridgeOnly = checkTokens(css(["--color-bg: var(--bg);"]));
    expect(bridgeOnly.find((r) => r.token === "--bg")?.found).toBe(null);
  });
});

describe("superseded pool hues", () => {
  /**
   * The plan's section 6 listed a lighter pool set before the mockup fixed the
   * palette. Those five hues must not survive as values anywhere in the token
   * file; they are allowed to be named in a comment that explains why they were
   * dropped, which is why comments are stripped first.
   */
  const SUPERSEDED = ["#8FB3C9", "#6FB58C", "#E0B15A", "#D77BAA", "#9B8CFF"];

  it("does not use any of the plan section 6 hues as a declared value", () => {
    const source = stripCssComments(readFileSync(TOKENS_PATH, "utf8")).toLowerCase();
    const present = SUPERSEDED.filter((hex) => source.includes(hex.toLowerCase()));
    expect(present, `superseded pool hues still declared: ${present.join(", ")}`).toEqual([]);
  });

  it("ships the mockup pool set instead", () => {
    const shipped = new Map(REQUIRED.map(([token, value]) => [token, value]));
    expect(shipped.get("--p-transparent")).toBe("#3a8bd9");
    expect(shipped.get("--p-sprout")).toBe("#1f9e62");
    expect(shipped.get("--p-sapling")).toBe("#d9641e");
    expect(shipped.get("--p-orchard")).toBe("#c94f8f");
    expect(shipped.get("--p-ironwood")).toBe("#8b7fe6");
  });

  it("strips comments before scanning, and would otherwise see them", () => {
    // Two-polarity evidence for the stripper itself: without it, the note in the
    // token file header that names the dropped hues would fail the scan.
    const raw = readFileSync(TOKENS_PATH, "utf8").toLowerCase();
    const namedInAComment = SUPERSEDED.some((hex) => raw.includes(hex.toLowerCase()));
    expect(namedInAComment).toBe(true);
    expect(stripCssComments("/* #8FB3C9 */ :root { --x: 1px; }")).not.toContain("8FB3C9");
    expect(stripCssComments(":root { --x: #8FB3C9; }")).toContain("#8FB3C9");
  });
});
