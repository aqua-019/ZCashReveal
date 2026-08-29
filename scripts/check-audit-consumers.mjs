// Guards the shape HANDOFF-08 committed five times: a discriminated-union
// variant gains a FIELD, and a renderer that reads some of its fields keeps
// reading the old ones.
//
// WHY `assertNever` DOES NOT ALREADY COVER THIS, which is the whole reason the
// guard exists. An exhaustiveness check protects the SET of variants: add a
// member to `FilterApplication` and every switch fails to compile until it
// grows a case. It says nothing about the SHAPE of one. HANDOFF-08 round 2
// added `rejectedForRivalWithdrawal` to the `conservation` variant's `params`
// and left its only renderer computing
// `dropped = rejectedForDoubleClaim + rejectedForBalance` - two of three - so a
// window in which two links were refused rendered "Nothing was refused", with
// `countIn: 3n` and `countOut: 1n` on the same record. `tsc` was silent because
// reading two fields of three is legal, and the union had not changed.
//
// THE RULE IS NOT "EVERY RENDERER READS EVERY FIELD", and the difference
// matters. `filterShort()` in the same file returns a static label per variant
// and reads no params at all; that is correct and must stay. The defect is a
// PARTIAL read - a block that consults the params and misses one - because that
// is the shape which silently keeps answering the old question after the record
// learns a new one. So: a case block that reads ANY field of `params` must read
// EVERY field. A block that reads none is a label and is exempt.
//
// This is narrower than the fold that commissioned it (LEDGER-08 round 4 fold
// 1, "every renderer of that variant reads every field of its params"), and the
// narrowing is deliberate and is flagged rather than taken silently: the literal
// form fails `filterShort` on its first run, which would make the guard's first
// output a false positive against correct code.
//
// IT IS ALSO THE COMPENSATING CONTROL FOR A MISSING TEST RUNNER. `legacy/dashboard`
// has no `test` script - its scripts are dev, build, preview, typecheck, clean -
// so the fix for that defect shipped with NO fail-side transcript, in a project
// whose rule is that every fix has one. Nothing asserts the rendered string and
// nothing can, short of adding a runner to a package retired at the HANDOFF-11
// cutover. A static guard needs no runner and covers exactly the gap the missing
// runner leaves.
//
// Self-tested in both directions on every run, like the guards beside it: a
// fixture that reads some fields must FAIL and one that reads all must PASS, so
// the scan cannot decay into one that inspects nothing.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNION_FILE = "packages/zec-types/src/analysis.ts";
const ROOTS = ["apps", "packages", "legacy"];
const EXTENSIONS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "build", "coverage"]);

/**
 * A block that hands the whole `params` object to something generic reads every
 * field by construction. `auditRecordToEstimateFilter` does exactly this with
 * `Object.entries(a.params)`, and demanding it name fourteen field names would
 * make the honest implementation the one that fails.
 */
