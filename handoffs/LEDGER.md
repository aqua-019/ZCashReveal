# §8 Ledger — ZECReveal 2.0

Append-only. docs-scribe appends one block per handoff; L2 reads the whole file before writing the next handoff.

---

## HANDOFF-00 — Housekeeping, docs import, CI runs tests, CLAUDE.md

Branch `claude/aqua-stack-v4-1-handoff-818gb3` · shipped 22 Aug 2026 · gate rounds: 0

```
QUESTIONS (for the operator / L2):

1. BRANCH NAME. HANDOFF-00 front-matter specifies `feat/v2-00-housekeeping`, but this
   session was opened with a harness-designated branch,
   `claude/aqua-stack-v4-1-handoff-818gb3`, and instructed never to push elsewhere without
   explicit permission. The work is on the designated branch. Decide which convention wins
   for handoffs 01-13: either release future sessions with `feat/v2-NN-*` as the designated
   branch, or relax the front-matter to "the session's designated branch".

2. UNMERGED BRANCH. `origin/claude/build-leak-panel-I0181` is NOT merged (1 commit,
   `83c1152`, 748-line LeakPanel). `main` carries a reworked 527-line LeakPanel from
   `fa4bd58` / `7387816`, so nothing regresses if it is deleted, but that commit is the only
   copy of the earlier variant. It is held in a separate section of
   `docs/2.0/BRANCH-CLEANUP.md` rather than the safe-delete list. Aqua's call.

3. BRANCH COUNT. The §2 audit fact "22 stale `claude/*` + 2 merged `feat/*`" does not match
   the live remote: 20 `claude/*` (19 merged, 1 not) + 2 merged `feat/*`. Either two were
   already deleted between the audit and now, or the audit miscounted. BRANCH-CLEANUP.md is
   generated from live `git branch -r`, so it is correct regardless; the plan §10 sentence
   still says 22.

4. MAINNET FIXTURE. One indexer test stays skipped forever until a captured post-NU5
   mainnet block lands in `apps/indexer/test/fixtures/blocks/mainnet-*.json`. That needs a
   synced zebrad, so it belongs to HANDOFF-10 (infra), not here. Worth adding as an explicit
   deliverable there, since A5-style "0 skipped" assertions will keep tripping on it.

INFERRED (non-empty inferences a worker made):

- A5's literal clause ("the vitest summary shows 0 skipped for apps/indexer") was read as
  its stated intent ("the indexer integration tests are not skipped"). The literal form is
  unsatisfiable in this handoff: 37 tests are Postgres-gated and 1 is fixture-gated, so the
  best achievable is 170 passed / 1 skipped. Evidence for both readings is in §7.
- The eslint `no-unused-vars` rule is "warn", not "error", for test files. A real finding
  exists (`block-decoder.test.ts:22`, unused `saplingSpend`) and A8 forbids editing
  `apps/*/src`, so erroring there would have made A3 and A8 mutually unsatisfiable. The
  finding stays visible as a warning.
- `vercel.json` was updated (`outputDirectory` -> `legacy/dashboard/dist`) rather than
  deleted. Plan §10 says vercel.json "goes with" the dashboard, but the handoffs README
  requires `z-cash-reveal-dashboard2` to keep building until the HANDOFF-11 cutover, and
  HANDOFF-00 is explicitly "no runtime behaviour change". Deletion belongs to 11.
- `DEPLOY.md` got the required superseded banner and also had its three `apps/dashboard`
  path references corrected, so the surviving v0.2 deploy doc is not actively wrong.
- Root `package.json` gained `"type": "module"` so the flat `eslint.config.js` parses as
  ESM without a Node warning. Every workspace package already declares its own `type`, so
  this is inert outside the root.

NOT-MATCHED (patterns handed over that did not apply):

- The §5 A9 grep (`grep -rP '[\x{1F300}-...]'`) does not run in a POSIX/C locale: GNU grep
  rejects `\x{}` escapes above U+FFFF and the pipeline still reports clean. Run verbatim it
  is a false-negative generator. Replaced by `scripts/check-no-emoji.sh`, which forces
  `LC_ALL=C.UTF-8` and self-tests the regex engine against a known emoji before scanning.
- `_incoming/v0.2-notes/postgres-port-5433.patch` was NOT applied. Its own runbook marks it
  the non-recommended Option B; 5433 is a property of one dev host, not the project. CI and
  `docker-compose.yml` stay on 5432.
- `gh pr create` (CLAUDE.md, Workflow) is unavailable in this environment; the PR was opened
  through the GitHub MCP tooling instead. Same outcome, different mechanism.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):

- A5, as above: "0 skipped for apps/indexer" versus "the integration tests are not skipped".
- A4 requires "the workflow passes on the PR", which cannot be evidenced before the PR
  exists. Recorded in §7 with the run's actual state at hand-off time.
- Deliverable 4 says the content-validate step is "allowed to skip while the package does
  not exist" without saying how. Implemented as a directory test that reports and passes,
  so the step is green and self-explaining rather than conditionally absent.

GATE ROUND COUNTS: 0 (no assertion required a re-dispatch; A3 and A5 were resolved by
design during first execution, not after a gate FAIL).

DEFERRED ASSUMPTIONS:

- The mainnet block fixture (question 4) — deferred to HANDOFF-10.
- Promoting test-file `no-unused-vars` back to "error", and removing the now-unused
  `saplingSpend` — deferred to the first handoff permitted to edit `apps/indexer/src`
  (06 or 07).
- Deleting `legacy/dashboard` and root `vercel.json` — deferred to HANDOFF-11 (cutover).
- The stale cross-app comment at `apps/gateway/src/ws-broker.ts:8` still points at
  `apps/dashboard/src/lib/ws.ts`. Correcting it would have violated A8, so it is deferred to
  HANDOFF-05, which owns that file.
```

---

## L2 RESOLUTION — HANDOFF-00

Appended by the HANDOFF-01 session under the revolution protocol, step 2. Verbatim; L2 has no write access to this repository.

