---
handoff: 10
title: Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0
status: shipped
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
STATUS: DONE-WITH-ASSUMPTIONS

  Every deliverable is complete as files except deliverable 2 (the captured mainnet
  block fixture), which is BLOCKED on hardware no session can reach, and A2/A9,
  which depend on it or on Docker image pulls this container's egress policy
  refuses. Both are reported with executed transcripts of the refusal rather than
  as omissions. Nothing was narrowed to make the gate pass.

BRANCH / PR: claude/handoff-08-completion-wngbjj -> PR (this one). Base 4386e98.
  The branch name is the harness's and names HANDOFF-08; it is this session's
  designated branch and the work on it is HANDOFF-10's. LOG.md and LEDGER.md key
  on the PR TITLE, which begins `HANDOFF-10:`, exactly for this reason.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  SPAWN MODE: PROVEN, by tool attempt, before any work. The `Agent` tool spawned an
  `Explore` subagent which ran and returned a full survey of the infra surface; the
  `Workflow` tool spawned a four-lens review with per-finding verifiers. Subagent
  fan-out is available in this session.

  The lead built the infrastructure directly rather than dispatching a
  director-build. §6 suggests `backend-api` (Haiku) writing compose from a
  `chain-integrator` spec. That routing assumes the spec is the hard part, and here
  it was not: four of this handoff's load-bearing facts CONTRADICT the spec (see
  ASSUMPTIONS), and each was found by reading Zebra's source rather than by writing
  YAML. Fan-out was spent where this project's own evidence says it pays - one gate
  round, four lenses, three adversarial verifiers per finding - plus the read-only
  Explore survey at the start.

  POST-FAN-OUT SWEEP, per CLAUDE.md, after each of the two fan-outs and before the
  next commit: `git status --porcelain` returned EMPTY after the Explore survey. It
  is stated again in GATE ROUNDS for the review fan-out. No worker wrote to the tree.