// ANCHORED ON THE PARAMS OBJECT. Unanchored, ANY `Object.entries(` anywhere in
// the case block - over an unrelated value - exempted the whole block, which is
// a hole big enough to drive the original defect through.
const GENERIC_READ =
  /Object\.(entries|keys|values|assign)\s*\(\s*[A-Za-z0-9_.]*\bparams\b|\.\.\.\s*[A-Za-z0-9_.]*params/;

/**
 * Omissions a human has looked at and accepted, each recording WHICH fields it
 * skips and why.
 *
 * THE RECORDED SKIP SET IS THE WHOLE MECHANISM, and it is what makes this a
 * sweep rather than a mute button. A finding is suppressed only when its missing
 * set is a SUBSET of the skips recorded here - so the moment a variant gains a
 * field, that field is not in any entry, the missing set grows past the skip
 * set, and the site fires again. Exactly the event that produced "Nothing was
 * refused", and exactly the event nobody noticed by hand four times.
 *
 * A blanket ignore keyed on file and case would have silenced the defect this
 * guard was written for, on its first run, forever.
 *
 * AND AN ENTRY LISTING EVERY FIELD OF ITS VARIANT IS THAT BLANKET IGNORE, which
 * is what the `conservation` entry below was when it shipped. It named all six
 * fields, so every subset of the current shape was covered, and DELETING the
 * `exitZat` render - the one substantive fix round 4 made - left the guard
 * green. Executed. The entry's own `why` claims the variant is "split between
 * two blocks... a partial read of a whole that IS fully read", so `coveredElsewhere`
 * now makes the guard ENFORCE that claim: each skipped field must be read by
 * SOME block of the same label in the same file. A claim in a comment that the
 * code does not check is how this guard came to certify its own defect.
 *
 * These are one-line PROSE SUMMARIES. `filterParams` renders a single line under
 * a filter chip and `assumptionGloss` renders one sentence; naming fourteen
 * fields in either would be a worse page, and a guard that demanded it would be
 * asking for a data dump in place of a summary. What it may not do is compute a
 * TOTAL from a subset, which is the shape that failed - and none of these do,
 * since the only count on the page is now `countIn - countOut`.
 */
const ACKNOWLEDGED = [
  {
    file: "legacy/dashboard/src/components/CandidatesPanel.tsx",
    label: "amount_match",
    skipped: ["matchedDepositTxid", "matchedDepositAmountZat", "withdrawalAmountZat"],
    why: "the chip line states the match kind, the deposit height and the tolerance; the txid and the two magnitudes are on the row itself",
  },
  {
    file: "legacy/dashboard/src/components/CandidatesPanel.tsx",
    label: "amount_echo",
    skipped: [
      "grade", "withdrawalTxid", "withdrawalAmountZat", "depositTxids", "depositAmountZat",
      "residualZat", "relativeError", "timeDeltaMs", "partial", "toleranceZat",
      "relativeEpsilon", "searchedCandidates",
    ],
    why: "a fourteen-field variant rendered as one line; the kind, grade, residual and split are what a reader needs at chip size, and the gloss beside it carries the epsilon",
  },
  {
    file: "legacy/dashboard/src/components/CandidatesPanel.tsx",
    label: "time_window",
    skipped: ["lowHeight"],
    why: "the gloss states the window in blocks and the anchor height; the range's lower bound is on the params line above it",
  },
  {
    file: "legacy/dashboard/src/components/CandidatesPanel.tsx",
    label: "conservation",
    // Split across two blocks, so every field below must be read by ONE of
    // them. Without this the entry lists the whole variant and silences itself.
    coveredElsewhere: true,
    skipped: [
      "poolBalanceZat", "claimedZat", "exitZat",
      "rejectedForDoubleClaim", "rejectedForRivalWithdrawal", "rejectedForBalance",
    ],
    why: "two blocks split this variant between them - the params line carries the three magnitudes and the gloss carries the three rejection reasons - so each is a partial read of a whole that IS fully read. That was not true when this entry was written: `exitZat` was rendered by nothing, and the guard's first tree-wide run is what surfaced it",
  },
];

/** `readonly filter: "name";` followed by that variant's `readonly params: {...}`. */
function variantsOf(text) {
  const out = new Map();
  const re = /readonly filter: "([a-z_]+)";\s*(?:\/\*[\s\S]*?\*\/\s*)?readonly params: \{([\s\S]*?)\n {6}\};/g;
  for (const m of text.matchAll(re)) {
    const fields = [...m[2].matchAll(/^\s*readonly ([A-Za-z0-9_]+)\??:/gm)].map((f) => f[1]);
    if (fields.length > 0) out.set(m[1], fields);
  }
  return out;
}

/** The text of every `switch (<expr>.filter) { ... }`, by brace matching. */
function filterSwitches(text) {
  const out = [];
  // `text.matchAll(head)`, NOT `head.matchAll(...)`. The first draft wrote the
  // latter behind a `? :` that silently fell through to an empty array, so the
  // scan found no switches and reported the tree clean having looked at
  // nothing. Its own self-test caught it on the first run, which is the whole
  // argument for self-testing a detector in both directions.
  // `switch (f.filter)` AND `const { filter } = f; switch (filter)`, which is
  // the standard destructured-discriminant idiom and narrows identically.
  const head = /switch\s*\(\s*(?:[A-Za-z0-9_.]*\.filter|filter)\s*\)\s*\{/g;
  for (const m of text.matchAll(head)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ body: text.slice(start, i + 1), offset: start });
  }
  return out;
}

