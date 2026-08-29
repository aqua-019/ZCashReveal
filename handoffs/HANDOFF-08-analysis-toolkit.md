---
handoff: 08
title: Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)
status: in-progress
branch: the session-designated branch (name it `feat/v2-08-analysis-toolkit` if you may choose)
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

> **PRECONDITION FROM HANDOFF-05 (23 Aug 2026).** Do not capture a golden baseline until
> HANDOFF-05 is merged. Until then the wallet fingerprint is INERT rather than merely
> approximate: `RpcTransaction` declared `expiryHeight` while zcashd and Zebra serialise
> `expiryheight`, so `leak-analyzer.ts` computed `expiryDelta = null` for every transaction that
> ever came off a node, and `fingerprint.ts` gates three of its five signatures on
> `expiryDelta !== null`. A baseline captured in that state freezes the bug into the artefact
> that is supposed to detect it. HANDOFF-05 maps the wire spelling at the RPC boundary; two
> signatures (YWALLET, ZECWALLET_LITE) become reachable and two (NIGHTHAWK, ZCASHD_RUST) do not,
> because they also gate on a ZIP-317 conventional fee and the wire carries no fee field at all -
> computing that fee is this handoff's, and it must be done before those two are baselined.

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

2. **`RoundTripIndex.ingest()` takes the WIDE rule** (added by LEDGER-07 fold 2, answering LEDGER-07 Q1). A **deposit requires a transparent input**; a **withdrawal requires a transparent output**. Today `ingest()` reads every `perPoolZat` leg as a deposit or a withdrawal, and a pool-to-pool crossing is neither - it did not come from the transparent side and it did not go there. One migration's arriving leg is filed as a deposit, a later unrelated migration's departing leg matches it on amount, and a `LinkRecord` is emitted whose two address fields are both `null`, because no transparent end exists. HANDOFF-07 reproduced it end to end in two polarities on committed code, one of them on pool legs byte-identical to base `eba5b03`, so the defect predates that handoff.

   The **narrow** guard L2 also considered (skip a report whose `perPoolZat` both gained and lost) is a symptom filter: it catches migrations because migrations happen to have that shape, and would keep letting through any future one-sided pool crossing. The wide rule is the definition of the thing. A round-trip is a claim about value entering and leaving the **transparent** side; a link between two addresses that do not exist is not a weak link, it is a category error, and a `LinkRecord` with two null address fields is the type system saying so.

   **ZIP 318 turns the collision from a coincidence into the expected case**, which is why this is not a tidy-up: quantising to `n x 10^k` is the entire migration scheme, so once Ironwood is live, two unrelated migrations of the same denomination are ordinary rather than rare.

3. **The 17 round-trip fixtures are rebuilt with a transparent side** (same fold). Deliverable 2 breaks 13 of the 17 existing round-trip tests, and they are **not 13 regressions - they are 13 fixtures that have been asserting the defect**, because every round-trip fixture in the tree has no transparent side at all. Give each the transparent end its assertion actually means: a shielding deposit gets a `vin` carrying an address, an unshielding withdrawal gets a `vout` carrying one. A fixture that keeps its null addresses after this deliverable is a fixture whose test is claiming something the wide rule forbids.

4. **`mixed` joins the `/track` row-class enum, and the SWEEP is the deliverable rather than the member** (LEDGER-07 fold 3, answering Q2). The enum is `shield | deshield | shielded | migration | transparent | undecoded`. A Sapling-to-Orchard transfer that also pays a transparent address is none of them: it is not a `migration` - a public recipient stands in it - and `shield`/`deshield` name a direction of transparent flow it has on one end only. It falls to the residual `shielded` while `analyze()` answers `MIXED`, which the enum cannot say.

   **Before widening it, enumerate every consumer of the enum and list them in §7** - producers, zod schemas, view builders, React components, fixtures, tests, and any `switch`, lookup table, CSS class map or sort order keyed on a member. This is the fourth session in a row in which widening a type produced the defect (HANDOFF-06's `Pool`, HANDOFF-07's `LeakClass` and `PoolPath`, and this), and in each the defect was in a consumer nobody swept, never in the widening. A consumer with a `default:` arm is not thereby swept: a default that silently absorbs a new member is how a wrong class renders without an error.

## §4b — SWEEP DISCIPLINE (applies to deliverables 2, 3 and 4)

Per CLAUDE.md's post-fan-out rule, `git status --porcelain` runs after every fan-out and before every commit, and §7 states what it returned. Per LEDGER-06 Q3, a widening or a narrowing runs every branch the old shape kept unreachable - enumerate the consumers and exercise the new member before shipping, and expect the type checker not to help wherever a value crosses a JSON, SQL or `zod` boundary.

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
- **A11.** (LEDGER-07 fold 2, both polarities.) Two 500 ZEC Orchard-to-Ironwood migrations, ingested into one `RoundTripIndex` inside the window, produce **NO** `LinkRecord` *(fail side: revert `ingest()` to the pre-transparent rule and observe a link appear between strangers, with `senderAddress` and `recipientAddress` both `null`)*. **Corrected in execution, gate round 1:** the assertion said the link appears at `MEDIUM` / `FEE_TOLERANT`; the two legs carry the SAME amount, so the link is `HIGH` and `EXACT`. The grade named here would have been satisfied by an index that produced the wrong link at the right confidence, and it was written from the shape of the fee-tolerant case rather than from this one. **And the probe itself was a finding:** the test written for it (`round-trip.test.ts`) built a report that already had both transparent ends, so it passed with the wide rule in place AND with it reverted - a fail-side probe that does not fail, which CLAUDE.md makes a finding in its own right. It is now labelled a CONTROL, is built from the same legs as the pass state with one variable changed, and the discriminating pair is the control plus the two pass-state tests. The same must hold for the Orchard-to-Sapling pair HANDOFF-07 reproduced, whose pool legs are byte-identical to base `eba5b03`.
- **A12.** (LEDGER-07 fold 2.) A genuine shield/unshield pair **with** a transparent input on the deposit and a transparent output on the withdrawal still links, at the same grade it linked at before the wide rule *(fail side: strip the transparent side from the fixture and observe the link disappear)*. Without this, A11 is satisfiable by a `RoundTripIndex` that emits nothing at all.
- **A13.** (LEDGER-07 fold 3.) A transaction that moves value between two shielded pools **and** pays a transparent address renders as row class `mixed`, not as the residual `shielded` *(fail side: remove the `mixed` arm and observe it fall to another class, disagreeing with `analyze()`'s `MIXED`)*. **Corrected in execution:** the assertion said it falls to the residual `shielded`; it falls to **`shield`**. `valueFlow.direction` is `DEPOSIT` whenever ANY pool leg is negative, so a transaction with a transparent input satisfies the `shield` test and never reaches the residual - which is exactly why the `mixed` arm has to be tested BEFORE `shield` and `deshield` rather than after them, and is the substance of the member rather than a detail of it. The assertion's version was the milder failure; the real one publishes `flow: "t to z"` for a transaction whose transparent side is one end of three. Every consumer enumerated under deliverable 4 either handles `mixed` explicitly or is asserted to be unreachable for it.

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
