---
handoff: 10
title: Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0
status: in-progress
branch: `claude/handoff-08-completion-wngbjj` (session-designated; the harness names branches)
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

> **CONSTRAINT ON THE MAINNET FIXTURE, FROM HANDOFF-05 (23 Aug 2026).** The mainnet block
> fixture this handoff owns (LEDGER-00 Q4) must be CAPTURED from a real RPC response and
> committed as the node serialised it - never hand-written to satisfy the TypeScript interface.
> A hand-written fixture can only agree with the interface; it cannot disagree with the wire, and
> that disagreement is exactly what hid a dead field for three revolutions (`expiryHeight` in the
> interface against `expiryheight` on the wire). `apps/indexer/test/fixtures/transactions/` holds
> the convention and a casing test that enforces it.
>
> **THE THIRD COPY OF THE VIEWING-KEY EXPOSURE IS YOURS (HANDOFF-05 A9).** The gateway now drops
> the query string and redacts key-shaped runs before writing a log line, and refuses to echo
> either to a caller. Neither control reaches a reverse proxy: `cloudflared`, nginx and every load
> balancer log full URLs by default, so a viewing key that arrives at
> `https://api.../api/search?q=uview1...` is written to the proxy's access log whatever the
> gateway does. The runbook must configure the tunnel and anything in front of it to log paths
> without query strings, and say so where an operator will read it.

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docker-compose.yml`, `infra/zebrad/zebrad.toml`, `DEPLOY.md`, `docs/2.0/HANDOFF-2026-08-22-v2.md` §1, `docs/2.0/v0.2-notes/RUNBOOK-finish-v0.2.md` + `postgres-port-5433.patch` (the v0.2 VPS notes, imported by HANDOFF-00)
- Zebra 6.x docs: config reference (`[rpc] enable_cookie_auth`, address indexes), state format, checkpoints, disk requirements — cite the version read
- ZcashFoundation/zebra PR **#9805** (merged 22 Aug 2025), which is what puts `vjoinsplit` on `getrawtransaction` at all — see the version floor in §3 and deliverable 2b

> **THE ZEBRA VERSION FLOOR IS A CORRECTNESS FLOOR, NOT A FEATURE FLOOR, AND IT NOW HAS TWO REASONS.**
> `docs/2.0/HANDOFF-2026-08-22-v2.md` already mandates **`zfnd/zebra` >= 6.0.0** because 6.0.0 is the
> first release with NU6.3/Ironwood support (docs/2.0/research/01-contemporary-zcash.md:47, `high`).
> The second reason is quieter and worse. Zebra's `getrawtransaction` gained the `vjoinsplit` field
> only in **PR #9805, merged 22 Aug 2025**; before that the field is not serialised at all. Every
> Sprout term in this project reads `tx.vjoinsplit`, so against a node that predates that PR
> `sproutValueBalanceZat` returns `0n` for every transaction, silently, with no failing test — the
> same shape as the `expiryheight` defect that made every wallet fingerprint inert for three
> revolutions. `docker-compose.yml` still pins `zfnd/zebra:4.4.1`, which is on the wrong side of
> both reasons. *(L2 RESOLUTION for HANDOFF-06, fold 9. The `vjoinsplit` SPELLING is settled — the
> official zcash RPC documentation for `getrawtransaction` prints it all-lowercase in the same
> result object where the Sapling arrays are `vShieldedSpend`/`vShieldedOutput`, and PR #9805 adds
> that spelling to Zebra. The end-to-end path is not settled, which is why deliverable 2a stands.)*

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Pin `zfnd/zebra` at **>= 6.0.0**, `6.2.x` (exact tag chosen and cited). The floor is not stylistic: below 6.0.0 there is no Ironwood support, and below PR #9805 (merged 22 Aug 2025) `getrawtransaction` does not serialise `vjoinsplit` at all, which makes every Sprout value term silently `0n`. See §2. Healthchecks and `restart: unless-stopped` for all services; named volumes; Postgres on host port 5433; Redis AOF; multi-stage Dockerfiles on `node:22-alpine` for indexer/gateway/publisher; cloudflared from an env token.
- `infra/zebrad/zebrad.toml` for 6.x: re-validate `enable_cookie_auth = false` with the loopback-bound RPC; enable the address indexes HANDOFF-05 needs; ZMQ if supported else document the polling fallback.
- `docs/2.0/RUNBOOK-VPS.md`: sizing (≥ 4 vCPU / 16 GB / ≥ 500 GB NVMe), first sync with checkpoints, wipe-and-resync, Postgres backups, upgrade within one Zebra major, alert on snapshot age > 20 blocks, the tunnel steps (`cloudflared tunnel create zecreveal-gateway`, DNS route, ingress → `gateway:8080`).
- `docs/2.0/DEPLOY-2.0.md`: Vercel project `zecreveal` (Root `apps/web`, Framework Next.js, env vars) and the post-deploy smoke (assert the snapshot fallback is present in the built JS). There is no cutover from `z-cash-reveal-dashboard2` to write: the operator deleted both v0.2 projects on 23 Aug 2026 and `zecreveal` is the only one on the account (HANDOFF-04 correction).
- Two Redis instances, documented as such everywhere: **VPS Redis** (`REDIS_URL`, compose service `redis`, AOF — pub/sub, `zcashreveal:mempool:live`, anchor registry; hot path — the prefix is written in full because the managed store's is `zecreveal:`, one letter away, and this contract commissions the files where the two meet) and the **Vercel-managed Redis** (`SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL` for the publisher on the VPS; `SNAPSHOT_REDIS_KV_REST_API_URL` + `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` for `apps/web` on Vercel — the read-only token, never the read-write one). Compose passes the TCP URL to the `publisher` service only.
- **THE MANAGED STORE IS SHARED WITH AN UNRELATED PRODUCTION PROJECT.** Read `docs/2.0/SNAPSHOT.md` before writing any runbook step that touches it: every key begins `zecreveal:`; `FLUSHDB`, `FLUSHALL`, `SWAPDB` and `SCRIPT FLUSH` are forbidden; `KEYS` is forbidden outright and `SCAN` only with `MATCH zecreveal:*`; no `DEL` by pattern. This binds the RUNBOOK hardest of anything in this handoff, because a runbook is where a "just clear the bad snapshot" one-liner would actually be written down, and `scripts/check-redis-safety.mjs` will fail CI if one is. Nothing in this rule applies to the VPS Redis, which is ours alone.
- ~~`DEPLOY-2.0.md` 'Storage' step for the operator: connect the store and verify the injected names~~ — **DONE, and the answer is in.** This bullet told a future session to go and read the variable names out of the Environment Variables tab and record the result. The operator did exactly that on 23 Aug 2026 and the answer contradicted the names this repository stated: the store `upstash-kv-blue-garden` is connected to `zecreveal` for Production and Preview under the custom variable prefix `SNAPSHOT_REDIS`, injecting `SNAPSHOT_REDIS_KV_REST_API_URL`, `SNAPSHOT_REDIS_KV_REST_API_TOKEN`, `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN`, `SNAPSHOT_REDIS_KV_URL` and `SNAPSHOT_REDIS_REDIS_URL`. The old "map them to the repo names" instruction is **withdrawn** — mapping means hand-copying secrets that the integration rotates and the copies do not. The injected names are canonical; `docs/2.0/SNAPSHOT.md` §3 carries the table and the reasoning. This handoff writes the runbook against those names and does not re-derive them. No agent sets Vercel env vars.
- `.env.example` covers every service with a one-line comment per variable; secrets never committed.

## §4 DELIVERABLES

1. `docker-compose.yml` (prod), `docker-compose.dev.yml` (Windows override), three Dockerfiles, updated `zebrad.toml`, `RUNBOOK-VPS.md`, `DEPLOY-2.0.md`, `.env.example`.
   - `.env.example` specifically (LEDGER-01 fold 7): the root `.env.example` still carries the v0.2 `VITE_*`
     block — remove it. The `SNAPSHOT_*` half of this item is **already done**: HANDOFF-05 added the
     managed-store block with the names the integration actually injects, one comment per variable, plus
     `SNAPSHOT_REDIS_MONTHLY_BUDGET`. Do not re-add `SNAPSHOT_REDIS_URL`, `SNAPSHOT_REDIS_REST_URL` or
     `SNAPSHOT_REDIS_REST_TOKEN`: they are injected by nothing.
2. **Mainnet block fixture** (LEDGER-00 Q4): capture one post-NU5 mainnet block from the synced Zebra into `apps/indexer/test/fixtures/blocks/mainnet-<height>.json` and commit it, so `block-decoder.test.ts` stops self-skipping. Record the height, hash and RPC command used in `RUNBOOK-VPS.md`.
   - 2a. **The capture must include a Sprout transaction — one carrying at least one JoinSplit.** The request stands after the L2 RESOLUTION for HANDOFF-06 closed the spelling question, because the two are different facts: `vjoinsplit` is confirmed as the wire name by two primary sources, and no transaction with a JoinSplit has ever been through this decoder. A captured one is the only thing that exercises `sproutValueBalanceZat` end to end against bytes a node produced.
   - 2b. **Verify the pinned Zebra actually serialises `vjoinsplit`** on that captured transaction and record the observed `subversion` string beside the fixture. A node below PR #9805 omits the field, and the boundary check in `packages/zebra-rpc` reports that as indeterminate rather than as zero — the fixture is where "indeterminate" is turned into "observed".
5. **Integration-test database isolation** (LEDGER-06 Q6): decide and implement one of database-per-worker, an advisory lock, or schema-per-run, and say which and why. The suite is not safe against two concurrent vitest processes on one Postgres — every integration suite TRUNCATEs shared tables in `beforeEach` — and HANDOFF-06's round 2 produced failures in BOTH directions when two workers ran side by side: one worker's TRUNCATE wiping the other's rows mid-test, and foreign rows landing in a count, including a corrupted conservation assertion. Both workers proved it pre-existing against `git show HEAD:` versions of their own files. CI is safe only because `.github/workflows/ci.yml` runs one vitest process per package and `apps/indexer/vitest.config.ts` sets `fileParallelism: false`; that is a configuration, not a property, and it is what HANDOFF-07 has been told not to change to buy wall clock. This handoff owns CI topology, so it owns the decision. *(L2 RESOLUTION for HANDOFF-06, fold 8.)*
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
- **A8.** *(rewritten by HANDOFF-05: as written this assertion would have PASSED while pinning `SNAPSHOT_REDIS_URL`, a name nothing injects — a green assertion that reads as verification of a variable that does not exist.)* `.env.example` contains `REDIS_URL` and the injected managed-store names with comments naming their roles, and in `docker-compose.yml` the managed-store TCP URL (`SNAPSHOT_REDIS_KV_URL` / `SNAPSHOT_REDIS_REDIS_URL`) appears inside the `publisher` service block only (script splits the file per service and greps) *(fail side: add it to `gateway` → the script fails)*. The script must assert the names against `docs/2.0/SNAPSHOT.md` §3 rather than against a list retyped into the script, so the two cannot drift.
- **A8b.** *(added by HANDOFF-05.)* `node scripts/check-redis-safety.mjs` exits 0 with the runbook written *(fail side: put a `FLUSHDB` recovery step in `RUNBOOK-VPS.md` → it exits 1 naming the file and line)*. The runbook is the single likeliest place in this repository for a forbidden command to be written down, and this handoff is the one that writes it.
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
