---
handoff: 00
title: Housekeeping, docs import, CI runs tests, CLAUDE.md
status: shipped
branch: claude/aqua-stack-v4-1-handoff-818gb3 (session-designated; see LEDGER question 1)
track: Foundation — first
depends_on: —
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-00 — Housekeeping, docs import, CI runs tests, CLAUDE.md

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Make the repository ready for a multi-session 2.0 build **without changing any runtime behaviour**: import the 2.0 docs, rewrite `CLAUDE.md`, make CI run the test suites, fix the broken lint script, park the v0.2 dashboard under `legacy/`, and list (not run) the branch-cleanup commands.

**Out of scope:** No feature work. No edits to `apps/indexer/src` or `apps/gateway/src` logic. No deletion of `apps/dashboard` (it is moved, not removed). No branch deletions.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `README.md`, `CLAUDE.md`, `RESEARCH.md`, `DEPLOY.md`, `.github/workflows/ci.yml`, `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `apps/*/package.json`
- `_incoming/` — the single pickup upload (its own `README.md` lists the contents): plan, dossier, tracking math, handoff v2, `CLAUDE-CODE-PROMPTS.md`, `CLAUDE.md.draft`, `AQUA-STACK-v4.1.png`, `research/01–04`, `mockups/*.html` + `mockups/reference/*.png` (reference screenshots rendered with the real typefaces), `v0.2-notes/` (`RUNBOOK-finish-v0.2.md`, `postgres-port-5433.patch`), `handoffs/`
- Audit facts (Read, 22 Aug 2026 @ `cf5c775`): CI builds `types`+`dashboard` only and runs **no tests**; `lint` scripts call eslint which is **not installed** (0 hits in `pnpm-lock.yaml`); `packageManager` pnpm 9.12.0, Node ≥ 20; 22 stale `claude/*` + 2 merged `feat/*` remote branches.

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Existing tests must still pass: indexer 171 (133 live / 38 Postgres-gated), gateway 7.
- Keep pnpm 9.12.0; pin Node 22 via `.nvmrc` and CI.
- `legacy/*` joins `pnpm-workspace.yaml` so `legacy/dashboard` still builds.

## §4 DELIVERABLES

1. `docs/2.0/` populated from `_incoming/`: `ZECREVEAL-2.0-PLAN.md`, `RESEARCH-2026-08-DOSSIER.md`, `TRACKING-MATH.md`, `HANDOFF-2026-08-22-v2.md`, `CLAUDE-CODE-PROMPTS.md` (the flat prompt pack, reference only), `AQUA-STACK-v4.1.png`, `research/` (4 files), `mockups/` (the `.html` files + `reference/` screenshots + its README), `v0.2-notes/` (runbook + patch); `_incoming/README.md` is consumed, not copied; root `RESEARCH.md` → `docs/RESEARCH-v0.2.md` with a one-line pointer left at the root; `DEPLOY.md` gets a superseded banner.
2. `handoffs/` directory at the repo root containing `_incoming/handoffs/*` (this file included), `LEDGER.md`, `LOG.md` seeded with the first entry.
3. `CLAUDE.md` rewritten from `_incoming/CLAUDE.md.draft`.
4. `.github/workflows/ci.yml`: typecheck all packages; `vitest run` for `apps/indexer` and `apps/gateway` with a `postgres:16` service and `DATABASE_URL` set so the 38 integration tests execute; Node 22; pnpm 9.12.0; `pnpm --filter @zcashreveal/content validate` step added but allowed to skip while the package does not exist.
5. Root `eslint.config.js` (flat config, typescript-eslint recommended, a `no-restricted-properties` rule banning `Math.random`) + devDependencies, so `pnpm lint` exits 0.
6. `apps/dashboard` → `legacy/dashboard` via `git mv`, with `legacy/dashboard/README.md` explaining its status.
7. `docs/2.0/BRANCH-CLEANUP.md` listing exact `git push origin --delete <branch>` commands for every stale branch (from `git branch -r`). Not executed.
8. `README.md` updated: thesis, new structure, status line '2.0 in progress', pointer to `docs/2.0` and `handoffs/`.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm install --frozen-lockfile && pnpm -r test` exits 0 on a clean checkout of the branch. *(fail side: add a throwing test file, observe non-zero exit, remove it.)*
- **A2.** `pnpm typecheck` exits 0. *(fail side: introduce a type error in a scratch file under `packages/zec-types/src`, observe failure, revert.)*
- **A3.** `pnpm lint` exits 0 and reports the `Math.random` rule as active (`pnpm lint` on a scratch file containing `Math.random()` reports an error).
- **A4.** `.github/workflows/ci.yml` contains a `services: postgres` block and a step invoking `vitest run` for both `apps/indexer` and `apps/gateway`; the workflow passes on the PR (Executed: CI run URL in §7).
- **A5.** On the CI run, the indexer integration tests are **not** skipped: the vitest summary shows 0 skipped for `apps/indexer`. *(fail side: unset `DATABASE_URL` locally → 38 skipped.)*
- **A6.** `legacy/dashboard` builds: `pnpm --filter @zcashreveal/dashboard build` exits 0 from the new path.
- **A7.** `docs/2.0/` contains exactly these top-level files — `ZECREVEAL-2.0-PLAN.md`, `RESEARCH-2026-08-DOSSIER.md`, `TRACKING-MATH.md`, `HANDOFF-2026-08-22-v2.md`, `CLAUDE-CODE-PROMPTS.md`, `BRANCH-CLEANUP.md`, `AQUA-STACK-v4.1.png` — plus `research/` (4 files), `mockups/` (2 `.html` + `reference/` with 12 `.png` + `README.md`) and `v0.2-notes/` (2 files); `handoffs/` contains 14 `HANDOFF-*.md`, `LEDGER.md`, `LOG.md`, `README.md`; `_incoming/` no longer exists (`git mv`, not copy).
- **A8.** `git diff --stat main..HEAD -- apps/indexer/src apps/gateway/src` is empty (no runtime source changes).
- **A9.** `grep -rP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' --include=*.md --include=*.ts --include=*.tsx --include=*.yml .` (excluding `node_modules`, `legacy/`, `docs/2.0/research/`) returns nothing.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Routing hint for director-build: mostly mechanical — `backend-api` (Haiku) for CI/eslint/workspace edits **after a PREFLIGHT** (mechanical-rule dispatch); `docs-scribe` seeds `LOG.md`/`LEDGER.md`; `test-engineer` produces the §5 transcripts.
- director-quality: `devops-deployer` verifies the CI run; `security-auditor` checks no secrets entered `docs/2.0` or `handoffs/` (the research files contain addresses and filings — public, but scan anyway).

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/aqua-stack-v4-1-handoff-818gb3 -> #31 (https://github.com/aqua-019/ZCashReveal/pull/31) (draft, stops at opened)
  The front-matter named feat/v2-00-housekeeping. This session was opened with a
  harness-designated branch and instructed not to push elsewhere without explicit
  permission, so the work is on the designated branch. LEDGER question 1.

SPAWN MODE (proven by tool attempt, reported before any other output):
  SUBAGENT-CAPABLE, flat (one tier). Probe: Agent tool invoked live, agent
  a64930e191d7cf16c returned "SPAWN-PROBE: OK", 3 tool uses, 31s. Per CLAUDE.md
  subagents do not nest, so the lead held director-build and director-quality in-seat.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  director-build   : held in-seat by the lead. Every mutating step (git mv, lockfile,
                     eslint config, CI, README) executed sequentially in one writer to
                     keep the tree consistent; a fan-out of writers over one worktree
                     would have raced on package.json and the lockfile.
  director-quality : held in-seat by the lead. All nine assertions executed directly so
                     each transcript is first-hand rather than relayed.
  Workers actually spawned (read-only reconnaissance, parallel, workflow
  handoff-00-recon / wf_7606f30b-d5b, 4 agents, 63 tool calls, 302k tokens):
    researcher:dashboard-refs   DONE  every reference that breaks on the legacy/ move
    researcher:test-topology    DONE  test inventory + the exact Postgres gate mechanism
    researcher:docs-inventory   DONE  _incoming manifest, plan thesis, structure
    researcher:root-docs        DONE  root docs, CI state, workspace script matrix
  No worker wrote to the repository; the working tree was verified clean after the run.

FILES (created / modified / moved):
  Moved (git mv, rename-detected, 73 renames, zero content change):
    2026-08-22-pickup/ -> _incoming/                       (46 files, first commit)
    _incoming/{PLAN,DOSSIER,TRACKING-MATH,HANDOFF-v2,PROMPTS,PNG} -> docs/2.0/
    _incoming/{research,mockups,v0.2-notes}/ -> docs/2.0/
    _incoming/handoffs/ -> handoffs/                       (14 + LEDGER + LOG + README)
    _incoming/CLAUDE.md.draft -> CLAUDE.md
    RESEARCH.md -> docs/RESEARCH-v0.2.md
    apps/dashboard/ -> legacy/dashboard/
  Consumed: _incoming/README.md (manifest, not copied). _incoming/ no longer exists.
  Created: .nvmrc (22) · eslint.config.js · docs/2.0/BRANCH-CLEANUP.md ·
    legacy/dashboard/README.md · scripts/check-no-emoji.sh ·
    scripts/assert-no-skipped-integration.mjs
  Modified: .github/workflows/ci.yml · README.md (rewritten) · RESEARCH.md (now a
    pointer) · DEPLOY.md (superseded banner + legacy/ paths) · package.json ·
    pnpm-workspace.yaml (+legacy/*) · turbo.json (+test task) · vercel.json
    (outputDirectory -> legacy/dashboard/dist) · .gitignore · pnpm-lock.yaml
    (regenerated: importer key apps/dashboard -> legacy/dashboard) ·
    handoffs/LOG.md · handoffs/LEDGER.md
  Untouched: apps/indexer/src, apps/gateway/src (A8).

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance):

A1 PASS (Executed): pnpm install --frozen-lockfile -> "Already up to date", rc=0;
   pnpm -r test -> gateway "Tests 7 passed (7)"; indexer "Tests 133 passed | 38 skipped
   (171)"; rc=0.
A1 FAIL (Executed): added apps/gateway/src/__tests__/__probe__.test.ts asserting
   expect(1).toBe(2) -> "Test Files 1 failed | 1 passed (2)", "Tests 1 failed | 7 passed
   (8)", ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL, rc=1. Probe removed; rc=0 restored.

A2 PASS (Executed): pnpm typecheck -> "Tasks: 5 successful, 5 total", rc=0. All five
   packages, including the dashboard from its new legacy/ path.
A2 FAIL (Executed): packages/zec-types/src/__typecheck_probe__.ts with
   `export const zatoshi: bigint = "not a bigint";` -> "error TS2322: Type 'string' is not
   assignable to type 'bigint'", "Tasks: 0 successful, 2 total", rc=2. Reverted; rc=0.

A3 PASS (Executed): pnpm lint -> "1 problem (0 errors, 1 warning)", rc=0.
A3 FAIL (Executed): scratch file containing `return Math.random();` ->
   "error  'Math.random' is restricted from being used. Math.random is banned. Seed from
   the chain tip instead (FNV-1a -> mulberry32); see CLAUDE.md, Design system
   no-restricted-properties", rc=1. Removed; rc=0 restored. Rule confirmed active.

A4 PASS (Executed on CI):
   .github/workflows/ci.yml contains `services: postgres` (image postgres:16, pg_isready
   health check) and two steps invoking `vitest run` - one for apps/indexer, one for
   apps/gateway. Verified by parsing the YAML: job `verify`, services ['postgres'].
   The workflow passed on this PR at head 0eb45d4:
     run 32603472860 - conclusion SUCCESS
     https://github.com/aqua-019/ZCashReveal/actions/runs/32603472860
   All 16 steps green: Install, Build, Typecheck (all packages), Lint, No emoji anywhere,
   Migrate database, Test - apps/indexer, Assert Postgres integration tests actually ran,
   Test - apps/gateway, Validate content package, Upload test report.
   Runner log excerpts:
     [migrate] apply 001_initial.sql / 002_candidate_analysis.sql / done
     Test Files 19 passed (19); Tests 170 passed | 1 skipped (171)     [indexer]
     Test Files  1 passed  (1); Tests   7 passed (7)                   [gateway]
     packages/content does not exist yet (arrives in HANDOFF-02); skipping validation.
   The whole sequence had also been rehearsed locally against a real PostgreSQL 16
   before the first push; every step rc=0 there too.
   NOTE: the write-back commit that fills in these numbers necessarily triggers a fresh
   run of the same workflow on the new head. The run above is the evidence for 0eb45d4.

A5 CORRECTED (Executed) - the literal clause is unsatisfiable; the intent is met.
   PASS (intent), locally: with a live migrated PostgreSQL 16 on 127.0.0.1:55432,
     `pnpm --filter @zcashreveal/indexer test` -> "Test Files 19 passed (19)",
     "Tests 170 passed | 1 skipped (171)". All 37 Postgres-gated integration tests
     executed; 0 integration tests skipped.
   PASS (intent), on CI (run 32603472860): every one of the seven integration files
     reports executed tests, summing to exactly 37 -
       integration/pool-anchors.test.ts          7 tests
       integration/pool-boundary-flows.test.ts   8 tests
       integration/pool-commitments.test.ts      7 tests
       integration/pool-nullifiers.test.ts       5 tests
       integration/precision.test.ts             4 tests
       integration/replay.test.ts                2 tests
       integration/rollback.test.ts              4 tests
     and the guard step printed:
       [assert] total=171 passed=170 failed=0 skipped=1
       [assert] integration files with executed tests: 7
       [assert] skipped (allowed): decodeBlock - real mainnet fixture ...
       [assert] OK: every Postgres integration test executed.
   FAIL (as specified in §5): with DATABASE_URL unset ->
     "Tests 133 passed | 38 skipped (171)" - and vitest still exits 0.
   CORRECTION: §5 says the summary must show "0 skipped for apps/indexer". It cannot.
     171 = 133 always-live + 37 Postgres-gated + 1 gated on a captured mainnet block
     fixture (block-decoder.test.ts, `describe.skipIf(fixturePath === null)`, needs
     apps/indexer/test/fixtures/blocks/mainnet-*.json, which needs a synced zebrad).
     The §2 audit fact "38 Postgres-gated" is off by one for the same reason.
     Best achievable here is 170 passed / 1 skipped.
   HARDENING: the integration suites gate on a TCP reachability probe, not on
     DATABASE_URL, so a misconfigured database silently yields a green 133-test run.
     scripts/assert-no-skipped-integration.mjs turns that into a build failure and runs
     as a CI step. Proven both ways: against the with-Postgres report ->
     "OK: every Postgres integration test executed", rc=0; against the without-Postgres
     report -> names all 37 skipped tests individually and exits 1.

A6 PASS (Executed): pnpm --filter @zcashreveal/dashboard build from legacy/dashboard ->
   "tsc -b && vite build", "57 modules transformed", "built in 1.13s", rc=0. Output at
   legacy/dashboard/dist, which is exactly where the updated vercel.json now points.

A7 PASS (Executed): structural check - docs/2.0 top-level is exactly the seven specified
   files; subdirectories exactly research/, mockups/, v0.2-notes/; research 4 files;
   mockups 2 .html; mockups/reference 12 .png + README.md; v0.2-notes 2 files; handoffs
   14 HANDOFF-*.md + LEDGER.md + LOG.md + README.md; _incoming does not exist. All PASS.
   Rename provenance: git reports 73 R (rename) entries, 2 D, 7 A, 11 M - moves, not
   copies.
A7 FAIL (Executed): touched docs/2.0/STRAY.md -> exact-match False, extra ['STRAY.md'].
   Removed; exact-match True restored.

A8 PASS (Executed): `git diff --stat main -- apps/indexer/src apps/gateway/src` is empty;
   `git diff --name-only` over the same paths returns 0 files.
A8 FAIL (Executed): appended a comment line to apps/gateway/src/ws-broker.ts ->
   "1 file changed, 2 insertions(+)", changed files = 1. Reverted; back to 0.

A9 PASS (Executed): ./scripts/check-no-emoji.sh -> "OK - no emoji in *.md, *.ts, *.tsx,
   *.yml (excluding legacy/ and research/)", rc=0.
A9 FAIL (Executed): planted a U+1F680 rocket in docs/__emoji_probe__.md ->
   "FAIL - emoji found ... ./docs/__emoji_probe__.md:1", rc=1. Removed; rc=0 restored.
A9 METHOD NOTE (Executed): the §5 command run verbatim in this shell prints
   "grep: character code point value in \x{} or \o{} is too large" and the pipeline
   still reports clean - a false negative. The script forces LC_ALL=C.UTF-8 and aborts
   with rc=2 if the regex engine cannot match a known emoji, so it cannot silently pass.
   Only emoji in the repository are 21 U+26A0 warning markers inside
   docs/2.0/research/03 and 04 - imported third-party research, inside A9's own
   research/ carve-out, left verbatim.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):
  1. CORRECTED - A5 "0 skipped": read as intent, not literally. Full evidence above.
  2. CORRECTED - §2 "38 Postgres-gated": it is 37 Postgres + 1 fixture-gated.
  3. CORRECTED - §2 "22 stale claude/*": the live remote has 20 (19 merged, 1 not) plus
     2 merged feat/*. BRANCH-CLEANUP.md is generated from live git, so it is right either
     way.
  4. ACCEPTED - delivered on the session-designated branch, not feat/v2-00-housekeeping.
  5. ACCEPTED - eslint no-unused-vars is "warn" in test files. A real finding exists at
     apps/indexer/src/decoder/__tests__/block-decoder.test.ts:22 and A8 forbids editing
     it, so "error" would make A3 and A8 mutually unsatisfiable.
  6. ACCEPTED - vercel.json updated rather than deleted; the v0.2 project must keep
     building until the HANDOFF-11 cutover.
  7. ACCEPTED - root package.json gained "type": "module" so the flat config parses as
     ESM without a Node warning. Inert for every workspace package.
  8. ACCEPTED - turbo.json gained a `test` task. It had none, so `turbo run test` errored
     outright; A1 uses `pnpm -r test` and was unaffected either way.
  9. ACCEPTED - postgres-port-5433.patch not applied; its own runbook calls it the
     non-recommended option and 5433 is one dev host's property.
  10. DEFERRED - the mainnet block fixture, to HANDOFF-10.

NOTICED (outside scope, not acted on):
  - apps/gateway/src/ws-broker.ts:8 still points at apps/dashboard/src/lib/ws.ts. Stale
    after the move; correcting it would violate A8. HANDOFF-05 owns that file.
  - The old CI job was named `typecheck` and never ran typecheck - two build commands
    only. indexer and gateway, where all 178 tests live, were never touched by CI.
  - `turbo run lint` reaches only the two packages declaring a lint script, so
    packages/zec-types was never lintable. The root script is now `eslint .` (one pass,
    whole monorepo) instead.
  - The 21 U+26A0 markers in docs/2.0/research/03-04 are load-bearing UNVERIFIED and
    CORRECTION flags in imported research. Left verbatim under A9's carve-out.
  - `->` and `<->` appear ~147 times across the shipped tree as domain notation, one of
    them inside a type-level string union (packages/zec-types/src/leaks.ts:98,
    "sapling->orchard"). They are arrows, not emoji; the scan does not match them and
    they must not be "cleaned".

UNVERIFIED (labelled):
  - That Vercel's build succeeds from the new outputDirectory. The build and its output
    path were verified locally (A6), but the Vercel-side run is UNVERIFIED and is an
    operator click.
  - That `pnpm --filter @zcashreveal/dashboard build` runs in CI. It does not: CI never
    builds the legacy app on its own, only `pnpm build` via turbo, which does include it.
    A6 was verified locally, not on the runner.
  - Nothing else. A1-A5 and A7-A9 are Executed with transcripts above; A4 and A5 now
    carry CI evidence as well as local.
  - Noticed on the runner, not acted on: GitHub warns that actions/checkout@v4,
    setup-node@v4, upload-artifact@v4 and pnpm/action-setup@v4 still target Node 20 and
    are being forced onto Node 24. Cosmetic today; a future handoff should bump them.

GATE ROUNDS: 0 · no assertion required a re-dispatch. A3 (lint error inside a file A8
  protects) and A5 (unsatisfiable literal) were identified and resolved during first
  execution, before any gate evaluation, so no fingerprinted round was opened.

PREVIEW URL (if any): none. This handoff ships no deployable surface; apps/web arrives in
  HANDOFF-01.
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):
INFERRED (non-empty inferences a worker made):
NOT-MATCHED (patterns handed over that did not apply):
SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
GATE ROUND COUNTS:
DEFERRED ASSUMPTIONS:
```
