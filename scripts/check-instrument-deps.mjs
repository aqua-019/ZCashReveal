// Guards the ONE constraint `packages/zec-instruments` exists to satisfy: its
// dependency graph contains neither `zeromq` nor `@zcashreveal/indexer`.
//
// WHY THIS EXISTS. HANDOFF-09 built three pool-level estimators inside
// `apps/indexer/src/analysis/` and a publisher that could not reach them, so
// `residual`, `drain`, `migrationHist` and `neffSeries` published as `null` on
// every tip for a whole handoff. The cause was not an oversight, it was the
// dependency graph: `@zcashreveal/indexer` depends on `zeromq@6`, a NATIVE
// ADDON, and `apps/publisher/Dockerfile`'s install stages carry no compiler on
// purpose - its own header says adding one "would quietly let a native
// dependency be introduced without anyone noticing it had been". The indexer's
// package entry also imports its ZMQ subscriber, so importing the barrel at all
// would load a socket layer into a process whose job is to write three keys per
// block. A worker refused an instruction to import it and was right.
//
// HANDOFF-09a moved the three modules into a dependency-free package both apps
// import. L2's scope for that handoff named the constraint and named the
// instrument in the same sentence: "No `zeromq`, no socket layer, no indexer
// entry point in its dependency graph - that constraint is the whole reason the
// package exists and IT WANTS A GUARD, NOT A COMMENT."
//
// The distinction is not stylistic. A comment is satisfied by a reader agreeing
// with it, and the previous comment - sixty lines at the top of
// `apps/publisher/src/instruments.ts` - was read by at least three sessions and
// would not have stopped any of them adding one line to a `package.json`. The
// failure it prevents is silent at every stage a developer sees: `pnpm install`
// succeeds, `tsc` succeeds, `vitest` succeeds, and the break appears in
// `docker build` on the operator's machine, or worse, in a publisher process
// that opens a socket nobody asked it to open.
//
// WHAT IT CHECKS, AND WHY TRANSITIVELY. The rule is about the resolved GRAPH,
// not the direct dependency list. `@zcashreveal/instruments` -> some future
// `@zcashreveal/chain-io` -> `@zcashreveal/indexer` -> `zeromq` is the same
// defect as a direct edge and is harder to see; a direct-only check would pass
// exactly the case that matters. So this walks the workspace graph from the
// package's own manifest, following `workspace:` edges into the other manifests
// and treating every non-workspace dependency as a leaf to be matched by name.
//
// The BANNED set is deliberately small and each entry is justified rather than
// precautionary:
//
//   zeromq                 a native addon; the publisher image has no compiler
//   @zcashreveal/indexer   its entry point opens a ZMQ subscriber, and it is
//                          what the estimators were moved OUT of - an edge back
//                          to it would re-create the cycle the package exists to
//                          break
//
// A THIRD RULE THAT IS NOT A DEPENDENCY EDGE, because the graph cannot see it.
// `packages/zec-instruments/src` must not import a node socket or child-process
// module directly - `node:net`, `node:dgram`, `node:tls`, `node:child_process`,
// `node:worker_threads` - since "no socket layer" is a statement about what the
// code does and a manifest says nothing about `import "node:net"`. Checked by
// scanning the package's own sources.
//
// WHAT IT DELIBERATELY DOES NOT CHECK. It does not forbid `@zcashreveal/types`,
// which is the package's one legitimate dependency and is itself pure. It does
// not police the OTHER packages' graphs: `apps/indexer` may depend on `zeromq`
// and does, which is correct and is the whole reason the split exists. The rule
// is scoped to what `@zcashreveal/instruments` can reach, and a version of it
// that policed the workspace generally would fire on the correct arrangement.
//
// Self-tested in both directions on every run, and the self-test drives the REAL
// rule functions rather than copies of them - HANDOFF-10's gate round 3 found
// this project's zebrad guard asserting against patterns written out a second
// time inside its own selfTest, so breaking the real check left every probe
// green. One function, two callers.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_DIR = "packages/zec-instruments";
const PACKAGE_NAME = "@zcashreveal/instruments";

/** Dependencies that may not appear anywhere in the package's resolved graph. */
export const BANNED_DEPENDENCIES = ["zeromq", "@zcashreveal/indexer"];

/** Node builtins that would make this package a socket layer whatever its manifest says. */
export const BANNED_MODULES = [
  "node:net",
  "node:dgram",
  "node:tls",
  "node:child_process",
  "node:worker_threads",
];