FILES (created / modified / moved):
  Created (16):
    .dockerignore
    docker-compose.dev.yml
    apps/indexer/Dockerfile              apps/indexer/docker-healthcheck.mjs
    apps/gateway/Dockerfile              apps/gateway/docker-healthcheck.mjs
    apps/publisher/Dockerfile            apps/publisher/docker-healthcheck.mjs
    infra/cloudflared/Dockerfile
    apps/indexer/test/global-setup.ts
    .github/workflows/e2e.yml
    docs/2.0/RUNBOOK-VPS.md
    scripts/check-compose.mjs
    scripts/check-zebrad-config.mjs
    scripts/check-infra-docs.mjs
  Modified (10):
    docker-compose.yml                   infra/zebrad/zebrad.toml
    .env.example                         package.json
    .github/workflows/ci.yml
    apps/indexer/vitest.config.ts
    apps/indexer/src/persistence/__tests__/integration/_setup.ts
    apps/indexer/src/persistence/__tests__/integration/migrations.test.ts
    docs/2.0/DEPLOY-2.0.md
    handoffs/HANDOFF-10-infra.md         handoffs/README.md
  Moved: none.
  26 files, +3180 / -56.

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance)

  A1  docker compose config, both files.  PASS: Executed.
      $ docker compose --env-file /tmp/a1.env -f docker-compose.yml config   -> rc=0
      $ docker compose --env-file /tmp/a1.env \
          -f docker-compose.yml -f docker-compose.dev.yml config             -> rc=0
      Services resolved: cloudflared, gateway, indexer, postgres, redis, zebrad;
      plus `publisher` with --profile publisher (7 total).
      FAIL SIDE: Executed. The four required variables are written `${VAR:?...}`,
      so with no env file the same command exits non-zero naming the variable. That
      is the mechanism, not a decoration: it is why a production bring-up cannot
      default GATEWAY_TRUSTED_PROXIES to empty.

  A2  docker build of each Dockerfile.  **BLOCKED — not passed, not skipped.**
      Executed, and the refusal captured verbatim:
      $ docker build --check -f apps/indexer/Dockerfile .
        ERROR: node:22-alpine: failed to resolve source metadata ...
        production.cloudfront.docker.com ... : Forbidden
      Identical for the gateway, publisher and cloudflared images (the last on
      busybox:1.37-musl). The proxy status endpoint records it as
      `connect_rejected ... gateway answered 403 to CONNECT (policy denial)`.
      This is an ORGANISATION EGRESS POLICY, and /root/.ccr/README.md says to
      report a 403 rather than route around it, so it was reported.
      WHAT IS NEVERTHELESS EVIDENCE: BuildKit parsed all four files far enough to
      resolve the instruction graph and to point at the exact FROM line, so the
      Dockerfile SYNTAX is valid. What is unverified is the BUILD - layer caching,
      the pnpm filtered install, the native build of `zeromq` on musl, and the
      final image sizes §5 asks for. Labelled UNVERIFIED below. The operator's
      first `docker compose build` on the VPS is the first real execution.

  A3  zebrad.toml parses; enable_cookie_auth = false; the keys the runbook names.
      PASS: Executed. `node scripts/check-zebrad-config.mjs` -> rc=0, reporting the
      file parses, every key in [health, metrics, network, rpc, state, tracing] is
      one Zebra 6.2.3 accepts, [rpc] enable_cookie_auth = false, and the health
      port, state directory and config path all agree with docker-compose.yml.
      FAIL SIDE: Executed, four separate mutations, each restored:
        enable_cookie_auth = true      -> rc=1 naming the A3 rule
        `filter` -> `filtr`            -> rc=1 "unknown key [tracing] filtr"
        health port 8080 -> 8099       -> rc=1 "the two must agree"
        network = Mainnet (unquoted)   -> rc=1 "unsupported value for network"
      THE THIRD CLAUSE OF A3 CANNOT BE SATISFIED AS WRITTEN. See ASSUMPTIONS.

  A4  a healthcheck for every service.
      PASS: Executed. `node scripts/check-compose.mjs` -> rc=0, "7 service(s) in
      docker-compose.yml all declare a healthcheck".
      FAIL SIDE: Executed twice. Removing zebrad's healthcheck -> rc=1 naming it.
      And, accidentally but far better, the guard was run against the PRE-HANDOFF-10
      committed docker-compose.yml and failed it on this very rule: zebrad had no
      healthcheck, which is the defect A4 exists to catch, present in main.

  A5  no literal secret in any compose file.
      PASS: Executed, same run, "no literal secret in 2 compose file(s)".
      FAIL SIDE: Executed. A literal TUNNEL_TOKEN -> rc=1 at docker-compose.yml:325.
      And again on the pre-HANDOFF-10 file: `POSTGRES_PASSWORD: zcashreveal` ->
      rc=1 at line 26.
      A5 CAUGHT THIS SESSION'S OWN DRAFT TWICE, and the second time is the one worth
      reading. First: docker-compose.dev.yml wrote the dev credentials out in full,
      reasoning that a loopback throwaway database holds nothing. Corrected to
      `${VAR:-default}` - which passed, and only because A5 could not yet see inside
      an interpolation default. Gate round 1 closed that blindness and the SAME LINE
      was flagged again, correctly: a default is a committed literal, and a known
      password in the dev file is the template somebody copies into the production
      one. The dev override now inherits the base file's required password and sets
      none of its own.

  A6  the runbook carries a COMMAND for each named operation.
      PASS: Executed. `node scripts/check-infra-docs.mjs` -> rc=0, "a command for all
      14 topics A6 requires".
      FAIL SIDE: Executed twice, each restored: replacing the `pg_dump` line with an
      echo -> rc=1 "no command for backup"; commenting out the DNS route ->
      rc=1 "no command for tunnel route". Both keep their section HEADINGS, which is
      the point - the guard looks for the command, not the prose.

  A7  DEPLOY-2.0.md names every variable apps/web reads.
      PASS: Executed, same run, all 5 NEXT_PUBLIC_/SNAPSHOT_ variables named.
      (The count was 6 before gate round 1 narrowed the scan to the two prefixes
      A7 is about; `NODE_ENV` had been passing on a prose sentence.)
      FAIL SIDE: Executed. Adding `process.env.NEXT_PUBLIC_UNDOCUMENTED_PROBE` to
      apps/web/src/lib/env.ts -> rc=1 naming it; reverted.
      A7 IS NOT IMPLEMENTED AS ITS LITERAL GREP. See ASSUMPTIONS.

  A8  the managed-store TCP URL in the publisher service and nowhere else, with the
      names asserted against SNAPSHOT.md §3 rather than retyped.
      PASS: Executed, same run: "the managed-store TCP URL (SNAPSHOT_REDIS_KV_URL,
      SNAPSHOT_REDIS_REDIS_URL) appears in the publisher service only, named from
      docs/2.0/SNAPSHOT.md section 3".
      FAIL SIDE: Executed, both directions the rule has:
        the TCP URL added to `gateway`  -> rc=1 (the probe the assertion names)
        SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN added to `publisher` -> rc=1,
          "a managed-store variable that belongs to apps/web on Vercel"
      The second is not in the assertion and is added because A8's first half is
      satisfiable by a compose file that leaks the READ-WRITE credential instead.
      `.env.example` carries REDIS_URL and the injected names with role comments
      (unchanged from HANDOFF-05, verified present).

  A8b `node scripts/check-redis-safety.mjs` exits 0 with the runbook written.
      PASS: Executed -> rc=0, 20 detectors self-tested.
      FAIL SIDE: Executed - the exact probe the assertion names. A "clear the store"
      one-liner added to RUNBOOK-VPS.md §11 -> rc=1, naming the file and line 464.
      A8b ALSO REJECTED TWO SAFE COMMANDS, AND WAS RIGHT TO. A keyspace summary and a
      scan for `zcashreveal:*` target the VPS Redis, which this project owns outright.
      The guard reads files, not intentions, and cannot see which of the two servers a
      `redis-cli` line will reach. In most of the tree that costs nothing; in a runbook
      it is the point, because a runbook is a copy-paste surface and the two prefixes
      differ by one letter. Rewritten to name exact keys, with the reasoning beside
      them so the next person does not re-add them.

  A9  0 skipped with the fixture committed.  **BLOCKED, and honestly so.**
      Executed as it stands: `pnpm --filter @zcashreveal/indexer test` reports
      439 passed | 1 skipped, and `scripts/assert-no-skipped-integration.mjs` prints
      the ONE allowed skip - "decodeBlock - real mainnet fixture decodes a captured
      post-NU5 mainnet block end-to-end". That is deliverable 2's fixture, which no
      session can capture (see BLOCKED below). A9 is therefore unmet, by exactly one
      test, for a reason outside this container. Its fail side is already the
      permanent state and needs no probe.

  DELIVERABLE 5 (integration-test isolation) is not an A-numbered assertion but is
  the largest behavioural change here, so it carries the same two-polarity evidence:
      PASS: Executed. Two concurrent vitest runs -> 60 passed / 60 passed, distinct
      schemas, nothing left in pg_namespace or pg_database afterwards.
      FAIL SIDE: Executed. The same two runs with the isolation disabled reproduce
      LEDGER-06 Q6 in BOTH directions - "expected 4 to be +0" in one and
      "expected +0 to be 4" in the other - and the failing test is A6, replay and
      rollback conserve balances across four pools. That is the corrupted
      conservation assertion the handoff names.

  FULL GATE, Executed on the finished tree, against a real PostgreSQL 16:
      pnpm -r test        1036 passed, 1 skipped, rc=0
                          (content 67, zebra-rpc 35, web 368, gateway 127,
                           indexer 439/1 skipped)
      pnpm typecheck      10/10
      pnpm lint           0 errors, 0 warnings
      content validate    OK
      pnpm check          8 guards, rc=0
      pnpm build          7/7
      Test count is unchanged from HANDOFF-08's 1036: this handoff adds no test and
      removes none. It changes how the existing ones are ISOLATED, which is why the
      evidence for deliverable 5 is a concurrency probe rather than a count.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason)

  1. CORRECTED - "enable the address indexes HANDOFF-05 needs" (§3). THERE IS NO
     SUCH CONFIG KEY IN ZEBRA 6.2.3, in any section of ZebradConfig
     (zebrad/src/config.rs:54-95). The address RPCs the gateway depends on are
     unconditional: getaddressbalance, getaddresstxids and getaddressutxos are
     declared on the RPC trait at zebra-rpc/src/methods.rs lines 232, 438 and 459,
     with z_gettreestate at 361 and z_getsubtreesbyindex at 382 for HANDOFF-12.
     Nothing turns them on because nothing turns them off. `indexer_listen_addr` is
     NOT this - it is an internal gRPC service needing the `indexer` build feature,
     which `default-release-binaries` does not include. Recorded at the site in
     zebrad.toml so nobody adds a key that would stop the node booting.

  2. CORRECTED - "ZMQ if supported else document the polling fallback" (§3). ZEBRA
     HAS NO ZMQ AT ANY VERSION; ZMQ was zcashd's. The fallback is therefore not a
     degraded mode but the ONLY mode, and it is silent: the indexer logs
     `zmq unavailable - falling back to polling only` once at WARN
     (apps/indexer/src/index.ts:87) and polls forever. Documented in three places
     an operator will actually meet it - the compose service, the zebrad config's
     [notify] section, and RUNBOOK-VPS.md §3. Zebra's equivalent is
     `[notify] block_notify_command`, left commented because choosing what the
     command does is HANDOFF-12's decision.

  3. CORRECTED - A7's literal grep cannot be executed as an assertion. Run against
     this tree it returns nine tokens of which FOUR ARE NOT VARIABLES:
     `NEXT_PUBLIC_` and `SNAPSHOT_REDIS_` from prose in a docblock (lib/env.ts:9-10),
     `SNAPSHOT_URL` from an exported CONSTANT name (lib/env.ts:42), and
     `NEXT_PUBLIC_X` from a docblock EXAMPLE explaining Next.js inlining
     (lib/env.ts:13). A guard built on it would require DEPLOY-2.0.md to document a
     variable that exists only inside a sentence. Implemented as the ASSERTION -
     every name actually read from `process.env` - which is stronger where it
     matters and narrower where the command was wrong. Same shape as HANDOFF-08's
     A10, and the imprecision is L2's rather than the executor's.

  4. ACCEPTED, with a divergence stated - §3 commissions THREE Dockerfiles and there
     are FOUR. cloudflare/cloudflared's runtime is
     `gcr.io/distroless/base-debian13:nonroot` and the only executable it adds is
     the cloudflared binary, so nothing inside it can call cloudflared's own /ready
     endpoint. That left two options: a healthcheck that cannot fail (which
     CLAUDE.md makes a finding in its own right, and which would have satisfied A4
     by counting a key while telling an operator nothing), or no healthcheck (which
     fails A4 and leaves the one externally-facing component unmonitored).
     infra/cloudflared/Dockerfile adds a static busybox and changes nothing else.

  5. ACCEPTED - the Zebra pin is 6.2.3, the newest 6.2.x, published 2026-07-28,
     read from the Docker Hub tags API. §3 says "6.2.x (exact tag chosen and cited)".
     NOTED AND NOT ACTED ON: `packages/zebra-rpc` was written in HANDOFF-05 against
     Zebra 6.3.0's structs, and 6.3.0 exists (2026-08-10). The contract says 6.2.x,
     so 6.2.x is what is pinned; whether the client and the node should be on the
     same minor is a question for the ledger, not a decision to take silently. See
     §8 QUESTIONS.

  6. ACCEPTED - schema-per-run, over an advisory lock or a database per worker, for
     deliverable 5. Reasoning is in the header of apps/indexer/test/global-setup.ts
     and in §8. Bound stated there: it isolates RUNS, not FILES, so
     `fileParallelism: false` is still load-bearing and must not be turned on to buy
     wall clock.

  7. ACCEPTED - the publisher service is behind a `publisher` compose profile because
     `apps/publisher` does not exist yet (HANDOFF-09 owns it). Its Dockerfile and
     healthcheck are written against the app's specified shape and build unchanged
     when the app lands. Without the profile, `docker compose up -d` today fails on
     a missing build context, which would make the whole stack unusable to prove a
     point about a file that is not there.

  8. DEFERRED - image sizes. §5 A2 asks for them and they cannot be measured without
     a build. See §8.

