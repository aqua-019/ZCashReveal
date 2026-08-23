---
handoff: 11
title: Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist
status: queued
branch: the session-designated branch (name it `feat/v2-11-live-wiring` if you may choose)
track: Integration
depends_on: 04, 05, 09, 10
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-11 — Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

> **Scope correction from HANDOFF-04 (23 Aug 2026).** The cutover this handoff was written to
> perform - moving the public site from the v0.2 Vite dashboard to `apps/web` - is smaller than
> it was. The operator deleted both v0.2 Vercel projects (`z-cash-reveal-dashboard` and
> `z-cash-reveal-dashboard2`) on 23 August 2026, so `zecreveal` with Root Directory `apps/web` is
> the only project on the account and has been serving previews since. What is left of the
> cutover is pointing a domain at `zecreveal` and promoting to Production - both operator clicks.
> `legacy/dashboard` still exists in the tree with no deployment; retiring the directory is still
> this handoff's, and is now a `git rm` rather than a migration.

Wire `apps/web` to the real API and WS with the snapshot as the baseline, so the public site can never render empty; add Playwright smoke tests and CI jobs; write the cutover checklist.

**Out of scope:** No production promotion, no Vercel env changes by agents — the checklist tells the operator what to click.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `apps/web/src/lib/api` (HttpApi), gateway routes (`docs/2.0/API.md`), `packages/zec-types` `SnapshotV1`, `docs/2.0/DEPLOY-2.0.md`, `docs/2.0/SNAPSHOT.md` (sinks + the two-Redis topology)
- **A session cannot reach the VPS, the gateway or a preview host from inside its container.** Deployment Protection returns 302 to the SSO endpoint, and the session's own egress proxy refuses the CONNECT tunnel with 403 before that (HANDOFF-04 §7, LEDGER-04 Q3). Every live check in this handoff is either the operator's, taken and pasted into the ledger, or it is not taken. Plan the cutover checklist on that basis rather than discovering it at cutover.

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `NEXT_PUBLIC_DATA_MODE = fixture | snapshot | live`; production default `snapshot` + live upgrade in the browser.
- Server-side `SnapshotStore` resolution, in order: `redis-rest` when `SNAPSHOT_REDIS_KV_REST_API_URL` + `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` are set (Upstash-compatible REST `GET zecreveal:snapshot:latest`; edge-safe; **the read-only token, never `SNAPSHOT_REDIS_KV_REST_API_TOKEN`**) → `redis` when `SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL` is set (`ioredis`, Node runtime only, one lazy connection per instance) → `gateway` (`GET ${NEXT_PUBLIC_API_URL}/api/snapshot`) → `fixture` (bundled). **The names above are the ones Vercel's integration injects** (`docs/2.0/SNAPSHOT.md` §3); the `SNAPSHOT_REDIS_REST_URL` / `SNAPSHOT_REDIS_REST_TOKEN` / `SNAPSHOT_REDIS_URL` this bullet used to name are injected by nothing, and reading them would have silently resolved past `redis-rest` to `gateway` or `fixture` — a stale site that renders and reports no fault. An assertion here must fail when the FIRST source is unreachable, not merely when the last one is. The site therefore renders from the managed Redis even when the VPS or the tunnel is down — the failure that emptied v0.2 production. The chosen source is rendered into the staleness indicator (`source: redis-rest | redis | gateway | fixture`).
- ISR (revalidate 60 s) for `/` and `/pools` from the snapshot; the mempool island hydrates from `snapshot.lastReports` then subscribes to WS; a staleness indicator shows `snapshot age: N blocks` when the socket is down; never a blank panel.
- `HttpApi` validates every response with the Zod DTOs; a validation failure renders the snapshot data with an `UNVERIFIED` chip, never a crash.
- No `apps/web` route handler proxies the gateway unless it is rate-limited. **The rate limiter must NOT use the managed store.** ~~if any proxy route exists it uses `@upstash/ratelimit` on the REST credentials~~ — withdrawn by HANDOFF-05, and it is the most dangerous line this handoff carried. `@upstash/ratelimit` on those credentials is a **per-request writer**, using the **read-write** token, writing keys under its own `@upstash/ratelimit` prefix — outside `zecreveal:` — into a database that holds an unrelated production project's live data. That breaks four rules of `docs/2.0/SNAPSHOT.md` §4 at once (1 namespace, 5 no per-request traffic, 6 read-only for `apps/web`, and the §5 budget, which is 3 writes per BLOCK and would become N per request). If a proxy route is needed, limit it at the edge, in memory, or on the VPS Redis behind the gateway — which already has a per-IP limiter with a trusted-proxy list from HANDOFF-05, and is the correct place for it. Omit the route entirely when the credentials are absent (the browser then calls the gateway directly).
- **The managed store is shared, so reads are budgeted too.** `apps/web` fetches the snapshot **once per render at module scope** — never once per component, never once per request — and prefers a cached value inside its staleness window over a fresh `GET`. §5 of `SNAPSHOT.md` explains why: the publisher's 3 writes per block are bounded and this side is not, and one `GET` per 60-second revalidation across three regions already exceeds the publisher's entire monthly budget. This handoff owes `SNAPSHOT.md` §5 a measured reads figure to replace the row that currently says the combined share is unknown.

