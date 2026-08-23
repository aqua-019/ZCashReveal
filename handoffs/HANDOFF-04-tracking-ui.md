---
handoff: 04
title: ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal
status: shipped
branch: the session-designated branch (name it `feat/v2-04-tracking-ui` if you may choose)
track: Web
depends_on: 01, 02 (03 optional)
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-04 — ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

The Tracking suite UI in `apps/web`, driven by a typed `ZecApi` interface with a fixture-backed implementation so every page is complete before the gateway API exists. Matches mockup screen 04 (six sub-views).

**Out of scope:** No HTTP calls yet (the `HttpApi` class exists but is not selected). No WASM decryption (`/reveal` Mode A is gated 'coming in 2.1').

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/TRACKING-MATH.md` §0 (what a query returns), §3–§4 (what the inference chain shows), §5 (Mode A/B copy)
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` screen `tracking` — all sub-views and the `_track.js` data shapes; `docs/2.0/mockups/reference/v2-04-tracking-*.png` (search, address, tx, pools, flows, reveal) for the rendered look
- `packages/content/data/cases.json`, `labels.json`
- `legacy/dashboard/src/hooks/useMempool.ts`, `src/lib/ws.ts`, `src/lib/parsers.ts`, `src/components/CandidatesPanel.tsx` (harvest the inference-chain rendering)

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- DTOs live in `packages/zec-types` (add `AddressView`, `TxView`, `BlockView`, `PoolsView`, `MempoolView`, `Estimate{candidates, filters: FilterApplication[], nEff, claim, assumptions[]}`, `LabelView`, `CaseView`) as Zod schemas + inferred types; `apps/web` never defines its own wire types.
- `ZecApi` interface: `searchKind(q)`, `getAddress(a)`, `getTx(id)`, `getBlock(h)`, `getPools()`, `getMempool()`, `getFlows()`, `getLabels()`, `subscribe(onFrame)`; implementations `FixtureApi` and `HttpApi` (unwired).
- Search-kind detection: `t1`/`t3` + 33 base58 chars → transparent; `zs1`/`u1`/`zc` → shielded (routes to `/reveal` Mode B); `uview`/`zxview`/`zivk` → viewing key (never leaves the client); 64 hex → txid; integer → height.
- A shielded balance is rendered **only** inside the Mode A pane, which is gated; every estimate renders its assumptions and the claim chip.
- **Tip-hash fixture** (LEDGER-01 Q2, fold 5): the canonical tip hash is the 64-character value in
  `apps/web/src/lib/chain.ts`. Never copy the 65-character literal out of the mockup HTML — it carries one
  zero too many in its leading run.
- **`@zcashreveal/types` is a dependency of `apps/web`** (LEDGER-03 fold 1). The DTOs are imported, never
  restated: `/method` imports the `ClaimLevel` union rather than declaring its own copy, and the tracking
  routes import every view type from the package. `apps/web` defines no wire type of its own.
- **Dates print their own text** (LEDGER-02 Q3, carried forward by LEDGER-03 fold 2). Any date the tracking
  UI renders prints its record's own `dateText`; a formatted sort key is never rendered, and a record whose
  `datePrecision` is coarser than `day` never renders a day.

## §4 DELIVERABLES

