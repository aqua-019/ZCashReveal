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
