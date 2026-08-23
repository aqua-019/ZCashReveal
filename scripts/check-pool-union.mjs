// Guards HANDOFF-06 assertion A7: no stale two-pool unions survive the widening.
//
// WHY A SCRIPT AND NOT THE GREP THE ASSERTION NAMES. A7 is written as
//
//   grep -rn "'sapling' | 'orchard'" packages apps/indexer/src
//
// and taken literally that command is now vacuous twice over. This tree is
// prettier-formatted with DOUBLE quotes, so the single-quoted pattern never
// matched a line of it even before the widening; and grep reads `|` as a
// literal here only by accident of it being a basic regular expression. A guard
// that passes because it searched for a string that cannot occur is worse than
// no guard, because it reports a clean tree having looked at nothing - the
// exact failure mode CLAUDE.md's fail-side rule exists to catch.
//
// So this implements the ASSERTION rather than the command: after HANDOFF-06,
// no file may declare a pool union of exactly sapling and orchard - in
// TypeScript or in a migration's CHECK constraint. It checks both quote styles,
// tolerates whitespace and line breaks inside the union, and is self-tested in
// both directions on every run so it cannot decay into a scan that detects
// nothing.
//
// WHAT IT DELIBERATELY DOES NOT FLAG. A single pool literal - `pool: "sapling"`
// on DecodedSaplingSpend - is correct and must stay: that structure really is
// Sapling-only. The defect is a UNION that enumerates the old pair, because
// that is the shape which silently keeps a four-pool value out of a two-pool
// field.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages", "apps"];
const EXTENSIONS = [".ts", ".tsx", ".sql"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "build", "coverage"]);