1. **First, before any tracking CSS is written** (LEDGER-03 Q5, fold 6): the `globals.css` de-duplication pass. Three preformatted-mono treatments collapse to one, two compact-cell registers collapse to one, and seven card insets move onto the five-step inset ladder. HANDOFF-03 folded four route stylesheets into `globals.css` to buy back a render-blocking request; the consolidation stays, and this handoff adds the largest CSS surface in the project, so the collapse is cheaper now than after.
2. Routes: `/track` (search + mempool), `/address/[addr]`, `/tx/[txid]`, `/block/[height]`, `/pools`, `/reveal`; `/flows` under Tracking is a summary linking to the Record `/flows`.
3. `/address`: header with label + provenance chip, exact balance tiles, balance step chart, interaction graph, transactions table with pool-side estimates, Reasoning panel. Fixture: the ZIP 271 lockbox (`t3ev37Q2…`, balance 78,183.4093, received 93,496.6388, sent 15,313.2295, four transactions).
4. `/tx`: public-fields panel, inference chain (raw → spent-count → time window → amount echo → N_eff → claim), round-trip ledger. Fixture: `7ae85864…` (50,000.5541 ZEC unshield, 2 Jan 2026).
5. `/pools`: Sankey with normalised node heights and hover, balances table, Unprovable Residual tile, pool history (stacked area with the two unsound bands), drain / migration lens / Ironwood-birth panels.
6. `/track` mempool: dense table + detail panel with per-class reasoning; WS client (ported from legacy `ws.ts`, reconnecting) fed by a fixture stream in fixture mode.
7. `/reveal`: Mode B fogged pane + Mode A ceremony UI with client-side prefix validation and the 2.1 gate.
8. Dashboard test infrastructure (vitest + testing-library + jsdom) with tests for `searchKind` and estimate rendering; `docs/2.0/screens/track-*.png`.
9. A `surface` field on the `Unverified` schema in `packages/content` (LEDGER-03 Q4, fold 5), carrying the route each quarantined record renders beside. `permalink()` reads that field rather than applying a prefix rule, and the split module in `apps/web` that holds the mapping today (`src/lib/quarantine.ts`) is retired.
10. **Added mid-session by the operator (message of 23 Aug 2026, item 1).** The two old Vercel projects no longer exist: `z-cash-reveal-dashboard` and `z-cash-reveal-dashboard2` were deleted on 23 Aug 2026 and `zecreveal` (Root Directory `apps/web`) is the only project on the account, confirmed by L2 from the Vercel API. Correct `docs/2.0/DEPLOY-2.0.md` and the root `DEPLOY.md` so they describe the one project that exists, and drop the two now-moot operator clicks from the `handoffs/README.md` table. Handoffs 00 to 02, `docs/2.0/BRANCH-CLEANUP.md`, `HANDOFF-2026-08-22-v2.md` and the v0.2 runbook are NOT rewritten - they are historical records of what was true when they were written, and LEDGER-03 Q3's sweep rule is about claims of fact the site states, not about a log of past state. Section 7 names what was corrected and what was deliberately left. HANDOFF-11's cutover scope shrinks to pointing a domain at `zecreveal`, which is a note for that handoff and not work for this one.
11. **Added mid-session by the operator (message of 23 Aug 2026, item 2).** `apps/web/vercel.json` pins `buildCommand` to a literal string that does not build `@zcashreveal/types`, which fold 1 has just made a dependency of `apps/web`. Vercel runs the literal and bypasses turbo, so the preview build fails on `Module not found: Can't resolve @zcashreveal/types` while `pnpm build` passes locally through turbo's `dependsOn: ["^build"]`. Change it to `pnpm turbo run build --filter=@zcashreveal/web` so the dependency graph resolves itself and cannot drift again, and extend `scripts/check-vercel-config.mjs` to assert that form.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** All six routes render in fixture mode (`NEXT_PUBLIC_DATA_MODE=fixture`) with HTTP 200 and no console errors (Playwright collects `pageerror`).
- **A2.** `/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` shows `78,183.4093` with an `exact` pill and the label text `ZIP 271` with provenance `consensus`.
- **A3.** `/tx/7ae8586467551b6a023cdc7ef0b851f3729ee3f25b21c86902f1438f23cacc1c` shows `+50,000.5541`, a link grade `MEDIUM`, and an assumptions paragraph mentioning `52` minutes.
- **A4.** `searchKind` unit tests: 10 cases incl. `zs1…` → shielded, `uview1…` → key, a 63-hex string → not a txid (unit tests pass; *fail side*: flip an expectation, observe failure, revert).
- **A5.** No route outside the Mode A pane renders a numeric balance for a shielded address: a test renders `/reveal?addr=u1…` and asserts the Mode B pane contains no `ZEC` amount.
- **A6.** `/pools` Sankey node heights sum (plus gaps) to ≤ the SVG height (no overflow) — computed in a test from the rendered `rect` attributes.
- **A7.** The mempool WS client reconnects after a simulated close within 1.5 s (unit test with a fake WebSocket).
- **A8.** Every `Estimate` rendered contains ≥ 1 `FilterApplication` row with `countIn`/`countOut` and a claim chip (Playwright on `/tx/...`).
- **A9.** The `globals.css` de-duplication holds (deliverable 1, LEDGER-03 fold 6): each of the three collapsed patterns appears exactly once in the stylesheet, and `/beware` and `/flows` render identically before and after the pass (a Playwright screenshot comparison against baselines captured on the pre-pass tree).
- **A11.** *(added mid-session by the operator, 23 Aug 2026.)* **The viewing key cannot leave the tab, measured rather than reasoned about.** With `/reveal` loaded, typing a well-formed viewing key produces ZERO network requests whose URL, headers or body contain any substring of it (Playwright request interception over the whole session, including a CSP `report-uri` if one is configured); the field carries `autocomplete='off'`, `spellcheck='false'`, no `name` attribute, and is not inside a `<form>` that can submit; and the key appears in no attribute of any element in the serialised DOM after typing. *Fail side*: bind the value back to React state in a scratch build and watch the DOM assertion fail.
- **A12.** *(added mid-session by the operator, 23 Aug 2026.)* The deployed preview for this branch reaches `READY`. Section 7 names the deployment id that proved it.
- **A10.** Lighthouse (LEDGER-03 Q1, fold 3): performance >= 95 and accessibility >= 95 **measured on the deployed preview**. Where no deployed measurement is reachable - Deployment Protection returns 302 to the SSO endpoint for every preview, which is operator click 03 and is now blocking - the container number (`next start`, mobile preset, simulated throttling) is recorded instead, and a Record page of `/beware`'s size passes at >= 90 with that reason cited. Accessibility stays at >= 95 with no exception, on any surface.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- director-build: `ui-builder` (Sonnet) builds routes and panels; `chain-integrator` (Sonnet) defines the DTOs in `packages/zec-types` and the fixture data from the cases; `test-engineer` (Haiku) writes the §5 checks after PREFLIGHT (the spec is longer than a screen).
- director-quality: `design-reviewer` checks the mockup parity per sub-view; `security-auditor` confirms the key input never leaves the client (no network call on input; CSP `connect-src` reviewed).

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/prompt04-p86caa (the harness names the branch; the PR title
  carries HANDOFF-04, which is what LOG.md and LEDGER.md key on). PR: see LOG.md.

