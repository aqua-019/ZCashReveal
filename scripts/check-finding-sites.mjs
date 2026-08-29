// Guards the second shape HANDOFF-08 committed five times: a gate finding names
// several sites, the fix lands in some of them, and the tree then states two
// different answers to one question.
//
// WHY THIS IS A PROPERTY OF THE FINDING RATHER THAN OF THE FIXER, which is what
// makes it worth more than the rule it replaces. CLAUDE.md has said since
// LEDGER-03 Q3 that a correction landing in one file while another still states
// the error is HIGH - "the site then contradicts itself about a named person,
// which is worse than the original error". That rule was then broken by the
// agent that wrote it, five times in one handoff:
//
//   round 2  the A9 attribution corrected in mempool.ts and API.md, left standing
//            in views.ts and mempool-view.test.ts
//   round 2  the exact-with-a-rival grade corrected in echo.ts's classifier,
//            left standing in the same file's countOut comment and in
//            CandidatesPanel.tsx
//   round 3  the "12 times" ratio corrected in echo.ts, left standing in GOLDEN.md
//   round 3  the stale row count corrected in MempoolPanel.tsx, left standing in
//            track/page.tsx - a THIRD site of one number
//   L2 F-41-1 the "12 times" correction itself, which fixed the comparison in two
//            sites and carried the wrong NUMBER into both (12 where the unscaled
//            ratio is 12.5), inside the commit that fixed the previous instance
//
// A rule an agent has violated five times and honoured less often is evidence
// about the instrument, not about the agent. So the finding's site list becomes
// data: each entry names every site the finding covered and the pattern that
// means "still wrong", and the guard re-reads all of them on every run. A fix
// that lands in three of four sites fails the build naming the fourth.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not try to decide whether a fix is
// CORRECT - that is a judgement, and a script pretending to make it would give
// the correction a false air of verification, the same objection
// check-corpus-citations.mjs records about its own bound. It answers one
// question: does any site the finding named still match the shape the finding
// described.
//
// Self-tested in both directions on every run.

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files that RECORD findings rather than assert facts, excluded from pattern
 * scanning by construction.
 *
 * THE LEDGER QUOTES THE DEFECT IN ORDER TO RECORD IT, so a register that scans
 * it fires forever on text that is doing its job. This guard's own first run
 * proved it: L2's verbatim block for F-41-1 contains the line `Twelve is the
 * ratio against the *unscaled* FEE_TOLERANCE_ZAT` - the finding being reported -
 * and the guard reported the ledger as an open site. The ledger is append-only
 * and its whole value is that it preserves wrong text alongside the correction;
 * demanding it be "fixed" would be asking it to falsify its own record.
 *
 * So a site is somewhere the tree ASSERTS a fact. Where it REPORTS one, it is
 * excluded, and the exclusion is self-tested below so it cannot quietly widen
 * into a way of hiding a real site.
 */
const RECORD_FILES = [/^handoffs\/LEDGER\.md$/, /^handoffs\/prompts\//, /^handoffs\/LOG\.md$/];

/**
 * The register. One entry per multi-site finding, with every site it covered.
 *
 * A site is checked by `absent` (a shape that must no longer appear), by
 * `present` (the corrected statement that must appear), or by both.
 *
 * `present` EXISTS BECAUSE A NEGATIVE PATTERN CANNOT TELL AN ASSERTION FROM AN
 * EXPLANATION OF ONE, and this guard proved it on itself. F-41-1's fix has to
 * say what was wrong - "twelve was never the answer to either question" - and a
 * pattern hunting for `twelve ... unscaled` then matches the correction as
 * loudly as the defect. Narrowing the pattern until it stopped matching the fix
 * would make it stop matching some future statement of the defect too. So where
 * a fix produces a positive claim, the guard asks whether that claim is THERE,
 * which is a question prose about the old error cannot answer wrongly.
 *
 * Both are matched against the whole file rather than a line number on purpose:
 * a line number decays the moment anyone inserts a paragraph above it, which
 * this project has already done to one citation inside the commit that wrote it
 * (check-corpus-citations.mjs exists because of that). A pattern survives an
 * edit that moves the text.
 *
 * ADDING AN ENTRY IS PART OF FIXING A MULTI-SITE FINDING, not paperwork after
 * it: the entry is what stops the sixth instance, and writing it forces the
 * fixer to enumerate the sites before claiming the sweep.
 */
const FINDINGS = [
  {
    id: "F-41-1",
    what: "the subset-sum residual ratio: 12.5 times the UNSCALED FEE_TOLERANCE_ZAT, 6.25 times the k-scaled allowance at k=2",
    // Both figures must be stated together, which is what fold 3 asks for:
    // 12.5 against the unscaled constant, 6.25 against the k-scaled allowance,
    // near enough to each other that neither reads as the other's answer.
    present: /12\.5[\s\S]{0,400}6\.25|6\.25[\s\S]{0,400}12\.5/,
    sites: [
      "apps/indexer/src/analysis/echo.ts",
      "apps/indexer/src/analysis/__tests__/GOLDEN.md",
    ],
  },
  {
    id: "R3-H2",
    what: "the same ratio stated against the k-scaled allowance: 6.25, not 12",
    absent: /(twelve|(?<!\d)12(?!\.)) times the absolute allowance/i,
    present: /6\.25/,
    sites: [
      "apps/indexer/src/analysis/echo.ts",
      "apps/indexer/src/analysis/__tests__/GOLDEN.md",
    ],
  },
  {
    id: "R2-A9",
    what: 'assertion A9 cited bare, where "A9" resolves to a different assertion in HANDOFF-08 than in HANDOFF-06',
    absent: /divergence assertion A9 forbids|ASSERTION A9 both forbid|\/\/ Assertion A9's rule/i,
    sites: [
      "apps/gateway/src/views/mempool.ts",
      "docs/2.0/API.md",
      "packages/zec-types/src/views.ts",
      "apps/gateway/src/__tests__/mempool-view.test.ts",
    ],
  },
  {
    id: "R2-GRADE",
    what: "an exact match with a rival grades LOW, not MEDIUM (TRACKING-MATH section 3.4 puts multiple candidates in the LOW clause by itself)",
    absent: /two grade MEDIUM|two of them MEDIUM/i,
    sites: [
      "apps/indexer/src/analysis/echo.ts",
      "legacy/dashboard/src/components/CandidatesPanel.tsx",
    ],
  },
  {
    id: "R3-ROWS",
    what: "the /track fixture row count, stated as a literal where it went stale three times",
    absent: /twelve (real|committed) rows/i,
    sites: [
      "apps/web/src/components/track/MempoolPanel.tsx",
      "apps/web/src/app/track/page.tsx",
      "apps/web/src/lib/api/fixtures/mempool.ts",
    ],
  },
  {
    id: "R4-GUARDS",
    what: "the number of static guards `pnpm check` runs, stated in three asserting places and correct in none of them for one commit",
    // The historical statements - HANDOFF-07's own report, the LOG rows - are
    // RECORDS of what that handoff did and stay at five. Only the sites that
    // assert the CURRENT count are listed.
    absent: /five static guards|the five guards|five guards OK/i,
    present: /seven (static )?guards/i,
    sites: ["CLAUDE.md", "README.md", "handoffs/HANDOFF-08-analysis-toolkit.md"],
  },
  {
    id: "R4-COUNT",
    what: "HANDOFF-08 section 7's test-count line, stale across rounds 2 and 3 (1047 written, 1056 at #40, 1058 at #41)",
    absent: /(?<!\d)(1047|1056|1063) passed/,
    sites: ["handoffs/HANDOFF-08-analysis-toolkit.md"],
  },
];

/**
 * Comment prefixes dropped and whitespace collapsed, so a pattern matches text
 * that WRAPPED.
 *
 * The guard's first run reported F-41-1's two code sites CLOSED while both still
 * carried the defect, because the sentence spans four wrapped comment lines and
 * the pattern's `[^.\n]` could not cross the break. That is the shape this whole
 * guard exists to prevent - a check reporting clean having looked at the wrong
 * thing - occurring inside the check itself, on its first run. Every pattern in
 * the register is therefore written against flattened text.
 */
function flatten(src) {
  return src.replace(/^\s*(\/\/|\*)\s?/gm, " ").replace(/\s+/g, " ");
}

function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

/** Sites of one finding that still match its pattern. Pure, for the self-test. */
export function openSites(finding, readFile) {
  const open = [];
  for (const site of finding.sites) {
    if (RECORD_FILES.some((r) => r.test(site))) continue;
    const text = readFile(site);
    if (text === null) {
      open.push({ site, reason: "missing" });
      continue;
    }
    const flat = flatten(text);
    if (finding.absent !== undefined && finding.absent.test(flat)) {
      open.push({ site, reason: "still states the old answer" });
      continue;
    }
    if (finding.present !== undefined && !finding.present.test(flat)) {
      open.push({ site, reason: "does not state the corrected answer" });
    }
  }
  return open;
}

/* ============================================================================
   Self-test, both directions
   ========================================================================== */

function selfTest() {
  const fixture = {
    id: "SELF",
    what: "fixture",
    absent: /still wrong/,
    sites: ["a.ts", "b.ts"],
  };
  const positive = { id: "SELF+", what: "fixture", present: /the right answer/, sites: ["a.ts"] };
  if (openSites(positive, () => "this states the right answer").length !== 0) {
    console.error("[finding-sites] self-test: a site stating the corrected answer was flagged.");
    return false;
  }
  const missingClaim = openSites(positive, () => "this says nothing useful");
  if (missingClaim.length !== 1 || missingClaim[0].reason !== "does not state the corrected answer") {
    console.error("[finding-sites] self-test: a site MISSING the corrected answer was not flagged.");
    return false;
  }
  // A `present` check must not be satisfiable by prose ABOUT the old error, and
  // must not be defeated by it either - that is the whole reason it exists.
  if (openSites(positive, () => "the old text was wrong; this states the right answer").length !== 0) {
    console.error("[finding-sites] self-test: narration of the old error defeated a present check.");
    return false;
  }
  const halfFixed = (s) => (s === "a.ts" ? "this is fine" : "this is still wrong");
  const allFixed = () => "this is fine";
  const oneMissing = (s) => (s === "a.ts" ? "this is fine" : null);

  const half = openSites(fixture, halfFixed);
  if (half.length !== 1 || half[0].site !== "b.ts") {
    console.error("[finding-sites] self-test: a half-applied fix was not detected.");
    return false;
  }
  if (openSites(fixture, allFixed).length !== 0) {
    console.error("[finding-sites] self-test: a fully applied fix was wrongly flagged.");
    return false;
  }
  const wrapped = openSites(
    { ...fixture, sites: ["a.ts"] },
    () => "this is\n   * still wrong",
  );
  if (wrapped.length !== 1) {
    console.error("[finding-sites] self-test: WRAPPED text defeated the pattern.");
    return false;
  }
  const record = openSites(
    { ...fixture, sites: ["handoffs/LEDGER.md"] },
    () => "this is still wrong",
  );
  if (record.length !== 0) {
    console.error("[finding-sites] self-test: a RECORD file was scanned as an asserting site.");
    return false;
  }
  const notRecord = openSites(
    { ...fixture, sites: ["handoffs/HANDOFF-08-analysis-toolkit.md"] },
    () => "this is still wrong",
  );
  if (notRecord.length !== 1) {
    // The exclusion must not widen to every path under handoffs/: a handoff's
    // own section 7 asserts facts and is exactly where one went stale twice.
    console.error("[finding-sites] self-test: the RECORD exclusion swallowed an asserting site.");
    return false;
  }
  const missing = openSites(fixture, oneMissing);
  if (missing.length !== 1 || missing[0].reason !== "missing") {
    // A site that has been deleted or moved is not silently closed: the
    // register would otherwise decay into a list of paths nobody reads.
    console.error("[finding-sites] self-test: a vanished site was treated as closed.");
    return false;
  }
  return true;
}

/* ============================================================================
   The sweep
   ========================================================================== */

if (!selfTest()) {
  console.error("[finding-sites] the detector is broken; a clean sweep would prove nothing.");
  process.exit(2);
}

if (FINDINGS.length === 0) {
  console.error("[finding-sites] FAIL: the register is empty, so this sweep looked at nothing.");
  process.exit(2);
}

const open = [];
for (const f of FINDINGS) {
  for (const hit of openSites(f, read)) open.push({ id: f.id, what: f.what, ...hit });
}

if (open.length > 0) {
  console.error(
    `[finding-sites] FAIL: ${open.length} site(s) named by a gate finding still match the shape ` +
      `that finding described. A correction that lands in one site while another states the old ` +
      `answer leaves the tree contradicting itself, which CLAUDE.md rates HIGH.`,
  );
  for (const o of open) console.error(`  ${o.id}  ${o.site}  (${o.reason})\n      ${o.what}`);
  process.exit(1);
}

const sites = FINDINGS.reduce((n, f) => n + f.sites.length, 0);
console.log(
  `[finding-sites] OK: ${FINDINGS.length} multi-site finding(s), ${sites} site(s), all closed ` +
    `(detector self-tested in both directions).`,
);
