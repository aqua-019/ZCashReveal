---
handoff: 11
title: Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist
status: queued
branch: the session-designated branch (name it `feat/v2-11-live-wiring` if you may choose)
track: Integration
depends_on: 04, 04a, 04b, 05, 09, 09a, 09b, 10
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
- **The cutover checklist expects `/v2/pools` to answer 503 with a body naming the four missing blocks until 06, 07, 08 and 09 have landed, and expects `/v2/pools/balances` to answer 200 throughout.** A 503 there is the design, not an incident (L2 RESOLUTION for HANDOFF-05, fold 3, LEDGER-05 Q2). The page has five blocks; one - the pool balances - is chain-derived and the gateway computes it, and the other four are the turnstile ledger (06), the deployment history (07), the estimator panel (08) and the supply reconciliation (09). A page that serves four empty blocks is claiming to have looked and found nothing; a 503 naming each missing block and the handoff that owns it is the truth. Triage it as a checklist expectation, never as a broken deployment.

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


- **THE CUTOVER MAY NOT DEPEND ON THE MAINNET BLOCK FIXTURE** (LEDGER-10 Q4). The capture is the operator's, it has now survived five handoffs as a note, and it is a named task in `handoffs/README.md`'s click list with the four things it closes. **The cutover ships with the fixture test still skipped, or it does not ship.** A cutover checklist that lists the capture as a step is a checklist that cannot be completed by anyone reading it, since no session can reach a synced node.
- **THE CUTOVER MAY NOT RENDER AN UNMEASURED PANEL AS A MEASUREMENT** (LEDGER-09 Q4, **restated on the right quantity by LEDGER-09a Q1**). ~~THE CUTOVER MAY NOT SHIP A NULL ANALYSIS PANEL~~ - amended in place rather than deleted, per the LEDGER-10 Q5 precedent, because a rule whose premise changed is one the next session obeys for the wrong reason unless the change is visible. **L2 corrected this against its own interest and said so:** as first written the rule turned on the COUNT - four panels of four - which is why HANDOFF-09a un-nulling two of them felt like it changed the answer. It should not have. LEDGER-05 Q2's remedy was never "fill the blocks"; it was **503 naming each missing block and the handoff that owns it**. The dishonesty in an empty block is not that it is empty. It is that **an empty chart RENDERS AS A MEASUREMENT OF ZERO**, and a flat drain line is read by every visitor as "the pool is not draining" - a claim this site has not made and cannot support. The corrected rule turns on the RENDERING and is count-independent. **So a named absence is PERMITTED, and it states the CONDITION that produced it** - ~~a named absence carrying its owner, `drain: not measured - needs a block-time source, HANDOFF-09b`~~ - **amended in place by HANDOFF-09b's gate round 6, on the same LEDGER-10 Q5 precedent this bullet already invokes, because a rule whose premise changed is one the next session obeys for the wrong reason unless the change is visible.** What changed the premise is that 09b SHIPPED: an absence naming a handoff that has closed is a prediction outliving its subject, which `apps/gateway/src/views/pools.ts` already records as reading like a fact, and `docs/2.0/SNAPSHOT.md` §8.1 - the contract this bullet cites as its authority - now mandates a condition in all four rows and forbids an owner in any. The honest forms are `drain: not measured - no block time or no baseline for this height` and `N_eff series: not measured - no Ironwood spend in the window could be bounded`. The LEDGER-05 Q2 precedent is unchanged and still applies; only the string does. **Do not render the struck text.** **Note what the correction costs, because it is the half that proves it is not a convenience:** the corrected rule NO LONGER BLOCKS THE CUTOVER. If the operator wants 11 before 09b, the honesty rule permits it provided both panels render as named absences stating their condition (the amended form above, not the struck one). 09b is still ordered first, on the cost argument alone - migrations 003 and 004 have never been applied to the VPS, so that database is COLD, and a 005 landing before the cutover is free where a 005 landing after it is a maintenance window on a live public site. **That is a cost ruling and the operator may overrule it; the honesty ruling is not one L2 will trade.** `SnapshotV1` permits all four panels to be `null` and `SNAPSHOT.md` §8.1 defines that null as "not measured" rather than as a zero - **that is the honest TYPE, and it is the RENDERER, not the type, that this rule now binds.**

## §4 DELIVERABLES