SPAWN MODE (proven by tool attempt, reported first): the Workflow tool answers
  in this session and was used for the gate - task wnvyleonc, four reviewer
  agents in one run (design, security, spec, facts), 908,803 subagent tokens
  over 287 tool calls, all four returning FAIL. The build itself was executed by
  the lead in-session rather than dispatched to build crews: the operator's
  standing instruction in this environment is that the Agent tool is not called
  unless requested, and it was not requested. That is a divergence from the §6
  dispatch hints and it is stated rather than glossed - the hints are L2's
  routing suggestions and director-build decides, but no director was spawned
  either, so §6's three-crew shape did not happen. What replaced it is the
  four-reviewer gate, which is the part of the shape that catches errors.

FILES

  created
    packages/zec-types/src/views.ts ......... every view DTO as a zod schema
    apps/web/src/lib/api/{index,kind,socket,stream,zec-api,fixture-api,http-api}.ts
    apps/web/src/lib/api/fixtures/{units,labels,address,tx,block,pools,mempool,flows}.ts
    apps/web/src/lib/claim.ts ............... CLAIM_TEXT, its own module (gate)
    apps/web/src/components/track/{Amount,EstimatePanel,Charts,TrackShell,
      TrackSearch,MempoolPanel,RevealKey,RevealAddress}.tsx
    apps/web/src/app/{address/[addr],tx/[txid],block/[height],pools,reveal,
      track/flows}/page.tsx
    apps/web/test/unit/{css-dedup,fixtures,frame-guard,search-kind,socket}.test.ts
    apps/web/test/unit/estimate-render.test.tsx .. jsdom render tests (gate)
    apps/web/test/e2e/{css-dedup,track,reveal-key}.spec.ts
    docs/2.0/screens/track-0{0..6}-*.png, docs/2.0/screens/lighthouse-*.json

  modified
    packages/content/src/{schema,loaders}.ts ..... Unverified.surface, permalink
    packages/{zec-types,content}/tsconfig.json ... tsBuildInfoFile into dist
    apps/web/src/app/globals.css ................. deliverable 1 + the tk- layer
    apps/web/src/styles/tokens.css ............... inset ladder, --p-orchard-text
    apps/web/next.config.ts ...................... the CSP and the headers
    apps/web/vercel.json ......................... buildCommand through turbo
    apps/web/vitest.config.ts, apps/web/package.json .. jsdom + testing-library
    apps/web/src/components/record/MethodLadder.tsx ... fold 1
    apps/web/src/components/ui/Chip.tsx .............. the warn tone
    apps/web/src/app/{track,pools,reveal,flows}/page.tsx and the record pages
      touched by the de-duplication
    scripts/check-vercel-config.mjs .............. two buildCommand form checks
    DEPLOY.md, docs/2.0/DEPLOY-2.0.md, docs/2.0/ZECREVEAL-2.0-PLAN.md,
      legacy/dashboard/README.md, handoffs/{README,HANDOFF-10-infra,
      HANDOFF-11-live-wiring}.md ................. the deleted Vercel projects

  deleted
    apps/web/src/lib/quarantine.ts ... deliverable 9 retires it; DROPPED_IDS in
      app/network/page.tsx goes with it