NOTICED (outside scope, not acted on):

  - `apps/indexer` depends on `zeromq@^6.1.2` and constructs a subscriber that can
    never connect to Zebra. The dependency is dead weight in the image and forces
    python3/make/g++ into the indexer's install stages for a native module nothing
    can use. Removing it is a code change outside this handoff's scope, and it
    should be removed together with whatever HANDOFF-12 decides about
    `block_notify_command` rather than separately.
  - `truncateAll` in the integration setup still truncates four tables and does not
    cover `leak_reports`, which HANDOFF-07 added a suite over, nor `pool_snapshots`
    and `migrations_zip318`, which have no writer yet. Schema-per-run makes this
    harmless BETWEEN runs and it remains live WITHIN one. The standing instruction
    is that whichever handoff first writes to those tables adds them in the same
    commit.
  - The gateway's `pg-cache.integration.test.ts` creates `tx_cache` and
    `address_cache` in the shared database and is NOT covered by the indexer's
    schema-per-run. It happens not to collide today because its tables are disjoint
    from the indexer's, which is a property of the current table list rather than a
    guarantee. Left alone deliberately: extending the mechanism to a second package
    means a shared helper, and inventing one for a hazard that does not yet exist is
    how a hand-maintained duplicate starts.
  - `docs/2.0/v0.2-notes/postgres-port-5433.patch` is now superseded - the 5433
    remap is a first-class part of both compose files. The patch file is v0.2
    history and was left where HANDOFF-00 put it.