```
L2 RESOLUTION — HANDOFF-00 (Cowork, 22 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of 514ae4c, not relayed):
  pnpm install --frozen-lockfile rc=0 · pnpm typecheck 5/5 rc=0 · pnpm lint "1 problem (0 errors, 1 warning)" rc=0 ·
  pnpm -r test: gateway 7 passed, indexer 133 passed / 38 skipped with no database present, rc=0 ·
  pnpm --filter @zcashreveal/dashboard build "built in 1.94s" rc=0 from legacy/dashboard ·
  Math.random ban fires on a probe file rc=1 · scripts/check-no-emoji.sh rc=0 clean, rc=1 on a planted U+1F680 ·
  scripts/assert-no-skipped-integration.mjs rc=1 with no database, naming all 37 gated tests individually ·
  docs/2.0 top level exactly the seven specified files, research 4, mockups 2 html + 12 reference png, v0.2-notes 2,
  handoffs 14 + LEDGER + LOG + README, _incoming and 2026-08-22-pickup both gone, CLAUDE.md byte-identical to the
  draft L2 shipped, A8 diff empty · CI check run "typecheck, lint, test" SUCCESS on the PR head 514ae4c (run
  32603703571), not merely on the 0eb45d4 cited in §7 · Vercel z-cash-reveal-dashboard FAILURE reproduced on base
  commit 30b2a35 on main, so it is pre-existing, not a regression.
  Verdict: every §5 assertion holds under re-execution; the §7 transcripts are accurate. No finding.

ANSWERS to the ledger questions:
  Q1 BRANCH NAME — the harness wins. Front-matter for 01-13 now reads "the session-designated branch". The stable
     key is the PR title, which must begin "HANDOFF-NN:"; LOG.md and this ledger key on that, never on the branch.
  Q2 UNMERGED BRANCH — delete claude/build-leak-panel-I0181. L2 read it: one commit, 83c1152, a 748-line LeakPanel
     and a 102-line App.tsx. main carries a reworked 527-line LeakPanel, the app is now legacy/dashboard, and it is
     retired at the HANDOFF-11 cutover. Nothing in 2.0 imports it. Move it to the safe-delete list.
  Q3 BRANCH COUNT — BRANCH-CLEANUP.md, generated from live git, is authoritative: 20 claude/* + 2 merged feat/*.
     HANDOFF-01 carries a one-line correction to plan §10.
  Q4 MAINNET FIXTURE — accepted into HANDOFF-10 as an explicit deliverable, with an assertion that the skip then
     disappears.

FOLDS applied by this session: items A3-A11 of the prompt that carried this block — HANDOFF-00 closed, HANDOFF-01
opened, branch fields relaxed, the emoji assertion pointed at scripts/check-no-emoji.sh, plan §10 correction added to
01, ws-broker.ts:8 fix added to 05, the "0 skipped" assertion in 06 replaced, mainnet fixture and Actions bump added
to 10.

OPERATOR CLICKS OUTSTANDING: delete the stale remote branches per BRANCH-CLEANUP.md; delete the orphaned Vercel
project z-cash-reveal-dashboard; create the Vercel project zecreveal with Root Directory apps/web for HANDOFF-01.
```

---

## HANDOFF-01 — `apps/web` scaffold + the ZEC Forensic design system

Branch `claude/aqua-v4-handoff-setup-94hbvt` (harness-designated) · shipped 23 Aug 2026 · gate rounds: 2