/**
 * Every workspace manifest, as {name -> {dir, deps}}.
 *
 * `deps` merges `dependencies` and `optionalDependencies` and EXCLUDES
 * `devDependencies`, which is the one judgement call in this file and is worth
 * stating. A devDependency is not in the shipped graph: it is not installed by
 * `pnpm install --prod`, it is not copied into the runtime stage of any
 * Dockerfile here, and it cannot reach a running publisher. `vitest` and
 * `fast-check` are devDependencies of this package and would otherwise have to
 * be special-cased, which is how a rule acquires exceptions and stops meaning
 * anything. If a future session needs the dev graph checked too, that is a
 * different rule with a different justification, not a widening of this one.
 */
export function readWorkspace(root, dirs) {
  const manifests = new Map();
  for (const dir of dirs) {
    const file = join(root, dir, "package.json");
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    manifests.set(json.name, {
      dir,
      deps: Object.keys({ ...json.dependencies, ...json.optionalDependencies }),
    });
  }
  return manifests;
}

/**
 * Walk the graph from `start` and return the first path to a banned name, or
 * null. Returns a PATH rather than a boolean so the failure names the edge a
 * reader has to remove, which for a transitive hit is not the one they added.
 */
export function findBannedPath(manifests, start, banned) {
  const seen = new Set();
  // Breadth-first, so the reported path is the shortest one.
  const queue = [[start]];
  while (queue.length > 0) {
    const path = queue.shift();
    const name = path[path.length - 1];
    if (seen.has(name)) continue;
    seen.add(name);

    const node = manifests.get(name);
    // A name that is not a workspace member is a leaf: it is an npm package, and
    // we match it by name rather than reading node_modules. That keeps the guard
    // runnable before `pnpm install` and makes it a statement about the
    // MANIFESTS, which is where a session introduces the defect.
    for (const dep of node?.deps ?? []) {
      const next = [...path, dep];
      if (banned.includes(dep)) return next;
      if (manifests.has(dep)) queue.push(next);
    }
  }
  return null;
}

/** Every `.ts` file under a directory, recursively. */
function sourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Banned module specifiers imported by a source text. Matches the specifier in
 * an `import`/`export ... from` clause or a `require`, and NOT a mention in a
 * comment - this file's own headers name `node:net` in prose, and a guard that
 * fired on its own explanation would be useless.
 */
