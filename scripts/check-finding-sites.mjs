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
    id: "H09b-TEST-SCHEMA",
    what: "a package whose integration suite TRUNCATEs shared tables must run the schema-per-run globalSetup, or `search_path` stays at `public` and the suite truncates the developer's real database",
    // A ROW RATHER THAN A THIRTEENTH GUARD, and L2 ruled it that way for the
    // reason this register exists: the two sites below are ALREADY the sites of
    // `H09a-VITEST-ALIAS`, this file already self-tests in both directions, and
    // the shape is verbatim the one it is for - a convention holding at one site
    // of two.
    //
    // IT IS NOT THE SHAPE `assert-no-skipped-integration.mjs` WAS WIDENED FOR,
    // and the distinction is the whole reason this needs its own row. That guard
    // covers "a green CI is not evidence a package RAN" - silence. Here the
    // suite RAN, against `public`: `apps/publisher`'s integration suite read
    // `ZR_TEST_SCHEMA` to scope itself while its vitest config declared no
    // `globalSetup`, so the variable was never set and `beforeEach` truncated
    // four real tables. The failure is not silence, it is a truncated developer
    // database plus five fabricated snapshots left behind for a local publisher
    // to publish a drain from. Same origin as the alias row - a new suite joins
    // the workspace without inheriting a convention every existing member has -
    // and a different failure mode.
    //
    // Verified before writing this: no other guard reads a vitest config for
    // `globalSetup`, so deleting the line that fixed it could not have failed
    // anything.
    //
    // ONE RESIDUAL, WRITTEN DOWN RATHER THAN DESIGNED AGAINST. The publisher's
    // entry points across apps at `../indexer/test/global-setup.ts`. A MOVED
    // file fails loudly, which is fine; a change to the indexer's schema
    // convention that silently does not apply to the publisher is what this row
    // cannot see.
    present: /globalSetup:/,
    // A config with the alias map and no globalSetup - the real pre-fix state of
    // `apps/publisher/vitest.config.ts`.
    probe: 'test: { include: ["src/**/__tests__/**/*.test.ts"], environment: "node", globals: false },',
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
    // PROBED AT GATE ROUND 6, HAVING SHIPPED WITHOUT ONE. The self-test's old
    // form skipped a row with no `probe` in silence and still printed "detector
    // self-tested in both directions", so this row's `absent` had never been
    // driven against any text at all - a self-test that under-covers its own
    // rule, which is the shape LEDGER-09a Q3 names. The loop now fails on a
    // probeless member, and this is the value it demanded.
    probe: "the fee band is twelve times the absolute allowance at k = 1",
    antiProbe: "the fee band is 6.25 times the absolute allowance at k = 2",
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
    // Probed at gate round 6, having shipped without one - see the loop below.
    probe: "with two candidates in range, two grade MEDIUM and the rest LOW",
    antiProbe: "with two candidates in range, a rival puts the match in the LOW clause by itself",
    // THE SECOND SITE WAS `legacy/dashboard/src/components/CandidatesPanel.tsx`
    // AND IT WAS RETIRED, NOT SILENTLY DROPPED. HANDOFF-11 section 1 deletes
    // `legacy/dashboard`: the two v0.2 Vercel projects were removed on 23 Aug
    // 2026 and nothing has deployed it since, so the retirement is a `git rm`.
    // The finding was CLOSED at that site before it went - the row is kept with
    // its remaining site so the record of what was fixed survives the file, and
    // a site list that named a deleted path would fail this guard as "missing",
    // which is the right behaviour and the reason this note exists rather than
    // a quiet edit.
    sites: ["apps/indexer/src/analysis/echo.ts"],
  },
  {
    id: "R3-ROWS",
    what: "the /track fixture row count, stated as a literal where it went stale three times",
    absent: /twelve (real|committed) rows/i,
    // Probed at gate round 6, having shipped without one - see the loop below.
    probe: "the fixture holds twelve committed rows and the panel renders them all",
    antiProbe: "the fixture's length is the count, so no literal can go stale here",
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
    // FIVE, THEN SEVEN, THEN ELEVEN, THEN TWELVE, THEN THIRTEEN, THEN FOURTEEN,
    // THEN SIXTEEN, NOW SEVENTEEN.
    // This entry tracks the CURRENT count rather than one correction: the shape
    // recurs every time a guard is added, which is exactly what makes it worth a
    // register row instead of a review. Each widening moves `present` and pushes
    // the superseded count into `absent`. The twelfth was
    // `check-instrument-deps.mjs` (HANDOFF-09a), the thirteenth
    // `check-nav-routes.mjs` (HANDOFF-04a) and the fourteenth
    // `check-svg-text-floor.mjs` (HANDOFF-04b), and this row has now earned its
    // keep on three commits running: at twelve it told a session that had
    // updated CLAUDE.md about README.md and ci.yml, and at thirteen and again at
    // fourteen it held the same three sites to the same standard without anyone
    // having to remember them.
    //
    // FIFTEEN AND SIXTEEN NEVER REACHED THIS ROW AT ALL, which is how the hole
    // below stayed open: HANDOFF-12 added `check-capture-consistency.mjs` and
    // `check-compose-zebra-tag.mjs` and moved CLAUDE.md's count to sixteen
    // without advancing `present`, and the row stayed green anyway for the
    // reason the next paragraph gives. Seventeen is `check-config-defaults.mjs`
    // (HANDOFF-13).
    //
    // THE `absent` ARM GAINS THE SUPERSEDED COUNT, NOT A MENTION OF THE NUMBER.
    // CLAUDE.md's ledger rules quote measurements over the guard population -
    // "three of its thirteen guards have shipped with a self-test that certified
    // a hole" - and a pattern hunting for the bare word would fire on prose
    // doing its job, which is the loose-pattern failure recorded for
    // `check-infra-docs`. Only the phrasings that ASSERT the current count are
    // forbidden.
    // THE OPTIONAL `(static )?` WAS THE HOLE, AND THE ROW WROTE ITS OWN WARNING
    // ABOUT THE MIRROR IMAGE OF IT ONE PARAGRAPH ABOVE. With `static` optional,
    // this pattern was satisfied at `CLAUDE.md` by the ledger-rule sentence
    // "three of its fourteen guards have shipped with a self-test that
    // certified a hole" - PROSE ABOUT THE GUARD POPULATION, not an assertion of
    // the current count. So the row stayed green for two handoffs while
    // CLAUDE.md asserted sixteen, `.github/workflows/ci.yml` asserted FOURTEEN
    // and `README.md` asserted fourteen: the tree contradicted itself about a
    // checkable fact at three of four asserting sites, and the guard that
    // exists to prevent exactly that could not see it.
    //
    // The docblock above already forbids this shape for the `absent` arm - "a
    // pattern hunting for the bare word would fire on prose doing its job" -
    // and the `present` arm was left open to the same error running the other
    // way. `static` is now REQUIRED, which is what all four asserting sites
    // write and what no measurement sentence writes.
    present: /seventeen static guards/i,
    probe: "# THE SIXTEEN STATIC GUARDS RUN BEFORE INSTALL AND BUILD, on purpose.",
    antiProbe: "# THE SEVENTEEN STATIC GUARDS RUN BEFORE INSTALL AND BUILD, on purpose.",
    absent: /five static guards|the five guards|five guards OK|seven static guards|the seven guards|seven guards OK|FOUR STATIC GUARDS|SEVEN STATIC GUARDS|eleven static guards|the eleven guards|eleven guards OK|ELEVEN STATIC GUARDS|twelve static guards|the twelve guards|twelve guards OK|TWELVE STATIC GUARDS|thirteen static guards|the thirteen guards|thirteen guards OK|THIRTEEN STATIC GUARDS|fourteen static guards|sixteen static guards/i,
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
    // Same retirement as R2-GRADE above, and this row is the more interesting
    // case: the finding's whole point was that `legacy/dashboard`'s
    // `parsers.ts` coerced an unknown record into an inert `time_window`, so
    // the conservation arm was UNREACHABLE there and no reader ever saw the
    // defect. Deleting the app closes it by removing the code, which is a
    // stronger close than the fix was.
    sites: ["handoffs/HANDOFF-08-analysis-toolkit.md"],
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
  {
    // FIFTH INSTANCE OF "A CORRECTED FACT LANDING AT SOME OF ITS SITES", AND THE
    // FIFTH WAS COMMITTED INSIDE THE FIX FOR THE FOURTH (gate round 5). Round 4
    // rewrote section 8.1's four rows so none names a handoff, wrote twenty-two
    // lines of prose ending "a condition does not decay, which is why all four
    // now name one", swept the integration test's comment to past tense - and
    // left the sentence INTRODUCING the table three lines above it still
    // mandating an owner, plus `chain-inputs.ts`'s restatement still in the
    // present tense, in a file that same commit edited fifty lines higher.
    // Its section 7 said "Swept:". The register row is what makes the next
    // sweep's completeness a check rather than a claim.
    id: "H09b-ABSENCE-CONDITION",
    what: "a null panel renders as a named absence stating a CONDITION, never an owner - gate round 4 rewrote SNAPSHOT.md section 8.1's rows and left two sites still naming an owner",
    // THE THIRD ALTERNATIVE IS THE DATA HALF, AND ROUND 5 SHIPPED WITHOUT IT
    // (gate round 6). The first two alternatives match the SENTENCES round 5
    // happened to fix, so reverting those sentences turned the guard red and it
    // was called two-polarity evidence. It was not. Executed by round 6:
    // restoring the round-3 TABLE ROWS verbatim - `drain: not measured - needs a
    // block-time source (HANDOFF-09b)`, the actual rendering string the rule
    // forbids - left the guard GREEN. That is the exact failure CLAUDE.md's
    // data-mutation rule names: a fail side chosen from the code rather than
    // from the set the predicate claims to exclude. Seven of eight paraphrases
    // ("naming its owner", "carrying the handoff that owns it") also passed.
    //
    // So alternative one is widened over the phrasing, and alternative three
    // matches the OBJECT: a table cell pairing "not measured" with a HANDOFF
    // reference. It is anchored on the cell pipe so that section 8.1's own
    // HISTORICAL quotation of that string in running prose - "would have told a
    // visitor ... 'needs a block-time source (HANDOFF-09b)'" - is not a hit,
    // which is the distinction `H09-WALLET-BOUND`'s comment says a bare phrase
    // match cannot draw.
    //
    // AND THE RESIDUAL IS STATED RATHER THAN CLAIMED AWAY. Driven over eight
    // paraphrases, the phrasing arm now catches seven; the eighth - "a named
    // absence that names the handoff responsible" - uses no owner-word at all
    // and is beyond any phrase match that does not also fire on ordinary prose
    // about handoffs. THE DATA ARM IS THE ONE THAT DOES NOT DEPEND ON PHRASING:
    // whatever sentence a future session writes about the rule, the thing that
    // reaches a visitor is the rendering string, and the third alternative
    // matches that. A reader should trust this row for the object and treat the
    // phrasing arms as a convenience.
    absent:
      /named absences?(?:(?!\b(?:never|not|no|nor|rather than|instead of|forbids|forbidden|without)\b)[^.,;]){0,48}\b(owner|owns it|owning)\b|8\.1 makes that null render as|\|\s*`[^|`]{0,60}not measured[^|`]{0,90}\(?HANDOFF-\d/i,
    probe: "It renders a **named absence carrying its owner**:",
    // A SECOND PROBE, DRAWN FROM THE EXCLUSION SET RATHER THAN FROM THE PROSE.
    // This is the value the guard was green on when it shipped.
    // BYTE-VERBATIM FROM `docs/2.0/SNAPSHOT.md` AT `73ea340`, line 329, which is
    // where this defect actually stood until `923372e` removed it - recovered
    // with `git show` rather than retyped. The first version of this key used an
    // ASCII hyphen where the file used an em dash, which is exactly the gap
    // between "a sentence resembling the defect" and "the defect".
    dataProbe: "| `drain` | `drain: not measured \u2014 needs a block-time source (HANDOFF-09b)` |",
    antiProbe: "It renders a **named absence stating the CONDITION that produced it**:",
    sites: [
      "docs/2.0/SNAPSHOT.md",
      "apps/publisher/src/sources/chain-inputs.ts",
      "apps/publisher/src/__tests__/snapshot-inputs.integration.test.ts",
      "handoffs/README.md",
      "handoffs/HANDOFF-11-live-wiring.md",
      // THE SEVENTH SITE, FOUND BY GATE ROUND 7 INSIDE THE FIX FOR THE SIXTH.
      // A supersession blockquote in 09a stating what is operative NOW -
      // "permits a named absence carrying its owner", present tense - which the
      // guard's own self-test settles as an ASSERTION rather than a record,
      // because the RECORD exclusion is pinned so it cannot widen to handoffs.
      "handoffs/HANDOFF-09a-estimator-package.md",
      // HANDOFF-09b IS DELIBERATELY NOT A SITE, AND THAT IS A STATED LIMIT
      // RATHER THAN AN OVERSIGHT. Its §1 carried the assertion and is fixed;
      // its §7 must NARRATE the defect, quoting the forbidden phrase, and
      // `absent` cannot tell an assertion from a report of one - which is the
      // limit `H09-WALLET-BOUND`'s comment states about this whole mechanism.
      // Registering the file would make the guard fight its own write-back.
      // So §1 is corrected and unguarded, and the next session is told so here
      // rather than left to infer it from a green run.
    ],
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
  return (
    src
      // STRUCK TEXT IS NOT AN ASSERTION, AND THIS PROJECT'S AMENDMENT CONVENTION
      // DEPENDS ON THAT (gate round 6). LEDGER-10 Q5 says a rule whose premise
      // changed is amended IN PLACE rather than deleted, "because a rule whose
      // premise changed is one the next session obeys for the wrong reason
      // unless the change is visible" - so `~~the old rule~~` beside the new one
      // is the correct shape, and a guard that fires on it would force the
      // deletion the convention exists to prevent. `~~` is markdown's own marker
      // for superseded, which makes this a rule about the document rather than a
      // special case: what is struck is not in force, so it is not a site
      // stating the old answer.
      //
      // LINE-SCOPED AND TILDE-FREE, BECAUSE THE FIRST FORM WAS `~~[\s\S]*?~~`
      // AND AN ODD NUMBER OF MARKERS INVERTS IT (gate round 7). Pairing runs
      // 1-2, 3-4, so one stray marker re-pairs every span and the guard then
      // eats the COMPLEMENTS - the prose BETWEEN the strikes. Measured on
      // `handoffs/README.md`: 229 characters stripped clean, 16,269 with one
      // stray marker added, 80.3% of the file invisible to every register row.
      // Not hypothetical: THIS FILE carries five `~~` markers, an odd count,
      // produced by the act of explaining the convention. GFM strikethrough
      // does not span a blank line, so scoping to one line with no interior
      // tilde costs nothing real and removes the inversion.
      .replace(/~~[^~\n]*~~/g, " ")
      .replace(/^\s*(\/\/|\*)\s?/gm, " ")
      .replace(/\s+/g, " ")
  );
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
    // EVERY MEMBER MUST CARRY AT LEAST ONE PROBE, AND THE LOOP FAILS NAMING THE
    // ONE THAT DOES NOT (LEDGER-09a Q3, enforced here at gate round 6). The
    // guard on the next line used to be `if (f.probe !== undefined)`, so a row
    // added WITHOUT a probe was skipped in silence and the run still printed
    // "detector self-tested in both directions" - a self-test that under-covers
    // its own rule, which is the exact shape the ledger rule names. Measured: a
    // row with `absent` and no `probe` printed OK at 16 findings while one row
    // had never been driven against any text.
    if (f.probe === undefined && f.dataProbe === undefined) {
      console.error(
        `[finding-sites] self-test: ${f.id} carries no probe, so its pattern has never been ` +
          "driven against the defect it names. Every register entry needs one.",
      );
      return false;
    }
    // BOTH PROBES, AND `dataProbe` IS THE ONE THAT MATTERS. `probe` is drawn
    // from the PROSE a fix happened to touch; `dataProbe` is drawn from the set
    // the predicate claims to exclude - an actual forbidden value. Round 5
    // shipped this register's newest row with only the first kind, and
    // reverting the two sentences it was written from turned the guard red,
    // which was mistaken for two-polarity evidence. It was not: restoring the
    // real forbidden TABLE ROWS left the same guard green.
    //
    // DRIVEN DIRECTLY, NOT THROUGH `openSites` (gate round 7). Routed through
    // `openSites` a probe counted as "matched" if `absent` fired OR `present`
    // was merely MISSING - so for the seven rows carrying a `present` check the
    // pattern was never driven at all, and the literal string "banana" passed
    // every one of them while the run printed "self-tested in both directions".
    // The loop written to close an under-covering self-test was itself under-
    // covering, for 7 of 15 rows. Each pattern the row carries is now asserted
    // on its own terms.
    for (const [kind, text] of [["probe", f.probe], ["dataProbe", f.dataProbe]]) {
      if (text === undefined) continue;
      const flat = flatten(text);
      if (f.absent !== undefined && !f.absent.test(flat)) {
        console.error(
          `[finding-sites] self-test: ${f.id}'s ABSENT pattern does not match the ${kind} - the defect it names.`,
        );
        return false;
      }
      if (f.present !== undefined && f.present.test(flat)) {
        console.error(
          `[finding-sites] self-test: ${f.id}'s ${kind} satisfies its PRESENT check, so it is not the defect.`,
        );
        return false;
      }
    }
    // WHAT THIS DOES NOT DO, STATED SO A GREEN RUN IS NOT READ AS WIDER THAN IT
    // IS: for a row carrying ONLY a `present` check, the `probe` field is not
    // load-bearing and cannot be. The defect such a row describes is text that
    // is MISSING, so any string lacking that text is a valid probe - the literal
    // "banana" is - and no held string can discriminate the pattern. The real
    // evidence for those rows is the site drive below, which deletes the
    // corrected text from the actual file. The probe is kept as documentation of
    // the defect's shape, and it is documentation rather than a test.
    //
    // AND AN `antiProbe` IS REQUIRED WHERE AN `absent` PATTERN EXISTS, which is
    // the asymmetry `check-infra-docs.mjs` closed in the same commit that left
    // this open: a row with no antiProbe has nothing showing its pattern does
    // not also match the CORRECTION, which is how three structural entries once
    // shipped matching the docblocks explaining their own fix.
    if (f.absent !== undefined && f.antiProbe === undefined) {
      console.error(
        `[finding-sites] self-test: ${f.id} has an absent pattern and no antiProbe, so nothing ` +
          "shows it does not also match the correction.",
      );
      return false;
    }
    // AND EACH ROW IS DRIVEN AGAINST ITS OWN REAL SITES, NOT ONLY AGAINST A
    // STRING THIS FILE HOLDS (L2's ruling on PR #46, gate round 7). A probe
    // checked in isolation proves the pattern matches a sentence somebody wrote
    // into the self-test; it does not prove the pattern fires on that defect
    // sitting in the file it is supposed to police, which is the only claim a
    // green run makes. The two kinds of row need opposite perturbations:
    //
    //   `absent`  the defect is text that must not be there, so the probe is
    //             SPLICED INTO the real file and the row must report that site.
    //   `present` the defect is text that is MISSING, so the corrected text is
    //             DELETED from the real file and the row must report that site.
    //
    // The second half is why this matters beyond tidiness. A `present` row
    // cannot be driven by a held string at all: any string that merely lacks
    // the required text satisfies the old check, and the literal "banana"
    // passed all seven `present`-bearing rows. Only the real file can carry the
    // difference between "this text is missing" and "this is not the file".
    for (const site of f.sites) {
      if (RECORD_FILES.some((r) => r.test(site))) continue;
      const real = read(site);
      if (real === null) {
        console.error(`[finding-sites] self-test: ${f.id}'s site ${site} does not exist.`);
        return false;
      }
      if (f.absent !== undefined) {
        const defect = f.dataProbe ?? f.probe;
        const perturbed = `${real}\n${defect}\n`;
        if (openSites({ ...f, sites: [site] }, () => perturbed).length === 0) {
          console.error(
            `[finding-sites] self-test: ${f.id} does not fire on ${site} with its own defect ` +
              "text spliced in - the pattern matches the probe in isolation and not the real file.",
          );
          return false;
        }
      }
      if (f.present !== undefined) {
        // STRIPPED IN THE SPACE THE MATCH HAPPENS IN, AND WITH THE ROW'S OWN
        // FLAGS. Two malformed drafts of this loop, both reported rather than
        // quietly redone, because each read as a defect in the row it was
        // testing: the first rebuilt the regex as `new RegExp(source, "g")` and
        // dropped the `i`, so a capitalised match survived; the second stripped
        // the RAW file while `openSites` matches the FLATTENED one, so a phrase
        // that only forms after comment-prefix stripping - "number of\n *
        // crossings" in `migration-lens.ts` - could not be removed and the row
        // looked inert. Strip where the guard looks.
        const all = f.present.flags.includes("g") ? f.present.flags : `${f.present.flags}g`;
        const stripped = flatten(real).replace(new RegExp(f.present.source, all), "");
        if (stripped === real) {
          console.error(
            `[finding-sites] self-test: ${f.id}'s present pattern does not match ${site} at all, ` +
              "so deleting it changes nothing and the row proves nothing about that site.",
          );
          return false;
        }
        if (openSites({ ...f, sites: [site] }, () => stripped).length === 0) {
          console.error(
            `[finding-sites] self-test: ${f.id} does not fire on ${site} with its corrected text ` +
              "deleted, so nothing shows the row would notice that site regressing.",
          );
          return false;
        }
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