UNVERIFIED (labelled):

  - EVERY DOCKER IMAGE BUILD. A2 is blocked by egress policy; only the Dockerfile
    syntax is verified, by BuildKit's own parse. Specifically unverified: that the
    pnpm filtered install resolves inside the image, that `zeromq` builds or has a
    musl prebuild, that the runtime stage's copied `node_modules` symlink farm
    resolves, and every image size.
  - EVERYTHING THAT REQUIRES A RUNNING STACK. No container was started - §1 forbids
    it and the images cannot be built anyway. So: the zebrad healthcheck against a
    real /healthy, the depends_on ordering, the tunnel, the cloudflared healthcheck,
    and the whole of RUNBOOK-VPS.md as an executed sequence. The runbook's commands
    are verified for SHAPE (flags, paths, service and volume names, all cross-checked
    against the compose file by scripts/check-infra-docs.mjs and by hand) and not for
    EFFECT.
  - The Zebra facts are Read, not Executed: they come from ZcashFoundation/zebra at
    tag v6.2.3 via raw.githubusercontent.com, which this container can reach, and
    from the Docker Hub tags API. No Zebra node was run.
  - Zebra 6.2.3's behaviour on a `state` directory written by 4.4.1. The upgrade
    path in RUNBOOK-VPS.md §8 says "within one major"; 4.4.1 to 6.2.3 crosses two,
    so the VPS needs a wipe-and-resync rather than an upgrade. Stated in §8 as an
    operator click because it is days of sync, not a command.

