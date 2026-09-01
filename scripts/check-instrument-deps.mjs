// Guards the ONE constraint `packages/zec-instruments` exists to satisfy: its
// dependency graph contains neither `zeromq` nor `@zcashreveal/indexer`, and its
// sources open no socket.
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
// ============================================================================
// THIS FILE'S FIRST DRAFT HAD ELEVEN HOLES AND ITS SELF-TEST CERTIFIED ALL OF
// THEM. Gate round 1 of HANDOFF-09a found them by executing probes against the
// real tree rather than by reading, and they are listed here because the list is
// the argument for how this version is built. Every one was a clean rc=0 with
// the real defect in place:
//
//   1. The self-test never exercised `zeromq` AT ALL. Its one case commented "a
//      transitive path to zeromq through the indexer" hit `@zcashreveal/indexer`
//      at hop one and returned there, because both names are in the banned set.
//      Deleting `zeromq` from the banned list left the self-test green and the
//      guard green - the native-addon rule, gone, certified by its own probe.
//      That is the shape CLAUDE.md records for HANDOFF-08's round 4, committed
//      inside the guard written to answer it.
//   2. A pnpm ALIAS evaded the graph walk entirely: `"zmq": "npm:zeromq@^6.1.2"`
//      and `"idx": "workspace:@zcashreveal/indexer@*"` are both valid, both
//      install the banned package, and both were invisible because the walk
//      keyed on `Object.keys` and the real name is in the VALUE.
//   3. `peerDependencies` was not read, and this workspace sets
//      `autoInstallPeers: true`, so a peer IS in the installed graph.
//   4. `devDependencies` was excluded ON A STATED JUSTIFICATION THAT WAS FALSE.
//      The old docblock argued a devDependency "is not installed by `pnpm
//      install --prod`" - true, and about the wrong install. Every Dockerfile
//      here runs `pnpm install --frozen-lockfile --filter <app>...` with NO
//      `--prod`, so a `zeromq` devDependency on this package lands in a
//      compiler-less build stage: exactly the failure the header describes.
//   5. R2 missed `net` without the `node:` prefix, `require("net")`, and dynamic
//      `await import("node:child_process")` - three ordinary spellings of the
//      thing it forbids. It also could not see `import { Subscriber } from
//      "zeromq"` in a source file, because R1 reads manifests and R2's list was
//      builtins: a banned DEPENDENCY imported from source was checked by neither.
//   6. A directory rename made the source scan return zero files IN SILENCE, so
//      R2 passed vacuously while reporting "0 source file(s)".
//   7. `readWorkspace` and `sourceFiles` - the two functions that produce the
//      real inputs - were outside the self-test, which built its inputs by hand.
//      Breaking either left every probe green. The old header claimed the
//      self-test "drives the REAL rule functions"; it was true one level down
//      and false where the defect then lived.
//   8. Three of the five banned builtins had no self-test case; deleting them
//      left the self-test green.
//   9. The workspace scan read `packages/` and `apps/` while
//      `pnpm-workspace.yaml` resolves `legacy/*` too, so a path through
//      `@zcashreveal/dashboard` was invisible - and the guard PRINTED the hole
//      on every clean run as "8 workspace manifest(s)" where pnpm resolves 9.
//  10. R2's negative self-test did not discriminate. The header claimed the
//      regex matched a specifier "and NOT a mention in a comment"; a comment
//      CONTAINING a full import statement failed the guard. The probe passed
//      only because its prose had no `from` clause, so it tested nothing about
//      comments containing code - the fail-side-probe rule from CLAUDE.md, where
//      the negative case does not discriminate and the positive result was
//      therefore never evidence. This matters concretely in a package whose
//      `index.ts` carries a fifty-line header discussing imports.
//  11. `sourceFiles` matched `.ts` only, so `probe.mts` and `probe.js` were not
//      scanned.
// ============================================================================
//
// WHAT IT CHECKS, AND WHY TRANSITIVELY. The rule is about the resolved GRAPH,
// not the direct dependency list. `@zcashreveal/instruments` -> some future
// `@zcashreveal/chain-io` -> `@zcashreveal/indexer` -> `zeromq` is the same
// defect as a direct edge and is harder to see; a direct-only check would pass
// exactly the case that matters.
//
// EVERY DEPENDENCY FIELD IS READ, which is the correction to hole 4 and is now
// the simpler rule as well as the true one: `dependencies`,
// `optionalDependencies`, `peerDependencies` and `devDependencies` can each put
// a package into an installed graph that some stage of some Dockerfile builds.
// This package's own devDependencies - `vitest`, `fast-check`, `typescript`,
// `@types/node` - are leaves matched by name, so reading them costs nothing and
// closes the hole rather than arguing about it.
//
// A THIRD RULE THAT IS NOT A DEPENDENCY EDGE, because the graph cannot see it.
// The package's sources must not import a socket or child-process module, or a
// banned dependency, DIRECTLY - a manifest says nothing about
// `import "node:net"`, and "no socket layer" is a statement about what the code
// does. Comments are stripped before that scan so the rule is about code, and
// `import type` is ignored because it is erased at compile time.
//
// WHAT IT DELIBERATELY DOES NOT CHECK. It does not forbid `@zcashreveal/types`,
// this package's one runtime dependency and itself pure. It does not police the
// OTHER packages' graphs: `apps/indexer` may depend on `zeromq` and does, which
// is correct and is the whole reason the split exists. The rule is scoped to
// what `@zcashreveal/instruments` can reach, and a version of it that policed
// the workspace generally would fire on the correct arrangement.
//
// Self-tested in both directions on every run, and the self-test drives the REAL
// functions - `readWorkspace` and `sourceFiles` included, over a temporary
// fixture tree, which is hole 7's correction.