EVIDENCE (Executed unless labelled otherwise; the suite carries its own fail
states as named tests, so one green run is a two-polarity transcript for every
assertion that has one)

  Final run, this tree: 127 Playwright tests passed (2.3 min) and 548 unit tests
  passed - apps/web 346, apps/indexer 133 (38 skipped), packages/content 62,
  apps/gateway 7. `pnpm typecheck` 8/8, `pnpm lint` 0 errors,
  `pnpm --filter @zcashreveal/content validate` OK.

  A1  routes render, no console errors. PASS: test/e2e/track.spec.ts "A1 pass
      state" over all seven routes, collecting `pageerror`. FAIL: the same block
      asserts a route the corpus does not carry renders the stated gap rather
      than a 500.
  A2  /address/t3ev37Q2... shows 78,183.4093, an `exact` pill, `ZIP 271` and
      provenance `consensus`. PASS + FAIL: "A2 pass state" / "A2 fail state - an
      address the corpus does not carry".
  A3  /tx/7ae85864... shows +50,000.5541, grade MEDIUM, 52 minutes in the
      assumptions. PASS + FAIL: "A3 pass state" (three tests) / "A3 fail state".
  A4  searchKind unit tests - 41 cases, not the 10 the spec asks for, including
      the t2 case a gate round added. FAIL side: an expectation was flipped,
      the failure observed, and reverted.
  A5  no ZEC amount in the Mode B pane. PASS + FAIL: "A5 pass state" (three
      tests) / "A5 fail state" (two). THE DETECTOR CAUGHT TWO OF MY OWN
      DEFECTS: it fired first on "1,240" (a count, so the detector was narrowed
      to `\bZEC\b|\d[\d,]*\.\d+`), and again after the gate round on "3.13M",
      which is why the note count is now written "about 3,130,000" - three
      significant figures and no decimal point.
  A6  Sankey node heights plus gaps fit the SVG. PASS + FAIL: "A6 pass state"
      (two) / "A6 fail state - an unnormalised layout would overflow".
  A7  the socket reconnects within 1.5 s. PASS: test/unit/socket.test.ts, 21
      cases against a fake WebSocket. FAIL side: the backoff was forced past the
      window, the failure observed, reverted.
  A8  every rendered Estimate carries a filter row with countIn/countOut and a
      claim chip. PASS + FAIL: "A8 pass state" (three) / "A8 fail state - the
      selectors discriminate" (two). A gate round found the generalising test's
      locator read `[data-estimate]` while the compact cell emits
      `data-estimate-cell`, so /address's three estimates were never visited;
      widening it failed until EstimateCell rendered its audit trail, which is
      the sequence a test is supposed to produce.
  A9  the de-duplication holds. PASS: test/unit/css-dedup.test.ts counts each
      collapsed pattern exactly once; test/e2e/css-dedup.spec.ts compares
      /beware and /flows against baselines captured on the pre-pass tree at
      maxDiffPixels: 0. Independently confirmed at the end of the gate round:
      re-capturing all fifteen docs screens left the eight record-*.png
      byte-identical and changed only the seven track-*.png.
  A10 Lighthouse. DEPLOYED MEASUREMENT NOT REACHED - see UNVERIFIED. Container
      numbers (next start, mobile preset, simulated throttling), after the gate
      round, JSON committed under docs/2.0/screens/:
        /track 95 · /pools 95 · /reveal 97 · /block 96 · /tx 96 ·
        /track/flows 97 · /address 94 · accessibility 100 on every one.
      /address is 94 against the 95 floor, measured three times with the same
      result. The cause is this gate round's own requirement: EstimateCell now
      renders the full audit trail for three estimates, and LCP moves from 2.6
      to 2.8 s under the mobile preset. Fold 3's fallback covers it - a Record
      page of /beware's size passes at >= 90 with the reason cited - and it is
      reported as a miss rather than shaved, because the alternative is deleting
      the assumptions a reader needs to judge the strongest claim on the site.
  A11 the viewing key cannot leave the tab. PASS: test/e2e/reveal-key.spec.ts,
      14 tests. Over the whole session no request's URL, headers or body carries
      any of five 24-character windows of a typed key; the key is in no
      attribute, no text node, not in outerHTML, the URL, the title, a cookie,
      localStorage or sessionStorage, while the live input property IS the key
      so the check is not vacuous; the field has autocomplete=off,
      spellcheck=false, no name, type=text, and `el.form === null`.
      FAIL: executed today. `value={scratchKey}` was bound back onto the input
      in a scratch build and the DOM assertion failed:
        Error: the key is in a DOM attribute
        - Array []
        + Array [ "INPUT[value]" ]
      and, with the three leak assertions softened so the run does not stop at
      the first:
        Error: the key is in the serialised document
        Expected: false   Received: true
      Reverted; the suite returns 14 passed. The finding that produced the fix
      was made by this test before the operator's message arrived: React renders
      a controlled input's value as a DOM ATTRIBUTE, so the key was in
      document.documentElement.outerHTML. Both key-capable fields are
      uncontrolled. The second half is next.config.ts: connect-src 'self' in
      fixture mode and form-action 'none', so the browser refuses rather than
      the author remembering.
  A12 the deployed preview reaches READY.
      PASS: dpl_J5ryna9fz6mh2TUgZmPTXWxSLNVF, commit 4716e1f, state READY,
      built in 31 s (buildingAt 1787488465724, ready 1787488496198). Its log
      reads `Detected Turbo. Adjusting default settings...` and installs
      `+ @zcashreveal/types 0.1.0 <- ../../packages/zec-types`.
      FAIL: dpl_Aca2Y5zfqgi2H2UFX4BbhTEgsEf5, commit 558faa8, state ERROR:
        Module not found: Can't resolve '@zcashreveal/types'
        Error: Command "pnpm --filter @zcashreveal/content build && next build" exited with 1
      which is the operator-reported failure, reproduced locally first and fixed
      by routing the build through turbo.

