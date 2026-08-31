// Guards the one kind of provenance this project uses most and checks least: a
// citation of the form `docs/2.0/research/01-contemporary-zcash.md:<line>`.
//
// WHY IT EXISTS. Constants in `@zcashreveal/instruments`' `activation-heights.ts`
// are chain parameters, and each carries a line citation into the research
// corpus as its provenance. A line number is the weakest possible citation -
// it decays the moment anyone inserts a paragraph above it - and this project
// has now decayed one inside the very commit that wrote it: HANDOFF-07 added a
// table to the corpus, re-pinned eight citations by ARITHMETIC rather than by
// reading, and landed one pointing at a blank line. A gate round found it.
// Nothing else would have: a wrong line number compiles, tests green, and the
// next reader follows it to the wrong place or to nothing at all.
//
// WHAT IT CHECKS, AND WHY THAT IS ENOUGH. That every cited line EXISTS, is not
// blank, and is not STRUCTURAL-ONLY - a `---` rule or front-matter fence, a bare
// `#`, or a `|---|---|` table separator. It deliberately does not try to check
// that the line says what the citing comment claims - that is a judgement, and a
// script pretending to make it would give the citation a false air of
// verification, which is worse than no check.
//
// THE STRUCTURAL CASE WAS ADDED IN HANDOFF-08 BECAUSE L2 PROBED THE GUARD AND
// GOT THROUGH. Testing the guard rather than reading it (LEDGER-07, probe f),
// L2 pointed a citation at line 12 of the corpus - the `---` closing the YAML
// front matter - and it passed, because `---` is not blank. That is the same
// failure the blank-line rule exists for: the citation points at nothing a
// reader can check. It is a bounded guard either way, and the bound is now one
// notch tighter than "the line has characters on it".
//
// The section tags beside each citation (§1.4, §2.1) are the human half of the
// same job and are not checked here: a section survives an edit that moves a
// line, so the two together degrade more gracefully than either alone.
//
// SELF-TESTED IN BOTH DIRECTIONS, like the guards beside it. A detector
// that has never been shown to fire is a detector nobody has tested.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where a citation may point. Anything under here is a corpus document. */
const CORPUS_DIRS = ["docs/2.0/research", "docs/2.0"];

/** Where citations are looked for. Archives are excluded - see below. */
const SCAN_DIRS = ["apps", "packages", "scripts"];

const SCAN_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".sql"];

const SKIP_DIR = new Set(["node_modules", "dist", ".next", ".turbo", "coverage"]);

/**
 * `<basename>.md:<line>`, with the line number captured.
 *
 * Deliberately loose about the path prefix, because the tree cites the same
 * document both with a full path and as a bare basename. Both are citations
 * and both decay, so both are checked.
 */
const CITATION = /([A-Za-z0-9._-]+\.md):(\d+)/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

/** Resolve a cited basename to a corpus file, or null if it is not one. */
function corpusPath(basename) {
  for (const dir of CORPUS_DIRS) {
    const candidate = join(ROOT, dir, basename);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not there; try the next directory */
    }
  }
  return null;
}

const lineCache = new Map();
function linesOf(path) {
  let lines = lineCache.get(path);
  if (lines === undefined) {
    lines = readFileSync(path, "utf8").split("\n");
    lineCache.set(path, lines);
  }
  return lines;
}

/**
 * What kind of structure-only line this is, or `null` if it carries content.
 *
 * THREE SHAPES, EACH ONE A LINE A CITATION CAN LAND ON AND SAY NOTHING FROM.
 * A `---` is a horizontal rule or a front-matter fence; a heading marker with
 * no words after it is a heading of nothing; a `|---|:--:|` row is a Markdown
 * table's separator, which is the line most likely to be hit when a citation is
 * re-pinned by arithmetic into the middle of a table.
 *
 * A heading WITH text ("## 1.4 Activation heights") is content and passes - it
 * is a perfectly good thing to cite, and refusing it would push citations off
 * section headers, which are the most durable target in the document.
 */
