// Guards the one kind of provenance this project uses most and checks least: a
// citation of the form `docs/2.0/research/01-contemporary-zcash.md:<line>`.
//
// WHY IT EXISTS. Constants in `apps/indexer/src/decoder/activation-heights.ts`
// are chain parameters, and each carries a line citation into the research
// corpus as its provenance. A line number is the weakest possible citation -
// it decays the moment anyone inserts a paragraph above it - and this project
// has now decayed one inside the very commit that wrote it: HANDOFF-07 added a
// table to the corpus, re-pinned eight citations by ARITHMETIC rather than by
// reading, and landed one pointing at a blank line. A gate round found it.
// Nothing else would have: a wrong line number compiles, tests green, and the
// next reader follows it to the wrong place or to nothing at all.
//
// WHAT IT CHECKS, AND WHY THAT IS ENOUGH. That every cited line EXISTS and is
// not blank. It deliberately does not try to check that the line says what the
// citing comment claims - that is a judgement, and a script pretending to make
// it would give the citation a false air of verification, which is worse than
// no check. Blankness is the failure mode that actually occurred, it is the one
// that means "this citation points at nothing", and it is decidable.
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
      if (targetLines[n - 1].trim() === "") {
        problems.push({
          source: sourceLabel,
          sourceLine: i + 1,
          citation: `${basename}:${lineNo}`,
          why: "points at a blank line",
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

  const ok =
    shouldFire.length === 1 &&
    shouldNotFire.length === 0 &&
    pastEnd.length === 1 &&
    notCorpus.length === 0;
  if (!ok) {
    console.error(
      `[citations] FAIL self-test: blank=${shouldFire.length} (want 1), ` +
        `good=${shouldNotFire.length} (want 0), pastEnd=${pastEnd.length} (want 1), ` +
        `nonCorpus=${notCorpus.length} (want 0)`,
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
    "non-blank line (detector self-tested in both directions).",
);