## §4 DELIVERABLES

1. Wiring + staleness indicator; `SnapshotStore` with the four sources and a unit test per source; `apps/web/e2e/*.spec.ts` (Playwright); CI jobs: e2e against a fixture build on PRs, and a post-deploy smoke job that fetches the production bundle and fails if the snapshot fallback marker is absent; `docs/2.0/CUTOVER.md`. The Storage step is **already done** — the store is connected to `zecreveal` for Production and Preview and its variables are injected automatically, so `CUTOVER.md` records the names and the read-only-token rule rather than asking the operator to set them. **The managed store is shared with an unrelated production project**: read `docs/2.0/SNAPSHOT.md` before any test or smoke job so that none of them points at it — a Playwright run against the shared store is exactly the mistake §4.5 forbids.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** Fixture e2e: every Record page renders its first claim; `/track` renders ≥ 1 mempool row; no `pageerror` on any route.
- **A2.** Snapshot mode with the API unreachable: `/pools` renders the snapshot balances and the staleness indicator text matches `/snapshot age: \d+ blocks/` (Playwright with the API URL pointed at a closed port).
- **A3.** Store resolution: with a mocked REST endpoint returning a valid `SnapshotV1` and `NEXT_PUBLIC_API_URL` pointed at a closed port, `/pools` renders the mocked snapshot's balances and the indicator reads `source: redis-rest` *(fail side: unset the REST variables → `source: gateway` or `source: fixture`, never a blank panel)*.
- **A4.** `grep -rn 'SNAPSHOT_REDIS' apps/web/src` matches only server-side modules (no file under `app/**/page.tsx` client components or anything with `'use client'`), and the built client bundle contains no `SNAPSHOT_REDIS` string (script greps `.next/static`).
- **A5.** Live mode with a fake WS server: after the server sends a `mempool` frame the table gains a row within 500 ms; after the server closes, the indicator appears within 3 s.
- **A6.** `/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` against a running gateway shows `78,183.4093`; if no gateway is available in CI this assertion runs against the mocked API and the live run is labelled UNVERIFIED in §7.
- **A7.** An API response failing Zod validation results in the `UNVERIFIED` chip and no thrown error (test injects a malformed `/api/pools`).
- **A8.** *(added by HANDOFF-05 from the operator's shared-store note.)* **`apps/web` cannot write to the managed store.** `grep -rn 'SNAPSHOT_REDIS_KV_REST_API_TOKEN' apps/web` is empty — the read-write token name appears nowhere in the application, only the `..._READ_ONLY_TOKEN` one *(fail side: reference the read-write name in the snapshot reader → the grep matches and the assertion fails)*. A4 already proves the prefix never reaches the browser; this proves the half that matters more, which is that a reader cannot become a writer to a store holding another project's production data.
- **A9.** *(same source.)* **No test or build reaches the managed store.** `apps/web/playwright.config.ts` sets all five `SNAPSHOT_REDIS_*` names to the empty string in `webServer.env`, and an e2e assertion reads the staleness indicator as `source: fixture` on a build started with a populated ambient environment *(fail side: remove the blanking → the indicator reads `source: redis-rest` and the assertion fails)*. Rule 5 of `SNAPSHOT.md` is otherwise a promise with no mechanism at the one point it would be broken: a build is where the credentials are certainly present and a read certainly happens.
- **A10.** *(same source.)* **Reads are counted.** Instrument the `redis-rest` source and assert that rendering `/` and `/pools` together issues **one** managed-store `GET`, not one per page and not one per component *(fail side: move the fetch inside a component → the count rises with the number of components)*. The measured per-month figure goes into `SNAPSHOT.md` §5, replacing the row that says the combined share is unknown.
- **A8.** The production bundle contains the literal marker `zr:snapshot-fallback:v1` (post-deploy job greps the built JS) *(fail side: remove the marker in a scratch build → job fails)*.
- **A9.** `history.replaceState` stubbed to throw never surfaces a page error on any route (Playwright).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `ui-builder` (Sonnet) wires the islands; `backend-api` (Haiku) adds the CI jobs after PREFLIGHT; `test-engineer` (Haiku) writes e2e from §5.
- director-quality: `devops-deployer` reviews the CI jobs; `design-reviewer` reviews the staleness indicator copy and placement.

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
