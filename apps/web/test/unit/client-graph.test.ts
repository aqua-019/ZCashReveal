/**
 * A4 - the managed store's variables cannot reach the browser, proved by
 * walking the import graph rather than by greping for a string.
 *
 * WHY THE GRAPH AND NOT THE GREP. A4 as HANDOFF-11 wrote it is two greps: the
 * source tree for `SNAPSHOT_REDIS`, and `.next/static` for the same. Both are
 * kept - the second is in the e2e suite, against a real build - and neither is
 * sufficient on its own, for opposite reasons. The source grep names a
 * predicate ("only server-side modules") that a reader has to evaluate by hand
 * against a directive that may be five imports away; the bundle grep is
 * authoritative but needs a production build, so it cannot run in the unit
 * suite and cannot say WHICH import would have leaked.
 *
 * DELIVERABLE 0 FOUND THIS ASSERTION PASSING VACUOUSLY. Against merged main no
 * module under `apps/web/src` read any managed-store variable at all, so both
 * legs were empty by construction and a two-polarity transcript collected then
 * would have certified a hole. It is meaningful only now that a reader exists,
 * and this file is what makes it meaningful in the unit suite.
 *
 * AND THE TRAP IS REAL AND WAS NEARLY TAKEN. `src/lib/env.ts` is the obvious
 * home for the reads - its own docblock promised "the first server-side reader
 * arrives in HANDOFF-11" - and `env.ts` is inside the client graph, three hops
 * from `MempoolPanel.tsx`: `env.ts` to `api/stream.ts` to the panel. The test
 * below fails on exactly that placement, which is its fail side.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** Every `.ts` and `.tsx` under `src`, as absolute paths. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC);

/**
 * The local modules a file imports, resolved to absolute paths.
 *
 * `@/x` and `./x` only. A bare specifier is a package, and a package cannot
 * carry this app's environment reads. Extensions are inferred the way the
 * bundler infers them, and a directory is tried as its `index`.
 */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs: string[] = [];
  // `import ... from "x"`, `import "x"`, `export ... from "x"` and dynamic
  // `import("x")`. The dynamic form matters: the store reaches `ioredis`
  // through one, and a walker blind to it would call an eagerly-loaded module
  // lazy.
  const RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)["']([^"']+)["']/g;
  for (const m of text.matchAll(RE)) {
    const spec = m[1];
    if (spec === undefined) continue;
    if (spec.startsWith("@/")) specs.push(resolve(SRC, spec.slice(2)));
    else if (spec.startsWith(".")) specs.push(resolve(dirname(file), spec));
  }
  return specs.flatMap((base) => {
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
      if (FILES.includes(candidate)) return [candidate];
    }
    return [];
  });
}

const IMPORTS = new Map(FILES.map((f) => [f, importsOf(f)]));

/** A file that declares itself a client component. */
function isClientEntry(file: string): boolean {
  const head = readFileSync(file, "utf8").slice(0, 200);
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(head);
}

/** Every module reachable from any `'use client'` entry, transitively. */
function clientGraph(): Set<string> {
  const seen = new Set<string>();
  const queue = FILES.filter(isClientEntry);
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const dep of IMPORTS.get(file) ?? []) queue.push(dep);
  }
  return seen;
}

const MANAGED_STORE_PREFIX = ["SNAPSHOT", "REDIS"].join("_");

describe("A4 - no managed-store variable can reach the browser", () => {
  it("the walker is not vacuous: it finds client entries and a graph larger than them", () => {
    // THE CHECK THIS FILE OWES ITSELF. A graph builder with a broken regex
    // returns an empty set, and an empty set satisfies every assertion below.
    // So the instrument is checked against a member already known to be in the
    // set before any finding is built on it.
    const entries = FILES.filter(isClientEntry);
    expect(entries.length).toBeGreaterThan(3);
    const graph = clientGraph();
    expect(graph.size).toBeGreaterThan(entries.length);

    // A KNOWN MEMBER, BY NAME. `MempoolPanel` is a client component, it imports
    // `api/stream.ts`, and `stream.ts` imports `lib/env.ts` - the exact three
    // hops that make `env.ts` the wrong home for the store's reads.
    const named = (p: string) => join(SRC, ...p.split("/"));
    expect(graph.has(named("components/track/MempoolPanel.tsx"))).toBe(true);
    expect(graph.has(named("lib/api/stream.ts"))).toBe(true);
    expect(graph.has(named("lib/env.ts"))).toBe(true);
  });

  it("PASS STATE: the snapshot store is NOT reachable from any client component", () => {
    const graph = clientGraph();
    const store = join(SRC, "lib", "snapshot", "store.ts");
    expect(FILES).toContain(store);
    expect(graph.has(store)).toBe(false);
  });

  it("PASS STATE: no module in the client graph carries the managed store's variable prefix at all", () => {
    const graph = clientGraph();
    const offenders = [...graph]
      .filter((f) => readFileSync(f, "utf8").includes(MANAGED_STORE_PREFIX))
      .map((f) => relative(SRC, f));
    // NOT "DOES NOT READ IT" - DOES NOT CARRY IT. The weaker predicate is the
    // one that would let the read-write token through as a mention, and a
    // predicate with an exception in it is a predicate whose next exception is
    // argued rather than refused. Two comments had to lose the literal prefix
    // for this to pass, which is a strengthening of the code rather than a
    // weakening of the assertion.
    expect(offenders).toEqual([]);
  });

  it("FAIL STATE, BY DATA: the store placed where its own docblock warns - inside the client graph - is caught", () => {
    // The member of the exclusion set, by name: a module transitively imported
    // by a `'use client'` file. `lib/env.ts` is that module, three hops from
    // MempoolPanel, and it is the placement the store's docblock names as the
    // one that would break this assertion.
    const graph = clientGraph();
    const envModule = join(SRC, "lib", "env.ts");
    expect(graph.has(envModule)).toBe(true);

    // Simulate the placement without writing to the tree: had the reads landed
    // in `env.ts`, this is the predicate that fires.
    const hypothetical = `${readFileSync(envModule, "utf8")}\nexport const REST = process.env.${MANAGED_STORE_PREFIX}_KV_REST_API_URL;\n`;
    expect(hypothetical.includes(MANAGED_STORE_PREFIX)).toBe(true);
    const wouldFail = [...graph].some(
      (f) => (f === envModule ? hypothetical : readFileSync(f, "utf8")).includes(MANAGED_STORE_PREFIX),
    );
    expect(wouldFail).toBe(true);
  });
});
