/**
 * ASSERTION A4, THE SOURCE HALF - every `<summary>` in `apps/web` carries its
 * finding.
 *
 * THE RULE. A closed panel that says "Sources" tells a reader nothing and reads
 * as evasion; one that says "6 fields, all public" is still an answer with the
 * panel shut. `EstimatePanel` established the pattern - `how this was bounded -
 * 3 filters, 2 assumptions` - and HANDOFF-04a promotes it to a rule.
 *
 * WHY THIS FILE EXISTS BESIDE THE RENDERED CHECK, AND IT IS NOT BELT AND
 * BRACES. `test/e2e/legibility.spec.ts` sweeps the summaries a route actually
 * renders, which is the stronger check where it applies: it reads `innerText`,
 * so it sees the digits a reader sees rather than the digits in the markup.
 * But it can only see what a visited route puts on the page, and measured on
 * this tree that is 5 summaries on `/`, 29 on `/beware` and ZERO on `/track` -
 * `/track`'s only disclosure is `EstimatePanel`'s, which exists once an
 * estimate does, on `/tx/...` and `/address/...`. A route contributing no
 * summaries contributes no coverage, and A4's wording is "every `<summary>` in
 * `apps/web`", which is a claim about the SOURCE. So the source is what this
 * file reads.
 *
 * THE TWO HALVES CATCH DIFFERENT THINGS AND NEITHER SUBSUMES THE OTHER. A
 * summary whose count comes from a prop the source cannot see is invisible
 * here and visible there; a summary on a component no test route renders is
 * visible here and invisible there.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../src");

function walk(dir: string): readonly string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Every `<summary>` element in the source, with the JSX between its tags.
 *
 * A `<summary>` in this codebase is always written across several lines with
 * child elements inside it, so the match spans lines and is non-greedy to its
 * own closing tag. A self-closing `<summary/>` would be a summary with no
 * content at all and is caught by the empty case rather than skipped.
 */
function summaries(): readonly { readonly file: string; readonly body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)) {
      out.push({ file: file.slice(SRC.length + 1), body: m[1] as string });
    }
  }
  return out;
}

/**
 * Does this summary's body carry a finding?
 *
 * A LITERAL DIGIT OR AN INTERPOLATED COUNT, and the second half is what makes
 * this check about the right thing. `{PUBLISHED.length}` and
 * `{sources.length}` carry no digit in the source and carry one on the page;
 * requiring a literal digit would push authors towards typing "6" beside a
 * six-item list, which is a second source for a quantity the list already has
 * and is exactly the defect A1 is written against. So a `.length`, a `count`,
 * or a `{...}` expression naming one satisfies it.
 */
function carriesFinding(body: string): boolean {
  if (/\d/.test(body)) return true;
  return /\{[^}]*\b(?:length|count|Count|total|size)\b[^}]*\}/.test(body);
}

describe("A4: every summary in apps/web carries its finding", () => {
  const found = summaries();

  it("finds the summaries at all - an empty sweep would pass vacuously", () => {
    // The parser is a regex over JSX. If a refactor changed how a summary is
    // written, this check would silently start passing over nothing, which is
    // the shape this project has shipped three times.
    expect(found.length, "no <summary> found in apps/web/src; the parser is broken").toBeGreaterThanOrEqual(2);
  });

  it("gives every summary a digit or a derived count", () => {
    const bare = found.filter((s) => !carriesFinding(s.body)).map((s) => `${s.file}: ${s.body.trim().slice(0, 80)}`);
    expect(bare).toEqual([]);
  });

  it("the fail side: the rule's own counter-example is caught", () => {
    // A DATA MUTATION from inside the exclusion set - "a summary whose text has
    // no digit" - and the member is the one the rule itself names. If
    // `carriesFinding` cannot see this, the green run above is not evidence.
    expect(carriesFinding("<span>Sources</span>")).toBe(false);
    expect(carriesFinding("Sources")).toBe(false);
    expect(carriesFinding("<span>How the residual is derived</span>")).toBe(false);
  });

  it("the fail side: a real summary stripped of its finding is caught", () => {
    // The same predicate, driven over a REAL body from the tree with its count
    // removed, rather than over a string invented for the probe.
    const withCount = found.find((s) => carriesFinding(s.body));
    expect(withCount, "no summary in the tree carries a finding; nothing to strip").toBeDefined();
    const stripped = (withCount?.body ?? "")
      .replace(/\d/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/length|count|Count|total|size/g, "");
    expect(carriesFinding(stripped), "a real summary stripped of its count still read as carrying one").toBe(false);
  });

  it("accepts a derived count and does not require a typed-in digit", () => {
    // The other polarity of the predicate: the interpolated form must PASS, or
    // the rule would push authors into writing the literal beside the list.
    expect(carriesFinding("<span>{PUBLISHED.length} fields, all public</span>")).toBe(true);
    expect(carriesFinding("<span>{sources.length} sources</span>")).toBe(true);
    expect(carriesFinding("<span>4 limits, stated</span>")).toBe(true);
  });
});