1. Wiring + staleness indicator; `SnapshotStore` with the four sources and a unit test per source; `apps/web/e2e/*.spec.ts` (Playwright); CI jobs: e2e against a fixture build on PRs, and a post-deploy smoke job that fetches the production bundle and fails if the snapshot fallback marker is absent; `docs/2.0/CUTOVER.md`. The Storage step is **already done** — the store is connected to `zecreveal` for Production and Preview and its variables are injected automatically, so `CUTOVER.md` records the names and the read-only-token rule rather than asking the operator to set them. **The managed store is shared with an unrelated production project**: read `docs/2.0/SNAPSHOT.md` before any test or smoke job so that none of them points at it — a Playwright run against the shared store is exactly the mistake §4.5 forbids.

2. **Delete the `/api` prefix; `/v2` is the API** (L2 RESOLUTION for HANDOFF-05, fold 2, LEDGER-05 Q1). HANDOFF-05 mounted every route at BOTH `/api` and `/v2` because the handoff specified one and HANDOFF-04's only written client sends the other, and mounting one would have broken the other at this cutover. That was the correct call for one handoff and is the wrong state to keep: `/api` is not a version, it is a category, and the moment a v3 exists the name lies. Delete it here. Any remaining `/api` path answers **410 with a body naming `/v2`**, not 404 - a 404 says the route never existed, and a client still sending `/api` needs to be told where the API went rather than left to guess at a network fault.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

> **Two assertion IDs are used twice in this section, and they were already so before this note.** HANDOFF-05's addendum appended an `A8`, an `A9` and an `A10`; the section already had an `A8` and an `A9` of its own, and both pairs are still below. This is recorded rather than renumbered because `A8` and `A9` are cited by number from `docs/2.0/SNAPSHOT.md` §7 and from LEDGER-05, and renumbering would move those citations onto different assertions. **A §7 report for this handoff must therefore name each of the four by its subject, not by its number.** Noticed by the HANDOFF-09 session while applying LEDGER-10 Q1 fold 2; raised in LEDGER-09 §8 for L2 to rule on.
> **Fold 5 of the L2 RESOLUTION for HANDOFF-09 asked this section to GAIN the `subversion` floor assertion "from LEDGER-10 Q1, still unbuilt". It was already here, and the checker it names is already built.** The HANDOFF-09 session applied LEDGER-10 Q1 fold 2 in full: `A11` below is that assertion, and `packages/zebra-rpc/src/version-floor.ts` exports `ZEBRA_MIN_VERSION`, `ZEBRA_MIN_VERSION_STRING`, `parseZebraVersion`, `compareZebraVersion` and `checkZebraVersionFloor`, with a test file covering the pass side, the below-floor side and the unparsed side. The HANDOFF-09a session checked before acting and did **not** add a second `A11`: this section already documents two duplicated IDs and a third would have been the first one introduced deliberately. What remains genuinely unbuilt is the SMOKE TEST that calls the checker against a live node, which is HANDOFF-11's own work and is what `A11` specifies. Recorded here rather than quietly skipped, per CLAUDE.md's rule that a probe reporting the code is wrong is checked before the code is judged.


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

- **A11.** *(added by LEDGER-10 Q1, 30 Aug 2026; the constant landed in HANDOFF-09.)* **The connected node clears the version floor `packages/zebra-rpc` declares.** Call `getinfo` against the node the smoke test reaches, pass its `subversion` to `checkZebraVersionFloor` (`packages/zebra-rpc/src/version-floor.ts`), and assert `ok === true` *(fail side: feed the same checker `"/Zebra:6.2.3/"` - the tag this repository pinned until this ruling - and assert `ok === false` with `reason === "below-floor"`; and feed it `"/MagicBean:5.4.2/"` and assert `reason === "unparsed"`, because "I could not read the string" must not be reported as a pass)*. **A pin states an intent; only this assertion notices when the box is running something else.** `docker-compose.yml` binds the image an operator brings up on the day they run `up -d` and says nothing about the node a gateway is talking to after a manual pull, a rollback, a second box, or a `ZEBRAD_RPC_URL` pointed elsewhere. All three reasons for the floor are silent when unmet: an older node answers, the schemas `.passthrough()`, the tests pass and the numbers are wrong. If no live node is reachable in CI, the two fail-side legs and the parser still run and the live leg is labelled UNVERIFIED in §7 - the same treatment A6 gives the gateway.
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
