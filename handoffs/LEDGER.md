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