GATE ROUNDS: 1 round, 4 lenses (compose-correctness, facts, runbook, guards),
  52 findings. Fingerprints below by file - rule - severity as returned.

  THE ROUND DID NOT CONVERGE AND IS NOT CLAIMED TO. Its verify phase was cut off
  by a usage limit after roughly 7 of 52 findings had been through their three
  refuters: 136 of 160 agents returned an error rather than a verdict. Under
  CLAUDE.md's gate-budget rule an unread finding is not a finding that went away,
  so THE LEAD READ ALL 45 UNVERIFIED ONES rather than shipping with them unread,
  and dispositioned each. That is weaker evidence than three adversarial refuters
  per finding and is labelled as such here rather than presented as a clean round.

  FIXED (the twenty that changed behaviour or would have misled an operator):
    apps/indexer/Dockerfile - runtime image shipped no migrations/ - HIGH
      The one that would have broken a production bring-up. Found by the lead
      before the gate returned, and confirmed by it. Neither A1 nor A2 could have
      caught it: compose config never opens a Dockerfile and docker build is
      blocked here.
    docs/2.0/RUNBOOK-VPS.md - sections 1 and 2 were circular - HIGH
    docs/2.0/RUNBOOK-VPS.md - the snapshot alert read a field /api/pools does not
      return, so the one alert that matters fired permanently - HIGH
    docs/2.0/RUNBOOK-VPS.md - `openssl rand -base64 32` produces URL-reserved
      characters that break DATABASE_URL about half the time - HIGH
    docker-compose.yml - GATEWAY_TRUSTED_PROXIES required a value that cannot
      exist before the stack runs - HIGH
    .env.example - ZEBRAD_ZMQ_URL defined twice, two values, two accounts - HIGH
    scripts/check-compose.mjs - A5 blind to a secret in a `${VAR:-default}` - HIGH
    scripts/check-compose.mjs - service splitter blind to a trailing comment,
      misfiling that service's lines onto the previous one - HIGH
    scripts/check-compose.mjs - A4 accepted compose's two ways of REMOVING a
      healthcheck (`disable: true`, `test: ["NONE"]`) - MID
    scripts/check-compose.mjs - A8 never asserted the TCP URL was PRESENT - LOW
    scripts/check-zebrad-config.mjs - cross-file checks satisfied by comments
      that quote the very strings being searched for - HIGH
    scripts/check-zebrad-config.mjs - the cross-file detectors had no self-test
      in either direction - MID
    scripts/check-infra-docs.mjs - A7's exclusion self-test was tautological - HIGH
    scripts/check-infra-docs.mjs - A7 scanned src/ only while claiming
      "apps/web reads"; next.config.ts reads three variables outside it - MID
    infra/zebrad/zebrad.toml + one other - "eleven sections" is wrong, twelve - MID
    four files - "Zebra has no ZMQ at any version" overreached - LOW
    .env.example - still described the RPC as loopback-bound - MID
    docs/2.0/RUNBOOK-VPS.md - `docker volume rm` fails while a stopped container
      references the volume - MID
    docs/2.0/RUNBOOK-VPS.md - pg_restore --clean ran against live writers - MID
    docs/2.0/RUNBOOK-VPS.md - the capture's `<shorthash>` is parsed by the shell
      as a redirection - MID
    docs/2.0/RUNBOOK-VPS.md - a cloudflared ingress file a token-run tunnel
      cannot read, presented as configuration - MID
    docs/2.0/RUNBOOK-VPS.md - no step rebuilt an image, so a code update deployed
      nothing and said nothing - MID

  AND THE FIX COMMIT CREATED ONE, which is the pattern this project has now
  recorded in four consecutive handoffs. The replacement snapshot-age query in
  the round-1 fix read `MAX(height)` from `pool_boundary_flows`, whose column is
  `block_height`. It was caught by executing it against the live schema rather
  than by reading it - `ERROR: column "height" does not exist` - and both SQL
  statements in the runbook are now executed transcripts rather than plausible
  ones.

  NOT FIXED, judged not defects or out of scope, with the reason (the remainder
  of the 52; several were the same finding from two lenses):
    - Several findings treat the dev override's `deploy: replicas: 0` as
      ineffective. It is honoured by compose v2 for `up`, and the services it
      applies to are the ones a dev runs on the host; the residual truth - that
      `--build` would still build them - is a cost of one command, not a defect.
    - "The indexer and gateway manifests stages omit apps/publisher/package.json,
      so both images break when HANDOFF-09 lands." Correct, and deliberately left:
      adding a manifest for a package that does not exist fails TODAY. It is a
      one-line change for whoever creates the package and is recorded in §8.
    - "The root .npmrc is not copied into the images." There is no root .npmrc in
      this repository.
    - "The indexer healthcheck's no-endpoints branch is unreachable." It is
      reachable - compose supplies the three variables, but a `docker run` of the
      image without them is exactly the case it exists for, and it was executed
      in that state.
    - A cluster of runbook findings about tools not installed (python3, git).
      Section 2.0 now installs cloudflared, which was the real gap; python3 and
      git are present on every image the sizing table names.
    - Guard findings about YAML shapes this repository does not use (top-level
      anchors merged with `<<:`, `env_file:`, a third compose file). Real bounds,
      all stated in the scripts' headers, none reachable by the tree as it is.
      Widening a guard to shapes nothing uses is how a detector grows a bug.

  ROUND 2 - THE FIX COMMIT REVIEWED AS ITS OWN COMMIT, per LEDGER-07 Q6, and it
  found FIVE MORE DEFECTS THAT THE ROUND-1 FIX ITSELF HAD CREATED. All five are
  in `scripts/check-compose.mjs`, all five were found by EXECUTING probes rather
  than by reading, and four of the five made the guard blind again in a new way:

    `${VAR:+secret}`, `${VAR-secret}` and `${VAR+secret}` were all still
      invisible to A5. The round-1 fix handled `:-` alone; compose accepts six
      operator forms and four of them carry a literal value. Confirmed with
      `docker compose config` that all four are real, not theoretical.
    `${PW:-${FALLBACK}}` was FALSELY FLAGGED - a nested interpolation with no
      literal anywhere in it. The blank marker the fix used contained braces, so
      the enclosing interpolation never matched on the next pass.
    `test: ["NONE"]` at the END of zebrad's healthcheck block was missed, because
      the fix read a fixed 12-line window and that block's comment is longer than
      twelve lines.

  Fixed by resolving interpolations innermost-first with a brace-free sentinel,
  handling all six operator forms, and reading the healthcheck block to its next
  sibling key rather than to a fixed offset. Every one is now a self-test case,
  and the six probes were re-executed against the real tree afterwards: four
  secret forms caught, the message form and the nested form correctly silent.

  THAT IS TWO CONSECUTIVE FIX COMMITS IN THIS ONE HANDOFF THAT INTRODUCED
  DEFECTS - round 1's fix created the SQL error and these five - which is the
  strongest evidence this branch offers for LEDGER-07 Q6's rule. Reviewing the
  fix commit is not ceremony here; it was the most productive review of the
  session, per unit of effort, by a wide margin.

  THE HONEST EXTRAPOLATION, per LEDGER-07 Q6's stopping rule: a third round
  would find one or two more of round 1's reach, and the most likely place is the
  three guard scripts rather than the compose or the runbook - round 1's guard
  lens was the most productive of the four and its findings were the least
  refutable. This round is NOT claimed to have converged: it ends because its
  reach was read and acted on, not because it returned nothing a user could see.

  POST-FAN-OUT SWEEP after the review fan-out: `git status --porcelain` returned
  two paths, `apps/indexer/Dockerfile` and `handoffs/HANDOFF-10-infra.md`, BOTH
  of them the lead's own uncommitted edits made while the fan-out was in flight -
  the migrations COPY and this report. No worker wrote to the tree. Recorded
  because one verifier reported the Dockerfile edit as evidence that "an earlier
  fan-out worker wrote into the repository" and recommended reverting it; that
  was a misattribution of the lead's own work, and reverting on it would have
  removed the fix for the round's highest-severity finding.

PREVIEW URL (if any): none, and none is expected. This handoff changes no file
  under `apps/web/src`, so the Vercel preview on this branch exercises nothing new.
  A session cannot fetch a preview host in any case: the egress proxy refuses the
  CONNECT tunnel with 403 before Deployment Protection is reached.
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