export function bannedModuleImports(text, banned) {
  const found = [];
  const specifier = /(?:^|[\s;])(?:import|export)[^;]*?from\s*["']([^"']+)["']|(?:^|[\s;=(])require\s*\(\s*["']([^"']+)["']\s*\)|(?:^|[\s;])import\s*["']([^"']+)["']/g;
  let m;
  while ((m = specifier.exec(text)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (banned.includes(spec)) found.push(spec);
  }
  return found;
}

export function instrumentFindings(manifests, sources) {
  const findings = [];

  if (!manifests.has(PACKAGE_NAME)) {
    findings.push(
      `${PACKAGE_DIR}  R0: no manifest named ${PACKAGE_NAME} was found. The guard cannot ` +
        "check a package that is not there, and a silent pass would be worse than a failure.",
    );
    return findings;
  }

  // R1 - the resolved dependency graph.
  const path = findBannedPath(manifests, PACKAGE_NAME, BANNED_DEPENDENCIES);
  if (path !== null) {
    findings.push(
      `${PACKAGE_DIR}/package.json  R1: ${PACKAGE_NAME} can reach "${path[path.length - 1]}" ` +
        `via ${path.join(" -> ")}. That package exists so the publisher can import the ` +
        "estimators without pulling in a native addon or a ZMQ subscriber; this edge undoes it.",
    );
  }

  // R2 - a socket the manifest cannot see.
  for (const { file, text } of sources) {
    for (const spec of bannedModuleImports(text, BANNED_MODULES)) {
      findings.push(
        `${file}  R2: imports "${spec}". "No socket layer" is a statement about what this ` +
          "package DOES, and a manifest says nothing about a node builtin.",
      );
    }
  }

  return findings;
}

function selfTest() {
  let ok = true;
  const fail = (m) => {
    console.error(`[instrument-deps] SELF-TEST FAIL: ${m}`);
    ok = false;
  };

  const clean = new Map([
    [PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/types"] }],
    ["@zcashreveal/types", { dir: "packages/zec-types", deps: ["zod"] }],
    ["@zcashreveal/indexer", { dir: "apps/indexer", deps: ["zeromq", PACKAGE_NAME] }],
  ]);

  // Pass side: the real arrangement. The indexer depends on the package and on
  // zeromq, which is CORRECT and must not fire - a guard that policed the
  // workspace generally instead of this package's reachable set would fail here.
  if (instrumentFindings(clean, []).length !== 0) {
    fail(`the correct arrangement was reported: ${JSON.stringify(instrumentFindings(clean, []))}`);
  }

  // R1 fail side, DIRECT edge.
  const direct = new Map(clean);
  direct.set(PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/types", "@zcashreveal/indexer"] });
  const directFindings = instrumentFindings(direct, []);
  if (!directFindings.some((f) => f.includes("R1"))) fail("R1 did not fire on a direct banned edge");

  // R1 fail side, TRANSITIVE edge - the case a direct-only check would pass, and
  // the reason this walks the graph at all. The package depends on a new pure
  // package which depends on the indexer.
  const transitive = new Map(clean);
  transitive.set(PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/chain-io"] });
  transitive.set("@zcashreveal/chain-io", { dir: "packages/chain-io", deps: ["@zcashreveal/indexer"] });
  const transFindings = instrumentFindings(transitive, []);
  if (!transFindings.some((f) => f.includes("R1"))) {
    fail("R1 did not fire on a TRANSITIVE banned edge - a direct-only check would pass this");
  }
  if (!transFindings.some((f) => f.includes("chain-io"))) {
    fail("R1 fired but did not name the intermediate package, so the path is not actionable");
  }

  // A transitive path to `zeromq` through the indexer, which is two hops.
  const twoHop = new Map(clean);
  twoHop.set(PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/indexer"] });
  if (!instrumentFindings(twoHop, []).some((f) => f.includes("R1"))) {
    fail("R1 did not fire on a two-hop path to a native addon");
  }

  // R2 fail side.
  const socket = [{ file: "x.ts", text: 'import { createServer } from "node:net";' }];
  if (!instrumentFindings(clean, socket).some((f) => f.includes("R2"))) {
    fail("R2 did not fire on a node:net import");
  }
  const required = [{ file: "x.ts", text: 'const net = require("node:child_process");' }];
  if (!instrumentFindings(clean, required).some((f) => f.includes("R2"))) {
    fail("R2 did not fire on a require of a banned builtin");
  }

  // R2 must NOT fire on prose. This file's own header names `node:net`, and a
  // guard that flagged its own explanation would be deleted by the next session.
  const prose = [{ file: "x.ts", text: "/* This package must never import node:net or node:tls. */" }];
  if (instrumentFindings(clean, prose).length !== 0) {
    fail(`R2 fired on a comment mentioning a banned module: ${JSON.stringify(instrumentFindings(clean, prose))}`);
  }

  // R0: the guard must fail loudly rather than pass when the package is absent.
  if (!instrumentFindings(new Map(), []).some((f) => f.includes("R0"))) {
    fail("R0 did not fire when the package was missing - the guard would have passed vacuously");
  }

  return ok;
}

if (!selfTest()) {
  console.error("[instrument-deps] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

const ROOT = process.cwd();
const WORKSPACE_DIRS = [
  ...readdirSync(join(ROOT, "packages"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join("packages", e.name)),
  ...readdirSync(join(ROOT, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join("apps", e.name)),
];

const manifests = readWorkspace(ROOT, WORKSPACE_DIRS);
const sources = sourceFiles(join(ROOT, PACKAGE_DIR, "src")).map((file) => ({
  file: file.slice(ROOT.length + 1),
  text: readFileSync(file, "utf8"),
}));

const findings = instrumentFindings(manifests, sources);

if (findings.length > 0) {
  console.error(`[instrument-deps] FAIL: ${findings.length} finding(s).`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}

const deps = manifests.get(PACKAGE_NAME).deps;
console.log(
  `[instrument-deps] OK: ${PACKAGE_NAME} declares ${deps.length} runtime dependency(ies) ` +
    `(${deps.join(", ") || "none"}), reaches none of ${BANNED_DEPENDENCIES.join(", ")} through ` +
    `${manifests.size} workspace manifest(s), and none of its ${sources.length} source file(s) ` +
    "imports a socket or child-process builtin (detectors self-tested in both directions).",
);