import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PACKAGE_DIR = "packages/zec-instruments";
const PACKAGE_NAME = "@zcashreveal/instruments";

/** Dependencies that may not appear anywhere in the package's resolved graph. */
export const BANNED_DEPENDENCIES = ["zeromq", "@zcashreveal/indexer"];

/**
 * Builtins that would make this package a socket or a process spawner whatever
 * its manifest says. BOTH SPELLINGS: `net` and `node:net` resolve to the same
 * builtin and do the same thing, and only one of them was listed (hole 5).
 */
export const BANNED_BUILTINS = ["net", "dgram", "tls", "child_process", "worker_threads"].flatMap(
  (m) => [m, `node:${m}`],
);

/** Every specifier R2 refuses: the builtins above, plus the banned packages. */
export const BANNED_MODULES = [...BANNED_BUILTINS, ...BANNED_DEPENDENCIES];

/** Source extensions the scan reads. `.ts` alone missed `.mts` and `.js` (hole 11). */
const SOURCE_EXT = /\.(?:m|c)?[jt]sx?$/;

/**
 * Every workspace manifest, as {name -> {dir, deps}}.
 *
 * `deps` merges ALL FOUR dependency fields - see the header, hole 4 - and also
 * resolves pnpm ALIASES out of the VALUE, because `"zmq": "npm:zeromq@^6"`
 * installs `zeromq` under a key that matches nothing (hole 2).
 */
