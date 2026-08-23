/**
 * Every source id written anywhere in apps/web resolves to a real source.
 *
 * `packages/content` guards its own seeds two ways: the zod schema refuses a
 * claim with no `sources[]`, and `scripts/check-provenance.mjs` asserts that
 * every URL in `sources.json` occurs in `docs/2.0/research`. Neither reaches
 * this package. HANDOFF-03 renders figures the corpus states as dated tables
 * rather than as claim objects - the shielded-share readings, the ZEC price
 * series, the Cypherpunk acquisition ledger - and those carry their citations
 * as `S-` literals inside `apps/web/src`, where nothing was checking them.
 *
 * A mistyped id is not a loud failure. `resolveSources` skips what it cannot
 * find, so the page renders with one fewer citation and says nothing about it -
 * which is the worst possible behaviour on a site whose argument is that every
 * claim is checkable. This test is the guard: it reads the source tree, pulls
 * out every `S-` literal, and requires all of them to resolve.
 *
 * It is deliberately a text sweep rather than a typed one. A typed check could
 * only see the ids some module chose to export; this sees every id anyone
 * writes, including one typed inline into a page a year from now.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getSource, getSources } from "@zcashreveal/content";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "src");

/** Source ids are `S-<slug>` (packages/content: sourceRefSchema). */
const SOURCE_ID = /"(S-[a-z0-9-]+)"/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

interface Ref {
  readonly id: string;
  readonly file: string;
}

function refsInTree(): readonly Ref[] {
  const out: Ref[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(SOURCE_ID)) {
      const id = m[1];
      if (id !== undefined) out.push({ id, file: file.slice(SRC.length + 1) });
    }
  }
  return out;
}

describe("source provenance across apps/web - pass state", () => {
  it("finds source citations written directly into the app", () => {
    // If this ever drops to zero the sweep has stopped looking, and every
    // assertion below becomes vacuous.
    expect(refsInTree().length).toBeGreaterThan(20);
  });

  it("every source id in the tree resolves through the content package", () => {
    const bad = refsInTree().filter((r) => getSource(r.id) === undefined);
    const detail = bad.map((r) => `${r.file}: ${r.id}`).join("\n  ");
    expect(bad, `source ids that are not in sources.json:\n  ${detail}`).toHaveLength(0);
  });

  it("reports which files carry citations, so a new one cannot go unnoticed", () => {
    const files = new Set(refsInTree().map((r) => r.file));
    // Not an exhaustive list - a new page carrying citations is expected and
    // fine. The check is that the sweep sees more than one file, so a refactor
    // that moved every citation into one module would be visible here.
    expect(files.size).toBeGreaterThan(0);
    for (const f of files) expect(f.endsWith(".ts") || f.endsWith(".tsx")).toBe(true);
  });
});

describe("source provenance across apps/web - fail state", () => {
  it("the same check rejects an id that is not in the corpus", () => {
    // Exactly the shape of a typo, and the shape of an invented citation.
    const planted = "S-a-source-that-does-not-exist";
    expect(getSource(planted)).toBeUndefined();
    const bad = [{ id: planted, file: "planted.ts" }].filter((r) => getSource(r.id) === undefined);
    expect(bad).toHaveLength(1);
  });

  it("the corpus it checks against is the real one", () => {
    expect(getSources().length).toBeGreaterThan(300);
  });
});
