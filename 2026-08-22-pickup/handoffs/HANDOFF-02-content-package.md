---
handoff: 02
title: `packages/content` — zod schemas + research seeds
status: queued
branch: feat/v2-02-content
track: Web
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-02 — `packages/content` — zod schemas + research seeds

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

A typed content package the Record renders from: zod schemas for every claim type, JSON seeds transcribed from the research dossiers, a validator that fails the build on a missing source or an unverified item cited as fact, and typed loaders with claim-ID permalink helpers.

**Out of scope:** No rendering. No new research — transcribe what the dossiers contain; where the dossier says `low` or UNVERIFIED, the seed says so.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/RESEARCH-2026-08-DOSSIER.md` (all sections; §F/§G are the corrections and the unverified list)
- `docs/2.0/research/03-history-exploits-governance.md` Part C (timeline table, ~110 rows) and Part D (people)
- `docs/2.0/research/02-promotion-network.md` §1 (Cypherpunk ledger), §2.1 (influencer table), §4 (phrase catalogue)
- `docs/2.0/research/04-exchange-inflows-insider-selling.md` §2 (dated transfers), §3 (labels, rich list), §5.3 (the round-trip inference), §6 (allegations), §7 (not verified)
- `docs/2.0/TRACKING-MATH.md` §1.5 (label precedence)

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Schemas: `Source{id,title,url,publisher,date,accessed}`; `Claim{id,title,summary,body?,sources:SourceRef[]≥1,confidence:'high'|'med'|'low',lastVerified,tags[]}`; `BewareEntry` (discovered, disclosed, fixed, discoverer, rootCause, detectable:'yes'|'no'|'partial'|'n/a', window{from,to}, severity:'crit'|'high'|'mid'); `Contradiction{claim,reality}`; `TimelineEvent{date, category∈LAUNCH|FUND|GOV|LEAD|EXPLOIT|TECH|MARKET|REG|NET, height?}`; `NetworkEntity`, `NetworkEdge{from,to,what,amount?,date,sources,confidence}`; `Phrase{text,origin,date,amplifiers[],tension,confidence}`; `AddressLabel{address,label,labeller∈consensus|owner-filing|exchange|analyst|behaviour,method,confidence,lastVerified,sources}`; `Case{id,title,steps[{time,height?,from,to,amount,note}],verdict,confidence,sources}`; `Unverified{claim,status,why}`.
- Claim IDs are stable and human-readable: `B1…B14`, `C1…C16`, `T<ISO-date>[-n]`, `N-<slug>`, `P-<slug>`, `L-<address>`, `K-<slug>`.
- The three phrases marked NOT VERIFIED in the dossier and the corrected premises (Korean-exchange dominance, 21Shares ETP, bot networks, ECC layoffs, 'Zooko sold for taxes') appear **only** in `unverified.json`.

## §4 DELIVERABLES

1. `packages/content/src/schema.ts`, `src/loaders.ts` (`getBeware()`, `getContradictions()`, `getTimeline({category?})`, `getNetwork()`, `getPhrases()`, `getLabels()`, `getCase(id)`, `getUnverified()`, `getSources()`, `permalink(id)`).
2. `packages/content/data/`: `beware.json` (14), `contradictions.json` (16), `timeline.json` (≥ 100), `network.json` (entities + edges from the loop + Cypherpunk ledger), `phrases.json` (catalogue minus the unverified three), `labels.json` (ZIP 271 multisig mainnet/testnet; `t1PKBiv7…` analyst/Lookonchain; `t1gGCYpy…`, `t1Ym8XWv…`, `t1XKfbZY…`, `t1dP1MJw…`, `t1U1NE8w…` with their provenance), `cases.json` (2 Jan 2026 event; lockbox disbursement; 202,076 unshield), `unverified.json`, `sources.json` (every URL de-duplicated), `stats.json` (the 22 Aug 2026 pool/price figures with their sources, for the Splash metrics until the snapshot exists).
3. `packages/content/scripts/validate.ts` wired to `pnpm --filter @zcashreveal/content validate` and to CI.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/content validate` exits 0 and prints counts: beware 14, contradictions 16, timeline ≥ 100, labels ≥ 7, cases 3, unverified ≥ 15, sources ≥ 150.
- **A2.** Every `SourceRef` in every data file resolves to an entry in `sources.json` *(fail side: change one ref to a nonexistent id → validator exits 1 naming the file and id)*.
- **A3.** Every claim has ≥ 1 source and a `lastVerified` date ≤ today *(fail side: blank one → exit 1)*.
- **A4.** No string from `unverified.json` (`claim` field) appears in any other data file *(fail side: paste one into `phrases.json` → exit 1)*.
- **A5.** `labels.json` entry for `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` has `labeller: 'consensus'` and cites ZIP 271; the entry for `t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ` has `labeller: 'analyst'` and `confidence` ≠ `'high'`.
- **A6.** `cases.json` `K-2026-01-02` has exactly the 9 steps of research 04 §2.1 with amounts 29,999.99 · 1,999.99 · 17,999.99 · 202,076.207 · 50,000.96 · 50,000.5541 · 24,000.9781 · 74,001.9317 · 1,293.9321 (Executed: a test asserts the list).
- **A7.** `getTimeline({category:'EXPLOIT'})` returns ≥ 20 events and all have `category === 'EXPLOIT'` (unit test).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Two-hop expected: `researcher` (Haiku) transcribes dossier tables into JSON against the schema — after a PREFLIGHT listing READING / FILES / DONE MEANS; a Sonnet (`chain-integrator` or `ui-builder`) writes the schema + loaders first so the executor has a written contract. Loop 3 spec-author review applies.
- director-quality: `docs-scribe` cross-checks 10 random rows against the dossier and records NOT-MATCHED in §8; `security-auditor` confirms no non-public data (all addresses and filings are public).

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