```
QUESTIONS (for the operator / L2):

1. THE MOCKUP'S MUTED INKS FAIL WCAG AA, AND I CHANGED THEM. `--ink-mute` #7C7366 is 4.04:1
   against `--bg` and `--ink-faint` #4F4840 is 2.10:1. Both are used for real text at 9.5-12px
   (eyebrows, table headers, the key column, the nav index numerals, the footer line numbers),
   which is normal text under WCAG, so 4.5:1 applies and neither cleared it. Worse, the nav's
   hover-dim state set the whole rest of the bar to `--ink-faint`, so pointing at the system bar
   made it unreadable. I raised them to #8F8576 (5.20:1 on --bg, 4.52:1 on the darkest surface
   it is painted on) and #6A6157, and retired `--ink-faint` from text entirely - it is now a
   non-text token for hairlines. Same hue ramp, same relationships, and the dim verb still reads
   as a clear step down from `--ink-dim`.
   This is a deliberate divergence from the mockup `:root`, which §2 names as the source of
   truth for values, so it needs L2's ruling rather than my judgement. Accessibility went 95 to
   100 on /beware. If L2 wants the mockup values back, the a11y budget in deliverable 6 cannot
   be met and one of the two has to give. Neither token is in A2's frozen list.

2. THE MOCKUP'S TIP HASH IS 65 HEX CHARACTERS. `mockups-v2.html:1494` has one zero too many in
   the leading run; a block hash is 32 bytes. I corrected the fixture to 64 and pinned the shape
   in a unit test. The mockup literal is still wrong and HANDOFF-11 will harvest from it.

3. SHOULD THE PLAYWRIGHT SUITE GATE CI? Assertions A4-A7 live in Playwright and nothing in
   .github/workflows/ci.yml runs them, so after this PR they are verified once and then
   unguarded. I added a step for the apps/web vitest suite (96 tests, no browser needed) but
   stopped short of the e2e job: it needs a chromium download, and the build already flaked once
   in this environment on the Google Fonts fetch, so a red e2e job would block unrelated PRs.
   HANDOFF-10 owns CI. Worth an explicit deliverable there.

4. FOUR WEBFONT FAMILIES COST THE PERFORMANCE BUDGET. 213 KiB across Instrument Serif, Fraunces,
   JetBrains Mono and Manrope held LCP at 3.0 s on the mobile preset. Preloading Manrope alone
   (it is the LCP element on every Record page) moved it to 1.9 s and performance 93 to 99, at a
   cost of CLS 0.005. That is well inside budget, but it is a real constraint on the type
   system: a fifth family, or preloading a second, will spend it.

INFERRED (non-empty inferences a worker made):

- §1 says "Next.js 15" and the plan says "15+". Read as 15: pinned 15.5.23 rather than 16.3.2.
  Literal, and the lower-risk reading.
- A3's raw grep (`grep -rn 'Math.random' apps/web/src` is empty) was taken literally, not as its
  intent. Two comments explaining the ban spelled the banned symbol, so the grep was non-empty
  while the code was clean. Reworded the comments rather than reinterpreting the assertion: a
  spec that only passes under a charitable reading is a spec nobody can run. This is the same
  shape as HANDOFF-00's A5 and A9, and the third time a §5 grep has needed this treatment.
- A11's fold text said "add an assertion: A8" to HANDOFF-10 §5, which already had an A8. Added
  as A9 to avoid two assertions with the same label.
- A5's front-matter branch rule said "using each file's own number and slug". Read as the
  filename slug, so HANDOFF-02-content-package yields feat/v2-02-content-package rather than the
  README's earlier feat/v2-02-content. Deterministic, and the field is advisory now.
- "Dev-only" in deliverable 4 was read as "cannot be reachable in production by accident", not
  merely "off in the default configuration". That is what forced the gate to be a dedicated
  variable rather than a data-mode side effect.
- The mockup's pool hues, not the plan's. Plan §6 lists an earlier lighter set (#8FB3C9 etc.);
  the mockup marks its set "validated, fixed order" and §3 names those exact values.

NOT-MATCHED (patterns handed over that did not apply):

- `gh pr create` (CLAUDE.md, Workflow) is still unavailable in this environment; the PR was
  opened through the GitHub MCP tooling, as in HANDOFF-00.
- §6 suggested `test-engineer` (Haiku) write the Playwright checks after `ui-builder` returns,
  and `devops-deployer` verify the Vercel preview. The first was followed. The second could not
  be: the zecreveal project does not exist until the operator creates it, so there is no preview
  to verify and its absence is not a failure.
- §6 suggested routing the primitives and routes to `ui-builder` workers. The lead wrote the
  token layer, primitives, ambience, shell and routes directly. Four parallel authors on one
  design language drift, and the coherence of the hover verb, the accent budget and the type
  register is the deliverable. Docs, tests and the whole quality pass did fan out.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):

- Deliverable 4's "dev-only". Satisfiable as "off unless a variable says on" or "off unless a
  variable says off". The first fails closed and the second fails open; only the first survives
  the rule that no agent may set a Vercel variable. Resolved in code, and the reasoning is in
  src/lib/env.ts rather than only here.
- A2's "grep each value" against a contract that writes `cubic-bezier(.32,.72,0,1)` while
  prettier writes `cubic-bezier(0.32, 0.72, 0, 1)`. Same value, different string. The check now
  holds the contract's spelling and normalises, so it can still detect real drift.
- A4's "every primitive listed in deliverables" - ui only, or ambience too? Read inclusively:
  all 22 names are asserted.
- A5's "90 s of simulated time" versus rAF, which Playwright's virtual clock does not drive.
  The tide assertions use fastForward; the rAF assertion uses a real 300 ms wait. Both polarities
  are in the file.
- Deliverable 6 states a Lighthouse budget but §5 has no assertion for it, so it is not a gate.
  Measured anyway and reported: performance 99, accessibility 100.

GATE ROUND COUNTS: 2 of 3. Round 1 closed the dev-surface gate and the first accessibility and
correctness findings; round 2 closed the pool-bar collapse, the undefined `.fair` class, the
contrast failures and the missing focus ring. Converged; no third round.

DEFERRED ASSUMPTIONS:

- The Playwright suite is not in CI (question 3) — HANDOFF-10.
- `next/font/google` makes `pnpm build` require egress to fonts.googleapis.com and
  fonts.gstatic.com; a failed fetch is a hard build error, not a fallback. Observed once in this
  environment. Hermetic alternative is `next/font/local` with the four families vendored.
  Documented in apps/web/README.md and DEPLOY-2.0.md — HANDOFF-10 or later.
- Plan §10's stale "22 branches" survives at lines 14 and 126; deliverable 7 authorised one line.
- Root `DEPLOY.md` still credits HANDOFF-10 with creating DEPLOY-2.0.md; HANDOFF-01 created it.
- Root `.env.example` documents no `SNAPSHOT_*` name — HANDOFF-09.
- Root `vercel.json` still targets legacy/dashboard — HANDOFF-11 cutover.
- `.mp` and `.txt` tracking-table classes not ported — HANDOFF-04.
- `/dev/primitives`, when gated off, returns Next's bare error shell rather than the styled 404.
  Cosmetic while the route is 404 by design; the fix is to drop it from the manifest entirely.
- The eslint `no-unused-vars` promotion for test files and the unused `saplingSpend` in
  `block-decoder.test.ts` remain deferred to 06 or 07, as HANDOFF-00 recorded.
```

---

## L2 RESOLUTION — HANDOFF-01

Appended by the HANDOFF-02 session under the revolution protocol, step 2. Verbatim; L2 has no write access to this repository.

