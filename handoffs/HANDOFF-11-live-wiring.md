---
handoff: 11
title: Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist
status: closed
branch: the session-designated branch (name it `feat/v2-11-live-wiring` if you may choose)
track: Integration
depends_on: 04, 04a, 04b, 05, 09, 09a, 09b, 10
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-11 — Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §0 DELIVERABLE 0 — the seven folds, and what the reconcile found (1 Sep 2026)

Fold 2 of the L2 RESOLUTION for HANDOFF-04b asks that the folds be applied in a `docs(handoffs)`
commit before any wiring, and that each be recorded. This section is that record. It is §0 rather
than an appendix because it changed §3, §4 and §5 above, and a reader who starts at §1 needs to
know that the text below them is not the text L2 wrote on 22 August.

| fold | what it asked | what was done |
|---|---|---|
| 1 | §5 is reconciled against the tree first | §5 rewritten in full and opted into the EXCLUSION SET format. Ten assertions changed; each is named by SUBJECT in §7 with what it assumed and what stopped being true. The three L2 named - `/pools` and `/reveal` now in the nav, the Record pages claim-first, no snapshot read path in `apps/web` - were all confirmed, and the reconcile found seven more. |
| 2 | the three status affordances go where 04a's surface list puts them | Taken, not departed from. A12 asserts the placement and A13 the source token. One READING is recorded rather than a departure: the surface list's `source:` chip and §3's `source: redis-rest \| redis \| gateway \| fixture` are two different things, and both are honoured - the DOCUMENT's resolved store rung goes in the bar's staleness indicator per §3, and a PANEL's own derivation source goes in that panel's disclosure `<summary>` next to the count, which is where `/pools` currently floats `view.source` beside a value. |
| 3 | four inherited rules bind everything added | A14, checked by the EXISTING guard or test in each case rather than by a new one, with the fail side driving `summary-findings` rather than assuming it. |
| 4 | §5 uses A8 and A9 twice each; §7 names all four by subject | The note is kept verbatim at the head of §5 and §7 names all four by subject. No renumbering: `docs/2.0/SNAPSHOT.md` §7 and LEDGER-05 cite them by number. |
| 5 | the cutover checklist may not depend on things no session can do | Three named: the mainnet block fixture (the cutover ships with that test skipped), the per-crossing crossing source (HANDOFF-12's), and a provisioned VPS. `docs/2.0/CUTOVER.md` marks every step no session can execute and states who can. |
| 6 | the plane stays as 04a built it | A15, with a data-mutation fail side. The adaptive retention window stays deferred whole. The one thing added is the block-arrival redraw, which is the surface's licensed ceremony. |
| 7 | the panel rule in its corrected form | The renderer may not present an unmeasured panel as a measurement; a named absence stating its CONDITION is permitted and is what `SNAPSHOT.md` §8.1 specifies. The old "may not ship a null analysis panel" is not the rule and is not implemented. |

### What the reconcile found that fold 1 did not name

Fold 1 said "find the rest yourself". Seven, and **three of them were assertions that were GREEN
against the tree and proved nothing**, which is this project's most expensive defect shape arriving
in a spec rather than in a test.

1. **The read-write-token grep is not empty and cannot be made empty while its own sibling is
   satisfied.** `grep -rn 'SNAPSHOT_REDIS_KV_REST_API_TOKEN' apps/web` returns
   `apps/web/playwright.config.ts` - a line that exists BECAUSE the other A8/A9 pair member
   requires all five names blanked - and `apps/web/.env.example`. The pair was jointly
   unsatisfiable. The resolution narrows the scope to `apps/web/src` and the predicate from MENTION
   to READ; the resolution NOT taken was deleting the blanking line, which would have made the grep
   pass by reopening the hole the sibling exists to close.
2. **The `SNAPSHOT_REDIS` client-bundle sweep passes because there is no reader at all**, so a
   two-polarity transcript collected before the store lands certifies a hole. Worse, the obvious
   home for the reads is the one that breaks it: `src/lib/env.ts` promises "the first server-side
   reader arrives in HANDOFF-11" in its own docblock and is already in the CLIENT graph.
3. **A fake WebSocket server emitting a bare `ZecFrame` goes green over a live path on which every
   real frame is silently discarded.** The gateway sends `{channel, payload}`; `apps/web` reads a
   flat `type`. The mismatch is double, and the failure mode is a panel reading "live" while
   receiving nothing.
4. **§3 and §4.2 contradicted each other.** §3 spelled the gateway rung `/api/snapshot` while §4.2
   deletes the `/api` prefix. Both answer on merged main, which is what kept it invisible; after
   §4.2 lands the rung would answer 410 and fall silently through to `fixture`. Corrected in §3.
5. **§4.1 names `apps/web/e2e/*.spec.ts` and that directory has never existed.** `playwright.config.ts`
   sets `testDir: "./test/e2e"`. A spec written to the named path would never run, and
   `playwright test` would report a pass having executed only the eighteen specs already there.
6. **A staleness surface already exists on every route and its copy contradicts A2's regex.**
   `FooterLedger` and `EpochClock` both render `fmtBlockAge(tip.snapshotAgeBlocks)` against a
   hardcoded `FIXTURE_TIP.snapshotAgeBlocks = 0`, so both read the literal `tip` today. They are the
   sites to repoint, not places to add a third indicator - and repointing them is what stops the
   footer stating `SNAPSHOT tip` on a page whose data is an hour old.
7. **`apps/web` has no ISR at all**, so A10's read count is zero rather than one and the figure
   `SNAPSHOT.md` §5 is owed depends on a revalidation policy this handoff has to establish first.

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
- Server-side `SnapshotStore` resolution, in order: `redis-rest` when `SNAPSHOT_REDIS_KV_REST_API_URL` + `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` are set (Upstash-compatible REST `GET zecreveal:snapshot:latest`; edge-safe; **the read-only token, never `SNAPSHOT_REDIS_KV_REST_API_TOKEN`**) → `redis` when `SNAPSHOT_REDIS_KV_URL` or `SNAPSHOT_REDIS_REDIS_URL` is set (`ioredis`, Node runtime only, one lazy connection per instance) → `gateway` (`GET ${NEXT_PUBLIC_API_URL}/v2/snapshot` - **corrected from `/api/snapshot` by deliverable 0**, because §4.2 of this same handoff deletes the `/api` prefix, so a rung written against it would answer 410 and fall silently through to `fixture`: the exact "stale site that renders and reports no fault" this bullet's own correction paragraph was written against. Both paths answer on merged main, which is what kept the contradiction invisible) → `fixture` (bundled). **The names above are the ones Vercel's integration injects** (`docs/2.0/SNAPSHOT.md` §3); the `SNAPSHOT_REDIS_REST_URL` / `SNAPSHOT_REDIS_REST_TOKEN` / `SNAPSHOT_REDIS_URL` this bullet used to name are injected by nothing, and reading them would have silently resolved past `redis-rest` to `gateway` or `fixture` — a stale site that renders and reports no fault. An assertion here must fail when the FIRST source is unreachable, not merely when the last one is. The site therefore renders from the managed Redis even when the VPS or the tunnel is down — the failure that emptied v0.2 production. The chosen source is rendered into the staleness indicator (`source: redis-rest | redis | gateway | fixture`).
- ISR (revalidate 60 s) for `/` and `/pools` from the snapshot; the mempool island hydrates from `snapshot.lastReports` then subscribes to WS; a staleness indicator shows `snapshot age: N blocks` when the socket is down; never a blank panel.
- `HttpApi` validates every response with the Zod DTOs; a validation failure renders the snapshot data with an `UNVERIFIED` chip, never a crash.
- No `apps/web` route handler proxies the gateway unless it is rate-limited. **The rate limiter must NOT use the managed store.** ~~if any proxy route exists it uses `@upstash/ratelimit` on the REST credentials~~ — withdrawn by HANDOFF-05, and it is the most dangerous line this handoff carried. `@upstash/ratelimit` on those credentials is a **per-request writer**, using the **read-write** token, writing keys under its own `@upstash/ratelimit` prefix — outside `zecreveal:` — into a database that holds an unrelated production project's live data. That breaks four rules of `docs/2.0/SNAPSHOT.md` §4 at once (1 namespace, 5 no per-request traffic, 6 read-only for `apps/web`, and the §5 budget, which is 3 writes per BLOCK and would become N per request). If a proxy route is needed, limit it at the edge, in memory, or on the VPS Redis behind the gateway — which already has a per-IP limiter with a trusted-proxy list from HANDOFF-05, and is the correct place for it. Omit the route entirely when the credentials are absent (the browser then calls the gateway directly).
- **The managed store is shared, so reads are budgeted too.** `apps/web` fetches the snapshot **once per render at module scope** — never once per component, never once per request — and prefers a cached value inside its staleness window over a fresh `GET`. §5 of `SNAPSHOT.md` explains why: the publisher's 3 writes per block are bounded and this side is not, and one `GET` per 60-second revalidation across three regions already exceeds the publisher's entire monthly budget. This handoff owes `SNAPSHOT.md` §5 a measured reads figure to replace the row that currently says the combined share is unknown.


- **THE CUTOVER MAY NOT DEPEND ON THE MAINNET BLOCK FIXTURE** (LEDGER-10 Q4). The capture is the operator's, it has now survived five handoffs as a note, and it is a named task in `handoffs/README.md`'s click list with the four things it closes. **The cutover ships with the fixture test still skipped, or it does not ship.** A cutover checklist that lists the capture as a step is a checklist that cannot be completed by anyone reading it, since no session can reach a synced node.
- **THE CUTOVER MAY NOT RENDER AN UNMEASURED PANEL AS A MEASUREMENT** (LEDGER-09 Q4, **restated on the right quantity by LEDGER-09a Q1**). ~~THE CUTOVER MAY NOT SHIP A NULL ANALYSIS PANEL~~ - amended in place rather than deleted, per the LEDGER-10 Q5 precedent, because a rule whose premise changed is one the next session obeys for the wrong reason unless the change is visible. **L2 corrected this against its own interest and said so:** as first written the rule turned on the COUNT - four panels of four - which is why HANDOFF-09a un-nulling two of them felt like it changed the answer. It should not have. LEDGER-05 Q2's remedy was never "fill the blocks"; it was **503 naming each missing block and the handoff that owns it**. The dishonesty in an empty block is not that it is empty. It is that **an empty chart RENDERS AS A MEASUREMENT OF ZERO**, and a flat drain line is read by every visitor as "the pool is not draining" - a claim this site has not made and cannot support. The corrected rule turns on the RENDERING and is count-independent. **So a named absence is PERMITTED, and it states the CONDITION that produced it** - ~~a named absence carrying its owner, `drain: not measured - needs a block-time source, HANDOFF-09b`~~ - **amended in place by HANDOFF-09b's gate round 6, on the same LEDGER-10 Q5 precedent this bullet already invokes, because a rule whose premise changed is one the next session obeys for the wrong reason unless the change is visible.** What changed the premise is that 09b SHIPPED: an absence naming a handoff that has closed is a prediction outliving its subject, which `apps/gateway/src/views/pools.ts` already records as reading like a fact, and `docs/2.0/SNAPSHOT.md` §8.1 - the contract this bullet cites as its authority - now mandates a condition in all four rows and forbids an owner in any. The honest forms are `drain: not measured - no block time or no baseline for this height` and `N_eff series: not measured - no Ironwood spend in the window could be bounded`. The LEDGER-05 Q2 precedent is unchanged and still applies; only the string does. **Do not render the struck text.** **Note what the correction costs, because it is the half that proves it is not a convenience:** the corrected rule NO LONGER BLOCKS THE CUTOVER. If the operator wants 11 before 09b, the honesty rule permits it provided both panels render as named absences stating their condition (the amended form above, not the struck one). 09b is still ordered first, on the cost argument alone - migrations 003 and 004 have never been applied to the VPS, so that database is COLD, and a 005 landing before the cutover is free where a 005 landing after it is a maintenance window on a live public site. **That is a cost ruling and the operator may overrule it; the honesty ruling is not one L2 will trade.** `SnapshotV1` permits all four panels to be `null` and `SNAPSHOT.md` §8.1 defines that null as "not measured" rather than as a zero - **that is the honest TYPE, and it is the RENDERER, not the type, that this rule now binds.**

## §4 DELIVERABLES

1. Wiring + staleness indicator; `SnapshotStore` with the four sources and a unit test per source; `apps/web/test/e2e/*.spec.ts` (Playwright - **path corrected by deliverable 0**: `apps/web/e2e` does not exist and never did, and `playwright.config.ts` sets `testDir: "./test/e2e"`, so a spec written to the name in the original text would never be executed and `playwright test` would report a pass having run only the eighteen specs that were already there); CI jobs: e2e against a fixture build on PRs, and a post-deploy smoke job that fetches the production bundle and fails if the snapshot fallback marker is absent; `docs/2.0/CUTOVER.md`. The Storage step is **already done** — the store is connected to `zecreveal` for Production and Preview and its variables are injected automatically, so `CUTOVER.md` records the names and the read-only-token rule rather than asking the operator to set them. **The managed store is shared with an unrelated production project**: read `docs/2.0/SNAPSHOT.md` before any test or smoke job so that none of them points at it — a Playwright run against the shared store is exactly the mistake §4.5 forbids.

2. **Delete the `/api` prefix; `/v2` is the API** (L2 RESOLUTION for HANDOFF-05, fold 2, LEDGER-05 Q1). HANDOFF-05 mounted every route at BOTH `/api` and `/v2` because the handoff specified one and HANDOFF-04's only written client sends the other, and mounting one would have broken the other at this cutover. That was the correct call for one handoff and is the wrong state to keep: `/api` is not a version, it is a category, and the moment a v3 exists the name lies. Delete it here. Any remaining `/api` path answers **410 with a body naming `/v2`**, not 404 - a 404 says the route never existed, and a client still sending `/api` needs to be told where the API went rather than left to guess at a network fault.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

> **Two assertion IDs are used twice in this section, and they were already so before this note.** HANDOFF-05's addendum appended an `A8`, an `A9` and an `A10`; the section already had an `A8` and an `A9` of its own, and both pairs are still below. This is recorded rather than renumbered because `A8` and `A9` are cited by number from `docs/2.0/SNAPSHOT.md` §7 and from LEDGER-05, and renumbering would move those citations onto different assertions. **A §7 report for this handoff must therefore name each of the four by its subject, not by its number.** Noticed by the HANDOFF-09 session while applying LEDGER-10 Q1 fold 2; raised in LEDGER-09 §8 for L2 to rule on.
> **Fold 5 of the L2 RESOLUTION for HANDOFF-09 asked this section to GAIN the `subversion` floor assertion "from LEDGER-10 Q1, still unbuilt". It was already here, and the checker it names is already built.** The HANDOFF-09 session applied LEDGER-10 Q1 fold 2 in full: `A11` below is that assertion, and `packages/zebra-rpc/src/version-floor.ts` exports `ZEBRA_MIN_VERSION`, `ZEBRA_MIN_VERSION_STRING`, `parseZebraVersion`, `compareZebraVersion` and `checkZebraVersionFloor`, with a test file covering the pass side, the below-floor side and the unparsed side. The HANDOFF-09a session checked before acting and did **not** add a second `A11`: this section already documents two duplicated IDs and a third would have been the first one introduced deliberately. What remains genuinely unbuilt is the SMOKE TEST that calls the checker against a live node, which is HANDOFF-11's own work and is what `A11` specifies.

> **DELIVERABLE 0, EXECUTED 1 SEPTEMBER 2026, AND IT IS WHY THIS SECTION NO LONGER READS AS L2 WROTE IT.** This handoff was written on 22 August. 04, 04a, 04b, 09, 09a and 09b have shipped since, and fold 1 of the L2 RESOLUTION for HANDOFF-04b makes reconciling this section against the tree the first deliverable, before any wiring. **Every assertion below was read against the tree that exists**, and the ten that changed are named in §7 with what each said, what it assumed, and what stopped being true. The section is also opted into the **EXCLUSION SET** format of LEDGER-09a Q2, which `scripts/check-ledger-structure.mjs` R4 checks structurally: each assertion states the values its predicate is written to reject, and names which MEMBER of that set its fail side used. R4 checks the clause is PRESENT and cannot check that it is CORRECT - that limit is in the guard's own header and is repeated here so a green run is not mistaken for a semantic one.
>
> **The single most important thing a later reader should take from the reconcile is that three of these assertions were GREEN AGAINST THE TREE AND PROVED NOTHING**, which is this project's most expensive defect shape arriving in a spec rather than in a test. The read-write-token grep is not empty and cannot be made empty while its own sibling assertion is satisfied; the `SNAPSHOT_REDIS` client-bundle sweep passes because there is no reader at all; and a fake WebSocket server emitting a bare `ZecFrame` goes green over a live path on which every real frame is silently discarded.

- **A1.** Fixture e2e: every Record page renders its first claim; `/track` renders ≥ 1 mempool row; no `pageerror` on any route. **"Any route" is now ELEVEN, not the nine this assertion was written against**: `NAV_ENTRIES` is `SCREENS` (nine, numbered, closed) plus `VIEWS` (`/pools` and `/reveal`, unnumbered), which is how HANDOFF-04a closed its own F-04a-3, and `/timeline` is the one dynamic route among them.
  *Exclusion set:* a Record page whose first claim block is absent or empty; a `/track` rendering zero mempool rows; any of the eleven routes emitting a `pageerror`; and a route reachable in the built app that the sweep does not visit at all.
  *Fail side names:* **"a `/track` rendering zero mempool rows"** - the fail side empties the mempool the panel is seeded from and watches the row-count assertion fire, rather than deleting the panel, which would prove only that the assertion is wired.

- **A2.** Snapshot mode with the API unreachable: `/pools` renders the snapshot balances and the staleness indicator text matches `/snapshot age: [\d,]+ blocks?/` (Playwright with the API URL pointed at a closed port). **THE REGEX IS CORRECTED FROM `\d+` TO `[\d,]+`, AND THE ORIGINAL WOULD HAVE PASSED ON A FRESH SITE AND FAILED ON A STALE ONE - the only case it exists for.** `fmtInt` groups a number with commas, the way every other numeral on this site is grouped, so `\d+` matches an age of 999 and stops matching at 1,000. Found by executing the assertion's own regex over the formatter at six ages rather than by reading it, and answered by widening the regex rather than by ungrouping the number, because a bare `1000000` in the system bar breaks the site's numeral convention to satisfy a check. `blocks?` for the same reason one layer down: at an age of exactly one block the honest word is singular. **The indicator is in the SYSTEM BAR, where fold 2 of the L2 RESOLUTION for HANDOFF-04b puts it - a property of the DOCUMENT, on the one surface every route carries - so this assertion holds on all eleven routes and `/pools` is where it is measured.** The regex is kept and the SHIPPED COPY MOVES TO IT: `fmtBlockAge` returned `tip` or `N blocks behind`, which the regex cannot match, and the alternative was a second differently-worded indicator beside the first - two renderings of one quantity, which is the defect `lib/api/fixtures/snapshot.ts` was written to avoid on the pool balances.
  *Exclusion set:* `tip`; `N blocks behind`; an empty indicator; an indicator rendered on some routes and not others; an age computed from the publish clock rather than from the chain height; and a grouped age above 999 that the check cannot read.
  *Fail side names:* **`tip`** - the exact string `fmtBlockAge(0)` returned on merged main, fed to the indicator and shown to fail the regex.

- **A3.** Store resolution: with a mocked REST endpoint returning a valid `SnapshotV1` and `NEXT_PUBLIC_API_URL` pointed at a closed port, `/pools` renders the mocked snapshot's balances and the indicator reads `source: redis-rest` *(fail side: unset the REST variables → `source: gateway` or `source: fixture`, never a blank panel)*.
  *Exclusion set:* `gateway`, `redis` and `fixture` as the resolved source while the REST pair is set and answers a valid `SnapshotV1`; and a blank panel under any of the four.
  *Fail side names:* **`fixture`** - reached by unsetting the REST pair with no gateway reachable, and asserted to render the bundled document rather than nothing.

- **A4.** `grep -rn 'SNAPSHOT_REDIS' apps/web/src` matches only server-side modules (no file under `app/**/page.tsx` client components or anything with `'use client'`), and the built client bundle contains no `SNAPSHOT_REDIS` string (script greps `.next/static`). **THIS ASSERTION IS VACUOUS UNTIL THE STORE LANDS AND MUST BE RE-RUN AFTER IT**: on merged main no module under `apps/web/src` reads any `SNAPSHOT_REDIS` name, so nothing can be inlined and both legs pass by construction. **And the obvious home for the reads is the one place that breaks it**: `src/lib/env.ts` promises in its own docblock that "the first server-side reader arrives in HANDOFF-11", and `env.ts` is already inside the client graph - `env.ts` → `api/stream.ts` → `MempoolPanel.tsx`, which carries `'use client'`. The store gets its own module that no client file transitively imports.
  *Exclusion set:* any occurrence of a `SNAPSHOT_REDIS` name in a file carrying `'use client'` or transitively imported by one; and any occurrence of the string in `.next/static`.
  *Fail side names:* **"a module transitively imported by a `'use client'` file"** - the fail side puts one store env read into `src/lib/env.ts`, rebuilds, and greps `.next/static`, which is a DATA mutation drawn from the excluded set rather than a deletion of the check.

- **A5.** Live mode with a fake WS server: after the server sends a frame the table gains a row within 500 ms; after the server closes, the indicator appears within 3 s. **THE FAKE SERVER MUST SPEAK THE GATEWAY'S WIRE FORMAT, AND THE ORIGINAL WORDING - "sends a `mempool` frame" - NAMES A FRAME NEITHER SIDE HAS EVER SENT.** The gateway wraps every frame as `{channel, payload}` (`ws-broker.ts`), `apps/web` reads a flat top-level `type` (`stream.ts`'s `asFrame`, and `zecFrameSchema`, a discriminated union on `type`), and the mismatch is double: after unwrapping, the relayed mempool payload is `{type: "tx_added", report: LeakReport}` where `ZecFrame` wants `{type: "tx_added", entry: MempoolRow}`, and the two connect-time payloads are typed `mempool_snapshot` and `snapshot_v1`, neither a member of the union. Every live frame is therefore dropped into `ZecSocket.droppedFrames` with no throw and no user-visible signal - a panel reading "live" while receiving nothing. The adapter is this handoff's work and `ws-broker.ts` says so in its own docblock.
  *Exclusion set:* a bare `ZecFrame` with no envelope; `{channel, payload}` carrying `{type: "tx_added", report}`; the `mempool_snapshot` payload; the `snapshot_v1` payload; and any frame the adapter accepts that `zecFrameSchema` would reject.
  *Fail side names:* **`{channel, payload}` carrying `{type: "tx_added", report: LeakReport}`** - the exact frame `apps/indexer/src/index.ts` publishes, asserted to produce NO row against merged main and a row after the adapter, so the transcript shows the assertion discriminating on the value rather than on the wiring.

- **A6.** `/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` against a running gateway shows `78,183.4093`; if no gateway is available in CI this assertion runs against the mocked API and the live run is labelled UNVERIFIED in §7. **The fixture leg is already shipped** (`test/e2e/track.spec.ts` and `test/unit/fixtures.test.ts`), so what this handoff owes is the leg against a mocked HTTP API - the same figure through `HttpApi` rather than through `FixtureApi`.
  *Exclusion set:* any rendered balance string other than `78,183.4093`; in particular the two-decimal `78,183.41` this site legitimately renders in prose at three other sites, which is the same number and NOT the same string.
  *Fail side names:* **`78,183.41`** - injected as the mocked API's balance and shown to fail the equality, which is the member of the set a careless rounding would actually produce.

- **A7.** An API response failing Zod validation results in the `UNVERIFIED` chip and no thrown error (test injects a malformed `/v2/pools`). **The path is corrected from `/api/pools`**: the shipped client has always requested `/v2/pools`, and §4.2 of this handoff deletes `/api` outright. **The behaviour is new construction rather than a test over existing code**: `HttpApi#get` THROWS on a schema mismatch today, `HttpApi` is never constructed, and the string `UNVERIFIED` appears nowhere in `apps/web`. The chip goes in the chip row beside the claim, with `confidence` and `lastVerified`, and never collapses (fold 2).
  *Exclusion set:* a thrown error reaching the page; a blank panel; a rendered panel carrying no chip; a chip reachable only by opening a disclosure; and a chip on a response that VALIDATED.
  *Fail side names:* **"a malformed `/v2/pools` body"** - a body carrying `lanes` where `poolsViewSchema` requires its own field set, which is a value drawn from the set the predicate rejects rather than a deleted `safeParse` call.

- **A8.** *(added by HANDOFF-05 from the operator's shared-store note.)* **`apps/web` cannot write to the managed store.** No module under **`apps/web/src`** READS `process.env.SNAPSHOT_REDIS_KV_REST_API_TOKEN`; only the `..._READ_ONLY_TOKEN` name is read. **THE ORIGINAL FORM - "`grep -rn 'SNAPSHOT_REDIS_KV_REST_API_TOKEN' apps/web` is empty" - IS UNSATISFIABLE, AND IT IS UNSATISFIABLE BECAUSE OF ITS OWN SIBLING.** That grep returns two lines on merged main: `apps/web/.env.example`, which documents the reserved name, and `apps/web/playwright.config.ts`, which sets it to the empty string - a line that exists *because* the other A8/A9 pair member requires all five names blanked in `webServer.env`. Satisfying one made the other fail. The resolution narrows the scope to `apps/web/src` and changes the predicate from MENTION to READ, because a blanking assignment removes a credential rather than consuming one; the resolution NOT taken was deleting the blanking line, which would have made the grep pass by reopening the exact hole the sibling exists to close. A4 already proves the prefix never reaches the browser; this proves the half that matters more, which is that a reader cannot become a writer to a store holding another project's production data.
  *Exclusion set:* any `process.env.SNAPSHOT_REDIS_KV_REST_API_TOKEN` read under `apps/web/src`, however spelled - a computed member expression, a destructure of `process.env`, or a re-export of the value under another name.
  *Fail side names:* **"a `process.env.SNAPSHOT_REDIS_KV_REST_API_TOKEN` read in the snapshot store module"** - written in, the grep shown to match, then reverted.

- **A9.** *(same source.)* **No test or build reaches the managed store.** `apps/web/playwright.config.ts` sets all five `SNAPSHOT_REDIS_*` names to the empty string in `webServer.env` - **already shipped by HANDOFF-05's addendum, and reported as shipped rather than claimed as this handoff's work** - and an e2e assertion reads the staleness indicator as `source: fixture` on a build started with a populated ambient environment, which is the half that is new. **THE ORIGINAL FAIL SIDE IS FORBIDDEN BY THE RULE IT ENFORCES**: "remove the blanking → the indicator reads `source: redis-rest`" is only reachable on a machine holding the real credentials, and running it there is a build reading the shared production store - `SNAPSHOT.md` rule 5, exactly. The runnable fail side sets the REST pair to a LOCAL mock, which discriminates identically and touches nothing shared. Rule 5 is otherwise a promise with no mechanism at the one point it would be broken: a build is where the credentials are certainly present and a read certainly happens.
  *Exclusion set:* `redis-rest`, `redis` and `gateway` as the resolved source of a Playwright build; and any managed-store host appearing in the build's egress at all.
  *Fail side names:* **`redis-rest`** - reached by setting `SNAPSHOT_REDIS_KV_REST_API_URL` and `..._READ_ONLY_TOKEN` to a local mock in `webServer.env`, and the indicator asserted to flip.

- **A10.** *(same source.)* **Reads are counted.** Instrument the `redis-rest` source and assert that rendering `/` and `/pools` together issues **one** managed-store `GET`, not one per page and not one per component *(fail side: move the fetch inside a component → the count rises with the number of components)*. The measured per-month figure goes into `SNAPSHOT.md` §5, replacing the row that says the combined share is unknown. **THE COUNT HAS NO MEANING UNTIL THIS HANDOFF STATES A REVALIDATION WINDOW, AND ON MERGED MAIN IT IS ZERO**: no route in `apps/web` exports `revalidate`, both pages are prerendered once at build time, and the two of them read two unrelated sources neither of which is a snapshot store - `/` calls `fixtureSnapshot()` directly and `/pools` calls `api().getPools()`, which returns a `PoolsView` and not a `SnapshotV1`. So the assertion states the window it counts against (§3's 60 s) and the monthly figure is derived from that window and the region count, both named.
  *Exclusion set:* a count that scales with the number of components rendered; a count that scales with the number of pages rendered; and a monthly figure quoted without the revalidation window and region count it was derived from.
  *Fail side names:* **"one `GET` per component"** - the fetch moved inside a component and the counter shown to rise with the component count, which is the member of the set §3's module-scope rule exists to exclude.

- **A11.** *(added by LEDGER-10 Q1, 30 Aug 2026; the constant landed in HANDOFF-09.)* **The connected node clears the version floor `packages/zebra-rpc` declares.** Call `getinfo` against the node the smoke test reaches, pass its `subversion` to `checkZebraVersionFloor` (`packages/zebra-rpc/src/version-floor.ts`), and assert `ok === true` *(fail side: feed the same checker `"/Zebra:6.2.3/"` - the tag this repository pinned until this ruling - and assert `ok === false` with `reason === "below-floor"`; and feed it `"/MagicBean:5.4.2/"` and assert `reason === "unparsed"`, because "I could not read the string" must not be reported as a pass)*. **A pin states an intent; only this assertion notices when the box is running something else.** `docker-compose.yml` binds the image an operator brings up on the day they run `up -d` and says nothing about the node a gateway is talking to after a manual pull, a rollback, a second box, or a `ZEBRAD_RPC_URL` pointed elsewhere. All three reasons for the floor are silent when unmet: an older node answers, the schemas `.passthrough()`, the tests pass and the numbers are wrong. If no live node is reachable in CI, the two fail-side legs and the parser still run and the live leg is labelled UNVERIFIED in §7 - the same treatment A6 gives the gateway.
  *Exclusion set:* `"/Zebra:6.2.3/"` and every tag below `ZEBRA_MIN_VERSION`; `"/MagicBean:5.4.2/"` and every string the parser cannot read; and the empty subversion.
  *Fail side names:* **`"/Zebra:6.2.3/"`** for the below-floor leg and **`"/MagicBean:5.4.2/"`** for the unparsed leg, both by value, because a version floor whose fail side is a deleted call proves only that something is wired.

- **A8.** The production bundle contains the literal marker `zr:snapshot-fallback:v1` (post-deploy job greps the built JS) *(fail side: remove the marker in a scratch build → job fails)*. **The marker does not exist anywhere in the repository today** - the only occurrence of the string is the line of this handoff that specifies it - so both the marker and the job are new construction. It must reach `.next/static`, which is the file set the post-deploy grep reads, while no `SNAPSHOT_REDIS` value may: the marker belongs in the client-visible fallback branch and the credentials in a module the client graph never imports.
  *Exclusion set:* a built bundle carrying no `zr:snapshot-fallback:v1`; a marker present only in server output and absent from `.next/static`; and a marker present as a comment the minifier strips.
  *Fail side names:* **"a built bundle carrying no `zr:snapshot-fallback:v1`"** - produced by a scratch build with the marker constant emptied, and the job shown to exit non-zero.

- **A9.** `history.replaceState` stubbed to throw never surfaces a page error on any route (Playwright). **ALREADY BUILT, IN BOTH POLARITIES, AND REPORTED AS SUCH RATHER THAN RE-CLAIMED**: `test/e2e/timeline-filter.spec.ts` carries the pass side and an explicit fail-state block over an unguarded call, and the guarded call site is `components/record/TimelineFilter.tsx`. The honest statement of its COVERAGE is the part that needed correcting: `replaceState` is called on exactly one route, so "any route" is today "the one route that calls it", and this handoff's own additions must not introduce a second unguarded call.
  *Exclusion set:* any route on which a throwing `replaceState` produces a `pageerror`; and any new call site this handoff adds that is not inside the same guard.
  *Fail side names:* **"an unguarded `replaceState` call"** - already in the spec as a named fail-state block, re-run here over the eleven routes rather than the one.

- **A12.** *(added by the L2 RESOLUTION for HANDOFF-04b.)* **The three status affordances each render where fold 2 places them, and the `UNVERIFIED` chip is reachable without opening a disclosure.** The staleness indicator is in the system bar beside the epoch clock, on all eleven routes; the `source:` chip for a panel's own derivation is inside the disclosure carrying that derivation, next to the count in the `<summary>`, never floating beside a value; the `UNVERIFIED` chip is in the chip row beside the claim, with `confidence` and `lastVerified`.
  *Exclusion set:* an `UNVERIFIED` chip inside a `<details>` body; a staleness indicator on a panel rather than on the bar; a `source:` chip floating beside a value; and any of the three absent from a route that renders the condition it describes.
  *Fail side names:* **"an `UNVERIFIED` chip inside a `<details>` body"** - the chip moved into the disclosure body and the assertion watched to fire with the disclosure closed, which is the collapse case fold 2 forbids by name.

- **A13.** *(same source.)* **The staleness indicator names the resolved source (`redis-rest | redis | gateway | fixture`), and the assertion FAILS WHEN THE FIRST SOURCE IS UNREACHABLE, not merely when the last one is.** This is §3's existing rule, and it is the one that would otherwise pass on a stale site that renders: a build whose REST pair is set but unreachable must not report `source: fixture` as though nothing were wrong.
  *Exclusion set:* a resolution that silently degrades from `redis-rest` to a later rung while the REST pair is CONFIGURED; a `source:` token naming a rung the document did not come from; and an indicator that renders no source at all.
  *Fail side names:* **"a configured but unreachable REST pair"** - the URL pointed at a closed port with the token set, and the assertion shown to fail rather than to pass on the fixture it falls through to.

- **A14.** *(same source.)* **Nothing this handoff adds violates the four rules it inherits, each checked by the EXISTING guard or test rather than by a new one.** No HTML text below `--t-floor` (`test/unit/type-scale.test.ts` and `test/e2e/legibility.spec.ts`); no SVG `<text>` or `<tspan>` anywhere in `apps/web` (`scripts/check-svg-text-floor.mjs`); every `<summary>` carries a digit or a count (`test/unit/summary-findings.test.ts` and the rendered sweep in `test/e2e/legibility.spec.ts`); and a CSSOM check as well as a screenshot for anything depending on a custom property, a `calc()` or a transform.
  *Exclusion set:* a new `<summary>` with no digit; a new declaration below 12px; a new SVG `<text>`; and a new declaration whose resolved value is `none` or empty when read back from the CSSOM.
  *Fail side names:* **"a new `<summary>` with no digit"** - the count removed from the `source:` chip's summary and the existing test shown to fail, which is the check that would otherwise be assumed rather than driven.

- **A15.** *(same source.)* **The plane is unchanged in what it draws, asserted rather than assumed.** One mark per counted crossing from `migrationHist`, uniform weight; the other four lanes render "not measured" rather than a zero; the adaptive retention window stays deferred whole (LEDGER-04a Q2), because without per-crossing ordering there is no "newest N" and a board of arbitrary marks labelled a recent window is the defect the mechanism exists to prevent. What this handoff MAY do is redraw the plane on block arrival, which is the surface's one licensed ceremony, and nothing per-transaction ever.
  *Exclusion set:* a mark carrying a per-crossing amount; a mark carrying an ordering or a confirmation state; a non-uniform weight; a drawn count that differs from `migrationHist`'s counted one; and a measured zero drawn under a lane the document has no field for.
  *Fail side names:* **"a mark carrying a per-crossing amount"** - one mark given an amount and the assertion shown to fail, which is the member `SnapshotV1` has no field for and which inventing would manufacture a measurement.

- **A16.** *(same source.)* **`pnpm -r test` is unchanged in COLOUR, and no test present in the baseline is removed or newly skipped.** Baseline **1,351 total, 1,348 passed, 3 skipped**, measured by L2 on a clean worktree of `50ac7d9` and reproduced by this session on merged main at `76ea9e7` with a real PostgreSQL 16.13 and a real local Redis. **L2's wording was "unchanged in COUNT as well as colour", and taken literally that forbids the unit tests §4.1 commissions in the same sentence; it is restated rather than obeyed or ignored, and §7 says so.** The count is a FLOOR, not a fixed point: the total rises only by tests this handoff adds. **And the 3 skips are not 3 gaps** - two are notice-tests that skip *because* their environment is present (`it.runIf(!reachable)` fires only when it is not), and the third is the mainnet block fixture, which is the operator's and which the cutover ships without (LEDGER-10 Q4, fold 5). **A FOURTH SKIP IS ADDED BY THIS HANDOFF AND IT IS MANDATED BY A11**, whose own text says so: "if no live node is reachable in CI, the two fail-side legs and the parser still run and the live leg is labelled UNVERIFIED". A skip count of 4 is therefore the correct outcome, and the first draft of this assertion excluded it - caught by running the suite rather than by reading the clause.
  *Exclusion set:* a passing baseline test that is absent from the new run; a baseline test whose state moves from passed to skipped; a NEW skip that no assertion in this section mandates and names; and a total below 1,351.
  *Fail side names:* **"a baseline test whose state moves from passed to skipped"** - one existing test marked `.skip`, the comparison shown to fire, then reverted; the comparison is by NAME against the baseline list rather than by total, because two changes of opposite sign leave a total unmoved.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `ui-builder` (Sonnet) wires the islands; `backend-api` (Haiku) adds the CI jobs after PREFLIGHT; `test-engineer` (Haiku) writes e2e from §5.
- director-quality: `devops-deployer` reviews the CI jobs; `design-reviewer` reviews the staleness indicator copy and placement.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/new-session-zejoty -> PR #49 (draft), forked from main at
  76ea9e7 (PR #48 merged).
  PR title begins "HANDOFF-11:". Stops at opened.

SPAWN MODE (proven by tool attempt, first output of the session):
  LIVE subagents. `Agent(general-purpose, haiku)` returned "76ea9e7 SPAWN-OK".
  The `Workflow` tool is also available and was used once.

DIRECTORS SPAWNED (the lead names each):
  ONE fan-out, and it was a reconnaissance rather than a build. `Workflow`
  "handoff-11-recon", nine read-only mappers over the subsystems section 5
  touches, each returning a structured {facts, staleAssertions, risks}:
  map:web-snapshot-path, map:web-record-and-chips, map:gateway-routes,
  map:snapshot-contract, map:tests-and-ci, map:zebra-version-floor,
  map:legacy-and-cutover-inputs, map:turnstile-plane, map:ledger-rules.
  9 returned, 0 errors, 418 tool uses.
  NO BUILD CREW WAS SPAWNED. The wiring is one seam across four packages and
  every change had to be made against a fact another change had just
  established - the envelope, the projection, the revive, the prefix. Splitting
  that across workers would have produced four reports agreeing with each other
  and not with the tree.

  POST-FAN-OUT SWEEP: run. `git status --porcelain` after the workflow returned
  listed only `apps/web/src/lib/snapshot/` - the lead's own uncommitted work,
  which one mapper correctly flagged as an untracked write it had not made. No
  worker wrote to the tree. Nothing was reverted.

FILES (created / modified / deleted):
  created:
    apps/web/src/lib/snapshot/source.ts, store.ts
    apps/web/src/lib/api/attempt.ts, tip-bus.ts
    apps/web/src/components/ui/Unverified.tsx, NotMeasured.tsx
    apps/web/src/components/ambience/BlockArrival.tsx
    apps/web/test/unit/snapshot-store.test.ts, snapshot-store.integration.test.ts,
      client-graph.test.ts, status-affordances.test.tsx
    apps/web/test/e2e/snapshot.spec.ts, test/e2e/support/mock-store.mjs
    apps/gateway/src/__tests__/leak-report-fixture.ts, wire-form.test.ts
    packages/zebra-rpc/src/__tests__/version-floor-smoke.test.ts
    scripts/post-deploy-smoke.mjs
    .github/workflows/post-deploy-smoke.yml
    docs/2.0/CUTOVER.md
  modified: apps/web (layout, splash, /pools, EpochClock, SysBar, Shell,
    FooterLedger, MempoolPanel, chain.ts, format.ts, env.ts, api/index.ts,
    http-api.ts, socket.ts, stream.ts, globals.css, next.config.ts,
    playwright.config.ts, package.json); apps/gateway (ws-broker, server,
    routes/index + every route docblock, routes/mempool, views/mempool,
    views/pools, config, logger, index, four test suites, capture-examples.mts);
    apps/indexer/src/index.ts; packages/zec-types/src/realtime.ts;
    scripts/check-no-emoji.sh, check-audit-consumers.mjs, check-finding-sites.mjs,
    check-infra-docs.mjs, check-instrument-deps.mjs, check-compose.mjs;
    docs/2.0/API.md, SNAPSHOT.md, RUNBOOK-VPS.md, ZECREVEAL-2.0-PLAN.md,
    BRANCH-CLEANUP.md; .github/workflows/ci.yml, e2e.yml; pnpm-workspace.yaml
  deleted: legacy/dashboard (30 tracked files, the whole v0.2 SPA)

DELIVERABLE 0 - THE RECONCILE, AND THE TEN ASSERTIONS THAT CHANGED.
  Fold 1 asks that section 5 be read against the tree first and that section 7
  name every assertion changed, what it said and what made it stale. Section 0
  carries the folds; this is the assertion-by-assertion record. Each is named by
  SUBJECT rather than by number, which fold 4 requires for the four duplicated
  IDs and which costs nothing to do for all of them.

  1. THE FIXTURE E2E (A1). Said "no pageerror on any route" against NINE routes.
     `NAV_ENTRIES` has held ELEVEN since HANDOFF-04a added `/pools` and `/reveal`
     as unnumbered views, closing its own F-04a-3. Restated over eleven, and the
     sweep now registers a pageerror listener, which `routes.spec.ts` never did.
  2. THE STALENESS REGEX (A2). Two things. Its regex `\d+` cannot match a
     grouped integer, so it would have PASSED on a fresh site and FAILED at
     1,000 blocks behind - the only case it exists for. Corrected to `[\d,]+`,
     found by executing the regex over the formatter at six ages. And the
     premise that no staleness surface existed was false: `EpochClock` and
     `FooterLedger` both rendered `fmtBlockAge`, which returns `tip` - a string
     with no digit. Those were the sites to repoint rather than places to add a
     third indicator.
  3. THE STORE RESOLUTION (A3). Its fail side needs the `gateway` rung, and
     section 3 spelled that rung `/api/snapshot` while section 4.2 of the same
     handoff deletes the `/api` prefix. Both answered on merged main, which kept
     the contradiction invisible; after 4.2 the rung would have answered 410 and
     fallen silently through to the fixture. Corrected in section 3.
  4. THE CLIENT-BUNDLE SWEEP (A4). Passed VACUOUSLY: no module under
     `apps/web/src` read any managed-store name, so nothing could be inlined and
     both legs were empty by construction. Restated with the condition that it
     is re-run after the store lands, and widened from "carries `'use client'`"
     to "is transitively imported by one" - which is the real hazard and which
     `src/lib/env.ts`, the obvious home for the reads, violates.
  5. THE FAKE WEBSOCKET (A5). Named a `mempool` frame that neither side has ever
     sent, and a fake server emitting a bare `ZecFrame` would have gone green
     over a live path where every real frame is discarded. Restated to require
     the gateway's own envelope, with the exclusion set naming the four shapes
     that were actually on the wire.
  6. THE LOCKBOX FIGURE (A6). Already asserted against the fixture in two
     places. What this handoff owed was the leg through `HttpApi` rather than
     `FixtureApi`. Exclusion set gained `78,183.41` - the two-decimal rounding
     this site legitimately renders in prose at three other sites, which is the
     same number and not the same string.
  7. THE UNVERIFIED CHIP (A7). Its path `/api/pools` was wrong twice: the
     shipped client has always requested `/v2/pools`, and 4.2 deletes `/api`.
     The behaviour was also the opposite of what shipped - `HttpApi#get` THROWS
     on a schema mismatch, and the string `UNVERIFIED` appeared nowhere in
     `apps/web`.
  8. THE MANAGED-STORE WRITE GREP (first A8, by subject: "apps/web cannot write
     to the managed store"). UNSATISFIABLE, and unsatisfiable because of its own
     sibling. `grep -rn 'SNAPSHOT_REDIS_KV_REST_API_TOKEN' apps/web` returns
     `playwright.config.ts`, which blanks that name BECAUSE the other member of
     the pair requires all five blanked. Narrowed to `apps/web/src` and from
     MENTION to READ. The resolution not taken was deleting the blanking line,
     which would have made the grep pass by reopening the hole the sibling
     closes.
  9. THE BUILD-REACHES-THE-STORE ASSERTION (second A8's sibling, by subject: "no
     test or build reaches the managed store"). Half already shipped in
     HANDOFF-05's addendum and is reported as shipped rather than claimed. Its
     FAIL SIDE as written is forbidden by the rule it enforces: "remove the
     blanking and watch the indicator read `source: redis-rest`" is only
     reachable on a machine holding the real credentials, and running it there
     IS the read `SNAPSHOT.md` rule 5 forbids against a store shared with
     another project's production. Restated onto a local mock.
 10. THE READ COUNT (A10). Zero, not one: no route in `apps/web` exported
     `revalidate`, so both pages were prerendered once at build time and there
     was no render to attach a read to. And the two pages read two unrelated
     sources, neither a snapshot. Restated to state the window it counts
     against, and `revalidate = 60` added to both routes.
  Also corrected, outside section 5: section 4.1 named `apps/web/e2e/*.spec.ts`,
  a directory that has never existed - `playwright.config.ts` sets
  `testDir: "./test/e2e"`, so a spec written to the named path would never run
  and `playwright test` would report a pass having executed only the eighteen
  specs already there.

  STILL VALID, unchanged: the version floor (A11), the fallback marker (second
  A8), and `history.replaceState` (second A9) - the last already built in both
  polarities by HANDOFF-04a's `timeline-filter.spec.ts`, with its coverage
  restated honestly as "the one route that calls it".

ONE CONTRACT LINE WAS NEARLY SHIPPED UNDELIVERED, AND IT WAS A 500.
  Section 3: "the mempool island hydrates from `snapshot.lastReports` then
  subscribes to WS". `/track` did `await zec.getMempool()` with nothing around
  it - correct while `api()` was always the fixture, and a 500 the moment this
  handoff made `api()` return `HttpApi` and the gateway did not answer. The page
  that exists so the site can never render empty was the one page that could not
  render at all. Found by re-reading section 3 against what had actually been
  built, after every assertion was already green.
  The rows fall back and the SUMMARY DOES NOT, which is the honest split:
  `lastReports` is fifty real `MempoolRow`s, and it carries no aggregate, while
  the metric row states bytes, a fee weather, a crossing total and a findings
  count - none derivable from fifty rows and all of which render as a
  measurement if invented. The tiles become a named absence stating the
  condition. `MempoolPanel`'s prop narrowed from `MempoolView` to the two fields
  it actually reads, so the fallback needs no fictional summary to satisfy a
  type - which is the same move as `NotMeasured` having nowhere to put an owner.

EVIDENCE (per assertion; Executed unless labelled):
  A1 eleven routes, no pageerror  PASS Executed: `snapshot.spec.ts` walks
    NAV_ENTRIES (11), all 200, zero pageerror and zero console error.
    FAIL SIDE Executed: the pre-existing `record.spec.ts` fail-state block on a
    route that does not exist.
  A2 staleness regex  PASS Executed: 11 routes, `[data-ui=staleness]` count 1,
    text matches `/snapshot age: [\d,]+ blocks?/`.
    FAIL SIDE Executed, BY DATA: `tip` and `1,234 blocks behind` - the two
    strings the shipped formatter returned - asserted NOT to match, in
    `format.test.ts` and again on the page.
  A3 store resolution  PASS Executed: `snapshot-store.test.ts` resolves
    `redis-rest` from a mocked REST endpoint and asserts the document BY VALUE
    (height 4,000,001), the bearer header sent, and the key requested; and
    `snapshot-store.integration.test.ts` does the same over a REAL socket.
    FAIL SIDE Executed, BY DATA: the wrong token -> the server answers 401, the
    rung faults, the site falls through and says so.
  A4 no managed-store name in the client  PASS Executed: `client-graph.test.ts`
    walks the import graph from every `'use client'` entry (graph non-empty,
    known members asserted) and finds the store unreachable; `.next/static`
    grep empty over 40+ files.
    FAIL SIDE Executed, BY DATA: the store's reads placed in `src/lib/env.ts` -
    the module its own docblock names - and the predicate shown to fire.
  A5 the WebSocket envelope  PASS Executed: `frame-guard.test.ts` accepts an
    enveloped snapshot and tip frame; `ws-broker.test.ts` shows the gateway
    emitting `{type: "tx_added", entry: MempoolRow}`.
    FAIL SIDE Executed, BY DATA: `{channel, payload: {type: "tx_added", report}}`
    - the exact frame `apps/indexer` publishes - asserted to produce NO frame.
  A6 the lockbox figure  PASS Executed against the fixture (shipped).
    LIVE GATEWAY LEG: UNVERIFIED - no session can reach one.
  A7 the UNVERIFIED chip  PASS Executed: `status-affordances.test.tsx` renders
    it with its reason, in the open, tone `warn`.
    FAIL SIDE Executed, BY DATA: the same chip inside a closed `<details>`,
    shown unreachable.
    THE PAGE-LEVEL LEG IS UNIT-LEVEL, NOT e2e - see UNVERIFIED below.
  A8 (managed-store write)  PASS Executed: zero reads of the read-write name
    under `apps/web/src`; the integration test proves the READ-ONLY token is
    what actually crosses the wire, which a grep cannot.
    FAIL SIDE Executed: the read written in, the grep shown to match, reverted.
  A9 (no test or build reaches the store)  PASS Executed: the e2e build reads
    `source: fixture` with `data-faults=0` on all eleven routes, with the five
    names blanked.
    FAIL SIDE Executed, BY DATA: the REST pair pointed at the local mock, and
    the store shown to resolve `redis-rest` instead - never at the real store.
  A10 reads are counted  PASS Executed: two resolutions in one window issue ONE
    GET; ten concurrent callers share one in-flight read.
    FAIL SIDE Executed, BY DATA: a resolution past `SNAPSHOT_TTL_MS` issues a
    second, so the memo is a window rather than a cache with no expiry.
    FIGURE: ~129,600/month warm, ~259,200 cold, in `SNAPSHOT.md` section 5 with
    its derivation and its assumptions named.
  A11 the version floor  FAIL SIDES Executed, BY DATA: `/Zebra:6.2.3/` ->
    `below-floor`, `/MagicBean:5.4.2/` -> `unparsed`.
    LIVE LEG: UNVERIFIED - no node is reachable from any session, and the suite
    says so with its reason rather than omitting the case.
  A8 (the fallback marker)  PASS Executed: present in `.next/static`.
    FAIL SIDE Executed, BY DATA: `post-deploy-smoke.mjs` against a route that
    loads no script - exit 1, "loaded no script at all".
  A9 (history.replaceState)  PASS Executed: shipped spec, re-run green.
  A12 the three affordances  PASS Executed: indicator in
    `[data-ui=sysbar] [data-ui=epochclock]`; `source:` chip in the derivation
    `<summary>` with its count; `UNVERIFIED` chip outside every `<details>`.
    FAIL SIDE Executed, BY DATA: the chip moved into a closed disclosure.
  A13 the resolved source and the FIRST rung  PASS Executed: the indicator
    names the rung and `data-faults`.
    FAIL SIDE Executed, BY DATA: a configured REST pair on a closed port - the
    site renders, `source: fixture`, and the fault is NAMED rather than
    swallowed.
  A14 the four inherited rules  PASS Executed: `type-scale`, `summary-findings`,
    `check-svg-text-floor` and the rendered legibility sweep all green over the
    new markup; the CSSOM check is `painted-floor.spec.ts`, re-run green.
  A15 the plane  PASS Executed: `plane.test.ts` unchanged and green; the plane's
    only change is its INPUT (the resolved document rather than the fixture
    function), which is the same type.
    SEE ASSUMPTIONS - two clauses of A15 as written are wrong about the shipped
    plane and are corrected there rather than forced.
  A16 the suite  PASS Executed: 1,409 passed, 4 skipped, 1,413 total, rc=0,
    against a real PostgreSQL 16.13 and a real local Redis. Baseline 1,348 / 3 /
    1,351 reproduced on merged main at 76ea9e7 before any change.
    Playwright 192 passed, 0 failed, on the committed tree - 187 passed with 2
    failed on the run before the two visual baselines were recaptured, which is
    the recapture doing its job rather than a flake.
    THE COUNT WAS QUOTED BEFORE IT WAS MEASURED, ONCE, AND CORRECTED HERE. The
    PR body was written with 1,409 / 1,413 arrived at by adding two new cases to
    a measured 1,407 / 1,411. It happens to be right; it was arithmetic rather
    than a reading until this line, and this project's rule is that a figure is
    executed or it is labelled.
    REPRODUCED INDEPENDENTLY BY CI, PER PACKAGE, ON THE PUSHED HEAD adca738.
    The `typecheck, lint, test` job's own log reports indexer 448/1, gateway
    157/0, publisher 99/2, web 486/0, zebra-rpc 54/1, content 67/0, instruments
    98/0 - summing to exactly 1,409 passed, 4 skipped, 1,413 total on a
    different machine. The breakdown is also the enumeration check the count
    alone cannot make: seven packages declare a `test` script
    (`@zcashreveal/types` declares none) and all seven appear in the log, so no
    suite is running locally and unrun in CI. That is the origin this project
    counts - a workspace member arriving without inheriting a convention every
    other member has - checked against the object (the packages) rather than
    against the CI file that enumerates them.
    Fourteen guards rc=0, typecheck rc=0, lint rc=0, `content validate` rc=0,
    `pnpm build` 8/8 (was 9/9; `legacy/dashboard` is gone).

ASSUMPTIONS:
  CORRECTED - A15's exclusion set said "a drawn count that differs from
    `migrationHist`'s counted one". The shipped board CAPS at `nMax` and prints
    the true count beside the drawn one, which is HANDOFF-04a's own answer to
    LEDGER-04a Q2. A literal implementation of that clause fails on merged main
    and the wrong fix - removing the cap - would reintroduce the defect 04a
    closed. Reported rather than implemented.
  CORRECTED - A15 said the "other four lanes render not measured". Three do.
    Ironwood is measured as the `in` side of the one relation `migrationHist`
    counts, so the honest count is three not-measured lanes and two measured
    ends of one edge.
  CORRECTED - A15's named fail side, "give a mark a per-crossing amount", cannot
    be built as a DATA mutation: neither `PlaneMark` nor `SnapshotV1` has such a
    field, which is the property the assertion exists to protect. The exclusion
    set is satisfied instead by the members that ARE constructible.
  CORRECTED - A16 as written says the suite is "unchanged in COUNT as well as
    colour", which forbids the unit tests section 4.1 commissions in the same
    sentence. Restated as a FLOOR plus "no baseline test removed or newly
    skipped", and the first restatement then excluded a 4th skip that A11's own
    text mandates - caught by running the suite, corrected in place.
  ACCEPTED - fold 2's `source:` chip and section 3's `source: redis-rest |
    redis | gateway | fixture` are two different things, and both are honoured:
    the DOCUMENT's resolved rung goes in the bar's staleness indicator per
    section 3, and a PANEL's own derivation source goes in that panel's
    disclosure summary, which is where `/pools` previously floated `view.source`
    beside a heading. Recorded as a reading rather than a departure.
  DEFERRED - the adaptive retention window stays deferred whole (LEDGER-04a Q2).
  DEFERRED - the mainnet block fixture stays the operator's (LEDGER-10 Q4). The
    cutover ships with that test skipped, and `CUTOVER.md` section 1 says so.

NOTICED (outside scope, not acted on):
  - `apps/web/tsconfig.json` has no `include` committed; `next build` writes one
    on every run, so a build dirties the working tree. Pre-existing on main.
    It is why the two-build Playwright design was abandoned - see UNVERIFIED.
    **CORRECTED BY HANDOFF-12, AND THE PREMISE IS FALSE (F-49-2).** The file
    HAS a committed `include`, containing `.next/types/**/*.ts`, and has since
    `dd2395a` - the HANDOFF-01 scaffold commit that created it. One commit has
    ever changed its content; blob `c82604a` is identical at `dd2395a`, at
    `origin/main` and in the worktree. `next build` writes that entry only when
    it is MISSING, which is why Q1's custom-`distDir` run triggers it and the
    default build does not. The sentence above is left standing rather than
    edited because it is a record of what that session believed; the correction
    is appended to `LEDGER.md` under the same rule. Q1's mechanism is
    unaffected and remains the reason the two-build design was abandoned.
  - The compose pin `zfnd/zebra:6.3.0` clears the 6.3.0 floor with ZERO
    headroom, and nothing in `pnpm check` would catch a tag moved one patch
    down. Stated by a test rather than guarded; a guard would have to extract
    the version from an image tag, which `parseZebraVersion` refuses by design.
  - `apps/gateway`'s `readLiveReports` casts `JSON.parse(raw) as LeakReport` in
    one more place than this handoff revived: the shape is now revived, but the
    CAST idiom remains the tree's habit and is what hid the 500 for two
    handoffs.
  - `zecFrameSchema`'s `class` enum is hand-copied into `stream.ts`'s guard as a
    runtime `Set<string>` with no compile-time link. Recorded as a standing
    exposure by HANDOFF-08 and still standing.

UNVERIFIED (labelled):
  - EVERY CHECK IN `docs/2.0/CUTOVER.md` SECTION 5. No session can reach a
    preview or production host: Deployment Protection answers 302 to the SSO
    endpoint and the container's egress proxy refuses the CONNECT tunnel with
    403 before that (LEDGER-04 Q3). The document says UNVERIFIED at the head of
    that section rather than reporting the checks as done.
  - THE POST-DEPLOY JOB HAS NEVER RUN AGAINST A DEPLOYMENT. The SCRIPT it runs
    is exercised in both polarities against a locally served production build,
    which is why it takes a base URL; the WORKFLOW that calls it is unrun.
  - A11's LIVE LEG. No node is reachable. The two fail-side legs and the parser
    run everywhere.
  - A6's LIVE GATEWAY LEG, on the same terms the assertion already permits.
  - A3, A7 AND A2's "API UNREACHABLE" LEG ARE UNIT-LEVEL, NOT e2e, and this is
    the one place the evidence is weaker than the assertion asks for. A second
    Playwright `webServer` with its own `distDir` was written and run: building
    with a custom `distDir` makes Next REWRITE the tracked
    `apps/web/tsconfig.json`, after which tsc checks the route validators in
    both output directories and a clean build fails in a route file nobody
    touched (`"COLLECTION_NAMES" is not a valid Route export field`). Measured:
    merged main builds 9/9 from a clean worktree; the same build after one
    custom-distDir run fails. A suite that dirties the working tree as a side
    effect is worse than the coverage it buys, so the second build was removed
    and the assertions moved to the unit layer, where they are asserted BY VALUE
    and, for the REST rung, over a real socket. `playwright.config.ts` carries
    the measurement.

GATE ROUNDS: 0 external rounds. The gate here is the session's own, and the
  extrapolation rather than a convergence claim: a first external round would
  probably find one to three defects, most likely in the gateway's frame
  mapping (the newest control flow, and the place three of this session's own
  fixes landed) or in `/pools`'s degraded rendering, which has no e2e leg. The
  four defects this session found in its OWN work - the footer's duplicate age,
  the mock's port-holding import, the A16 skip clause, and the self-test arm
  that answered a missing checklist step with the wrong message - were all
  found by running something rather than by reading it, which is the reach a
  round of review would have to beat.

PREVIEW URL: none. No session can reach one.
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