export function structuralKind(line) {
  const t = line.trim();
  if (/^-{3,}$/.test(t) || /^\*{3,}$/.test(t) || /^_{3,}$/.test(t)) {
    return "a horizontal rule or front-matter fence";
  }
  if (/^#+$/.test(t)) return "a heading marker with no heading text";
  // A table separator row: pipes, colons, dashes and spaces only, and at least
  // one dash - so `| a | b |` (a real header row) is content and passes.
  if (/^\|[\s|:-]*\|$/.test(t) && t.includes("-")) return "a table separator row";
  return null;
}

/**
 * Check one file's citations. Returns a list of problems.
 *
 * Exported shape rather than inlined so the self-test can drive it over a
 * string instead of over the tree.
 */
export function citationProblems(sourceLabel, sourceText) {
  const problems = [];
  const sourceLines = sourceText.split("\n");
  for (const [i, line] of sourceLines.entries()) {
    CITATION.lastIndex = 0;
    let m;
    while ((m = CITATION.exec(line)) !== null) {
      const [, basename, lineNo] = m;
      const target = corpusPath(basename);
      if (target === null) continue;
      const n = Number(lineNo);
      const targetLines = linesOf(target);
      if (n < 1 || n > targetLines.length) {
        problems.push({
          source: sourceLabel,
          sourceLine: i + 1,
          citation: `${basename}:${lineNo}`,
          why: `points past the end of the file, which has ${targetLines.length} lines`,
        });
        continue;
      }
      const targetLine = targetLines[n - 1];
      if (targetLine.trim() === "") {
        problems.push({
          source: sourceLabel,
          sourceLine: i + 1,
          citation: `${basename}:${lineNo}`,
          why: "points at a blank line",
        });
        continue;
      }
      const structural = structuralKind(targetLine);
      if (structural !== null) {
        problems.push({
          source: sourceLabel,
          sourceLine: i + 1,
          citation: `${basename}:${lineNo}`,
          why: `points at ${structural}, which carries no claim a reader can check`,
        });
      }
    }
  }
  return problems;
}

/* ============================================================================
   Self-test: the detector must fire, and must not fire on the good case.
   ========================================================================== */

function selfTest() {
  const corpus = corpusPath("01-contemporary-zcash.md");
  if (corpus === null) {
    console.error("[citations] FAIL self-test: the research corpus is not where this script looks");
    return false;
  }
  const lines = linesOf(corpus);
  const blank = lines.findIndex((l) => l.trim() === "") + 1;
  const nonBlank = lines.findIndex((l) => l.trim() !== "") + 1;
  if (blank === 0 || nonBlank === 0) {
    console.error("[citations] FAIL self-test: the corpus has no blank or no non-blank line");
    return false;
  }

  const shouldFire = citationProblems("self-test", `// 01-contemporary-zcash.md:${blank}`);
  const shouldNotFire = citationProblems("self-test", `// 01-contemporary-zcash.md:${nonBlank}`);
  const pastEnd = citationProblems("self-test", `// 01-contemporary-zcash.md:${lines.length + 500}`);
  const notCorpus = citationProblems("self-test", "// README.md:999999");

  // THE STRUCTURAL DETECTOR IS SELF-TESTED AGAINST THE EXACT LINE L2 GOT
  // THROUGH WITH, not against a synthetic one: the first `---` in the real
  // corpus, which is its front-matter fence. If the corpus stops having one,
  // the self-test says so rather than reporting a detector it never exercised.
  const rule = lines.findIndex((l) => structuralKind(l) !== null) + 1;
  if (rule === 0) {
    console.error("[citations] FAIL self-test: the corpus has no structural-only line to probe");
    return false;
  }
  const structuralFires = citationProblems("self-test", `// 01-contemporary-zcash.md:${rule}`);

  // And the negative direction, on the shapes that must NOT be called
  // structural: a heading with text, and a table's header row.
  const negatives = [
    "## 1.4 Activation heights",
    "| Upgrade | Mainnet | Testnet |",
    "- a bullet",
    "text --- with a rule inside it",
  ].filter((l) => structuralKind(l) !== null);

  const ok =
    shouldFire.length === 1 &&
    shouldNotFire.length === 0 &&
    pastEnd.length === 1 &&
    notCorpus.length === 0 &&
    structuralFires.length === 1 &&
    negatives.length === 0;
  if (!ok) {
    console.error(
      `[citations] FAIL self-test: blank=${shouldFire.length} (want 1), ` +
        `good=${shouldNotFire.length} (want 0), pastEnd=${pastEnd.length} (want 1), ` +
        `nonCorpus=${notCorpus.length} (want 0), ` +
        `structural=${structuralFires.length} (want 1), ` +
        `falsePositives=${negatives.length} (want 0)${
          negatives.length > 0 ? `: ${JSON.stringify(negatives)}` : ""
        }`,
    );
  }
  return ok;
}

if (!selfTest()) process.exit(1);

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const problems = files.flatMap((f) =>
  citationProblems(f.slice(ROOT.length + 1), readFileSync(f, "utf8")),
);

if (problems.length > 0) {
  console.error("[citations] FAIL: a corpus citation points at nothing.");
  for (const p of problems) {
    console.error(`  ${p.source}:${p.sourceLine}  cites ${p.citation} - ${p.why}`);
  }
  console.error(
    "\nA line number is the weakest citation this project uses and it decays whenever the\n" +
      "corpus is edited. Re-pin it by READING the corpus, never by adding the number of\n" +
      "inserted lines - that arithmetic is what produced the citation this guard was written for.",
  );
  process.exit(1);
}

console.log(
  `[citations] OK: every corpus line citation in ${SCAN_DIRS.join(", ")} points at a real, ` +
    "non-blank, non-structural line (both detectors self-tested in both directions).",
);
