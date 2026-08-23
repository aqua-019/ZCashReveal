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
// no file may declare a pool union of exactly sapling and orchard. It checks
// both quote styles, tolerates whitespace and line breaks inside the union, and
// is self-tested in both directions on every run so it cannot decay into a scan
// that detects nothing.
//
// WHAT IT DELIBERATELY DOES NOT FLAG. A single pool literal - `pool: "sapling"`
// on DecodedSaplingSpend - is correct and must stay: that structure really is
// Sapling-only. The defect is a UNION that enumerates the old pair, because
// that is the shape which silently keeps a four-pool value out of a two-pool
// field.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOTS = ["packages", "apps"];

// A run of quoted string literals joined by `|` - one whole union, however it
// is quoted, ordered or wrapped across lines. The members are then compared as
// a SET, which is the only way to tell the stale pair apart from the correct
// four: a naive pattern for `"sapling" | "orchard"` matches inside
// `"sprout" | "sapling" | "orchard" | "ironwood"` and condemns the definition
// site itself. The self-test below caught exactly that on this script's first
// run, which is the evidence it is not decorative.
const UNION_RUN = /(["'])((?:\\.|(?!\1)[^\\])*)\1(?:\s*\|\s*(["'])((?:\\.|(?!\3)[^\\])*)\3)+/g;
const LITERAL = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;

const POOLS = new Set(["sprout", "sapling", "orchard", "ironwood"]);
const STALE_PAIR = "orchard,sapling";

/** Lines that are allowed to look like a two-pool union, with the reason. */
const ALLOWED = [
  // None. The widening left no legitimate two-pool union in the tree. An entry
  // here needs a reason a reviewer would accept, not a path that happens to
  // fail.
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
  for (const m of text.matchAll(UNION_RUN)) {
    const members = [...m[0].matchAll(LITERAL)].map((l) => l[2]);
    if (!isStalePair(members)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    hits.push({ line, text: (lines[line - 1] ?? "").trim() });
  }
  return hits;
}

function selfTest() {
  const mustFlag = [
    'pool: "sapling" | "orchard";',
    "pool: 'orchard' | 'sapling';",
    'pool:\n  | "sapling"\n  | "orchard";',
    'Array<{ pool: "sapling" | "orchard"; value: Hex }>',
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

function sourceFiles() {
  // git ls-files rather than a directory walk: it already excludes
  // node_modules, dist and .next, and it will not report a file this repository
  // does not track.
  const out = execFileSync(
    "git",
    ["ls-files", "--", ...ROOTS.map((r) => `${r}/**/*.ts`), ...ROOTS.map((r) => `${r}/**/*.tsx`)],
    { encoding: "utf8" },
  );
  return out.split("\n").filter((f) => f.length > 0 && !f.startsWith("legacy/"));
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
