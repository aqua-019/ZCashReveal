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
    for (const m of maskComments(readFileSync(file, "utf8")).matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)) {
      out.push({ file: file.slice(SRC.length + 1), body: m[1] as string });
    }
  }
  return out;
}

/**
 * Comments blanked LENGTH-PRESERVINGLY, and this is a defect fix rather than
 * tidying.
 *
 * The sweep above used to read raw source. Components in this tree QUOTE
 * `<summary>` in their docblocks while explaining the rule - `Working.tsx`'s
 * docblock states the rule and gives its worked example, "Sources - 14 cited, 3
 * primary" - and an unmasked regex matches from the `<summary>` inside the
 * comment to the real `</summary>` far below, swallowing the prose between
 * them. The captured body then contains the comment's digits, so the summary
 * READS AS CARRYING A FINDING BECAUSE ITS OWN DOCUMENTATION MENTIONED ONE.
 *
 * That is A4 satisfiable by a comment, which is the "a comment cannot fail"
 * defect arriving in the checker instead of in the palette. Found by an
 * exemption self-check that asserted `Working.tsx`'s summary carries NO finding
 * in the source and got the opposite answer - the probe was right and the
 * parser was wrong, which is the order this project's rule about probes
 * insists on establishing before either is changed.
 */
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
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

/**
 * The one summary in the tree that carries a finding it cannot show here, and
 * the rule that replaces reading it.
 *
 * `components/record/Working.tsx` is a shared disclosure whose summary is
 * `{title}` and `{finding}`. Both are props, so the SOURCE of the summary
 * carries no digit and no derived count and never will - which is precisely the
 * case this file's own docblock names: "a summary whose count comes from a prop
 * the source cannot see is invisible here and visible there".
 *
 * WIDENING `carriesFinding` TO ACCEPT `{finding}` WOULD BE THE WRONG FIX. It
 * would let any component pass by naming a variable `finding`, which is a
 * predicate satisfied by the value it was written to exclude. So the check moves
 * to the OBJECT the rule is actually about: not the summary, which is a
 * template, but every CALL SITE that supplies the value the template renders.
 * That is LEDGER-09b's rule - enumerate the object, never a source that
 * constructs it - applied one layer down.
 */
const PROP_SUMMARY_COMPONENTS = ["Working"];

/** Every `<Working ...>` call site's `finding` attribute, with its file. */
function workingFindings(): readonly { readonly file: string; readonly finding: string }[] {
  const out: { file: string; finding: string }[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/<Working\b([\s\S]*?)>/g)) {
      const attrs = m[1] as string;
      const f = /finding=(?:\{(`[^`]*`|"[^"]*"|'[^']*'|[^}]*)\}|("[^"]*"))/.exec(attrs);
      out.push({ file: file.slice(SRC.length + 1), finding: f === null ? "" : (f[1] ?? f[2] ?? "") });
    }
  }
  return out;
}

describe("A4: every summary in apps/web carries its finding", () => {
  const found = summaries();

  it("does not read a summary out of a comment", () => {
    // The defect the mask closes, driven over the real parser rather than
    // argued: a docblock that quotes the rule and its worked example, followed
    // by a real summary carrying no finding. Unmasked, the match spans both and
    // the comment's digits satisfy the check.
    const planted =
      "/**\n * EVERY `<summary>` CARRIES ITS FINDING - \"Sources - 14 cited, 3 primary\".\n */\n" +
      "<details><summary><span>Sources</span></summary><div /></details>";
    const raw = [...planted.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => m[1] as string);
    expect(raw, "the unmasked probe did not reproduce the defect, so it proves nothing").toHaveLength(1);
    expect(carriesFinding(raw[0] as string), "the unmasked sweep should be fooled by the comment").toBe(true);
    const masked = [...maskComments(planted).matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map(
      (m) => m[1] as string,
    );
    expect(masked).toHaveLength(1);
    expect(carriesFinding(masked[0] as string), "the masked sweep must see the bare summary for what it is").toBe(false);
  });

  it("finds the summaries at all - an empty sweep would pass vacuously", () => {
    // The parser is a regex over JSX. If a refactor changed how a summary is
    // written, this check would silently start passing over nothing, which is
    // the shape this project has shipped three times.
    expect(found.length, "no <summary> found in apps/web/src; the parser is broken").toBeGreaterThanOrEqual(2);
  });

  it("gives every summary a digit or a derived count", () => {
    // `Working.tsx`'s summary is a template over two props and is checked at its
    // call sites instead - see `PROP_SUMMARY_COMPONENTS` and the test below.
    // Named explicitly rather than skipped by a pattern, so the exemption is a
    // list a reader can count rather than a hole a regex leaves.
    const bare = found
      .filter((s) => !carriesFinding(s.body))
      .filter((s) => !PROP_SUMMARY_COMPONENTS.some((c) => s.file.endsWith(`${c}.tsx`)))
      .map((s) => `${s.file}: ${s.body.trim().slice(0, 80)}`);
    expect(bare).toEqual([]);
  });

  it("every <Working> call site passes a finding that carries one", () => {
    const sites = workingFindings();
    for (const s of sites) {
      expect(s.finding, `${s.file}: a <Working> with no finding prop`).not.toBe("");
      expect(
        carriesFinding(s.finding),
        `${s.file}: <Working finding=${s.finding}> carries no digit and no derived count`,
      ).toBe(true);
    }
  });

  it("the exempted components really are the ones that cannot be read here", () => {
    // AN EXEMPTION THAT COVERS NOTHING IS AN EXEMPTION THAT OUTLIVES ITS REASON,
    // and the next reader takes it for a rule. Each name must correspond to a
    // real file whose summary really is a prop passthrough - so a component that
    // later gains a literal finding stops being exempt automatically.
    for (const c of PROP_SUMMARY_COMPONENTS) {
      const s = found.find((x) => x.file.endsWith(`${c}.tsx`));
      expect(s, `${c} is exempted and has no <summary> in the tree`).toBeDefined();
      expect(
        carriesFinding(s?.body ?? ""),
        `${c}'s summary now carries a finding in the source, so the exemption is no longer needed`,
      ).toBe(false);
    }
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

  it("the fail side: a <Working> call site with the rule's own counter-example", () => {
    // A DATA MUTATION over the real attribute parser, using the member the rule
    // names. `finding="Sources"` is the bare form the whole rule exists to
    // forbid, and it must not survive the predicate the pass side ran.
    expect(carriesFinding('"Sources"')).toBe(false);
    expect(carriesFinding('"Sources - 14 cited, 3 primary"')).toBe(true);
    // And the parser itself, driven over a synthetic call site, so a green run
    // above cannot be the parser matching nothing.
    const parsed = /<Working\b([\s\S]*?)>/.exec('<Working title="Sources" finding="Sources">');
    expect(parsed, "the <Working> call-site parser matched nothing").not.toBeNull();
    expect(/finding="([^"]*)"/.exec(parsed?.[1] ?? "")?.[1]).toBe("Sources");
  });

  it("accepts a derived count and does not require a typed-in digit", () => {
    // The other polarity of the predicate: the interpolated form must PASS, or
    // the rule would push authors into writing the literal beside the list.
    expect(carriesFinding("<span>{PUBLISHED.length} fields, all public</span>")).toBe(true);
    expect(carriesFinding("<span>{sources.length} sources</span>")).toBe(true);
    expect(carriesFinding("<span>4 limits, stated</span>")).toBe(true);
  });
});