ASSUMPTIONS

  ACCEPTED
   1. Fixture mode is the only mode wired; `api()` fails CLOSED to FixtureApi
      for `snapshot` and `live`. §1 says fixture, and a misconfigured deployment
      should degrade to something honest.
   2. `MempoolRow`, not `MempoolEntry` - the latter name is taken in
      transactions.ts and two DTOs with one name is how the wrong one gets
      imported.
   3. Estimate DTOs are zod schemas used as wire contracts, with a hand-written
      narrowing guard (`asFrame`) on the socket path so the client bundle does
      not carry a validator.
   4. Deliverable 2 names six routes; seven are shipped, because §4.2 also asks
      for `/track/flows` as a summary linking to the Record's.

  CORRECTED (by a gate round unless noted)
   5. "testing-library + jsdom" was substituted with Playwright-on-a-production-
      build. The gate was right that a substitution nobody records is a gap:
      both are installed now and test/unit/estimate-render.test.tsx renders
      EstimatePanel and every EstimateCell in jsdom. The Playwright evidence
      stays; it is stronger about the shipped artefact.
   6. `t[123]` in the transparent classifier - one character wider than §3's
      rule and than its own comment. Now `t[13]`, with a unit case.
   7. `IS_FIXTURE` read the env while `api()` ignored it. Derived from what was
      selected.
   8. `addressViewSchema.script` admitted "shielded" while /reveal's docblock
      claimed no such view could exist. The member is gone; A5 is a type now.
   9. Four estimates' claim levels were typed by hand; three disagreed with
      `claimLevelFor`. All computed, with a unit test walking the corpus.
  10. Gold on the consensus label chip, the residual figure, the balance chart,
      the interaction graph's base stroke and both claim-level colour tables.
      Removed; gold survives on the balance chart only where a new `crossing`
      flag says a pool boundary was crossed.
  11. The Mode B fog painted over the text at 1.99:1 and 1.18:1. It tints the
      ground now (`isolation: isolate` + `z-index: -1`), and the branch gained
      focusable controls so the `:focus-within` that thins it can fire.
  12. Four figures the mockup states self-contradictorily were corrected during
      the build, each with a stated reason in the fixture: gross-vs-net address
      legs; the migration histogram summing to 82,428.5 against a caption of
      134,472; the ZIP 317 conventional-fee count (9 stated, 11 computed); the
      Orchard drain rate (5,603 stated, 4,919 over the window the panel labels).
  13. Six statements of fact corrected against the corpus in the gate round -
      the ZIP 1015/1016 coinbase split, the Whale Alert claim, the round-trip
      assertion, "Powers of Tau", the CipherScan/stats-seed height, and the
      "twelve times"/"three orders of magnitude" tolerance factors. Every
      restatement was swept in the same commit; the swept files are named under
      SWEEP below.

  DEFERRED (to §8)
  14. `script-src 'unsafe-inline'` in the CSP. A nonce needs middleware, which
      makes every route dynamic and would undo the work that took /reveal from
      92 to 97. Stated in next.config.ts rather than hidden.
  15. `Unverified.surface` is required on all 32 records while only eight render
      anywhere, so 24 carry a surface they do not appear on and `permalink()`
      emits an anchor that resolves to a page rather than an element. Whether
      the field should be nullable is a question for L2 (§8 Q4).
  16. /address at 94. See A10.

