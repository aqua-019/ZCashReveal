---
handoff: 00
title: Housekeeping, docs import, CI runs tests, CLAUDE.md
status: open
branch: feat/v2-00-housekeeping
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
STATUS: DONE | DONE-WITH-ASSUMPTIONS | BLOCKED | OUT-OF-DEPTH | NOT CONVERGING
BRANCH / PR:
DIRECTORS SPAWNED (lead names each + spawn mode proven):
FILES (created / modified / moved):
EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):
ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason):
NOTICED (outside scope, not acted on):
UNVERIFIED (labelled):
GATE ROUNDS: n · fingerprints (file · rule · severity) per round
PREVIEW URL (if any):
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