export function readWorkspace(root, dirs) {
  const manifests = new Map();
  for (const dir of dirs) {
    const file = join(root, dir, "package.json");
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    const fields = {
      ...json.dependencies,
      ...json.optionalDependencies,
      ...json.peerDependencies,
      ...json.devDependencies,
    };
    const deps = [];
    for (const [key, spec] of Object.entries(fields)) {
      deps.push(key);
      // The captured name must LOOK like an npm package name, or `workspace:*`
      // - an ordinary version spec, not an alias - yields a dependency called
      // `*`. Harmless (nothing bans it) and wrong, and it printed on every run.
      const alias = /^(?:npm|workspace):((?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*)(?:@|$)/.exec(
        String(spec ?? ""),
      );
      if (alias !== null && alias[1] !== key) deps.push(alias[1]);
    }
    manifests.set(json.name, { dir, deps });
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

/** Every source file under a directory, recursively. Real function, self-tested. */
export function sourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Banned module specifiers a source text IMPORTS.
 *
 * COMMENTS ARE STRIPPED FIRST, which is hole 10's correction. The previous
 * version claimed to match "a specifier and NOT a mention in a comment" and did
 * not: a comment containing a full import statement failed the guard, and its
 * negative probe passed only because the prose had no `from` clause. This
 * package's `index.ts` carries a fifty-line header discussing imports, so a
 * guard that fired on its own explanation would be deleted by the next session.
 *
 * `import type` and `export type` are ignored: they are erased at compile time,
 * so they are not something the package DOES.
 */
export function bannedModuleImports(text, banned) {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `[^:]` keeps `https://` out of the line-comment rule.
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const found = [];

  // FOUR SEPARATE SCANS, NOT ONE ALTERNATION, and this is hole 12 - found by the
  // review of the commit that fixed holes 1 to 11, which is why the fix commit
  // is always reviewed as its own commit.
  //
  // One regex shares one `lastIndex`. The `from` branch's `[^;]*?` has to cross
  // newlines, because a multi-line import clause is ordinary, so on a
  // SEMICOLON-LESS bare `import "node:net"` it ran past the statement, matched
  // the NEXT statement's `from`, reported that benign specifier, and consumed
  // the banned one. Executed: `import "node:net"` followed by any `from` import,
  // without semicolons, gave rc=0. This repository has no prettier config and no
  // `semi` lint rule, so that spelling is lint-clean, tsc-clean and build-clean
  // - nothing else in the six-command gate would have seen it either.
  const scans = [
    /(?:^|[\s;])(?:import|export)(\s+type\b)?[^;]*?from\s*["']([^"']+)["']/g,
    /(?:^|[\s;=(])require\s*\(\s*["']([^"']+)["']\s*\)/g,
    /(?:^|[\s;])import\s*["']([^"']+)["']/g,
    /(?:^|[\s;=(,:])import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const [i, re] of scans.entries()) {
    let m;
    while ((m = re.exec(code)) !== null) {
      if (i === 0 && m[1] !== undefined) continue; // `import type` - erased
      const spec = i === 0 ? m[2] : m[1];
      if (banned.includes(spec)) found.push(spec);
    }
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

  // R0b - the source scan is silent on a missing directory, so an empty result
  // is reported rather than treated as a clean one (hole 6).
  if (sources.length === 0) {
    findings.push(
      `${PACKAGE_DIR}/src  R0b: the source scan found no files. R2 cannot check a directory ` +
        "that is not there, and a vacuous pass is what a rename would otherwise produce.",
    );
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

  // R2 - a socket, a spawn, or a banned package the manifest cannot see.
  for (const { file, text } of sources) {
    for (const spec of bannedModuleImports(text, BANNED_MODULES)) {
      findings.push(
        `${file}  R2: imports "${spec}". "No socket layer" is a statement about what this ` +
          "package DOES, and a manifest says nothing about a bare import.",
      );
    }
  }

  return findings;
}

/* ============================================================================
   Self-test, both directions, over the REAL functions
   ========================================================================== */

function withFixtureTree(build) {
  const root = mkdtempSync(join(tmpdir(), "instrument-deps-"));
  try {
    return build(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeManifest(root, dir, json) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "package.json"), JSON.stringify(json));
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
  const oneSource = [{ file: "x.ts", text: "export const a = 1;" }];

  // Pass side: the real arrangement. The indexer depends on the package and on
  // zeromq, which is CORRECT and must not fire - a guard that policed the
  // workspace generally instead of this package's reachable set would fail here.
  if (instrumentFindings(clean, oneSource).length !== 0) {
    fail(`the correct arrangement was reported: ${JSON.stringify(instrumentFindings(clean, oneSource))}`);
  }

  // R1, EVERY banned dependency, GENERATED FROM `BANNED_DEPENDENCIES` rather
  // than hand-written - fold 1 of the L2 RESOLUTION for HANDOFF-09a, F-45-1.
  //
  // WHY THIS LOOP EXISTS AND WHAT IT REPLACES. The previous version had three
  // hand-written R1 cases: a direct edge and a transitive edge, both naming
  // `@zcashreveal/indexer` as a literal, and one `toAddon` map naming `zeromq`
  // as a literal. That covered the two members the list happened to have, and a
  // THIRD member would have arrived with zero R1 probes while the clean-run
  // summary went on asserting the rule for it by name. L2 measured exactly
  // that: appending `better-sqlite3` left the self-test GREEN, R2 gained eight
  // probes automatically and R1 gained none.
  //
  // That is hole 8's own shape - "a future entry cannot arrive untested" -
  // surviving inside the guard that closed it, in the half of the file that did
  // not have the loop. The comment at R2's loop said it; R1 did not do it.
  //
  // EVERY PROBE PATH CONTAINS NO BANNED NAME BUT ITS TARGET, which is hole 1's
  // rule generalised. The old zeromq case routed through `@zcashreveal/indexer`,
  // itself banned, so the walk stopped at hop one and `zeromq` was never
  // actually reached - deleting it from the banned list left the self-test
  // green. Building each probe graph from scratch here, rather than from
  // `clean`, is what keeps that true for every member the list ever gains:
  // `clean` contains `@zcashreveal/indexer`, so extending it would reintroduce
  // the shortcut for every member except that one.
  for (const banned of BANNED_DEPENDENCIES) {
    // DIRECT edge.
    const direct = new Map([
      [PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/types", banned] }],
      ["@zcashreveal/types", { dir: "packages/zec-types", deps: ["zod"] }],
    ]);
    const directFindings = instrumentFindings(direct, oneSource);
    if (!directFindings.some((f) => f.includes("R1") && f.includes(banned))) {
      fail(`R1 did not fire on a direct edge to ${banned}`);
    }

    // TRANSITIVE edge, through a hop that is not itself banned - the case a
    // direct-only check would pass, and the reason this walks the graph at all.
    const transitive = new Map([
      [PACKAGE_NAME, { dir: PACKAGE_DIR, deps: ["@zcashreveal/chain-io"] }],
      ["@zcashreveal/chain-io", { dir: "packages/chain-io", deps: [banned] }],
    ]);
    const transFindings = instrumentFindings(transitive, oneSource);
    if (!transFindings.some((f) => f.includes("R1") && f.includes(banned))) {
      fail(
        `R1 did not fire on a TRANSITIVE edge to ${banned} through a hop that is not itself ` +
          "banned - a direct-only check, or a walk that stops at the first banned name, would pass this",
      );
    }
    if (!transFindings.some((f) => f.includes("chain-io"))) {
      fail(`R1 fired for ${banned} but did not name the intermediate package, so the path is not actionable`);
    }
  }

  // R2, EVERY banned specifier, generated from the array so a future entry
  // cannot arrive untested (hole 8). Four spellings each.
  for (const mod of BANNED_MODULES) {
    // BOTH PUNCTUATIONS. The first version's four spellings all ended in `;`,
    // which is precisely why it certified hole 12: the defect only appears when
    // a statement does NOT terminate, and every probe terminated. The second
    // line of each pair is the one that used to pass.
    const spellings = [
      `import { x } from "${mod}";`,
      `import { x } from "${mod}"\nimport { y } from "./other.js"\n`,
      `const x = require("${mod}");`,
      `const x = require("${mod}")\nimport { y } from "./other.js"\n`,
      `import "${mod}";`,
      `import "${mod}"\nimport { y } from "./other.js"\n`,
      `const x = await import("${mod}");`,
      `const x = await import("${mod}")\nimport { y } from "./other.js"\n`,
    ];
    for (const text of spellings) {
      if (!instrumentFindings(clean, [{ file: "x.ts", text }]).some((f) => f.includes("R2"))) {
        fail(`R2 did not fire on ${JSON.stringify(text)}`);
      }
    }
  }

  // R2 must NOT fire on a comment, INCLUDING a comment that contains a whole
  // import statement. Hole 10: the old negative probe was prose with no `from`
  // clause, so it discriminated nothing, and the real behaviour was the
  // opposite of what the header claimed.
  const commented = [
    { file: "a.ts", text: '// Never write: import { createServer } from "node:net"; in this package.' },
    { file: "b.ts", text: '/*\n * Do not do this:\n *   import { Socket } from "node:tls";\n */\nexport const a = 1;' },
    { file: "c.ts", text: '// see https://example.com/net for why\nexport const b = 2;' },
  ];
  const commentFindings = instrumentFindings(clean, commented);
  if (commentFindings.length !== 0) {
    fail(`R2 fired on a comment containing an import: ${JSON.stringify(commentFindings)}`);
  }

  // `import type` is erased at compile time and is not something the package
  // DOES, so it must not fire.
  const typeOnly = [{ file: "x.ts", text: 'import type { Socket } from "node:net";' }];
  if (instrumentFindings(clean, typeOnly).length !== 0) {
    fail("R2 fired on an `import type`, which is erased at compile time");
  }

  // R0: the guard must fail loudly rather than pass when the package is absent.
  if (!instrumentFindings(new Map(), []).some((f) => f.includes("R0"))) {
    fail("R0 did not fire when the package was missing - the guard would have passed vacuously");
  }
  // R0b: an empty source scan is a finding, not a clean run (hole 6).
  if (!instrumentFindings(clean, []).some((f) => f.includes("R0b"))) {
    fail("R0b did not fire on an empty source scan - a rename would pass vacuously");
  }

  // THE REAL `readWorkspace` AND `sourceFiles`, over a temporary tree. Hole 7:
  // both were outside the self-test, so breaking either left every probe green
  // while the header claimed the real functions were driven.
  withFixtureTree((root) => {
    writeManifest(root, "packages/p", { name: PACKAGE_NAME, dependencies: { "@zcashreveal/types": "workspace:*" } });
    writeManifest(root, "packages/t", { name: "@zcashreveal/types", dependencies: { zod: "^3" } });
    const m = readWorkspace(root, ["packages/p", "packages/t"]);
    if (m.size !== 2) fail(`readWorkspace read ${m.size} manifests, expected 2`);
    if (!m.get(PACKAGE_NAME)?.deps.includes("@zcashreveal/types")) {
      fail("readWorkspace lost a plain dependency");
    }

    // An ALIAS hides the real name in the value (hole 2).
    writeManifest(root, "packages/alias", { name: "aliased", dependencies: { zmq: "npm:zeromq@^6.1.2" } });
    const aliased = readWorkspace(root, ["packages/alias"]);
    if (!aliased.get("aliased")?.deps.includes("zeromq")) {
      fail('readWorkspace did not resolve the alias "zmq": "npm:zeromq@^6.1.2" to zeromq');
    }
    writeManifest(root, "packages/alias2", {
      name: "aliased2",
      dependencies: { idx: "workspace:@zcashreveal/indexer@*" },
    });
    if (!readWorkspace(root, ["packages/alias2"]).get("aliased2")?.deps.includes("@zcashreveal/indexer")) {
      fail('readWorkspace did not resolve "workspace:@zcashreveal/indexer@*" to @zcashreveal/indexer');
    }

    // A PEER dependency is in the installed graph here (hole 3).
    writeManifest(root, "packages/peer", { name: "peered", peerDependencies: { zeromq: "^6.1.2" } });
    if (!readWorkspace(root, ["packages/peer"]).get("peered")?.deps.includes("zeromq")) {
      fail("readWorkspace did not read peerDependencies, which autoInstallPeers puts in the graph");
    }

    // A DEV dependency reaches the compiler-less build stage (hole 4).
    writeManifest(root, "packages/dev", { name: "devved", devDependencies: { zeromq: "^6.1.2" } });
    if (!readWorkspace(root, ["packages/dev"]).get("devved")?.deps.includes("zeromq")) {
      fail("readWorkspace did not read devDependencies, which every Dockerfile install stage gets");
    }

    // `sourceFiles` over a real tree, including the extensions `.ts` missed.
    const srcDir = join(root, "src");
    mkdirSync(join(srcDir, "nested"), { recursive: true });
    for (const f of ["a.ts", "b.mts", "c.js", "d.tsx", "ignore.json"]) writeFileSync(join(srcDir, f), "");
    writeFileSync(join(srcDir, "nested", "e.cjs"), "");
    const found = sourceFiles(srcDir);
    if (found.length !== 5) fail(`sourceFiles found ${found.length} files, expected 5 (.ts .mts .js .tsx .cjs)`);
    if (sourceFiles(join(root, "does-not-exist")).length !== 0) fail("sourceFiles threw on a missing directory");
  });

  return ok;
}

if (!selfTest()) {
  console.error("[instrument-deps] the detectors are broken; a clean scan would prove nothing.");
  process.exit(2);
}

/* ============================================================================
   The sweep
   ========================================================================== */

const ROOT = process.cwd();

// READ FROM `pnpm-workspace.yaml` RATHER THAN LISTED, which is hole 13 and is
// hole 9 again one level up. Hole 9 was that `legacy/*` was missing from a
// hardcoded list; the first fix added `legacy` to the list, which corrects the
// VALUE and leaves the RULE - a workspace that later adds `tools/*` is invisible
// exactly as `legacy/*` was, with the same tell (a manifest count that disagrees
// with pnpm). Executed on a tree with `tools/*`: an instruments -> chain-io ->
// zeromq path through `tools/` gave rc=0, because an unscanned member is treated
// as an npm leaf.
function workspaceTops() {
  const file = join(ROOT, "pnpm-workspace.yaml");
  if (!existsSync(file)) return ["packages", "apps"];
  const tops = [];
  // A deliberately small parser: `packages:` followed by `- "glob"` lines. The
  // workspace file is three lines long and a yaml dependency for it would be a
  // worse trade than this - but an unparsed file falls back to the list above
  // rather than to an empty scan, which would pass vacuously.
  let inPackages = false;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
    if (inPackages) {
      const m = /^-\s*["']?([^"'\s]+)["']?/.exec(line);
      if (m === null) { if (line !== "" && !line.startsWith("#")) inPackages = false; continue; }
      const top = m[1].split("/")[0];
      if (top !== "" && top !== "." && !tops.includes(top)) tops.push(top);
    }
  }
  return tops.length > 0 ? tops : ["packages", "apps"];
}

const WORKSPACE_TOPS = workspaceTops();
const WORKSPACE_DIRS = WORKSPACE_TOPS.flatMap((top) => {
  const dir = join(ROOT, top);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(top, e.name));
});

const manifests = readWorkspace(ROOT, WORKSPACE_DIRS);

// The manifest's own recorded directory, not the constant, so a rename is
// followed rather than silently producing an empty scan (hole 6).
const packageDir = manifests.get(PACKAGE_NAME)?.dir ?? PACKAGE_DIR;
const sources = sourceFiles(join(ROOT, packageDir, "src")).map((file) => ({
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
  `[instrument-deps] OK: ${PACKAGE_NAME} declares ${deps.length} dependency(ies) across all four ` +
    `manifest fields (${deps.join(", ") || "none"}), reaches none of ` +
    `${BANNED_DEPENDENCIES.join(", ")} through ${manifests.size} workspace manifest(s), and none ` +
    `of its ${sources.length} source file(s) imports a socket, a spawn or a banned package ` +
    "(detectors self-tested in both directions, over the real readWorkspace and sourceFiles).",
);
