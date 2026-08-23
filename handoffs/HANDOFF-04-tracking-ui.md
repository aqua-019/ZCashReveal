---
handoff: 04
title: ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal
status: in-progress
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
