---
handoff: 03
title: The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources
status: queued
branch: the session-designated branch (name it `feat/v2-03-record-pages` if you may choose)
track: Web
depends_on: 01, 02
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-03 — The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Render the Record from `packages/content` with React Server Components in `apps/web`, matching mockup screens 00–03, 05, 06: zero-motion pages, footnote apparatus, measure lock, claim-ID permalinks, chart twins, RSS + JSON exports.

**Out of scope:** No Tracking UI (HANDOFF-04). No live data.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` screens `splash`, `beware`, `timeline`, `network`, `method`, `flows` — layout, copy, charts; `docs/2.0/mockups/reference/v2-00…03,05,06-*.png` for the rendered look
- `packages/content` loaders and data
- `docs/2.0/TRACKING-MATH.md` (for `/method`) and `docs/2.0/research/04-*.md` (for `/flows`)

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Charts are inline SVG built in code: thin marks, 2 px surface gaps between stacked segments, legends for ≥ 2 series, sparing direct labels, text in ink tokens never in series colours, a visually-hidden table twin for every chart.
- Client islands only where interaction exists (timeline filter, tooltip, citation popover); URL-synced state must wrap `history.replaceState` in try/catch (sandboxed iframes throw).
- Every rendered claim shows its id, confidence, and a 'cite this' popover (id, canonical URL, lastVerified, sources).
- Zero motion on Record pages (DGIGA TP05) except the Splash fog/tide.

## §4 DELIVERABLES

1. `/` Splash: hero (FogCanvas + leaks column), metrics row from `stats.json`, the two-windows diagram, pool snapshot bar, entry cards, footer ledger.
2. `/beware` + `/contradictions`: quote pair, ledger rows with severity stripe and detectable chip, the B2 deep dive (code diff + timeline steps), contradictions grid.
3. `/timeline`: shielded-share chart, category filter island, year rails.
4. `/network`: loop diagram (SVG, label halos), edge table, Cypherpunk ledger, statements-vs-price chart (log scale, staggered annotations), phrase catalogue, paid-content + fairness panels.
5. `/method`: claim-levels card, query table, clustering cards, estimator table, posterior block, ceremony grid, golden cases.
6. `/flows`: summary cards, dated transfers table, case reconstruction block, labels table, rich list + false-inference warning, labelling-infrastructure table, reserves, dev-fund panels, allegations table, unverified list.
7. `/sources`; `/beware.xml` (RSS of ledger changes); `/api/content/<collection>.json` exports.
8. `docs/2.0/screens/record-*.png` at 1440 px with real fonts (run where Google Fonts load).

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** All eight routes return 200 from `next start`; each page's first claim id is present in the HTML (Playwright).
- **A2.** `/beware#B2` scrolls to an element with `id="B2"` containing the text `CVE-2026-54496`.
- **A3.** Every chart `<svg>` has a sibling `<table>` twin (Playwright counts match per page).
- **A4.** axe (`@axe-core/playwright`) reports 0 serious/critical violations on `/beware`, `/timeline`, `/flows`.
- **A5.** Lighthouse performance ≥ 95 and accessibility ≥ 95 on `/beware` (Executed: JSON report committed under `docs/2.0/screens/lighthouse-beware.json`).
- **A6.** With `prefers-reduced-motion: reduce`, Record pages (not `/`) register no animations: `document.getAnimations().length === 0` after load (Playwright).
- **A7.** `/timeline?category=EXPLOIT` renders only `EXPLOIT` rows and the filter island never throws when `history.replaceState` is stubbed to throw *(fail side: remove the try/catch → page error)*.
- **A8.** `/beware.xml` validates as RSS 2.0 (parse with `fast-xml-parser`; ≥ 14 items).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- director-build: `ui-builder` (Sonnet) builds pages and islands; `test-engineer` (Haiku) writes Playwright + axe checks from the §5 list; `docs-scribe` captures screens.
- Loop 1 PREFLIGHT for any Haiku touching the chart code (spec longer than a screen).
- director-quality: `design-reviewer` reviews against the mockup and the DGIGA restraint stack; an APPROVE is a return like any other — it must cite what it compared.

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
