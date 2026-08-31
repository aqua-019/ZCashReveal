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
// THE BOUNDARY OF THIS GUARD, STATED BECAUSE IT IS EASY TO READ IT AS WIDER THAN
// IT IS (LEDGER-10 fold 7). This guard enforces CLOSURE of REGISTERED findings.
// Registration is MANUAL, and nothing asserts the registry is complete.
//
// So a green run says: every site of every finding somebody wrote down is
// closed. It does NOT say: every multi-site finding this project made was
// written down. A finding nobody registered is invisible here, and the guard's
// output looks identical either way - which is the same shape as a fail-side
// probe that does not fail, and it is why this paragraph exists rather than a
// line in a handoff nobody reads next.
//
// The gap is not closable by this script. A finding lives in a gate return, a
// ledger block or a review comment; deciding which of those named two file:line
// sites is a judgement, and a script that guessed would give the registry a
// false air of completeness - the same objection check-corpus-citations.mjs
// records about its own bound. The design question is carried as plan-only
// material in handoffs/HANDOFF-13-mode-a-wasm.md, where it is named rather than
// answered: what, mechanically, makes registration non-optional?
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
    id: "H09a-VITEST-ALIAS",
    what: "every workspace dependency an app's vitest config does not alias resolves to that package's `dist`, so the suite asserts on a build artefact instead of the branch",
    // `present` rather than `absent`: the defect is a MISSING line, and a
    // missing line matches no pattern. Each site must name the package in its
    // alias map. Registered after the same one-line omission was fixed in
    // `apps/publisher` (gate round 2) and left standing in `apps/indexer`
    // (round 3) - the move added the dependency to BOTH apps and only one alias
    // list gained a line, which is exactly the shape this register exists for.
    present: /"@zcashreveal\/instruments":\s*resolve\(/,
    // A config that aliases the other packages and not this one - the real
    // pre-fix state of `apps/indexer/vitest.config.ts`.
    probe: 'alias: { "@zcashreveal/types": resolve(HERE, "../../packages/zec-types/src/index.ts") },',
    sites: [
      "apps/publisher/vitest.config.ts",
      "apps/indexer/vitest.config.ts",
    ],
  },
  {
    id: "H09-WALLET-BOUND",
    what: "the published wallet upper bound is `<= Sigma counts` (the crossing count), never the denomination-run count - two wallets crossing one denomination in adjacent blocks form ONE run, so the run count can fall BELOW the truth and tightens as evidence accumulates",
    // `present` AND NOT `absent`, which is the one judgement in this row and is
    // worth stating. Every corrected site QUOTES the falsified claim in order to
    // correct it - TRACKING-MATH 3.9 says "this sentence read `<= number of
    // denomination runs` until 31 Aug 2026", and `migration-lens.ts` carries the
    // whole argument that amended it. An `absent: /denomination runs/` would fire
    // on all five corrections and catch nothing, which is the loose-pattern
    // failure CLAUDE.md records for `check-infra-docs`. What actually
    // distinguishes a live defect is a site that discusses the bound and states
    // ONLY the old one, which is exactly what the public /method page did for two
    // handoffs. So: every registered site must STATE the corrected bound.
    present: /Sigma counts|Σ counts|number of crossings|crossing count|<= *Σ|≤ *Σ/i,
    // The pre-fold /method sentence, verbatim - the eighth site, which HANDOFF-09
    // swept seven of and missed. Measured: this string fails `present`, and the
    // real file at 2c5b951~1 failed it too, so the row would have caught the
    // instance that prompted it rather than only the ones already fixed.
    probe:
      "so a migration session bounds the number of notes at >= ceil(B / 10,000) and the set of wallets at <= the number of denomination runs.",
    sites: [
      "docs/2.0/TRACKING-MATH.md",
      "apps/web/src/components/record/MethodEstimators.tsx",
      "packages/zec-instruments/src/migration-lens.ts",
      "packages/zec-types/src/snapshot.ts",
      "packages/zec-types/src/analysis.ts",
    ],
  },
  {
    id: "F-41-1",
    what: "the subset-sum residual ratio: 12.5 times the UNSCALED FEE_TOLERANCE_ZAT, 6.25 times the k-scaled allowance at k=2",
    // Both figures must be stated together, which is what fold 3 asks for:
    // 12.5 against the unscaled constant, 6.25 against the k-scaled allowance,
    // near enough to each other that neither reads as the other's answer.
    present: /12\.5[\s\S]{0,400}6\.25|6\.25[\s\S]{0,400}12\.5/,
    // AND the bare figure beside the unscaled constant, or the defect could be
    // re-added next to the corrected table with both entries reporting closed:
    // `present` is satisfied 200 characters away and R3-H2's `absent` requires
    // a phrase this wording does not contain.
    absent: /(?<!\d)12(?!\.\d)\s+times[^.]{0,60}unscaled/i,
    probe: 'This said "12 times", which is the ratio against the UNSCALED FEE_TOLERANCE_ZAT',
    antiProbe: "2,000,000 zat / 160,000 = 12.5 times the UNSCALED FEE_TOLERANCE_ZAT and 6.25 at k = 2",
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
    // NO `//` IN THE PATTERN: `flatten()` strips a line-leading comment marker
    // before the test, so an alternative anchored on `//` matched only a
    // TRAILING comment and never the standalone line the fix actually removed.
    // Dead for exactly the shape it was written for.
    absent: /divergence assertion A9 forbids|ASSERTION A9 both forbid|\bAssertion A9's rule\b/i,
    probe: "    // Assertion A9's rule on the row /track renders: a class naming the",
    antiProbe: "    // HANDOFF-06's assertion A9 on the row /track renders: a class naming the",
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
    id: "H07-DENOM",
    what: "ZIP 318's DENOM_CAP: 10,000 ZEC plus the canonical fee caps the funding NOTE, and 10,000 ZEC is the largest pool-crossing denomination - two quantities, not two readings of one",
    absent: /the corpus states? (it )?two ways|DENOM_CAP two ways|corpus gives DENOM_CAP two ways/i,
    probe: "above DENOM_CAP on the flat 10,000 ZEC reading, which the corpus states two ways",
    antiProbe: "above 10,000 ZEC, the largest crossing ZIP 318 permits",
    sites: [
      "packages/zec-types/src/leaks.ts",
      "packages/zec-types/src/zip318.ts",
      "apps/indexer/src/decoder/leak-analyzer.ts",
      "docs/2.0/TRACKING-MATH.md",
    ],
  },
  {
    id: "H07-IRONWOOD-ROOT",
    what: "`getblock` carries no `finalironwoodroot`; `trees.ironwood.size` is the block-level Ironwood signal (confirmed against Zebra's source, PR #10888)",
    // A PROPERTY, NOT A MENTION: `finalironwoodroot:` declared or forwarded.
    // The three sites each keep a CONFIRMED-ABSENT docblock naming the field,
    // which is the correct state and which the first draft flagged.
    absent: /finalironwoodroot\s*[:?]/i,
    probe: "finalironwoodroot: hash32Schema.optional(),",
    antiProbe: "There is no Ironwood root on this response at all; see the note where one used to be declared.",
    sites: [
      "packages/zebra-rpc/src/schemas.ts",
      "packages/zebra-rpc/src/client.ts",
      "packages/zebra-rpc/src/types.ts",
      "apps/indexer/src/decoder/block-decoder.ts",
    ],
  },
  {
    id: "H08-WALLETGUESS",
    what: "a `WalletGuess` member no rule can return is a branch that reads as covered and never runs - YWALLET and EDGE were withdrawn from the union, not just from the classifier",
    // A UNION MEMBER, NOT A MENTION. `| "YWALLET"` is the defect; the docblocks
    // that explain the removal, and `UNSOURCED_WALLET_HYPOTHESES` where the
    // string correctly lives as data, are not. The first draft matched the bare
    // literal and reported three correct files as open sites.
    absent: /\|\s*"(YWALLET|EDGE)"/,
    probe: 'export type WalletGuess = "ZCASHD_RUST" | "YWALLET" | "ZODL";',
    antiProbe: 'export type WalletGuess = "ZCASHD_RUST" | "ZODL";',
    sites: [
      "packages/zec-types/src/leaks.ts",
      "apps/indexer/src/decoder/fingerprint.ts",
      "apps/indexer/src/decoder/__tests__/rpc-casing.test.ts",
    ],
  },
  {
    id: "R4-GUARDS",
    what: "the number of static guards `pnpm check` runs, stated in several asserting places and correct in none of them for one commit",
    // The historical statements - HANDOFF-07's own report, the LOG rows - are
    // RECORDS of what that handoff did and stay at the count of their day. Only
    // the sites that assert the CURRENT count are listed.
    //
    // FIVE, THEN SEVEN, THEN ELEVEN, NOW TWELVE. This entry tracks the CURRENT
    // count rather than one correction: the shape recurs every time a guard is
    // added, which is exactly what makes it worth a register row instead of a
    // review. Each widening moves `present` and pushes the superseded count into
    // `absent`. The twelfth is `check-instrument-deps.mjs` (HANDOFF-09a), and
    // this row earned its keep on that commit: the session updated CLAUDE.md's
    // count, ran the guard, and was told about README.md and ci.yml - the two
    // asserting sites it had not thought of.
    present: /twelve (static )?guards/i,
    probe: "# THE ELEVEN STATIC GUARDS RUN BEFORE INSTALL AND BUILD, on purpose.",
    antiProbe: "# THE TWELVE STATIC GUARDS RUN BEFORE INSTALL AND BUILD, on purpose.",
    absent: /five static guards|the five guards|five guards OK|seven static guards|the seven guards|seven guards OK|FOUR STATIC GUARDS|SEVEN STATIC GUARDS|eleven static guards|the eleven guards|eleven guards OK|ELEVEN STATIC GUARDS/i,
    sites: [
      "CLAUDE.md",
      "README.md",
      // The FOURTH asserting site, in the hunk the commit that wrote this entry
      // was editing, and missed by the sweep that wrote it. The commit message
      // said "three asserting places"; it was four.
      ".github/workflows/ci.yml",
    ],
    // `handoffs/HANDOFF-08-analysis-toolkit.md` WAS A SITE HERE AND IS REMOVED,
    // deliberately and with the reason stated rather than dropped quietly.
    //
    // Its hit was the line `pnpm check      seven guards OK (two added by round
    // 4)`, which sits in that handoff's section 7 among `pnpm typecheck 10/10`
    // and `pnpm build OK`. It is a TRANSCRIPT of a run at a commit where the
    // answer was seven, and it was true then and is true now. A transcript
    // cannot track a moving count without being falsified: to satisfy an
    // `eleven` pattern it would have to claim a run that never happened.
    //
    // THE GENERAL RULE IS UNCHANGED AND IS STILL PINNED. A handoff's section 7
    // asserts facts and IS an asserting site - the self-test below proves the
    // RECORD exclusion does not swallow `HANDOFF-08-analysis-toolkit.md` - and
    // every other entry that names a section 7 keeps it. What is narrowed is
    // this one row, for the one line in it that is a measurement rather than a
    // claim about the present.
  },
  {
    id: "R4-EXITZAT-REACH",
    what: "the `exitZat` render fixed a record-to-render seam, not a page anyone saw: legacy/dashboard's parsers.ts coerces an unknown record into an inert time_window, so the conservation arm is unreachable there",
    absent: /a reader was being shown the side the law does not bound|ONE SUBSTANTIVE DEFECT ROUND 4 FOUND IN SHIPPED CODE/i,
    probe: "match, so a reader was being shown the side the law does not bound.",
    antiProbe: "match, so this line stated the side the law does not bound.",
    sites: [
      "legacy/dashboard/src/components/CandidatesPanel.tsx",
      "handoffs/HANDOFF-08-analysis-toolkit.md",
    ],
  },
  {
    id: "R4-COUNT",
    what: "HANDOFF-08 section 7's test-count line, stale across rounds 2 and 3 (1047 written, 1056 at #40, 1058 at #41)",
    absent: /(?<!\d)(1047|1056|1063) passed/,
    // AND THE COMPONENTS. Forbidding three literals cannot notice the line
    // going stale at a fourth number, nor the BREAKDOWN keeping 128/445 - which
    // sums to 1047 - one line under a corrected total. Both happened.
    present: /1058 passed[\s\S]{0,900}gateway 131[\s\S]{0,40}indexer 454/,
    probe: "pnpm -r test 1047 passed, 1 skipped",
    antiProbe: "pnpm -r test 1058 passed, 1 skipped",
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
  // THE PHRASE MUST CROSS THE BREAK. It read "this is\n * still wrong", where
  // `/still wrong/` matches the raw text - so the fixture passed with `flatten`
  // as the identity and the wrap feature, added BECAUSE the guard reported two
  // sites closed that still carried the defect, had no discriminating test. A
  // fail-side probe that does not fail is a finding in its own right.
  const wrapped = openSites(
    { ...fixture, sites: ["a.ts"] },
    () => "this is still\n   * wrong",
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
  // EVERY REGISTER ENTRY, PROVEN BOTH WAYS. Patterns were written from memory
  // and never run against the text the finding quoted, which is how an
  // alternative anchored on `//` shipped unmatchable and how three structural
  // entries shipped matching the docblocks that explain their own fix. A
  // pattern nobody has run against the defect is a pattern nobody has tested.
  for (const f of FINDINGS) {
    if (f.probe !== undefined) {
      if (openSites({ ...f, sites: ["probe"] }, () => f.probe).length === 0) {
        console.error(`[finding-sites] self-test: ${f.id}'s pattern does not match the defect it names.`);
        return false;
      }
    }
    if (f.antiProbe !== undefined && f.absent !== undefined && f.absent.test(flatten(f.antiProbe))) {
      console.error(`[finding-sites] self-test: ${f.id}'s pattern matches the CORRECTION.`);
      return false;
    }
    if (f.absent === undefined && f.present === undefined) {
      console.error(`[finding-sites] self-test: ${f.id} has neither an absent nor a present check.`);
      return false;
    }
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

// COUNT WHAT WAS ACTUALLY READ. Summing `sites.length` included any path
// excluded as a record, so "all closed" would have covered sites the sweep
// never opened. True today because no entry lists one; false the first time one
// does, which is the kind of statement that decays silently.
let checked = 0;
let excluded = 0;
for (const f of FINDINGS) {
  for (const site of f.sites) {
    if (RECORD_FILES.some((r) => r.test(site))) excluded += 1;
    else checked += 1;
  }
}
console.log(
  `[finding-sites] OK: ${FINDINGS.length} multi-site finding(s), ${checked} site(s) checked` +
    `${excluded > 0 ? `, ${excluded} excluded as records` : ""}, all closed ` +
    `(detector self-tested in both directions).`,
);
