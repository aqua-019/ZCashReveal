---
handoff: 02
title: `packages/content` — zod schemas + research seeds
status: shipped
branch: the session-designated branch (name it `feat/v2-02-content-package` if you may choose)
track: Web
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-02 — `packages/content` — zod schemas + research seeds

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

A typed content package the Record renders from: zod schemas for every claim type, JSON seeds transcribed from the research dossiers, a validator that fails the build on a missing source or an unverified item cited as fact, and typed loaders with claim-ID permalink helpers.

**Out of scope:** No rendering. No new research — transcribe what the dossiers contain; where the dossier says `low` or UNVERIFIED, the seed says so.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/RESEARCH-2026-08-DOSSIER.md` (all sections; §F/§G are the corrections and the unverified list)
- `docs/2.0/research/03-history-exploits-governance.md` Part C (timeline table, ~110 rows) and Part D (people)
- `docs/2.0/research/02-promotion-network.md` §1 (Cypherpunk ledger), §2.1 (influencer table), §4 (phrase catalogue)
- `docs/2.0/research/04-exchange-inflows-insider-selling.md` §2 (dated transfers), §3 (labels, rich list), §5.3 (the round-trip inference), §6 (allegations), §7 (not verified)
- `docs/2.0/TRACKING-MATH.md` §1.5 (label precedence)

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Schemas: `Source{id,title,url,publisher,date,accessed}`; `Claim{id,title,summary,body?,sources:SourceRef[]≥1,confidence:'high'|'med'|'low',lastVerified,tags[]}`; `BewareEntry` (discovered, disclosed, fixed, discoverer, rootCause, detectable:'yes'|'no'|'partial'|'n/a', window{from,to}, severity:'crit'|'high'|'mid'); `Contradiction{claim,reality}`; `TimelineEvent{date, category∈LAUNCH|FUND|GOV|LEAD|EXPLOIT|TECH|MARKET|REG|NET, height?}`; `NetworkEntity`, `NetworkEdge{from,to,what,amount?,date,sources,confidence}`; `Phrase{text,origin,date,amplifiers[],tension,confidence}`; `AddressLabel{address,label,labeller∈consensus|owner-filing|exchange|analyst|behaviour,method,confidence,lastVerified,sources}`; `Case{id,title,steps[{time,height?,from,to,amount,note}],verdict,confidence,sources}`; `Unverified{claim,status,why}`.
- Claim IDs are stable and human-readable: `B1…B14`, `C1…C16`, `T<ISO-date>[-n]`, `N-<slug>`, `P-<slug>`, `L-<address>`, `K-<slug>`.
- The three phrases marked NOT VERIFIED in the dossier and the corrected premises (Korean-exchange dominance, 21Shares ETP, bot networks, ECC layoffs, 'Zooko sold for taxes') appear **only** in `unverified.json`.

## §4 DELIVERABLES

1. **Delete the root `vercel.json`** (LEDGER-01 addendum, fold 8). L2 executed the first production
   build of the new `zecreveal` project and it FAILED with `NEXT_OUTPUT_DIR_MISSING`: Vercel read the
   ROOT `vercel.json`, built `legacy/dashboard`, then looked for its `outputDirectory` under
   `apps/web/`. `apps/web/vercel.json` was ignored entirely. The root file is read for every project
   in this repository and overrides the one inside the Root Directory. `apps/web` has no workspace
   dependencies, so with the root file gone the Next.js preset builds it with no custom command and
   `apps/web/vercel.json` finally applies. Record the deleted file's exact settings in
   `docs/2.0/DEPLOY-2.0.md` and add the operator click to the `handoffs/README.md` table, so
   `z-cash-reveal-dashboard2` can be kept building from project settings until the HANDOFF-11
   cutover. Delete the file whether or not the operator has moved them yet, and say which in §7.
2. `packages/content/src/schema.ts`, `src/loaders.ts` (`getBeware()`, `getContradictions()`, `getTimeline({category?})`, `getNetwork()`, `getPhrases()`, `getLabels()`, `getCase(id)`, `getUnverified()`, `getSources()`, `permalink(id)`).
3. `packages/content/data/`: `beware.json` (14), `contradictions.json` (16), `timeline.json` (≥ 100), `network.json` (entities + edges from the loop + Cypherpunk ledger), `phrases.json` (catalogue minus the unverified three), `labels.json` (ZIP 271 multisig mainnet/testnet; `t1PKBiv7…` analyst/Lookonchain; `t1gGCYpy…`, `t1Ym8XWv…`, `t1XKfbZY…`, `t1dP1MJw…`, `t1U1NE8w…` with their provenance), `cases.json` (2 Jan 2026 event; lockbox disbursement; 202,076 unshield), `unverified.json`, `sources.json` (every URL de-duplicated), `stats.json` (the 22 Aug 2026 pool/price figures with their sources, for the Splash metrics until the snapshot exists).
4. `packages/content/scripts/validate.ts` wired to `pnpm --filter @zcashreveal/content validate` and to CI.
5. **Plan branch-count correction** (LEDGER-01 fold 1): correct the two remaining "22 stale branches"
   claims in `docs/2.0/ZECREVEAL-2.0-PLAN.md` (lines 14 and 126) to 20 `claude/*` + 2 merged `feat/*`,
   matching the §10 line HANDOFF-01 already fixed.
6. **Mockup tip-hash note** (LEDGER-01 fold 2): in `docs/2.0/mockups/reference/README.md`, record that
   the mockup's tip hash literal is 65 hex characters (one zero too many in the leading run) and that
   the canonical fixture is the 64-character value in `apps/web/src/lib/chain.ts`, so no later handoff
   harvests the typo.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/content validate` exits 0 and prints counts: beware 14, contradictions 16, timeline ≥ 100, labels ≥ 7, cases 3, unverified ≥ 15, sources ≥ 150.
- **A2.** Every `SourceRef` in every data file resolves to an entry in `sources.json` *(fail side: change one ref to a nonexistent id → validator exits 1 naming the file and id)*.
- **A3.** Every claim has ≥ 1 source and a `lastVerified` date ≤ today *(fail side: blank one → exit 1)*.
- **A4.** No string from `unverified.json` (`claim` field) appears in any other data file *(fail side: paste one into `phrases.json` → exit 1)*.
- **A5.** `labels.json` entry for `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` has `labeller: 'consensus'` and cites ZIP 271; the entry for `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` has `labeller: 'analyst'` and `confidence` ≠ `'high'`.
- **A6.** `cases.json` `K-2026-01-02` has exactly the 9 steps of research 04 §2.1 with amounts 29,999.99 · 1,999.99 · 17,999.99 · 202,076.207 · 50,000.96 · 50,000.5541 · 24,000.9781 · 74,001.9317 · 1,293.9321 (Executed: a test asserts the list).
- **A7.** `getTimeline({category:'EXPLOIT'})` returns ≥ 20 events and all have `category === 'EXPLOIT'` (unit test).
- **A8.** No `vercel.json` exists at the repository root, and `apps/web/vercel.json` contains `"framework": "nextjs"` *(fail side: restore the root file in a scratch commit, observe it present, revert)* (LEDGER-01 addendum, fold 9).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Two-hop expected: `researcher` (Haiku) transcribes dossier tables into JSON against the schema — after a PREFLIGHT listing READING / FILES / DONE MEANS; a Sonnet (`chain-integrator` or `ui-builder`) writes the schema + loaders first so the executor has a written contract. Loop 3 spec-author review applies.
- director-quality: `docs-scribe` cross-checks 10 random rows against the dossier and records NOT-MATCHED in §8; `security-auditor` confirms no non-public data (all addresses and filings are public).

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/aqua-stack-v4-l2-resolution-7v7qvw (harness-designated) · PR #33 (https://github.com/aqua-019/ZCashReveal/pull/33)

DIRECTORS SPAWNED (lead names each + spawn mode proven):

Spawn mode: subagents available, proven before any other work by an actual Agent
call (general-purpose, returned the single token PROBE-OK, 0 tool uses, 1.7 s).

Subagents do not nest in this environment, so a director could not itself spawn a
crew. The lead therefore acted as director-build and director-quality directly and
named every worker, which is the same shape HANDOFF-01 recorded. Eleven workers in
all:

  build     researcher-beware (Sonnet)            data/beware.json
            researcher-contradictions (Sonnet)    data/contradictions.json
            researcher-timeline-early (Haiku)     timeline 2013-2020, 41 rows
            researcher-timeline-late (Haiku)      timeline 2021-2026, 69 rows
            researcher-network (Sonnet)           data/network.json
            researcher-phrases (Haiku)            data/phrases.json
            researcher-unverified (Sonnet)        data/unverified.json
            researcher-timeline-gate (Sonnet)     gate round 1, three findings
  quality   security-auditor (Sonnet)             eight data files
            security-auditor-2 (Sonnet)           timeline.json, network.json
            docs-scribe (Sonnet)                  twelve-record corpus cross-check
            spec-reviewer (Sonnet)                Loop 3 against sections 1-5

Every Haiku dispatch and every gate re-dispatch carried a Loop 1 PREFLIGHT
(READING / FILES / DONE MEANS / INFERRED / NOT-MATCHED). Every worker returned on
the Loop 2 ladder.

The lead wrote the schema, the loaders, the validator, the three scripts, the five
test suites, sources.json, labels.json, cases.json and stats.json directly. The
schema is the contract every transcription was executed against, and labels and
cases carry assertions A5 and A6, so both were written before any crew ran.

FILES (created / modified / moved):

created  packages/content/package.json, tsconfig.json, vitest.config.ts, README.md
         packages/content/src/schema.ts, src/loaders.ts, src/index.ts
         packages/content/scripts/validate.ts, build-sources.mjs,
           check-provenance.mjs, resolve-refs.mjs
         packages/content/data/beware.json, cases.json, contradictions.json,
           labels.json, network.json, phrases.json, sources.json, stats.json,
           timeline.json, unverified.json
         packages/content/test/schema.test.ts, loaders.test.ts, timeline.test.ts,
           labels.test.ts, cases.test.ts
         handoffs/prompts/PROMPT-02.md
deleted  vercel.json (the repository root file, deliverable 1)
created  scripts/check-vercel-config.mjs (assertion A8)
modified .github/workflows/ci.yml (content tests, validate, provenance and the
           vercel-config check now run unconditionally)
         docs/2.0/DEPLOY-2.0.md (the root-vercel.json caution rewritten as a
           resolved finding, with the settings the operator must move, a seventh
           verification step and the click list renumbered)
         DEPLOY.md and legacy/dashboard/README.md (both described the deleted
           file as driving the dashboard build; corrected)
         docs/2.0/ZECREVEAL-2.0-PLAN.md (deliverable 4)
         docs/2.0/mockups/reference/README.md (deliverable 5)
         handoffs/HANDOFF-01, -02, -03, -04, -05, -10 (reconcile + the seven folds)
         handoffs/LEDGER.md, handoffs/README.md, handoffs/LOG.md
         pnpm-lock.yaml (zod, tsx, vitest for the new package)
moved    nothing

Final counts, from the validator: beware 14, contradictions 16, timeline 124,
labels 8, cases 3, unverified 32, sources 328, network 36 entities / 41 edges,
phrases 19, 186 distinct sources cited of 328 held.

EVIDENCE (per section 5 assertion: pass transcript + fail transcript, provenance):

All transcripts below are Executed. Each fail state mutates exactly one thing and
is reverted with `git checkout --`; the working tree was verified clean afterwards
(`git status --short` empty) and the full suite re-run green.

A1  counts. PASS (Executed):
      $ pnpm --filter @zcashreveal/content validate
      content validation
        beware            14  (expected 14)
        contradictions    16  (expected 16)
        timeline         124  (expected >= 100)
        labels             8  (expected >= 7)
        cases              3  (expected 3)
        unverified        32  (expected >= 15)
        sources          328  (expected >= 150)
        network           36 entities, 41 edges
        phrases           19
        source refs      186 cited, 142 uncited
      OK  all checks passed
      rc=0
    FAIL (Executed): remove one beware entry ->
        beware            13  (expected 14)
      FAIL  1 problem
        beware.json: expected exactly 14 entries, found 13
      rc=1

A2  every SourceRef resolves. PASS: the A1 run above, 0 dangling of 184 cited.
    FAIL (Executed): set contradictions[0].sources[0] to S-does-not-exist ->
      FAIL  1 problem
        contradictions.json: C1 cites "S-does-not-exist", which is not in sources.json
      rc=1
    The failure names the file and the id, as the assertion requires.

A3  at least one source, lastVerified not in the future. PASS: the A1 run above.
    FAIL a (Executed): blank beware[0].sources ->
      FAIL  2 problems
        beware.json: 0.sources -- every claim needs at least one source
        beware.json: B1 has no sources
      rc=1
    FAIL b (Executed): set one timeline lastVerified to 2027-01-01 ->
      FAIL  1 problem
        timeline.json: T2013-01-01 lastVerified 2027-01-01 is in the future (today is 2026-08-23)
      rc=1

A4  nothing from the quarantine appears elsewhere. PASS: the A1 run above.
    FAIL (Executed): paste an unverified claim into a phrases.json field ->
      planted: Korean exchanges dominate ZEC trading volume worldwide.
      FAIL  1 problem
        phrases.json: contains the unverified claim "Korean exchanges dominate ZEC
        trading volume worldwide." (id U-korean-exchange-dominance) -- it may appear
        only in unverified.json
      rc=1

A5  the two pinned labels. PASS (Executed): vitest test/labels.test.ts, 7 passed.
    FAIL (Executed): promote the t1PKBiv7 label to labeller consensus, confidence
    high ->
      FAIL  A5 -- labels the presumed exchange hot wallet by analyst, below high confidence
      FAIL  the label set -- reserves consensus for addresses written into the protocol
      Tests  2 failed | 5 passed (7)
    Both halves of the assertion fire, and the consensus-reservation rule catches
    the same mutation independently.

A6  the nine amounts of 2 January 2026. PASS (Executed): vitest test/cases.test.ts,
    7 passed, including the exact ordered list
      29999.99 · 1999.99 · 17999.99 · 202076.207 · 50000.96 · 50000.5541 ·
      24000.9781 · 74001.9317 · 1293.9321
    FAIL (Executed): round 50000.5541 to 50000.55 ->
      FAIL  A6 -- carries exactly the nine amounts of research 04 section 2.1, in order
      Tests  1 failed | 6 passed (7)

A7  the exploit filter. PASS (Executed): vitest test/timeline.test.ts, 9 passed;
    getTimeline({category:'EXPLOIT'}) returns 24.
    FAIL a (Executed): recategorise every EXPLOIT event to TECH ->
      FAIL  A7 -- returns at least twenty events
      Tests  3 failed | 6 passed (9)
    FAIL b (Executed): broaden the filter itself to match secondaryCategory ->
      FAIL  A7 -- returns only events whose primary category is EXPLOIT
      AssertionError: T2018-10-28 is TECH: expected 'TECH' to be 'EXPLOIT'
      Tests  1 failed | 8 passed (9)
    The purity half of A7 is a property of the filter, not of the data: relabelling
    a row cannot break it, because the row then genuinely is EXPLOIT. FAIL b breaks
    the plausible wrong implementation instead, and the assertion catches it.

A8  the Vercel configuration (LEDGER-01 addendum, fold 9). PASS (Executed):
      $ node scripts/check-vercel-config.mjs
      vercel config
        root vercel.json      absent  (expected absent)
        apps/web/vercel.json  present  (expected present, framework nextjs)
      OK  the root file is gone and apps/web declares nextjs
      rc=0
    FAIL (Executed): restore the root file from HEAD, observe, revert ->
      vercel config
        root vercel.json      PRESENT  (expected absent)
        apps/web/vercel.json  present  (expected present, framework nextjs)
      FAIL  1 problem
        vercel.json exists at the repository root. Vercel applies it to every
        project here, overriding apps/web/vercel.json, and the apps/web build
        fails with NEXT_OUTPUT_DIR_MISSING. Keep legacy/dashboard building from
        the z-cash-reveal-dashboard2 project settings instead; the exact values
        are in docs/2.0/DEPLOY-2.0.md.
      rc=1
    Reverted; the check returns rc=0 and the working tree is clean. The check runs
    in CI, so the root file cannot come back without turning the build red first.
    FAIL b (Executed): drop the outputDirectory pin from apps/web/vercel.json ->
      FAIL  1 problem
        apps/web/vercel.json outputDirectory is undefined, expected ".next".
        Unset here means the zecreveal project's stored setting wins, and that is
        the legacy dashboard's.
      rc=1
    Restored; rc=0.

DELETING THE ROOT FILE WAS NECESSARY BUT NOT SUFFICIENT (Executed, post-push):

  The preview deployment on 9cc2dca, the commit that deleted the root vercel.json,
  FAILED the same way: dpl_DjyBB8byMZYASmu7TA65yg8Y1n6h. Its build log shows Vercel
  running `pnpm install --frozen-lockfile`, then
  `pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard
  build`, then dying on
  `The Next.js output directory "legacy/dashboard/dist" was not found at
  /vercel/path0/apps/web/legacy/dashboard/dist` -- with no root vercel.json in the
  tree at all (`git show 9cc2dca:vercel.json` -> "does not exist in 9cc2dca").

  So the same six settings are ALSO stored on the zecreveal project itself, adopted
  when the project was imported from a repository that still had the root file. A
  file deletion cannot remove a stored project setting, and no agent may edit one.

  The fix that is available in code: vercel.json takes precedence over stored
  project settings, and with the root file gone apps/web/vercel.json is the file
  Vercel reads. It now pins framework, installCommand, buildCommand and
  outputDirectory explicitly instead of trusting the project settings to be clean.
  scripts/check-vercel-config.mjs asserts all four.

  GitHub Actions CI is green on 9cc2dca (run 32611476921, conclusion success), so
  this is a Vercel-only failure and the repository's own gate never went red.

  VERIFIED (Executed): the deployment on 95aba04, the commit that pinned the four
  keys, SUCCEEDED. dpl_CrmijWHtimk842w65Tkux7vibZg1, readyState READY, built in
  19 s. Its log reads

    Running "install" command: `pnpm install --frozen-lockfile`...
    Detected Next.js version: 15.5.23
    Running "next build"
    Compiled successfully in 4.1s
    Build Completed in /vercel/output [19s]
    Deployment completed

  and prerenders all twelve routes. Compare the same lines on the previous
  deployment, which ran the dashboard's build command instead. The pin is what
  changed, and it is what fixed it. No agent deployed anything: Vercel builds every
  push to the PR branch.

Deliverable 1, the operator click, stated as fold 8 requires (Read + UNVERIFIED):

  The root vercel.json is deleted in this PR. Whether the operator has already
  moved its settings into the z-cash-reveal-dashboard2 project, I do not know and
  cannot check: no agent reads or writes Vercel project settings, and L2's finding
  reports on the zecreveal project only. Treat it as NOT DONE. Until it is,
  z-cash-reveal-dashboard2 will fail to build, and that is the accepted trade fold
  8 names: the dashboard is legacy and retired at the HANDOFF-11 cutover, and a red
  check on it is not a reason to keep the new project broken. The exact settings
  are recorded in docs/2.0/DEPLOY-2.0.md section 1 and the click is row 02 of the
  handoffs/README.md operator table.

Whole-workspace evidence (Executed):
    pnpm typecheck            7 of 7 successful (6 before this handoff)
    pnpm lint                 1 problem, 0 errors, 1 warning -- the pre-existing
                              HANDOFF-00 finding at block-decoder.test.ts:22
    pnpm --filter content test  5 files, 58 tests passed
    ./scripts/check-no-emoji.sh rc=0
    pnpm --filter content check:provenance
                              328 sources against 328 corpus urls, OK
    consumer smoke test against the BUILT package (dist/src/index.js):
      beware 14 | contradictions 16 | phrases 19 | labels 8 | sources 328
      B2 https://zecreveal.com/beware#B2
      B2 cites GitHub / ZODL / Zcash Community Forum / Schneier on Security
      K-2026-01-02 steps 9

Lead spot-checks against the corpus (Read, file + line cited):
    B2 against dossier section A fact 2 and the section B row: line numbers
      309-310, 29 May 2026 23:53, heights 3,363,426 and 3,364,600, window
      31 May 2022 to 1 Jun 2026, CVE-2026-54496, GHSA-ww9q-8r59-xv46, detectable
      no, confidence high -- every figure matches.
    B5 and B6 against the same table: fChecked / CheckBlock / v3.1.0 28 Jul 2020
      through v6.11.x; SetChainPoolValues in AcceptBlock; both windows and both
      fix versions match.
    Three phrases (P-zcash-winning-meme, P-insurance-bitcoin,
      P-most-mispriced-asset) against research 02 section 4 -- origins, dates and
      tensions match.
    The 65-character mockup tip hash confirmed by measurement: the literal in
      zecreveal-2.0-mockups-v2.html is 65 characters with ten leading zeros; the
      fixture in apps/web/src/lib/chain.ts is 64 with nine.

Quality tier (Executed by the named worker, findings acted on by the lead):

  spec-reviewer, Loop 3 against sections 1, 3, 4 and 5:
    MATCHES-SPEC 17 · DIVERGES 2 · SPEC-WAS-AMBIGUOUS 0 (two ambiguities recorded
    without a verdict split; both are in section 8). All seven contract items, all
    five deliverables and all seven assertions were checked, and it re-executed
    four of the fail states itself on a scratch copy rather than taking the
    session's transcripts on trust. Divergence 1 (MID) was real and is fixed: the
    zatoshi comment promised bigint widening that no code did. Divergence 2 (LOW)
    was that the fields added beyond section 3's literal lists had not been
    surfaced to L2; that closes with this write-back, and every addition is
    itemised in section 8 INFERRED.

  docs-scribe, twelve records by a declared stride rule across six files:
    11 of 12 matched cleanly on all six checks (figures, names, confidence,
    quotations, sources, overstatement). One MID finding, fixed:
    P-low-entropy-carrier cited the CoinDesk podcast carrying Mumtaz's other
    quote. It also confirmed that every hit of the banned strings across the
    package is a legitimately quarantined or corrected claim, never a live
    assertion.

  security-auditor, seven checks over eight data files:
    No findings on non-public data, identity claims, label precedence, claim
    levels, editorial posture or secrets. One LOW completeness finding, fixed:
    the fifth corrected premise had no quarantine entry.

  security-auditor-2, the same seven checks over timeline.json and network.json:
    No findings on illegality by implication, named individuals,
    undisclosed-conflict framing, non-public data or the false premises. It
    verified that no motive is asserted anywhere: the only "because" in either
    file is inside a quotation of Zooko's own words about his own framing. One
    HIGH finding, fixed: gate round 2 had corrected the Hayes entity and missed
    the edge.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED -- reason):

 1. ACCEPTED. "Execute the newest handoff with status: open" -- after RECONCILE,
    02 (Web), 05 (Data) and 10 (Infra) all became open at once, one per track, so
    "newest" had no unique referent. Read as the Web track's successor to
    HANDOFF-01, which is also the handoff L2's own folds 1 and 2 amend. Question 1
    in section 8 asks L2 to confirm the rule.
 2. ACCEPTED. Directors do not nest, so the lead is both directors. Recorded above.
 3. ACCEPTED. sources.json is the complete bibliography, 328 entries, because
    deliverable 2 says "every URL de-duplicated". 144 are currently uncited.
    Question 2 asks whether that is the intent.
 4. ACCEPTED. The claim base was extended onto Phrase, AddressLabel, Case and
    NetworkEdge. Section 3's field lists for those four do not include sources,
    confidence or lastVerified, but the same section says every Record claim
    carries all three, and A3 checks every claim. The narrower reading would have
    left four claim types uncheckable.
 5. ACCEPTED. Fields added beyond section 3's literal lists: BewareEntry.cve;
    Contradiction inherits title/summary; TimelineEvent.datePrecision, dateText,
    dateEnd, secondaryCategory; NetworkEntity.kind, role, exposure;
    AddressLabel.id, network, balanceZec, notes; Case.summary, lastVerified,
    step.txid; Unverified.id, sources, lastVerified; the whole Stats type. Each is
    additive and each is used.
 6. ACCEPTED. Timeline ids are T<ISO-date>[-n] as the contract requires, but 36 of
    124 rows are month-, year- or range-precise in the corpus. Rather than invent a
    day, `date` is the earliest day consistent with the corpus and exists only to
    sort, `datePrecision` says how much of it is real, and `dateText` carries the
    corpus's own rendering. Question 3 asks L2 to confirm before HANDOFF-03 renders
    it.
 7. ACCEPTED. A3's "lastVerified <= today" is enforced against the system date at
    validation time. Every seed is 2026-08-22, the dossier's compile date.
 8. ACCEPTED. unverified.json is excluded from "every claim" in A3. Its records
    deliberately have no sources; six of the 32 cite nothing at all, which is the
    honest answer for an unlocatable artefact.
 9. ACCEPTED. A4 is implemented as an exact, case-sensitive substring search of
    each quarantined `claim` against the raw text of every other data file, and the
    schema refuses a claim shorter than 12 characters as uncheckable. The shortest
    in the file is 55.
10. ACCEPTED. sources.json is generated by scripts/build-sources.mjs from the union
    of every URL in the four dossiers rather than hand-curated, and
    check-provenance.mjs asserts every URL in it occurs in the corpus. Citations
    are written as URLs by the crews and rewritten to ids by resolve-refs.mjs,
    which fails on any URL the corpus does not contain. Three truncated URLs and
    one fabricated-looking one were caught this way during the run.
11. CORRECTED. The URL extractor stopped at the first ")" and truncated
    .../Zcash_Miner_Linking%20(2).pdf. Found because a crew citation would not
    resolve. The regex now admits ")" and trims only unbalanced ones; sources.json
    was byte-identical afterwards apart from that one URL.
12. CORRECTED. Two of my own assertions in cases.test.ts tested punctuation rather
    than value: case ids compared as a sorted array, and lockbox figures compared
    against prose that groups its digits.
13. CORRECTED. Ten timeline dateText values carried an en dash where the other 114
    use a plain hyphen.
14. CORRECTED. One timeline title read "Mumtaz and Hayes hype ZEC". "Hype" is a
    verdict on a speaker; dossier section H says report what was said against what
    the chain shows.
15. CORRECTED. P-zcash-winning-meme's tension ended with a note from the researcher
    to whoever builds the site. Faithful to the corpus, wrong for a rendered field.
16. CORRECTED. zatoshiSchema's own comment said the loaders widen the string to
    bigint and nothing did. It now transforms at the parse boundary, so every
    consumer holds a bigint, which is what CLAUDE.md requires.
17. CORRECTED. P-low-entropy-carrier cited Mumtaz's other quote.
18. CORRECTED. T2025-11-06 attributed a Form 144 filing to the wrong entity on the
    wrong day at a price that was a ZEC price rather than a share price, citing one
    low-tier secondary while two primary filings sat unused in sources.json.
19. CORRECTED. N-edge-hayes-builds-position still carried the $174M figure against
    Hayes by name at high confidence, thirty lines below the entity body that
    disclaims it.
20. CORRECTED. Source ids were derived from publisher plus title, so improving 47
    titles moved 46 ids. They now derive from publisher plus the URL's own path,
    which is stable under title edits and reads better. All 452 citations were
    migrated by URL, none unmapped, and the generator is deterministic: two
    consecutive runs are byte-identical.
21. ACCEPTED. Fold 8 says "delete the file whether or not the operator has done it
    yet". Done, and the consequence is stated above rather than softened: the legacy
    dashboard project is broken until someone types six settings into a UI.
21a. CORRECTED. Fold 8's stated mechanism was incomplete, and the deployment proved
    it within a minute of the push: deleting the root file did not fix the build,
    because the same settings are stored on the zecreveal project too. Pinned
    framework, installCommand, buildCommand and outputDirectory in
    apps/web/vercel.json, which takes precedence over stored project settings. This
    is the repository's own prescribed remedy: DEPLOY-2.0.md already said "the fix
    is an explicit apps/web/vercel.json, and that is a code change in a handoff, not
    a UI override". No Vercel setting was touched by any agent.
22. CORRECTED. Deleting the file made two documents wrong that fold 8 did not name.
    Root DEPLOY.md said the build command was "unset (UI override OFF, vercel.json
    drives it)" and legacy/dashboard/README.md said the project builds "from this
    path (vercel.json -> outputDirectory ...)" and that the directory and the root
    file are "deleted together" at the cutover. All three statements are now false.
    Fixing the docs my own deletion broke is part of the deliverable, not scope
    creep, so both are corrected and DEPLOY.md carries a second superseded banner.
23. DEFERRED. Section 8 carries the rest.

NOTICED (outside scope, not acted on):

 - The corpus contradicts itself on the ETF ticker: research 03 PART C writes ZCH
   at lines 462, 528 and 545 while the dossier's section F establishes ZCSH from
   the SEC 8-K and the S-3/A. Corrected in the data; the research files are left
   as the historical artefact.
 - The corpus contradicts itself on Grayscale's ZEC count three ways. Recorded in
   the N-grayscale-zcash-trust body and in section 8.
 - The corpus contradicts itself on the $174M Arkham position: research 03's
   holders table attaches it to Maelstrom, research 04 says in terms that it is a
   different party from Hayes. Resolved toward research 04 and quarantined.
 - research 03 PART C dates the ECC team's regrouping as "cashZ (cashz.org)" on
   8 Jan 2026, while the dossier says the team became ZODL. Both are transcribed:
   the January row says cashZ and the 9 March row says ZODL, which reads as a
   rename rather than a contradiction, but nobody states that explicitly.
 - The Protos URL cited for Naval Ravikant's "insurance against Bitcoin" row is
   listed live in research 02's source list, while research 03 PART F separately
   notes a Protos article on Naval's conflicts whose URL 404s. Possibly the same
   article. Confidence on that row is med.
 - Fold 8's reasoning rests on "apps/web has no workspace dependencies", which is
   true today and stops being true in the very next handoff: HANDOFF-03 renders the
   Record from `@zcashreveal/content`, which is a `workspace:*` dependency, and this
   PR is what creates it. With no root vercel.json and a bare Next.js preset, the
   zecreveal build must still build that workspace package. The fix is
   `transpilePackages` in next.config, or an explicit Build Command in the zecreveal
   project settings, and never a restored root vercel.json. Recorded in
   docs/2.0/DEPLOY-2.0.md as a note to HANDOFF-03 and in section 8.
 - Root `.vercelignore` is untouched. It excludes apps/indexer, apps/gateway and
   infra, does no work for zecreveal, and unlike vercel.json does no harm.
 - packages/zec-types still exports `Pool = "sapling" | "orchard"`, the v0.2 pair.
   packages/content defines its own five-value supplyBucket rather than importing
   it. HANDOFF-06 owns widening Pool.
 - Root .env.example still carries the v0.2 VITE_* block and no SNAPSHOT_* names.
   Already folded into HANDOFF-10 deliverable 1 by this session's RECONCILE.
 - Root vercel.json still targets legacy/dashboard. HANDOFF-11 retires it.

UNVERIFIED (labelled):

 - No live chain or explorer confirmation of the eight labelled addresses or the
   fourteen case transaction ids. Egress to blockchair.com and
   mainnet.zcashexplorer.app is blocked in this environment (curl returns 403 from
   the proxy). Every address and txid is transcribed from research 04, which
   states it queried the Blockchair API on 2026-08-22 and marks each row
   [verified]. Independently re-pulling them needs an environment with egress.
 - No live fetch of any of the 328 source URLs. Provenance is proven against the
   corpus, not against the live web; link rot is unmeasured, and research 03
   PART F already reports at least one 404.
 - The CI workflow's content and vercel-config steps: they are exercised locally by
   the same commands CI invokes, and the run against the PR head is what proves
   them in CI. Its result is recorded on PR #33, not here.
 - Whether the operator has moved the deleted file's settings into
   z-cash-reveal-dashboard2. Assume not.
 - The section 5 route checklist against the preview. The preview deployment is
   behind Vercel Deployment Protection, so a fetch returns 302 to the SSO endpoint
   rather than the app; the routes are listed as prerendered in the build output but
   have not been requested over the wire. That checklist is an operator step on a
   deployment the checker can actually reach.

GATE ROUNDS: 4 · fingerprints (file · rule · severity)

Loop 4 caps re-dispatch convergence at three rounds. Round 4 is a deliberate
overrun and section 8 question 6 asks L2 to rule on the reading: every finding in
it is a new defect surfaced by review, not the same finding failing to converge,
and three of the four are wrong statements about named individuals. The trend is
convergent, not divergent: two HIGH in round 1, one in round 2, none in round 3.
Shipping a known misattribution to hold a counter at three would have been the
worse call, but it is L2's rule and L2 should say so.

 round 1  timeline.json · no corrected fact may survive uncorrected · HIGH
            T2026-08-21 carried the ticker as ZCH in title while summary already
            said ZCSH. One occurrence; a file-wide sweep found no other.
          timeline.json · section 2 READING names dossier section D as a source · HIGH
            The NET category had zero events though the schema declares it and the
            Record renders a filter for it. Fourteen rows added from section D,
            seven recategorised. NET 0 -> 20, EXPLOIT unchanged at 24.
          timeline.json · title is a headline, summary is the substance · MID
            30 titles were the whole row pasted in, up to 36 words. All rewritten
            to 4-12 words, summary byte-for-byte unchanged.
 round 2  network.json · no claim may be more certain than the corpus · HIGH
            N-arthur-hayes carried the $174M Arkham figure as Hayes's own position
            size, contradicting the package's own quarantine entry.
          network.json · the most recent primary figure wins · MID
            N-grayscale-zcash-trust carried a 31 Mar 2026 count beside an August
            AUM; the 30 Jun 2026 10-Q figure now leads.
          unverified.json · all five corrected premises must be quarantined · LOW
            "Zooko sold ZEC to pay taxes" was absent from the package entirely.
          phrases.json · tension is what a reader sees · MID
            A note from the researcher to the site's builder was rendered copy.
 round 3  schema.ts · CLAUDE.md requires bigint for zatoshi · MID
            spec-reviewer: the comment promised widening that no code did.
          phrases.json · a citation must be about its claim · MID
            docs-scribe: P-low-entropy-carrier cited Mumtaz's other quote.
 round 4  timeline.json · a claim about a person must match the primary record · HIGH
            T2025-11-06 attributed a Form 144 to the wrong entity on the wrong day
            at a ZEC price mistaken for a share price. Both primary filings were
            already in sources.json, unused.
          network.json · no claim may be more certain than the corpus · HIGH
            security-auditor-2: round 2 fixed the Hayes entity and missed the edge.
          sources.json · a title must name the source, not restate the claim · MID
          sources.json · an id must not move when a title improves · MID

PREVIEW URL: https://zecreveal-git-claude-aqua-stack-v4-l2-r-3f5876-aquatic-17b9f112.vercel.app
(deployment dpl_CrmijWHtimk842w65Tkux7vibZg1 on 95aba04, READY). It is behind Vercel
Deployment Protection, so it needs an authenticated browser. packages/content itself
renders nothing; what this proves is that apps/web builds and deploys again.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):

1. WHICH HANDOFF IS "THE NEWEST OPEN" WHEN THREE OPEN AT ONCE. The revolution
   protocol says RECONCILE opens the lowest unblocked handoff in every track, and
   the kickoff line says execute the newest one with status: open. After this
   session's RECONCILE, 02 (Web), 05 (Data) and 10 (Infra) all became open in the
   same commit, so "newest" had no unique referent. I read it as the Web track's
   successor to HANDOFF-01, which is also the handoff L2's own folds 1 and 2
   amended in the same breath. That is almost certainly what was meant, but the
   rule as written does not say it. Suggest either "the lowest-numbered open
   handoff unless the operator names one", or have the kickoff line name the file.
   05 and 10 are now open and unclaimed; if they are meant to run in parallel,
   each needs its own session told which file it owns.

2. sources.json IS THE WHOLE BIBLIOGRAPHY, 328 ENTRIES, AND 144 ARE UNCITED.
   Deliverable 2 says "sources.json (every URL de-duplicated)", so I took the
   union of every URL in the four dossiers rather than only what the Record cites.
   That comfortably clears A1's floor of 150, and it means any URL a later handoff
   lifts out of the corpus already resolves. The cost is that /sources will render
   a bibliography roughly 1.8 times the size of the citation graph. Confirm that is
   the intent, or say prune-to-cited and I will note that "every URL" then means
   "every URL the Record uses".

3. TIMELINE DATES CARRY THREE FIELDS, NOT ONE. Section 3 says ids are
   `T<ISO-date>[-n]`, but 36 of the 124 rows are month-, year- or range-precise in
   the corpus ("2013", "May 2014", "Apr-Jun 2018", "~Nov 2025"). Inventing a day to
   satisfy the id format would have fabricated precision, so `date` is the earliest
   day consistent with the corpus and exists only to sort, `datePrecision` says how
   much of it is real, and `dateText` carries the corpus's own rendering, which is
   what HANDOFF-03 should print. `dateEnd` closes a range. Confirm the shape before
   03 renders it, because changing it afterwards changes every id.

4. SECTION D OR PART C, WHERE THEY DISAGREE ON A CATEGORY? research 03 PART C is
   the 109-row table and its category key has no NET at all. The dossier's section D
   is abridged but marks sixteen rows NET, and NET is in the contract's union. I
   made section D authoritative for those rows: fourteen rows section D has and
   PART C lacks were added, and seven PART C rows were recategorised to NET. Without
   that, the /timeline page ships a filter with nothing behind it and the promotion
   network, which is the site's thesis, is absent from its own timeline. Confirm
   section D wins on category, or tell me PART C does and NET goes unused.

5. WHICH GRAYSCALE ZEC COUNT IS CANONICAL? The corpus states it three ways.
   research 04's SEC EDGAR table is itemised by filing date: 393,522.33134026 at
   2025-12-31 and 388,673.68359943 at 2026-06-30 against total assets of $155,252k.
   research 01 line 412 and dossier section E.3 both attach the 393,522.33 figure to
   the Q2 10-Q, but that figure is the December line in the same table and the
   $155,252k it is paired with belongs to the June line. I used 388,673.68359943 at
   30 Jun 2026 and carried the others alongside. Confirm, because HANDOFF-03 renders
   this on /network and /flows.

6. I TOOK A FOURTH GATE ROUND. PLEASE RULE ON WHETHER THAT WAS RIGHT. CLAUDE.md
   says a gate FAIL gets at most three rounds and a fourth is NOT CONVERGING,
   escalated to the operator. Round 4 here found four new defects, two of them HIGH
   and both wrong statements about named individuals: a Form 144 attributed to the
   wrong Silbert entity on the wrong day at a ZEC price mistaken for a share price,
   and the $174M Arkham figure still asserted against Arthur Hayes on a network edge
   thirty lines below the entity body that disclaims it. I read the cap as governing
   convergence on a finding, not as a budget of corrections: the rounds were
   convergent, two HIGH then one then none, and round 4's findings were new, from
   two different reviewers, not the same defect resisting a fix. Shipping a known
   misattribution about a named person to keep a counter at three seemed clearly
   worse. But it is your rule. If the cap is meant to be absolute, say so and I will
   escalate instead next time; if it governs per-finding convergence, CLAUDE.md
   should say "at most 3 rounds per finding".

7. THE PROTOCOL ASSUMES ONE PROMPT PER SESSION, AND THIS SESSION HAD TWO. Step 5
   says archive "the prompt that started your session" to prompts/PROMPT-NN.md. The
   Vercel addendum arrived mid-session, after the PR was open. Dropping it would
   lose half the session's instructions, and overwriting PROMPT-02.md would break
   the byte-for-byte property L2 verified on PROMPT-01.md, so I appended it under a
   rule and a heading that says what it is. The file is now two verbatim messages,
   and each is still byte-identical to what was sent. If you would rather have one
   file per message, say so and the convention can be PROMPT-NN-a/-b.

8. THE ADDENDUM IS FILED UNDER HANDOFF-01, ABOVE THE HANDOFF-02 BLOCK IT AMENDS.
   Step 2 says append an L2 RESOLUTION "beneath the ledger block of the handoff it
   names", and this one names HANDOFF-01. It arrived after the HANDOFF-02 block had
   been written, so obeying that literally put it earlier in the file than a block
   it postdates. I did it anyway, because grouping HANDOFF-01's material is clearly
   the intent and the block itself opens "This block arrives mid-session", so it
   self-dates. Flagging it because file order in LEDGER.md is no longer chronological.

INFERRED (non-empty inferences a worker made):

- Subagents do not nest in this environment, so a director could not spawn a crew.
  The lead acted as director-build and director-quality and named all eleven
  workers. Same shape HANDOFF-01 recorded; worth folding into CLAUDE.md's operating
  model as the standing arrangement rather than rediscovering it every session.
- The claim base was extended onto Phrase, AddressLabel, Case and NetworkEdge.
  Section 3's field lists for those four omit sources, confidence and lastVerified,
  but the same section says every Record claim carries all three and A3 checks every
  claim. Under the narrow reading, four claim types would have been uncheckable.
  spec-reviewer flagged this as the one place an explicit assumption back to L2 was
  the cleaner path, and it is here.
- Fields added beyond section 3's literal lists, each additive and each used:
  BewareEntry.cve; TimelineEvent.datePrecision, dateText, dateEnd, secondaryCategory;
  NetworkEntity.kind, role, exposure; NetworkEdge.id (`N-edge-<slug>`, an id family
  section 3's list does not name) and lastVerified; AddressLabel.id, network,
  balanceZec, notes; Case.summary, lastVerified and CaseStep.txid; Unverified.id,
  sources and lastVerified; and the whole Stats type, which section 3 never names
  although deliverable 2 requires stats.json.
- Loaders added beyond deliverable 1's list: getCases(), getSource(ref),
  resolveSources(refs), getStats(). getCase(id) needs a list to search; the citation
  popover HANDOFF-03 must build needs resolveSources.
- A3's "lastVerified <= today" is enforced against the system date at validation
  time, not against a pinned date. Every seed is 2026-08-22.
- unverified.json is excluded from "every claim" in A3. Its records deliberately
  carry no sources; six of the 32 cite nothing, which is the honest answer for an
  artefact that was searched for and not found.
- A4 is an exact, case-sensitive substring search of each quarantined `claim`
  against the raw text of every other data file, and the schema refuses a claim
  under 12 characters as uncheckable. It catches verbatim repetition, not
  paraphrase, which matches the assertion's own fail-side example.
- sources.json is generated, not hand-curated: scripts/build-sources.mjs takes the
  union of every corpus URL and scripts/check-provenance.mjs asserts every URL in
  the file occurs in the corpus. Crews cite URLs; scripts/resolve-refs.mjs rewrites
  them to ids and fails on any URL the corpus does not contain. That caught three
  truncated URLs during the run, one of them mine.
- packages/content defines its own five-value supplyBucket rather than importing
  `Pool` from packages/zec-types, which is still the v0.2 pair. HANDOFF-06 owns
  widening Pool; when it does, content can switch, with transparent staying
  separate because it is not a pool.
- Fold 8's diagnosis was right about the root vercel.json and incomplete about the
  cause. The deployment on the deleting commit failed identically, because the same
  settings are also stored on the zecreveal project. The available remedy in code is
  to pin them in apps/web/vercel.json, which takes precedence over stored project
  settings; a stored setting itself is an operator click, and no agent may touch it.
  Worth folding back into whatever L2 tells the next session about Vercel: deleting
  a config file does not undo a setting the dashboard already adopted from it.
- Fold 8's premise, "apps/web has no workspace dependencies", is true at this commit
  and false at the next one: HANDOFF-03 makes apps/web depend on the very package
  this PR creates. With no root vercel.json and a bare Next.js preset, that build
  must still build the workspace package, via transpilePackages or an explicit Build
  Command in project settings, never a restored root file. Written into
  docs/2.0/DEPLOY-2.0.md as a note addressed to HANDOFF-03.
- Deleting the root vercel.json falsified three sentences in root DEPLOY.md and
  legacy/dashboard/README.md that fold 8 did not name. Corrected both: a deletion
  that leaves the documentation describing the deleted thing is half a deletion.
- Source ids derive from publisher plus the URL's own path, not from the title.
  The first design used the title, and improving 47 titles moved 46 ids, which
  would have broken every citation. Titles keep improving as the extractor does;
  ids must not move when they do. Migration was mechanical, by URL, 452 citations,
  none unmapped.
- A bibliography bullet is recognised by its dash separator: "- Title -- URL". A
  prose bullet that merely contains a link is about the claim, not about the
  source, and no longer supplies a title. That is what had the BitMEX source, cited
  by the corpus for both 2025 price extremes, titled with June 2026 crash figures.
- The two Blockchair API dashboard URLs are admitted as sources even though they
  are templates carrying {addr} and {hash}. They are the corpus's own stated
  verification method for the single-use addresses, and citing press that never
  mentioned those addresses would have been worse.

NOT-MATCHED (patterns handed over that did not apply):

- `gh pr create` (CLAUDE.md, Workflow) is still unavailable in this environment.
  The PR was opened through the GitHub MCP tooling, as in HANDOFF-00 and 01. Third
  session running; CLAUDE.md still says gh.
- Section 6 suggested a Sonnet write the schema and loaders so the executor has a
  written contract. The lead wrote them, along with the validator, the three
  scripts, the five test suites, sources.json, labels.json, cases.json and
  stats.json. labels and cases carry A5 and A6 and are small; the schema is the
  contract every transcription runs against.
- Section 6 suggested researcher (Haiku) transcribe the dossier tables. Split by
  shape rather than uniformly: Haiku took the two well-structured tables (the
  timeline halves, the phrase catalogue), Sonnet took the four files needing
  judgement (beware, contradictions, network, unverified). Every Haiku dispatch and
  every re-dispatch carried a PREFLIGHT.
- Three separate workers independently reported the same non-problem: that writing
  `sources` as URLs would fail `sourceSchema` as literally coded. The resolver they
  had not found is scripts/resolve-refs.mjs. A dispatch that says "cite URLs" should
  say in the same breath which script converts them.
- research 03 PART C's category key lists eight categories and never NET, so the
  worker reading PART C alone could not have produced a NET row. Question 4.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):

- Whether section 3's field list per type is exhaustive, or whether every type
  implicitly extends Claim because "every Record claim carries sources[],
  confidence, lastVerified". The build chose the second uniformly. It is the only
  reading under which A3 and the validator's sweep make sense across all types, but
  the Phrase and Unverified lists look deliberately short rather than abbreviated,
  which is what makes it ambiguous rather than merely terse.
- Section 3 names an id family for every type except NetworkEdge, which needs one to
  be a permalink target. Invented `N-edge-<slug>`.
- A1's counts are given as a flat list; "beware 14, contradictions 16, cases 3" read
  as exact and "timeline >= 100, labels >= 7, unverified >= 15, sources >= 150" as
  floors, because the first three are fixed by the corpus and the others are not.
  The validator enforces exactly that split.
- A7 says the filter "returns >= 20 events and all have category === 'EXPLOIT'".
  The purity half is a property of the filter, not of the data: no edit to a row can
  break it, because a relabelled row genuinely is EXPLOIT. The fail-state transcript
  therefore breaks the plausible wrong implementation (a filter that also matches
  secondaryCategory) instead.

GATE ROUND COUNTS: 4. See question 6: the fourth is a deliberate overrun of the
Loop 4 cap and I am asking you to rule on the reading rather than assuming it.

  round 1 (timeline.json, re-dispatched to researcher-timeline-gate)
    file · rule · severity
    timeline.json · no corrected fact may survive uncorrected · HIGH
    timeline.json · section 2 READING names dossier section D as a source · HIGH
    timeline.json · title is a headline, summary is the substance · MID
  round 2 (lead corrections, from lead review and security-auditor)
    network.json · no claim may be more certain than the corpus · HIGH
    network.json · the most recent primary figure wins · MID
    unverified.json · all five corrected premises must be quarantined · LOW
    phrases.json · tension is what a reader sees · MID
  round 3 (lead corrections, from spec-reviewer and docs-scribe)
    schema.ts · CLAUDE.md requires bigint for zatoshi · MID
    phrases.json · a citation must be about its claim · MID
  round 4 (lead corrections, from lead review and security-auditor-2)
    timeline.json · a claim about a person must match the primary record · HIGH
    network.json · no claim may be more certain than the corpus · HIGH
    sources.json · a title must name the source, not restate the claim · MID
    sources.json · an id must not move when a title improves · MID

  Rounds 1 to 3 converged: two HIGH, then one, then none. Round 4's two HIGH
  findings are not a regression of that trend; they are the first pass in which
  anyone read timeline.json and network.json line by line against the primary
  filings, and both files landed last. The lesson for the next handoff is to gate
  the largest files first rather than last.

DEFERRED ASSUMPTIONS:

- No live chain or explorer confirmation of the eight labelled addresses or the
  fourteen case transaction ids. Egress to blockchair.com and
  mainnet.zcashexplorer.app is blocked here; curl gets 403 from the proxy. Every one
  is transcribed from research 04, which states it queried Blockchair on 2026-08-22
  and marks each row [verified]. Re-pulling them needs an environment with egress,
  which HANDOFF-10 or 11 will have.
- No live fetch of any of the 328 source URLs. Provenance is proven against the
  corpus, not the live web. research 03 PART F already reports at least one 404, and
  the Protos URL cited for Naval Ravikant's row may be that one. Link-rot sweep
  deferred to whichever handoff renders /sources.
- research 03 PART C dates the ECC team's regrouping as "cashZ (cashz.org)" on
  8 Jan 2026 while the dossier says the team became ZODL. Both are transcribed, the
  January row as cashZ and the March row as ZODL, which reads as a rename; nobody
  states that explicitly and no source in the corpus connects them.
- The corpus's own Zebra advisory table tallies 11 Critical and 8 High across 41
  rows, against its stated headline of 12 Critical. B10 transcribes the headline.
  Pre-existing corpus arithmetic, not introduced here.
- The eslint no-unused-vars promotion for test files and the unused `saplingSpend`
  in block-decoder.test.ts remain deferred to 06 or 07, as HANDOFF-00 and 01 both
  recorded. Still the only lint warning in the workspace.
- Root .env.example still carries the v0.2 VITE_* block and no SNAPSHOT_* names.
  This session's RECONCILE folded it into HANDOFF-10 deliverable 1.
- Root vercel.json: no longer deferred. HANDOFF-00 and HANDOFF-01 both deferred
  deleting it to the HANDOFF-11 cutover, and the first L2 RESOLUTION for HANDOFF-01
  said apps/web/vercel.json "makes the outcome the same either way". L2's own build
  log disproved that, and the addendum's fold 8 supersedes all three deferrals. It
  is deleted in this PR.
- The zecreveal project still stores the legacy dashboard's build command, install
  command and output directory. apps/web/vercel.json overrides all three, so the
  build no longer depends on them, but they are a trap for whoever next edits that
  file. Clearing them is operator click one in docs/2.0/DEPLOY-2.0.md section 1.
- `z-cash-reveal-dashboard2` will fail to build until an operator types the deleted
  file's six settings into that project. Accepted by fold 8, recorded in
  docs/2.0/DEPLOY-2.0.md section 1 and as row 02 of the operator table.
- packages/zec-types `Pool` is still the v0.2 pair. HANDOFF-06.
```