```
L2 RESOLUTION — HANDOFF-01 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of a17e7be, not relayed):
  pnpm install --frozen-lockfile rc=0 · pnpm typecheck 6/6 rc=0 · pnpm lint "1 problem (0 errors,
  1 warning)" rc=0, the warning being HANDOFF-00's pre-existing indexer finding ·
  pnpm --filter @zcashreveal/web build rc=0, 14 static pages · pnpm -r test: web 96 passed,
  gateway 7 passed, indexer 133 passed / 38 skipped (no database in this environment) ·
  pnpm test:e2e 19 passed in 41.9 s, including both polarities of A5 · check:tokens 15 ok, and
  drifting --gold to #ffcc00 produces "FAIL --gold expected #f4b728 found #ffcc00" rc=1 ·
  grep -rn 'Math.random' apps/web/src empty · scripts/check-no-emoji.sh rc=0 ·
  dev-surface gate re-tested from scratch: rm -rf .next, production build with NO environment
  variable set at all, next start - / 200, /dev/primitives 404, /nope 404, zero occurrences of
  __zr in the served HTML. The gate cannot fail open ·
  STEP A landed in full: CLAUDE.md carries the revolution protocol including ARCHIVE, HANDOFF-00
  is closed, the folds are present in 05, 06 and 10, LEDGER carries the L2 block verbatim, and
  handoffs/prompts/PROMPT-01.md is 11,014 bytes, byte-for-byte the prompt that started the
  session ·
  CI check run "typecheck, lint, test" SUCCESS on the PR head a17e7be (run 32608529590).
  Contrast recomputed independently (WCAG relative luminance): --ink-mute was 4.04:1 on --bg and
  is now 5.20:1; --ink-faint was 2.10:1 and is now 3.11:1. The report's numbers are accurate and
  slightly conservative.
  Verdict: every assertion holds under re-execution. Two gate rounds, converged, no finding.
  Lighthouse 99/100 is accepted on the session's evidence rather than reproduced here; the
  accessibility half of it was verified independently by the contrast computation above.

ANSWERS to the ledger questions:
  Q1 MUTED INKS — ACCEPTED, and the new values are now canonical. The mockup's --ink-mute
     (#7c7366, 4.04:1) and --ink-faint (#4f4840, 2.10:1) fail WCAG AA for normal text and were
     being used for real text at 9.5-12px, so the mockup was wrong and the correction is right.
     #8f8576 and #6a6157 stand, --ink-faint stays retired from text as a hairline token, and the
     accessibility budget outranks mockup fidelity wherever the two disagree again. The mockup
     files stay as the historical artefact; the token file is the source of truth for these two
     values from here.
  Q2 65-CHARACTER HASH — ACCEPTED. The mockup literal is a typo; the corrected 64-character
     fixture and its unit test stand. Nothing may harvest that literal (fold below).
  Q3 PLAYWRIGHT IN CI — YES, it should gate, but not on every PR. Folded into HANDOFF-10 as a
     separate e2e job with a paths filter on apps/web, installing chromium in the job. The Google
     Fonts flake that argued against it is removed at the root by vendoring the fonts (fold into
     HANDOFF-03), which also settles DEFERRED assumption 9.
  Q4 WEBFONT BUDGET — ACCEPTED as a standing constraint: four families, Manrope preloaded alone,
     no fifth family without an explicit L2 decision. Recorded in the HANDOFF-03 fold.

FOLDS (apply now, in the RECONCILE commit):
  1. HANDOFF-02 §4 - add a deliverable: correct the two remaining "22 stale branches" claims in
     `docs/2.0/ZECREVEAL-2.0-PLAN.md` (lines 14 and 126) to 20 `claude/*` + 2 merged `feat/*`,
     matching the §10 line HANDOFF-01 already fixed.
  2. HANDOFF-02 §4 - add a deliverable: in `docs/2.0/mockups/reference/README.md`, record that
     the mockup's tip hash literal is 65 hex characters (one zero too many in the leading run)
     and that the canonical fixture is the 64-character value in `apps/web/src/lib/chain.ts`, so
     no later handoff harvests the typo.
  3. HANDOFF-03 §3 - add to the contract: the four families are vendored with `next/font/local`
     rather than fetched from Google at build time, so the build is hermetic and CI cannot flake
     on a font fetch. Manrope alone is preloaded; a fifth family, or a second preload, needs an
     explicit L2 decision (LEDGER-01 Q4). Keep the Lighthouse floors of performance >= 95 and
     accessibility >= 95 on `/beware` as a §5 assertion.
  4. HANDOFF-03 §3 - add: `--ink-mute` #8f8576 and `--ink-faint` #6a6157 are canonical and
     `--ink-faint` is a non-text token (hairlines, rules) only. Where a mockup value and WCAG AA
     for normal text disagree, AA wins and the divergence is recorded in §8.
  5. HANDOFF-04 §3 - add: the tip-hash fixture is the 64-character value from
     `apps/web/src/lib/chain.ts`. Never copy the 65-character literal out of the mockup HTML.
  6. HANDOFF-10 §4 - add a deliverable: a Playwright e2e CI job, separate from the main verify
     job, triggered only by a paths filter on `apps/web/**`, installing chromium in the job
     (`playwright install --with-deps chromium`), running `pnpm --filter @zcashreveal/web
     test:e2e` (LEDGER-01 Q3).
  7. HANDOFF-10 §4 - add to the `.env.example` deliverable: the root `.env.example` still carries
     the v0.2 `VITE_*` block and no `SNAPSHOT_*` names. Remove the former, add the latter
     (LEDGER-01 NOTICED).

NOTED, NOT ACTED ON: root `vercel.json` still points at `legacy/dashboard` - HANDOFF-11 retires
it at the cutover, and `apps/web/vercel.json` makes the outcome the same either way. The bare
error shell on a gated-off `/dev/primitives` is cosmetic and stays.

OPERATOR CLICKS OUTSTANDING: create the Vercel project `zecreveal` (Root Directory `apps/web`,
Framework Next.js) if not yet done; delete the stale remote branches per
`docs/2.0/BRANCH-CLEANUP.md`; delete the orphaned Vercel project `z-cash-reveal-dashboard`.
```

---

## L2 RESOLUTION — HANDOFF-01 addendum (Vercel)

Appended by the HANDOFF-02 session under the revolution protocol, step 2. It arrived mid-session, after the HANDOFF-02 block below had already been written, and is placed here rather than at the end of the file because it names HANDOFF-01. Verbatim; L2 has no write access to this repository.

```
L2 RESOLUTION — HANDOFF-01 addendum, Vercel (Cowork, 23 Aug 2026)

This block arrives mid-session. Apply it in your next commit, before the PR opens. It is two
extra folds and does not change HANDOFF-02's scope.

FINDING (Executed by L2, not relayed). The `zecreveal` Vercel project now exists
(prj_rNTLvGWnz92w5qcvROBchPUfdhIR, Root Directory `apps/web`, framework Next.js, no environment
variables, no custom domain). Its first production build FAILED:
dpl_9HHZKwUpk798aLxSdMAjy3UDnQNm, errorCode NEXT_OUTPUT_DIR_MISSING. The build log shows Vercel
ran the ROOT `vercel.json`'s buildCommand verbatim -
"pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard build" - built
`legacy/dashboard`, then looked for the root file's outputDirectory at
`/vercel/path0/apps/web/legacy/dashboard/dist`. `apps/web/vercel.json` was ignored entirely.
This RESOLVES the HANDOFF-01 §7 UNVERIFIED line "that Vercel resolves vercel.json relative to
the Root Directory": it does not. The root file is read for every project in this repository and
overrides the one inside the Root Directory.

FOLDS (apply to THIS handoff, HANDOFF-02):
  8. §4 - add as the FIRST deliverable: delete the root `vercel.json`. `apps/web` has no
     workspace dependencies, so with that file gone the Next.js preset builds it with no custom
     command and `apps/web/vercel.json` (`{"framework":"nextjs"}`) is finally the one that
     applies. The operator moves the deleted file's settings into the `z-cash-reveal-dashboard2`
     project settings so that project keeps building until the HANDOFF-11 cutover - Framework
     Other, Install `pnpm install --frozen-lockfile`, Build `pnpm --filter=@zcashreveal/types
     build && pnpm --filter=@zcashreveal/dashboard build`, Output `legacy/dashboard/dist`,
     environment variable `VITE_MOCK_MODE=true`. Record those exact values in
     `docs/2.0/DEPLOY-2.0.md` and add the click to the `handoffs/README.md` operator table.
     Delete the file whether or not the operator has done it yet, and say which in §7: the
     dashboard is legacy, and a red check on it is not a reason to keep the new project broken.
  9. §5 - add an assertion: no `vercel.json` exists at the repository root, and
     `apps/web/vercel.json` contains `"framework": "nextjs"` *(fail side: restore the root file
     in a scratch commit, observe it present, revert)*.

Nothing else in HANDOFF-02 changes. The seven folds you already applied stand.
```

---

## HANDOFF-02 — `packages/content` — zod schemas + research seeds

Branch `claude/aqua-stack-v4-l2-resolution-7v7qvw` (harness-designated) · shipped 23 Aug 2026 · gate rounds: 4

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

---

## L2 RESOLUTION — HANDOFF-02

Appended by the HANDOFF-03 session under the revolution protocol, step 2. Verbatim; L2 has no write access to this repository.

```
L2 RESOLUTION — HANDOFF-02 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of 5271813, not relayed):
  pnpm install --frozen-lockfile rc=0 · content validate rc=0 printing beware 14, contradictions
  16, timeline 124, labels 8, cases 3, unverified 32, sources 328, network 36 entities / 41 edges,
  phrases 19, 186 refs cited · pnpm -r test: content 58, web 96, gateway 7, indexer 133 passed /
  38 skipped · pnpm typecheck 6/6 rc=0 · pnpm lint 0 errors 1 pre-existing warning ·
  node scripts/check-vercel-config.mjs rc=0, root file absent and apps/web pinning all four keys ·
  CI check run "typecheck, lint, test" SUCCESS on the PR head 5271813.
  The Vercel repair is confirmed from the deployment record, not from the report: dpl_9HHZ
  (production, main) ERROR; dpl_EYkD and dpl_Bbf (early PR commits) ERROR; dpl_DjyB on 9cc2dca,
  the commit that DELETED the root file, still ERROR - which is the session's own finding and the
  important one; dpl_Crmi on 95aba04, the commit that pinned apps/web/vercel.json, READY; dpl_CMgB
  on the head, READY. The diagnosis that the project had also STORED the root file's settings at
  import time is correct, and it is my fault it was ever stored: I created the project while that
  file was still in the tree. Deleting the file was necessary and not sufficient, exactly as the
  session says.
  Verdict: every assertion holds. Four gate rounds. ONE FINDING, below.

FINDING F-02-1 (Executed, reproduced deliberately) - `pnpm -r test` is not self-sufficient on a
  clean checkout, and HANDOFF-00's assertion A1 is therefore wrong as written.
  My first `pnpm -r test` on a fresh worktree failed: "apps/gateway ... Failed Suites 1 ... Error:
  Failed to resolve entry for package @zcashreveal/types ... Tests no tests". Four subsequent runs
  passed. I isolated the mechanism rather than dismissing it as flake: `rm -rf
  packages/zec-types/dist && pnpm -r test` reproduces it every time, exit 1, same message. The
  gateway suite imports the BUILT types package, so the recursive test task requires a prior
  `pnpm build` (or a `tsc -b`, which is why running `pnpm typecheck` first hides it).
  HANDOFF-00 A1 reads "pnpm install --frozen-lockfile && pnpm -r test exits 0 on a clean checkout
  of the branch". That is false on a genuinely clean checkout. It passed in my HANDOFF-00 and
  HANDOFF-01 verifications only because I ran `pnpm typecheck` first and it emitted the dist.
  CI is not affected: its order is Install, Build, Typecheck, Lint, then tests. Not urgent, but it
  is the fourth §5 assertion in three handoffs that does not survive literal execution, and it
  should stop happening. Fold 1 fixes it.

OBSERVED, NOT A FINDING: `pnpm build` failed for me on this branch with "`next/font` error:
  Failed to fetch Instrument Serif / JetBrains Mono / Manrope from Google Fonts". Same commit,
  same command, succeeded during my HANDOFF-01 verification and on CI. This is precisely the
  non-hermetic build HANDOFF-01 deferred and LEDGER-01 Q3 named as the reason not to put Playwright
  in CI. It is no longer hypothetical - it has now flaked for me once. Fold 2 raises its priority.

ANSWERS to the ledger questions:
  Q1 WHICH HANDOFF WHEN THREE ARE OPEN — you read it right, and the rule was loose. It is now:
     **the lowest-numbered handoff with status: open, unless the prompt names a file; the prompt
     names one whenever more than one track is open.** Fold 3 puts that in CLAUDE.md and the
     kickoff line. 05 and 10 stay open and unclaimed on purpose: they are the Data and Infra
     tracks and they run in their own sessions when Aqua chooses to start them. This session owns
     HANDOFF-03 and nothing else.
  Q2 sources.json AT 328 WITH 144 UNCITED — keep the union. A bibliography larger than the
     citation graph is the correct shape for this site: the thesis is that the record is public and
     checkable, and a reader who wants to audit a claim we did not cite should still find the
     source. But /sources must not present 328 undifferentiated links. Fold 4: the page separates
     "cited by the Record" from "in the corpus, not cited", and the count of each is stated.
  Q3 THREE DATE FIELDS — confirmed, ship it. `date` sorts, `datePrecision` says how much of it is
     real, `dateText` is what renders, `dateEnd` closes a range. Inventing a day to satisfy an id
     format would have fabricated precision on a site whose entire argument is about not doing
     that. Fold 5 makes `dateText` the rendered string an explicit contract line in HANDOFF-03 so
     it cannot regress to a formatted `date`.
  Q4 SECTION D vs PART C ON CATEGORY — section D wins, as you did it. A NET filter with nothing
     behind it would be worse than wrong; it would be a filter that quietly tells the reader the
     promotion network is not part of the story. Record the 14 additions and 7 recategorisations
     in the ledger, which you did.
  Q5 GRAYSCALE — your reading is right. 388,673.68359943 ZEC at 30 Jun 2026 is the figure that
     belongs with $155,252k total assets; 393,522.33134026 is the 31 Dec 2025 line, and research 01
     line 412 and dossier E.3 both mis-paired it with the Q2 10-Q. Ship the June figure as the
     headline with the December one carried alongside, both dated. Fold 6 adds a correction note to
     the dossier so the mis-pairing is not re-harvested.
  Q6 THE FOURTH GATE ROUND — you were right, and the rule was wrong. The cap governs convergence
     on a finding, not a budget of corrections. Rounds that go two HIGH, one, none are converging;
     new defects from different reviewers are new information, not a loop. And the specific
     defects settle it: shipping a Form 144 attributed to the wrong Silbert entity, or a $174M
     figure asserted against Arthur Hayes thirty lines below the text that disclaims it, to protect
     a counter, would have been indefensible on a site that exists to hold other people to their
     own record. Fold 3 rewrites the rule as "at most 3 rounds per finding; a round that surfaces
     only NEW findings is not a repeat round", and adds: never ship a known false statement about a
     named person to satisfy a process cap - escalate instead, and if the operator is unreachable,
     fix it and say so.
  Q7 TWO PROMPTS IN ONE SESSION — appending under a heading was the right call and is now the
     rule. Fold 3: `prompts/PROMPT-NN.md` holds every message that steered the session, each
     verbatim under a heading naming what it is and when it arrived. One file per handoff, not one
     per message.
  Q8 THE ADDENDUM FILED UNDER HANDOFF-01 — correct as done. Group by the handoff a block names,
     not by arrival time; the block says when it arrived.

FOLDS (apply in the RECONCILE commit):
  1. HANDOFF-03 §4 - add a deliverable: make `pnpm -r test` self-sufficient. Either give the test
     task a build dependency in `turbo.json` (`"test": { "dependsOn": ["^build"] }`) or add a
     `pretest` to the gateway package. Then correct HANDOFF-00's A1 in place to name the actual
     command sequence, with a one-line note that L2 reproduced the failure on 23 Aug 2026 by
     deleting `packages/zec-types/dist`. §5 assertion: `rm -rf packages/zec-types/dist && pnpm -r
     test` exits 0 *(fail side: revert the fix, same command, observe the resolve error)*.
  2. HANDOFF-03 - the font vendoring in the earlier fold is now the FIRST deliverable, not one of
     several: `next/font/local` with the four families committed under `apps/web/src/fonts`, no
     Google Fonts fetch at build time. It has now flaked for L2 once (see OBSERVED above) and it
     blocks the Playwright CI job in HANDOFF-10. §5 assertion: `grep -rn "next/font/google"
     apps/web/src` is empty, and a build with no network reaches "Generating static pages".
  3. CLAUDE.md, Revolution protocol - three amendments: (a) step 3 becomes "EXECUTE the
     lowest-numbered handoff with status: open, unless the prompt names a file - and the prompt
     names one whenever more than one track is open"; (b) the Loop 4 cap becomes "at most 3 rounds
     per finding; a round that surfaces only NEW findings, from a different reviewer or a different
     file, is not a repeat round. Never ship a known false statement about a named person to keep a
     counter down: escalate, or fix it and say so in section 7"; (c) step 5 becomes "archive every
     message that steered the session to `handoffs/prompts/PROMPT-NN.md`, each verbatim under a
     heading naming what it is and when it arrived".
  4. HANDOFF-03 §3 - `/sources` renders two labelled groups, "cited by the Record" and "in the
     corpus, not cited", each with its count, rather than one undifferentiated list of 328.
  5. HANDOFF-03 §3 - timeline rows render `dateText` verbatim. A formatted `date` is never shown;
     `datePrecision` drives any relative or grouped display. §5 assertion: no rendered timeline row
     shows a day for a row whose `datePrecision` is coarser than `day`.
  6. HANDOFF-03 §4 - add a correction note to `docs/2.0/RESEARCH-2026-08-DOSSIER.md` E.3 and to
     `docs/2.0/research/01-contemporary-zcash.md` near line 412: the 393,522.33134026 ZEC figure is
     the 31 Dec 2025 line and is mis-paired there with the Q2 10-Q and with $155,252k total assets;
     the June 2026 figure is 388,673.68359943 (LEDGER-02 Q5).

OPERATOR CLICKS OUTSTANDING: Vercel Deployment Protection blocks every preview - L2 could not
fetch `/beware` even with a regenerated share token (302 to the SSO endpoint), so the route
checklist stays UNVERIFIED over the wire for a second revolution. Turn on Protection Bypass for
Automation, or drop protection on preview deployments, if you want previews checkable by L2 and CI.
Also still outstanding: delete the stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`, and
delete the orphaned Vercel project `z-cash-reveal-dashboard`. The `z-cash-reveal-dashboard2`
settings move is no longer urgent - `apps/web/vercel.json` now pins its own settings, so that
project keeps building from its stored ones - but do it before the HANDOFF-11 cutover.
```

---

## HANDOFF-03 — The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources

Branch `claude/handoff-03-record-pages-3jzxm1` (harness-designated) · shipped 23 Aug 2026 · gate rounds: 4

```
QUESTIONS (for the operator / L2):

1. A5's PERFORMANCE FLOOR WAS SET AGAINST A PLACEHOLDER, AND THE REAL PAGE MISSES IT BY ONE
   POINT. Lighthouse on /beware is accessibility 100 (floor 95) and performance 94 (floor 95),
   five runs giving 94/94/93/94/94. HANDOFF-01 measured 99 when /beware was two sample rows and
   a "scheduled" panel; it is now fourteen entries, twenty-nine citation disclosures and the B2
   deep dive. I took it from 89 to 94 with four real reductions - one stylesheet instead of two
   (a second render-blocking request cost about 1,370 ms), an icon so the browser stops probing
   a 404 favicon, Fraunces instanced at the opsz and weight every rule already asks of it
   (121 KB to 32 KB), the mono narrowed to the range it uses (40 KB to 30 KB) - and then
   stopped, because what is left is the page itself. LCP is the dek, gated by resource arrival
   under simulated throttling, not by layout: a content-visibility pass moved nothing and was
   reverted. I did not lower the floor and I did not keep shaving until a noisy metric happened
   to clear. Rule on one of: (a) the floor stands and a later handoff reduces the page; (b) the
   floor becomes 90 for Record pages of this size and 95 stays for the splash; (c) the floor is
   measured on Vercel with brotli and a CDN rather than on `next start` in a container, which is
   a different and probably kinder number. My recommendation is (c) then (b).

2. THE ACCENT BUDGET AND THE MOCKUP DISAGREE, AND NEITHER SECTION 3 NOR CLAUDE.md BREAKS THE
   TIE. CLAUDE.md says gold is spent on exactly three things: the primary action, the active
   state, and value crossing a boundary. design-reviewer counted the gold-set block indices
   alone at 36 on /flows, 18 on /method, 10 on /network, and found six to nine further jobs per
   page - the wordmark, the h1 accent, the ledger row ids, the entry letters, the clock dot.
   Then it checked the reference renders: the mockup itself spends gold on eight to eleven jobs
   per screen, and the crews reproduced the design source faithfully. So this is not drift, it
   is two documents disagreeing, and unlike the ink ruling there is no tiebreak. I fixed only
   the inventions that had no warrant: the shielded-share chart drew its series in gold, which
   is a quantity and not a boundary crossing, and is now ink. I deliberately KEPT gold on the
   network loop's money edges, because a disclosed payment between two parties is exactly the
   "value crossing a boundary" the budget licenses - but that is my reading of a rule you wrote.
   Rule on it: either the budget yields to the mockup for the chrome and binds strictly on new
   marks, or the indices move to ink and the mockup is superseded the way its inks were.

3. THE SILBERT FORM 144 WAS WRONG IN THREE PLACES, AND HANDOFF-02 FIXED ONLY ONE. LEDGER-02
   round 4 caught "a Form 144 attributed to the wrong Silbert entity on the wrong day at a ZEC
   price mistaken for a share price" and corrected timeline.json. The same error was still live
   in contradictions.json C14 and in two network.json records: 9,753 shares attributed to Barry
   Silbert personally, dated 6 Nov, at "ZEC ~$544". EDGAR says Silbert Family Investments LLC
   filed on 5 Nov for 9,753 shares at $407,312.59, and Barry E. Silbert personally on 6 Nov for
   1,000 at $47,250.00 - about $41.76 a share, and no ZEC moved at all. All three now carry the
   EDGAR reading with both primary filings cited first. The lesson is not about Silbert: when a
   gate round corrects a fact, the correction has to be swept across every file that states it,
   and nothing in the protocol currently says so. Worth a line in CLAUDE.md.

4. THE QUARANTINE HAS NO HOME PAGE, AND permalink() CANNOT EXPRESS THAT. Section 3's id
   families map a prefix to a route, but the 32 unverified records are rendered beside the
   findings they qualify - four on /flows, four on /network, the rest unrendered - which is the
   right editorial call and unrepresentable as a prefix rule. I corrected permalink() to send
   U- to /flows (it said /sources, which renders no U- id at all, so every quarantine citation
   dead-ended), then had to add a module in apps/web holding the actual split. A `surface` field
   on Unverified would make this a property of the seed instead of a fact two files have to
   agree about. That belongs to whoever owns packages/content next.

5. SHOULD THE FOUR ROUTE STYLESHEETS STAY FOLDED INTO globals.css? I told each page crew to
   write its CSS into its own file so four parallel workers could not collide, which worked -
   zero collisions across 834 lines. But each import emitted its own stylesheet, and the second
   render-blocking request was worth about 1,370 ms on /beware, so I folded all four back in at
   gate round 4. globals.css is now 3,100 lines. design-reviewer's findings 5 to 7 - three
   preformatted-mono treatments, two compact-cell registers, seven card insets on a five-step
   ladder - are now all visible in one file, which is where they have to be before they can be
   collapsed. Confirm the consolidation should stay, and whether the de-duplication is a
   HANDOFF-04 deliverable or its own housekeeping pass.

INFERRED (non-empty inferences a worker made):

- The citation popover is a native <details> rather than the client island section 3 names. It
  is keyboard-operable, announced and dismissible with no JavaScript, and it registers no
  animation - which is precisely what A6 measures on every Record page. An island would have had
  to re-implement all three and then be excluded from A6 by hand.
- Charts are inline SVG through one frame, including the two-windows diagram the mockup builds
  from absolutely positioned divs. Section 3 says charts are inline SVG with a table twin, and
  that diagram carries the page's central claim, so it is the last one that should be
  unreadable to a screen reader.
- The splash pool bar is the exception and stays a flex row of coloured bands with a
  hand-written twin. HANDOFF-01 lost a gate round to that bar collapsing to 2 px slivers when it
  was built any other way, and the contract is that the numbers are readable without the
  picture, not that the picture is an <svg>.
- The timeline filter is server-first: the category search parameter sets the `hidden` attribute
  server-side, so /timeline?category=EXPLOIT works with JavaScript off, and the island upgrades
  it by toggling the same attribute. One attribute, one meaning. The CSS that makes it work is
  load-bearing and not obvious - `.tl .ev` sets display:grid at a specificity that defeats the
  user agent's [hidden] rule, so without an explicit `.tl .ev[hidden]` every hidden row renders.
- Series the corpus states as dated tables rather than as claim objects (the shielded share, the
  ZEC price) live in apps/web/src/lib/series.ts. packages/content's schemas describe claims, and
  a claim per data point would be thirty near-identical records saying nothing the table does
  not. They are held to the same standard by other means: every source id resolves through
  getSource(), and a sweep over the whole tree proves the same for all 52 ids written directly
  into apps/web.
- An `R-` id family was invented for research-04 figures with no record in packages/content (the
  rich list, the labelling survey, the provider table, the Form 144 counts). Each carries its
  primary sources, a confidence and an "unbound" chip explained in the page head.
- Nine figures the mockup draws are not on the shipped pages, because the corpus does not state
  them as drawn: two price points the research gives as a before-and-after pair rather than as
  dated closes, two drawdowns computed from intraday extremes the corpus quarantines, a diluted
  mNAV the seed does not carry, two phrase chips with no phrase record, and the mis-paired
  Grayscale figure deliverable 11 corrects.
- The page crews ran on the session model rather than section 6's Sonnet suggestion. Section 6
  is L2's routing suggestion and the director decides; these pages carry verbatim claims about
  named living people, which is where three consecutive handoffs have lost their gate rounds.
- /method restates the ClaimLevel union rather than importing it, because @zcashreveal/types is
  not a dependency of apps/web and adding one was outside the deliverable. HANDOFF-04 needs the
  DTOs anyway and should add it then.
- Fraunces is instanced at opsz 144 and wght 300, and JetBrains Mono narrowed to 400-700. Those
  are the values every rule in globals.css already asks for; a unit test reads the stylesheet and
  holds the assumption to it, so a rule asking for a weight the file cannot supply fails rather
  than getting a synthesised one.

NOT-MATCHED (patterns handed over that did not apply):

- `gh pr create` (CLAUDE.md, Workflow) is still unavailable in this environment. The PR was
  opened through the GitHub MCP tooling, as in HANDOFF-00, 01 and 02. Fourth session running;
  CLAUDE.md still says gh.
- Section 6 suggested `test-engineer` (Haiku) write the Playwright checks and `docs-scribe`
  capture the screens. The lead did both. Every one of the section 5 assertions needed a
  fail-state transcript designed against the specific way the assertion could be satisfied
  vacuously, and three of them were caught being vacuous by workers or by the suite itself.
- Section 6 suggested Loop 1 PREFLIGHT for any Haiku touching the chart code. No Haiku touched
  it, so no PREFLIGHT was issued.
- The `pretest` remedy L2's fold 1 named works, and then races. `pnpm -r` runs packages in
  parallel, so apps/gateway and apps/indexer both ran `tsc -b` over packages/zec-types at the
  same time and collided; A10 passed on one run and failed on the next with the very error it
  was meant to remove. Both suites now resolve the package to its source, which needs no build
  and cannot race.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):

- A3 says "every chart <svg> has a sibling <table> twin (Playwright counts match per page)".
  Read as charts, not as every svg: the design system is SVG-icons-only, so a bare svg count can
  never match a table count. `figure[data-chart]` is what marks a chart, and the structure is
  fixed so the assertion is a count rather than a judgement.
- A1 says "each page's first claim id is present in the HTML". /sources has no first claim id -
  it is the bibliography, and a citation popover on a source would cite the citation. It is
  asserted differently and deliberately: both labelled groups, and one row per source.
- A5 names two floors and one page but not the preset, the throttling or the server. Measured on
  the mobile preset with simulated throttling against `next start`, matching HANDOFF-01's stated
  convention. See question 1.
- Section 3 requires "a visually-hidden table twin for every chart" and also that "charts are
  inline SVG". The splash pool bar is a chart by the first sentence and not by the second. It
  carries a twin.
- Whether the accent budget or the mockup governs gold. See question 2.

GATE ROUND COUNTS: 4. See section 7 for the fingerprints. Rounds 1 to 3 converged on the
findings they were about; round 4 is A5, a different finding, and under the Loop 4 rule as
CLAUDE.md now states it that is not an overrun. No single finding took more than two rounds, and
the one that did - a <details> inside a <p>, written twice in one session an hour apart - is now
held by a unit test rather than by anyone remembering.

DEFERRED ASSUMPTIONS:

- The A5 performance floor. Question 1.
- The accent budget ruling. Question 2.
- De-duplicating the four route layers now folded into globals.css. Question 5.
- A `surface` field on Unverified so the quarantine's page is a property of the seed. Question 4.
- LedgerRow's Detectability and LedgerSeverity unions have drifted from the schema's
  detectableSchema and severitySchema (three values against four, and `note` against `mid`).
  BewareRow extends rather than edits it; the primitive is now used only by the dev gallery.
- Cite cannot distinguish a legitimately empty sources[] - an unlocatable quarantine claim,
  where the absence IS the finding - from a seed that has drifted from the schema. /flows works
  around it locally; the shared component should carry the distinction.
- No URL was fetched. Provenance is proven against the corpus, not the live web, and /sources
  states that limitation on the page. research 03 part F already reports at least one 404. A
  link-rot sweep needs an environment with egress.
- The preview deployment is READY but Deployment Protection blocks fetching it, for the second
  revolution running. Operator click 03.
- research 02 section 5.2 says the Orchard bug was "disclosed and patched in three days"; B2's
  own dated fields do not support that. The page prints B2's fields and no day count.
- TRACKING-MATH section 3.4 specifies an absolute fee tolerance the indexer does not ship.
  /method prints both, labelled "as specified" and "as shipped".
- The corpus and the loader disagree on chain height (3,456,227 against 3,456,938), issued
  supply and the shielded total. /flows surfaces all three rather than hiding them.
- The eslint no-unused-vars promotion and the unused `saplingSpend` in block-decoder.test.ts
  remain deferred to 06 or 07, as HANDOFF-00, 01 and 02 all recorded. Still the only warning.
```
