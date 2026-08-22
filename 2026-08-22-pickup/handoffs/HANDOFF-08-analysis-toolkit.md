---
handoff: 08
title: Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)
status: queued
branch: feat/v2-08-analysis-toolkit
track: Data
depends_on: 06
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-08 — Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Implement the process-of-elimination toolkit from TRACKING-MATH §1, §3, §4 as pure, audited modules keeping the v0.2 `FilterApplication` audit-record contract, with the golden-case tests from §6 and a conservation property test.

**Out of scope:** No wiring into the live indexer loop (HANDOFF-12). No UI.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/TRACKING-MATH.md` (all)
- `apps/indexer/src/analysis/*.ts` + tests
- `packages/content/data/{cases,labels}.json`
- ZIP 317, ZIP 318, ZIP 320, ZIP 1014/1015/1016 (funding-stream addresses per height) — cite revisions

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `analysis/echo.ts`: exact / fee-tolerant (`FEE_TOLERANCE_ZAT`) / relative (`ε = 1e-4`) / subset-sum (`k ≤ 3`, window-bounded, amounts quantised to `1e4` zat) matchers; grades HIGH / MEDIUM / LOW per the spec; injectable clock; audit records.
- `analysis/clustering.ts`: common-input-ownership union-find; change heuristic with `pChange`; exchange-shape detectors (change-to-self withdrawal, many-to-one sweep); P2SH multisig flag.
- `analysis/labels.ts`: consensus labels (ZIP 271 multisig mainnet/testnet; funding-stream addresses from the ZIPs — cite; TEX detection) with precedence `consensus > owner-filing > exchange > analyst > behaviour`; loads `labels.json` for non-consensus tiers.
- `analysis/posterior.ts`: `w_j = L_amount · L_time · L_fp · L_struct`, normalisation, `H`, `N_eff`, claim via the existing classifier; returns top-k with `p_j` and assumption sentences.
- `analysis/taint.ts`: ≤ 3-hop flow estimate, cut `p < 0.02`, unresolved-mass residual.
- All modules pure (no I/O); audit records serialise to the wire shape the UI parses.

## §4 DELIVERABLES

1. Five modules + tests; `analysis/index.ts` exports; a `GOLDEN.md` in `apps/indexer/src/analysis/__tests__/` describing each golden case and its source transactions.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** Golden 1: shield 50,000.960 at t, unshield 50,000.5541 at t+52 min in a window with no other candidates → grade `MEDIUM`, relative error `8.1e-6 ± 1e-7`, audit record `filter: 'amount_echo'`, `matchKind: 'RELATIVE'`.
- **A2.** Golden 2: the same pair under the v0.2 absolute tolerance only → no match (unit test proves the old rule misses it).
- **A3.** Golden 3: 7,875 → pool, 7,438.2295 back 20 min later, same address → grade `LOW` with `partial: true`; never `MEDIUM` or `HIGH`.
- **A4.** Golden 4: a 202,076.207 unshield with no in-window shield ≥ 100,000 → `claimLevel === 'aggregate_only'` and `N_eff > 1000`.
- **A5.** Subset-sum: shields {30,000, 20,000} and an unshield 49,999.98 within the window → a `k=2` split match graded `LOW` (and `MEDIUM` when the timing is < 1 h and the split count is 2 — test both).
- **A6.** Clustering: the three Dec 2025 withdrawals from `t1PKBiv7…` to `t1XKfbZY…` (inputs from one address, change back to self) are flagged `exchange-withdrawal-shape` with the change output identified (unit test from `cases.json`).
- **A7.** Labels: `t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` → `consensus`; an unknown address → `behaviour`/none; precedence sorts `consensus` above `analyst` (unit tests).
- **A8.** Posterior: three candidates with weights 0.8/0.1/0.1 → `H ≈ 0.92 bits`, `N_eff ≈ 1.9`, claim `requires_disclosure` (unit test with tolerance 1e-3).
- **A9.** Property test: for random windows of shields/unshields, `Σ estimated exits ≤ Bal_pool` always holds and any estimator output violating it is rejected with a logged audit record (fast-check ≥ 300 runs).
- **A10.** `grep -rn 'fetch(\|postgres\|ioredis' apps/indexer/src/analysis` is empty (purity).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Hard: `chain-integrator` (Sonnet) implements; `test-engineer` (Haiku) encodes §5 after PREFLIGHT (spec longer than a screen); `researcher` (Haiku) extracts the funding-stream addresses from the ZIPs with citations.
- director-quality re-judges every golden case against the code, not the test names.

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
