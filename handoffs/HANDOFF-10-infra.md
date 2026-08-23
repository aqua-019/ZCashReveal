---
handoff: 10
title: Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0
status: open
branch: the session-designated branch (name it `feat/v2-10-infra` if you may choose)
track: Infra
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-10 — Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Production infrastructure as files: a compose stack for a Linux VPS (Zebra 6.2.x, Postgres 16, Redis 7, indexer, gateway, publisher, cloudflared), a dev override for the Windows box, the Zebra 6 config, a VPS runbook, and the 2.0 deploy guide for the new Vercel project. **No containers are started by any agent.**

**Out of scope:** No `docker compose up`, no cloud provisioning, no DNS changes. `docker build` of the repo Dockerfiles is allowed.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docker-compose.yml`, `infra/zebrad/zebrad.toml`, `DEPLOY.md`, `docs/2.0/HANDOFF-2026-08-22-v2.md` §1, `docs/2.0/v0.2-notes/RUNBOOK-finish-v0.2.md` + `postgres-port-5433.patch` (the v0.2 VPS notes, imported by HANDOFF-00)
- Zebra 6.x docs: config reference (`[rpc] enable_cookie_auth`, address indexes), state format, checkpoints, disk requirements — cite the version read

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Pin `zfnd/zebra:6.2.x` (exact tag chosen and cited). Healthchecks and `restart: unless-stopped` for all services; named volumes; Postgres on host port 5433; Redis AOF; multi-stage Dockerfiles on `node:22-alpine` for indexer/gateway/publisher; cloudflared from an env token.
- `infra/zebrad/zebrad.toml` for 6.x: re-validate `enable_cookie_auth = false` with the loopback-bound RPC; enable the address indexes HANDOFF-05 needs; ZMQ if supported else document the polling fallback.
- `docs/2.0/RUNBOOK-VPS.md`: sizing (≥ 4 vCPU / 16 GB / ≥ 500 GB NVMe), first sync with checkpoints, wipe-and-resync, Postgres backups, upgrade within one Zebra major, alert on snapshot age > 20 blocks, the tunnel steps (`cloudflared tunnel create zecreveal-gateway`, DNS route, ingress → `gateway:8080`).
- `docs/2.0/DEPLOY-2.0.md`: Vercel project `zecreveal` (Root `apps/web`, Framework Next.js, env vars), cutover from `z-cash-reveal-dashboard2`, post-deploy smoke (assert the snapshot fallback is present in the built JS).
- Two Redis instances, documented as such everywhere: **VPS Redis** (`REDIS_URL`, compose service `redis`, AOF — pub/sub, `mempool:live`, anchor registry; hot path) and the **Vercel-managed Redis** (`SNAPSHOT_REDIS_URL` for the publisher on the VPS; `SNAPSHOT_REDIS_REST_URL` + `SNAPSHOT_REDIS_REST_TOKEN` for `apps/web` on Vercel — the read-only token). Compose passes `SNAPSHOT_REDIS_URL` to the `publisher` service only.
- `DEPLOY-2.0.md` 'Storage' step for the operator: Vercel → project `zecreveal` → Storage → connect the existing Marketplace Redis store; read the variable names the integration injected (Upstash-style `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` / `KV_URL` / `REDIS_URL`, or Redis-Cloud-style `REDIS_URL` — **verify in the project's Environment Variables tab and record the result as an ASSUMPTION → ACCEPTED/CORRECTED in §7**); map them to the repo names (REST URL + read-only token → `SNAPSHOT_REDIS_REST_*` on Vercel; the TCP `rediss://` URL → `SNAPSHOT_REDIS_URL` in the VPS `.env`). No agent sets Vercel env vars.
- `.env.example` covers every service with a one-line comment per variable; secrets never committed.

## §4 DELIVERABLES

1. `docker-compose.yml` (prod), `docker-compose.dev.yml` (Windows override), three Dockerfiles, updated `zebrad.toml`, `RUNBOOK-VPS.md`, `DEPLOY-2.0.md`, `.env.example`.
   - `.env.example` specifically (LEDGER-01 fold 7): the root `.env.example` still carries the v0.2 `VITE_*`
     block and documents no `SNAPSHOT_*` name. Remove the former; add `SNAPSHOT_REDIS_URL`,
     `SNAPSHOT_REDIS_REST_URL` and `SNAPSHOT_REDIS_REST_TOKEN`, each with its one-line comment.
2. **Mainnet block fixture** (LEDGER-00 Q4): capture one post-NU5 mainnet block from the synced Zebra into `apps/indexer/test/fixtures/blocks/mainnet-<height>.json` and commit it, so `block-decoder.test.ts` stops self-skipping. Record the height, hash and RPC command used in `RUNBOOK-VPS.md`.
3. Bump the pinned GitHub Actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `pnpm/action-setup`) to versions whose runtime is not deprecated — the HANDOFF-00 run warned that all four are being forced onto Node 24 (LEDGER-00 NOTICED).
4. **Playwright e2e CI job** (LEDGER-01 Q3, fold 6): a job separate from the main verify job, triggered only by a
   paths filter on `apps/web/**`, installing chromium in the job (`playwright install --with-deps chromium`) and
   running `pnpm --filter @zcashreveal/web test:e2e`. It gates apps/web PRs without gating unrelated ones.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `docker compose -f docker-compose.yml config` exits 0; `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` exits 0.
- **A2.** `docker build` of each Dockerfile exits 0 (Executed; image sizes reported).
- **A3.** `zebrad.toml` parses as TOML and contains `enable_cookie_auth = false` under `[rpc]` and the address-index keys named in the runbook (test script).
- **A4.** The compose file has a `healthcheck` for every service (script counts `healthcheck:` blocks = service count).
- **A5.** `grep -rn 'sk_\|token=\|PASSWORD=' docker-compose*.yml` shows only `${VAR}` references, never literal values.
- **A6.** `RUNBOOK-VPS.md` contains a command for each of: provisioning, first sync, wipe-and-resync, backup, upgrade, tunnel create/route/run (checklist test by `docs-scribe`).
- **A7.** `DEPLOY-2.0.md` lists every `NEXT_PUBLIC_*` and every server-only `SNAPSHOT_*` variable used in `apps/web` (script cross-checks `grep -rhoE '(NEXT_PUBLIC|SNAPSHOT)_[A-Z_]*' apps/web/src` against the doc).
- **A8.** `.env.example` contains both `REDIS_URL` and `SNAPSHOT_REDIS_URL` with comments naming their roles, and in `docker-compose.yml` the string `SNAPSHOT_REDIS_URL` appears inside the `publisher` service block only (script splits the file per service and greps) *(fail side: add it to `gateway` → the script fails)*.
- **A9.** With the fixture committed, `pnpm --filter @zcashreveal/indexer test` reports 0 skipped and `node scripts/assert-no-skipped-integration.mjs` prints no `skipped (allowed)` line *(fail side: move the fixture aside → the test self-skips again)*.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `backend-api` (Haiku) writes compose/Dockerfiles from a `chain-integrator` (Sonnet) spec after PREFLIGHT (RPC/auth trigger); `researcher` (Haiku) reads the Zebra 6 docs and returns cited facts; `docs-scribe` assembles the runbook.
- director-quality: `devops-deployer` reviews the builds and healthchecks; `security-auditor` reviews exposed ports and the tunnel ingress (only `gateway:8080`; never `:8232`).

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
