/**
 * No citation disclosure may sit inside a paragraph.
 *
 * `Cite` renders a `<details>`. `<details>` is flow content, and the HTML
 * parser closes an open `<p>` when it meets one - so a citation written inside
 * a paragraph is torn out of that paragraph AND out of its `.claim` container,
 * promoted to a sibling, and followed by a stray empty `<p>`. The server sends
 * one tree, the browser builds another, and React reports a hydration mismatch.
 * Nothing about it is visible in TypeScript, in lint, or in a passing build.
 *
 * It happened twice in one session: once on the splash, found by design review,
 * and once in the timeline dek, found an hour later by the A7 suite noticing a
 * page error. Both were written by people who knew about the first one. That is
 * the shape of a defect that needs a check rather than a habit.
 *
 * The two components that render caller JSX into a block - `RecordHead`'s dek
 * and `Pending`'s body - are now `<div>`, so the remaining risk is a page
 * writing `<p>` around its own citation. This test reads the source for that.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** A `<p ...>` whose content reaches a citation before its closing tag. */
const P_WITH_DISCLOSURE = /<p\b[^>]*>((?:(?!<\/p>)[\s\S])*?)(?:<Cite\b|<FlowsClaim\b|className="claim")/g;

/**
 * Comments are stripped first. The fix for the splash carries a comment that
 * explains the trap by spelling it out, and the sweep matched the explanation -
 * the same trap HANDOFF-01 hit twice with the Math.random ban and HANDOFF-03
 * hit again with the font loader. A check that cannot survive being described
 * is a check nobody can leave a note about.
 */
function code(text: string): string {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Components that render `children` or a prop into a block element. */
const FLOW_CONTAINERS = [
  { file: join(SRC, "components", "shell", "RecordHead.tsx"), needle: '<div className="dek">' },
  { file: join(SRC, "components", "shell", "Pending.tsx"), needle: "<div>{children}</div>" },
];

describe("citation disclosures are never inside a paragraph - pass state", () => {
  it("no page or component wraps a citation in a <p>", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = code(readFileSync(file, "utf8"));
      for (const m of text.matchAll(P_WITH_DISCLOSURE)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${file.slice(SRC.length + 1)}:${line}`);
      }
    }
    expect(
      offenders,
      `a <details> inside a <p> is torn out of it by the parser and breaks hydration:\n  ${offenders.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("the two components that render caller JSX use a flow container, not a paragraph", () => {
    for (const { file, needle } of FLOW_CONTAINERS) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} no longer renders caller JSX into a flow container`).toContain(needle);
    }
  });

  it("finds citations at all, so the sweep is not looking at an empty tree", () => {
    const withClaims = walk(SRC).filter((f) => readFileSync(f, "utf8").includes('className="claim"'));
    expect(withClaims.length).toBeGreaterThan(5);
  });
});

describe("citation disclosures are never inside a paragraph - fail state", () => {
  it("the same pattern matches a paragraph that does wrap one", () => {
    const planted = '<p className="src">Some prose. <span className="claim"><Cite id="B1" /></span></p>';
    expect([...planted.matchAll(P_WITH_DISCLOSURE)]).toHaveLength(1);
  });

  it("and does not match a div that wraps one", () => {
    const fine = '<div className="src">Some prose. <span className="claim"><Cite id="B1" /></span></div>';
    expect([...fine.matchAll(P_WITH_DISCLOSURE)]).toHaveLength(0);
  });
});