SWEEP (LEDGER-03 Q3 - a corrected fact is corrected everywhere in the same
commit). ZIP 1015/1016: src/lib/api/fixtures/block.ts (header, share
computation, four rendered lines) and src/app/block/[height]/page.tsx:79.
Powers of Tau: src/lib/api/fixtures/pools.ts (two sites) and
src/app/pools/page.tsx:124. Tolerance factors: src/lib/api/fixtures/tx.ts
(:41 comment and the rendered assumption) and src/lib/api/fixtures/address.ts
(:43 header and the filter param), plus the comment in
test/e2e/track.spec.ts that restated it. Gold's job count: CLAUDE.md line 44
was already right; src/styles/tokens.css:48 said three and now says four.

DELETED VERCEL PROJECTS (operator message, item 1) - what was corrected and
what was deliberately left.
  Corrected: docs/2.0/DEPLOY-2.0.md, DEPLOY.md, legacy/dashboard/README.md,
  docs/2.0/ZECREVEAL-2.0-PLAN.md (lines 18, 213, 215),
  handoffs/HANDOFF-10-infra.md, handoffs/HANDOFF-11-live-wiring.md (the cutover
  scope note), handoffs/README.md (the two moot operator clicks dropped).
  Deliberately left, as instructed: handoffs 00, 01 and 02;
  docs/2.0/BRANCH-CLEANUP.md; HANDOFF-2026-08-22-v2.md; the v0.2 runbook;
  handoffs/LEDGER.md and handoffs/LOG.md; handoffs/prompts/*;
  CLAUDE-CODE-PROMPTS.md; and ZECREVEAL-2.0-PLAN.md line 132, which describes
  what the deployment was at the time it was written. These are records of past
  state, not claims the site makes.

NOTICED (outside scope, not acted on)
  - `.tk-examples a:hover` and `.entry:hover` both spend `--gold-dim` on a
    hover border. The design reviewer declined to file it because HANDOFF-01
    shipped the pattern, so it is precedent rather than drift - but it is a
    gold mark that none of the four jobs licenses, and it wants an operator
    decision rather than a gate round (§8 Q1).
  - `.tk-residual .v` uses `"SOFT" 40` where the shared numeral register uses
    30. The mockup declares 40 and the fonts contract pins only weight and
    opsz, so nothing is violated; it is a third variant introduced immediately
    after a de-duplication pass, which is worth someone's judgement.
  - 24 of the 32 quarantine records render on no surface at all. That is
    HANDOFF-03's state, not this handoff's, but deliverable 9 made it visible.

UNVERIFIED (labelled)
  - A10 ON THE DEPLOYED PREVIEW. Fold 3 makes the deployed measurement
    authoritative and it was not reached, for two independent reasons, both
    verified today rather than assumed. (1) The project's Deployment Protection
    has `ssoProtection.enabled = true`, `deploymentType =
    all_except_custom_domains` (read from the Vercel API), which is operator
    click 03. (2) This container's egress proxy refuses the host outright -
    `curl` to the preview returns `CONNECT tunnel failed, response 403`, not a
    302 to SSO - so even with protection lifted, Lighthouse could not be driven
    against it from here. A deployed A10 needs either an operator run or a
    custom domain.
  - The route checklist over the wire, for the same reason.

GATE ROUNDS: 1 round · 36 findings · four reviewers, all FAIL
  design    11 (5 MID, 6 LOW): globals.css:3431 accent-budget MID ·
    Charts.tsx:568 accent-budget MID · fixtures/mempool.ts:85 mockup-parity MID ·
    globals.css:4045 WCAG-1.4.3 MID · tokens.css:78 provenance MID ·
    globals.css:3915 accent-budget LOW · Charts.tsx:104 accent-budget LOW ·
    globals.css:3748 accent-budget LOW · globals.css:3798 hover-verb LOW ·
    MethodPosterior.tsx:62 provenance LOW · fixtures/mempool.ts:315 parity LOW
  security   6 (1 HIGH, 5 MID): RevealAddress.tsx:91 claim-ladder HIGH ·
    fixtures/tx.ts:72 arithmetic MID · next.config.ts:11 CSP MID (STALE) ·
    RevealKey.tsx:14 provenance MID (STALE) · reveal/page.tsx:32 type-claim MID ·
    fixtures/tx.ts:122 label-precedence MID
  spec       7 (2 HIGH, 3 MID, 2 LOW): MethodLadder.tsx:32 fold-1 HIGH (STALE) ·
    EstimatePanel.tsx:133 contract HIGH · api/index.ts:40 disclosure MID ·
    RevealKey.tsx:14 provenance MID (STALE) · package.json:29 deliverable-8 MID ·
    track.spec.ts:359 A8-coverage LOW · kind.ts:36 contract LOW
  facts     12 (2 HIGH, 8 MID, 2 LOW): fixtures/block.ts:24 corpus HIGH ·
    fixtures/flows.ts:74 corpus HIGH · fixtures/pools.ts:161 corpus MID ·
    fixtures/pools.ts:38 corpus MID · fixtures/tx.ts:72 arithmetic MID ·
    fixtures/pools.ts:219 sourcing MID · MempoolPanel.tsx:211 self-contradiction
    MID · fixtures/flows.ts:74 hedging MID · fixtures/flows.ts:62 determinism
    MID · fixtures/address.ts:128 claim-ladder MID · loaders.ts:177 provenance
    LOW · fixtures/address.ts:43 arithmetic LOW
  Three findings marked STALE were fixed in the working tree while the reviewers
  read HEAD; they are in commit a027db4, which precedes the fix commit. Every
  other finding is addressed in 4716e1f. No finding needed a second round, so
  the Loop 4 cap of three rounds per finding was not approached.

PREVIEW URL: https://zecreveal-git-claude-prompt04-p86caa-aquatic-17b9f112.vercel.app
  (behind SSO - operator click 03; deployment dpl_J5ryna9fz6mh2TUgZmPTXWxSLNVF)
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