/** Comments blanked to spaces, LENGTH PRESERVED so offsets and line numbers survive. */
function blankComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Each `case "label":` at the switch's OWN depth, and the text to the next
 * boundary at that depth.
 *
 * DEPTH-AWARE, AND OVER COMMENT-FREE TEXT, BECAUSE THE FIRST VERSION WAS
 * NEITHER AND FAILED IN BOTH DIRECTIONS. It ended a block at the first literal
 * `default:` found by `indexOf` at any nesting depth, in text whose comments
 * had not been stripped. So a case containing an inner
 * `switch (mode) { ... default: ... }` BEFORE its params reads was truncated to
 * nothing and reported clean - the guard's whole purpose defeated - and one
 * containing it AFTER the first read was reported as a partial read of correct
 * code. A guard that fails on correct code is a guard that gets silenced.
 */
function caseBlocks(switchBody) {
  const out = [];
  const src = blankComments(switchBody);
  const depth = new Array(src.length);
  for (let i = 0, d = 0; i < src.length; i += 1) {
    if (src[i] === "{") d += 1;
    else if (src[i] === "}") d -= 1;
    depth[i] = d;
  }
  const re = /case\s+"([a-z_]+)"\s*:/g;
  const marks = [...src.matchAll(re)].filter((m) => depth[m.index] === 1);
  for (let n = 0; n < marks.length; n += 1) {
    const from = marks[n].index + marks[n][0].length;
    const nextCase = n + 1 < marks.length ? marks[n + 1].index : Infinity;
    let nextDefault = Infinity;
    const dre = /\bdefault\s*:/g;
    dre.lastIndex = from;
    for (let m2; (m2 = dre.exec(src)); ) {
      if (depth[m2.index] === 1) {
        nextDefault = m2.index;
        break;
      }
    }
    const to = Math.min(nextCase, nextDefault, switchBody.length);
    out.push({ label: marks[n][1], body: switchBody.slice(from, to), at: marks[n].index });
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * Comments stripped, because a field NAMED IN PROSE is not a field READ.
 *
 * Without this the guard reads the docblock that explains a defect as evidence
 * the defect is fixed - and the very first site it scanned was the one whose
 * comment names `rejectedForDoubleClaim` and `rejectedForBalance` while
 * explaining why the code no longer sums them. A detector that counts an
 * apology as a fix is worse than none.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * The findings for one file's text. Exported shape: {file, line, label, missing}.
 */
export function scanText(text, variants) {
  const findings = [];
  for (const sw of filterSwitches(text)) {
    for (const block of caseBlocks(sw.body)) {
      const fields = variants.get(block.label);
      if (fields === undefined) continue;
      const code = stripComments(block.body);
      if (GENERIC_READ.test(code)) continue;
      const read = fields.filter((f) => new RegExp(`\\b${f}\\b`).test(code));
      if (read.length === 0) continue; // a label, not a params renderer
      const missing = fields.filter((f) => !read.includes(f));
      if (missing.length > 0) {
        findings.push({
          line: lineOf(text, sw.offset + block.at),
          label: block.label,
          read: read.length,
          total: fields.length,
          missing,
        });
      }
    }
  }
  return findings;
}

/* ============================================================================
   Self-test, both directions
   ========================================================================== */

const FIXTURE_UNION = new Map([["demo", ["alpha", "beta", "gamma"]]]);

const PARTIAL_READ = `
function render(f) {
  switch (f.filter) {
    case "demo": {
      return f.params.alpha + f.params.beta;
    }
  }
}`;

const FULL_READ = `
function render(f) {
  switch (f.filter) {
    case "demo": {
      return f.params.alpha + f.params.beta + f.params.gamma;
    }
  }
}`;

const LABEL_ONLY = `
function short(f) {
  switch (f.filter) {
    case "demo":
      return "a demo filter";
  }
}`;

const COMMENTED_AWAY = `
function render(f) {
  switch (f.filter) {
    case "demo": {
      // gamma is deliberately not read here
      return f.params.alpha + f.params.beta;
    }
  }
}`;

// NAMES A FIELD, so `read.length === 0` cannot exempt it and only GENERIC_READ
// can make it pass. Without the named field two independent exemptions shared
// one probe and neither was tested.
const GENERIC = `
function all(f) {
  switch (f.filter) {
    case "demo": {
      const label = f.params.alpha;
      return label + Object.entries(f.params).map(String).join(",");
    }
  }
}`;

// H1's two shapes. A nested switch BEFORE the reads truncated the block to
// nothing; a nested switch AFTER them ended it early and reported correct code
// as a partial read.
const NESTED_DEFAULT_FIRST = `
function render(f, mode) {
  switch (f.filter) {
    case "demo": {
      switch (mode) {
        case "a": break;
        default: break;
      }
      return f.params.alpha + f.params.beta;
    }
  }
}`;

const NESTED_DEFAULT_AFTER = `
function render(f, mode) {
  switch (f.filter) {
    case "demo": {
      const x = f.params.alpha;
      switch (mode) {
        default: break;
      }
      return x + f.params.beta + f.params.gamma;
    }
  }
}`;

// A comment containing the word `default:` mid-block, which the raw `indexOf`
// also treated as a boundary.
const DEFAULT_IN_COMMENT = `
function render(f) {
  switch (f.filter) {
    case "demo": {
      // the default: case is handled elsewhere
      return f.params.alpha + f.params.beta + f.params.gamma;
    }
  }
}`;

const DESTRUCTURED_DISCRIMINANT = `
function render(f) {
  const { filter, params } = f;
  switch (filter) {
    case "demo": {
      return params.alpha + params.beta;
    }
  }
}`;

function selfTest() {
  const partial = scanText(PARTIAL_READ, FIXTURE_UNION);
  if (partial.length !== 1 || !partial[0].missing.includes("gamma")) {
    console.error("[audit-consumers] self-test: a PARTIAL read was not detected.");
    return false;
  }
  const commented = scanText(COMMENTED_AWAY, FIXTURE_UNION);
  if (commented.length !== 1 || !commented[0].missing.includes("gamma")) {
    console.error("[audit-consumers] self-test: a field named only in a COMMENT counted as read.");
    return false;
  }
  for (const [name, src] of [
    ["full", FULL_READ],
    ["label-only", LABEL_ONLY],
    ["generic", GENERIC],
    ["nested-default-after", NESTED_DEFAULT_AFTER],
    ["default-in-comment", DEFAULT_IN_COMMENT],
  ]) {
    if (scanText(src, FIXTURE_UNION).length !== 0) {
      console.error(`[audit-consumers] self-test: the ${name} fixture was wrongly flagged.`);
      return false;
    }
  }
  for (const [name, src] of [
    ["nested-default-first", NESTED_DEFAULT_FIRST],
    ["destructured-discriminant", DESTRUCTURED_DISCRIMINANT],
  ]) {
    const hits = scanText(src, FIXTURE_UNION);
    if (hits.length !== 1 || !hits[0].missing.includes("gamma")) {
      console.error(`[audit-consumers] self-test: a partial read in the ${name} shape was missed.`);
      return false;
    }
  }

  // THE PARSE ITSELF. `variantsOf` dropping a field per variant left the scan
  // green and still printed "4 variants", so the count was not evidence.
  const parsed = variantsOf(`
      readonly filter: "demo";
      readonly params: {
        readonly alpha: bigint;
        readonly beta?: number;
        readonly gamma: string;
      };
`);
  const got = parsed.get("demo");
  if (got === undefined || got.join(",") !== "alpha,beta,gamma") {
    console.error("[audit-consumers] self-test: variantsOf did not parse a variant's fields.");
    return false;
  }

  // THE SUPPRESSION LOGIC, which is the property the whole guard rests on: a
  // missing set containing ONE unacknowledged field must still be reported.
  // `.every` -> `.some` is a one-character mutation that destroys it, and
  // nothing caught it.
  const ack = [{ file: "f.ts", label: "demo", skipped: ["beta"] }];
  const suppressed = (missing) =>
    ack.some(
      (a) => a.file === "f.ts" && a.label === "demo" && missing.every((m) => a.skipped.includes(m)),
    );
  if (!suppressed(["beta"])) {
    console.error("[audit-consumers] self-test: an acknowledged omission was not suppressed.");
    return false;
  }
  if (suppressed(["beta", "gamma"])) {
    console.error("[audit-consumers] self-test: an UNacknowledged field was suppressed alongside an acknowledged one.");
    return false;
  }
  return true;
}

/* ============================================================================
   The scan
   ========================================================================== */

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
  for (const r of ROOTS) {
    try {
      if (statSync(join(ROOT, r)).isDirectory()) walk(join(ROOT, r));
    } catch {
      /* a root that is not present is not a failure */
    }
  }
  return out;
}

if (!selfTest()) {
  console.error("[audit-consumers] the detector is broken; a clean scan would prove nothing.");
  process.exit(2);
}

let variants;
try {
  variants = variantsOf(readFileSync(join(ROOT, UNION_FILE), "utf8"));
} catch {
  console.error(`[audit-consumers] FAIL: cannot read ${UNION_FILE}.`);
  process.exit(2);
}
if (variants.size === 0) {
  // A parse that finds nothing would report a clean tree having looked at
  // nothing - the failure mode the fail-side rule exists to catch.
  console.error(`[audit-consumers] FAIL: no FilterApplication variants parsed from ${UNION_FILE}.`);
  process.exit(2);
}

const files = sourceFiles();

/**
 * Fields read by ANY block of a given label in a given file.
 *
 * Two passes, because `coveredElsewhere` is a claim about the FILE and not about
 * one block: an entry saying "the params line carries the magnitudes and the
 * gloss carries the reasons" is only true if between them they read everything.
 * Without this the entry lists the whole variant and silences its own site.
 */
const readUnion = new Map();
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.slice(ROOT.length + 1);
  for (const hit of scanText(text, variants)) {
    const key = `${rel}\u0000${hit.label}`;
    const set = readUnion.get(key) ?? new Set();
    for (const f of variants.get(hit.label) ?? []) if (!hit.missing.includes(f)) set.add(f);
    readUnion.set(key, set);
  }
}

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.slice(ROOT.length + 1);
  for (const hit of scanText(text, variants)) {
    // Suppressed only when EVERY missing field was knowingly skipped. A new
    // field on the variant is in no entry, so the site fires again.
    const covered = ACKNOWLEDGED.some(
      (a) =>
        a.file === rel &&
        a.label === hit.label &&
        hit.missing.every(
          (m) =>
            a.skipped.includes(m) &&
            // `coveredElsewhere` entries claim the variant is SPLIT across
            // blocks, so the guard checks that claim rather than taking it.
            (a.coveredElsewhere !== true ||
              (readUnion.get(`${rel}\u0000${hit.label}`)?.has(m) ?? false)),
        ),
    );
    if (covered) continue;
    findings.push({ file: rel, ...hit });
  }
}

if (findings.length > 0) {
  console.error(
    `[audit-consumers] FAIL: ${findings.length} partial read(s) of a FilterApplication variant's ` +
      `params. A block that consults some fields and not others keeps answering the question the ` +
      `record used to ask - which is how "Nothing was refused" was rendered for a window in which ` +
      `two links were refused. Read every field, or derive from countIn/countOut.`,
  );
  for (const f of findings) {
    console.error(
      `  ${f.file}:${f.line}  case "${f.label}" reads ${f.read} of ${f.total} - missing: ${f.missing.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log(
  `[audit-consumers] OK: every FilterApplication case block that reads params reads all of them ` +
    `(${variants.size} variants, detector self-tested in both directions).`,
);
