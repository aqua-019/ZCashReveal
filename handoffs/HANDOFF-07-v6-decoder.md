---
handoff: 07
title: Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection
status: in-progress
branch: the session-designated branch (name it `feat/v2-07-v6-decoder` if you may choose)
track: Data
depends_on: 06
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-07 — Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Decode v6 transactions and Ironwood actions from Zebra 6.x RPC JSON into the four-pool state; detect ZIP 318 migrations and record canonical denominations; never crash on an unknown shape.

**Out of scope:** No analysis changes beyond emitting the new records. No real-node operations (fixtures may be synthetic if the node is not synced; say so).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `apps/indexer/src/decoder/*.ts`, `test/fixtures/blocks/README.md`, `packages/zebra-rpc` (or `zebrad-rpc.ts`)
- ZIP 229 (v6 format), ZIP 258 (NU6.3), ZIP 2005 (Ironwood notes), ZIP 318 (migration), ZIP 257 (proof-size rule) — fetch and cite the revision read
- Zebra 6.x source/docs for the `getrawtransaction` / `getblock` verbosity-2 JSON field names of the Ironwood bundle — cite file + commit

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `decoder/ironwood.ts` mirrors `orchard.ts`; `decoder/v6.ts` dispatches by `version`; `block-decoder.ts` emits Ironwood commitments/anchors/nullifiers and boundary deltas.
- Unknown version or bundle → a structured `UNSUPPORTED_TX` leak report (severity INFO) with the raw field names logged — never a throw.
- Migration detection: `valueBalanceOrchard > 0 && valueBalanceIronwood < 0` with no transparent components → `MIGRATION_O2I`; amount recorded with `(n, k)` where amount = `n × 10^k` ZEC, `n ∈ {1,2,5}`, `canonical` false otherwise.
- Post-NU6.2 sanity: `proofsOrchard` length must equal `2720 + 2272 × nActionsOrchard` — a violation is recorded as a finding (decoder sanity), not a crash.
- Fingerprints: add expiryDelta/padding signatures for Zodl 3.x, Vizor, Zkool, Zingo, Cake as documented hypotheses with their source.

## §4 DELIVERABLES

1. `decoder/ironwood.ts`, `decoder/v6.ts`, updated `block-decoder.ts`, `leak-analyzer.ts`, `fingerprint.ts`; fixtures under `test/fixtures/blocks/` (real if a synced node is available — say which heights; else synthetic mirroring the RPC shape with the real-fixture test `skipIf`-guarded); tests.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/indexer test` exits 0 with ≥ 200 tests.
- **A2.** Decoding the v6 fixture yields `ironwood` commitments with contiguous positions and a `valueBalanceIronwood` equal to the fixture's value (unit test).
- **A3.** A transaction JSON with `version: 7` decodes to a report with `leakClass === 'UNSUPPORTED_TX'` and the decoder does not throw *(fail side: temporarily remove the guard → throw observed, restore)*.
- **A4.** A migration fixture (500 ZEC Orchard→Ironwood) is classified `MIGRATION_O2I` with `(n,k) = (5, 2)` and `canonical === true`; 499.5 ZEC yields `canonical === false` (unit tests, both polarities).
- **A5.** `proofsOrchard` of length `2720 + 2272×2 − 1` on a post-NU6.2 fixture produces a `PROOF_SIZE_NONCANONICAL` finding; the correct length produces none.
- **A6.** No `any` introduced: `grep -rn ': any' apps/indexer/src/decoder` is empty.
- **A7.** Replay of the fixture block through `PoolState` leaves `Bal_orchard` unchanged or decreased and `Bal_ironwood` increased by the migrated amounts (integration test).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Hard and not voluminous: `chain-integrator` (Sonnet) builds it directly; `test-engineer` (Haiku) writes fixtures/tests after PREFLIGHT (unfamiliar subsystem).
- director-quality: `security-auditor` reviews parsing of untrusted RPC JSON (bounds, lengths).

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