// A run of quoted string literals joined by `|` - one whole union, however it
// is quoted, ordered or wrapped across lines. The members are then compared as
// a SET, which is the only way to tell the stale pair apart from the correct
// four: a naive pattern for `"sapling" | "orchard"` matches inside
// `"sprout" | "sapling" | "orchard" | "ironwood"` and condemns the definition
// site itself. The self-test below caught exactly that on this script's first
// run, which is the evidence it is not decorative.
const UNION_RUN = /(["'])((?:\\.|(?!\1)[^\\])*)\1(?:\s*\|\s*(["'])((?:\\.|(?!\3)[^\\])*)\3)+/g;

/**
 * The SQL form of the same union: `IN ('sapling', 'orchard')`.
 *
 * A separate pattern because SQL separates members with commas inside
 * parentheses rather than with `|`, so the TypeScript run above cannot see it -
 * which the self-test caught the moment `.sql` was added to the scanned
 * extensions, exactly as it caught the definition-site false positive when this
 * script was first written.
 */
const SQL_IN_LIST = /\bIN\s*\(\s*((?:(["'])(?:\\.|(?!\2)[^\\])*\2\s*,?\s*)+)\)/gi;

const LITERAL = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;

const POOLS = new Set(["sprout", "sapling", "orchard", "ironwood"]);
const STALE_PAIR = "orchard,sapling";

/**
 * Lines allowed to look like a two-pool union, each with the reason.
 *
 * AN APPLIED MIGRATION IS A HISTORICAL RECORD AND MUST NOT BE EDITED. Migration
 * 002 declared the two-pool CHECK on four tables and has been applied to every
 * database this project has; rewriting it now would mean a database that ran the
 * original and one that runs the edited file end in different states while both
 * report 002 as applied. 003_four_pools.sql is the migration that widens these
 * four constraints, and its existence is the fix - which is exactly why these
 * four lines are permitted and no TypeScript line is.
 *
 * An entry here needs a reason a reviewer would accept, not a path that happens
 * to fail. Each is pinned to a file AND a line, so moving the code re-flags it.
 */
const ALLOWED = [
  "apps/indexer/migrations/002_candidate_analysis.sql:13", // pool_commitments, widened by 003
  "apps/indexer/migrations/002_candidate_analysis.sql:26", // pool_anchors, widened by 003
  "apps/indexer/migrations/002_candidate_analysis.sql:37", // pool_nullifiers, widened by 003
  "apps/indexer/migrations/002_candidate_analysis.sql:49", // pool_boundary_flows, widened by 003
];

/**
 * Whether one union's members are exactly the old two-pool pair.
 *
 * Compared as a set of WHOLE literals, so `"sapling→orchard"` is one member
 * named after a path and not two members named after pools - the old
 * `poolPath` union contained both shapes and a substring test would have got
 * it wrong in both directions.
 */
function isStalePair(members) {
  const pools = [...new Set(members.filter((m) => POOLS.has(m)))].sort();
  return pools.join(",") === STALE_PAIR;
}

function scanText(text) {
  const hits = [];
  const lines = text.split("\n");
  // Matched across the whole text so a union wrapped over several lines is
  // still one union, then the offset is mapped back to a line number.
  for (const pattern of [UNION_RUN, SQL_IN_LIST]) {
    for (const m of text.matchAll(pattern)) {
      const members = [...m[0].matchAll(LITERAL)].map((l) => l[2]);
      if (!isStalePair(members)) continue;
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ line, text: (lines[line - 1] ?? "").trim() });
    }
  }
  return hits;
}

function selfTest() {
  const mustFlag = [
    'pool: "sapling" | "orchard";',
    "pool: 'orchard' | 'sapling';",
    'pool:\n  | "sapling"\n  | "orchard";',
    'Array<{ pool: "sapling" | "orchard"; value: Hex }>',
    // The migration form. 002 declared this four times and 003 widens it.
    "CHECK (pool IN ('sapling', 'orchard'))",
  ];
  const mustNotFlag = [
    // The definition site itself. A pattern that flags this flags the fix.
    'export type ShieldedPool = "sprout" | "sapling" | "orchard" | "ironwood";',
    // A structure that really is one pool. DecodedSaplingSpend.pool is correct.
    'pool: "sapling";',
    'pool: "orchard";',
    // Three of four is a different bug and not this one; flagging it here would
    // report the wrong cause.
    'pool: "sprout" | "sapling" | "orchard";',
    // A path literal contains both pool names as substrings and is one member.
    'poolPath: "sapling→orchard" | "orchard→ironwood";',
    '"sapling" | "sapling"',
    "// the two pools sapling and orchard",
    // The widened migration form, which is what 003 writes.
    "CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood'))",
  ];

  let ok = true;
  for (const s of mustFlag) {
    if (scanText(s).length === 0) {
      console.error(`[pool-union] SELF-TEST FAIL: did not flag: ${JSON.stringify(s)}`);
      ok = false;
    }
  }
  for (const s of mustNotFlag) {
    if (scanText(s).length > 0) {
      console.error(`[pool-union] SELF-TEST FAIL: wrongly flagged: ${JSON.stringify(s)}`);
      ok = false;
    }
  }
  return ok;
}

/**
 * Every source file under ROOTS, by walking the directory.
 *
 * A `git ls-files` version of this shipped first and was a real hole, found by
 * the gate: it reports only TRACKED files, and a file being written is untracked
 * until it is staged - so `pnpm check` said the tree was clean about the one file
 * whose union was actually stale, and CI would then reject the push. The sibling
 * guard in the same `pnpm check`, check-redis-safety.mjs, already walks the
 * directory, so the two disagreed about what "the tree" means.
 *
 * `.sql` IS SCANNED TOO. Migration 002 declared the two-pool union four times as
 * `CHECK (pool IN ('sapling','orchard'))`, and 003 exists to widen exactly those.
 * A guard against stale two-pool unions that could not read the file format the
 * constraint lives in was checking the half of the model that TypeScript already
 * protects and ignoring the half it does not.
 */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        walk(full);
      } else if (EXTENSIONS.some((ext) => e.name.endsWith(ext))) {
        out.push(full);
      }
    }
  };
  for (const root of ROOTS) {
    try {
      if (statSync(root).isDirectory()) walk(root);
    } catch {
      // A root that is not present is not a failure: this repository has both.
    }
  }
  return out;
}

if (!selfTest()) {
  console.error("[pool-union] the detector is broken; a clean scan would prove nothing.");
  process.exit(2);
}

const findings = [];
for (const file of sourceFiles()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const hit of scanText(text)) {
    const key = `${file}:${hit.line}`;
    if (ALLOWED.some((a) => a.startsWith(key))) continue;
    findings.push({ file, ...hit });
  }
}

if (findings.length > 0) {
  console.error(
    `[pool-union] FAIL: ${findings.length} stale two-pool union(s). ` +
      `The pool model is sprout | sapling | orchard | ironwood; a field typed as the old pair ` +
      `cannot hold a Sprout or Ironwood value and will fail silently rather than loudly. ` +
      `Reference ShieldedPool from @zcashreveal/types instead of enumerating members.`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text}`);
  process.exit(1);
}

console.log(
  `[pool-union] OK: no stale two-pool unions in ${ROOTS.join(", ")} ` +
    `(detector self-tested in both directions).`,
);
