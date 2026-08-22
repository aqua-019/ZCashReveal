---
handoff: 06
title: Indexer: four pools + migration 003 + post-NU6.3 invariants
status: queued
branch: feat/v2-06-four-pools
track: Data
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-06 — Indexer: four pools + migration 003 + post-NU6.3 invariants

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Widen the pool model to `sprout | sapling | orchard | ironwood` across types, state machine, persistence and analysis without regressing the 171 tests; add activation heights through NU6.3; enforce the exit-only Orchard invariant; make the migration runner transactional.

**Out of scope:** No decoding of v6 transactions (HANDOFF-07). No new estimators (HANDOFF-08).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `packages/zec-types/src/{analysis,shielded,leaks,realtime}.ts`
- `apps/indexer/src/state/*`, `persistence/*`, `migrations/001,002`, `migrate.ts`, `decoder/activation-heights.ts`, `analysis/round-trip.ts`
- Plan §3.1 (turnstile invariants) and docs/RESEARCH-v0.2.md (state tuple)

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `ShieldedPool` is the single source of truth for the union; `Pool = ShieldedPool`; every exhaustive `switch` updated; generics `<P extends Pool>` preserved.
- Migration `003_four_pools.sql`: widen `CHECK (pool IN (...))` on `pool_commitments`, `pool_anchors`, `pool_nullifiers`, `pool_boundary_flows`; add `pool_snapshots(height, pool, balance_zat, commitment_count, nullifier_count, anchor_count, ts)` and `migrations_zip318(txid, height, amount_zat, denom_n, denom_k, canonical, ts)`. Runner becomes transactional per migration.
- `activation-heights.ts` adds mainnet NU6 `2_726_400`, NU6.1 `3_146_400`, ORCHARD_MITIGATION `3_363_426`, NU6_2 `3_364_600`, NU6_3 `3_428_143`; testnet `4_048_500`, `4_052_000`, `4_134_000`; `poolsActiveAt(height)`.
- `ValuePool`/`PoolState`: `Bal ≥ 0` for all pools; for heights ≥ NU6_3, `deltaV_orchard ≥ 0` — violation throws a typed error (our decoder is wrong, never the chain).
- `LeakClass` gains `MIGRATION_O2I` and Ironwood variants; `poolPath` gains `orchard→ironwood`; `RoundTripIndex` handles four pools.

## §4 DELIVERABLES

1. Type, state, persistence and analysis changes; migration 003; `poolsActiveAt`; updated tests; a fast-check property test that replay/rollback conserves every pool balance.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/indexer test` passes with ≥ 171 tests and 0 skipped when `DATABASE_URL` is set (CI job from HANDOFF-00).
- **A2.** Applying migrations on a fresh DB and on a DB migrated through 001→002 both succeed; re-running is idempotent (integration test).
- **A3.** A `pool_commitments` insert with `pool='ironwood'` succeeds and with `pool='tachyon'` fails the CHECK (integration test, both polarities).
- **A4.** `poolsActiveAt(3_428_142)` excludes `ironwood`; `poolsActiveAt(3_428_143)` includes it (unit test).
- **A5.** Applying a `BoundaryDelta` with `pool='orchard'`, `height=3_428_200`, `deltaZat=-1n` throws `ExitOnlyViolation`; the same delta at `height=3_428_100` is accepted (unit test, both polarities).
- **A6.** Property test: for any sequence of deltas across four pools followed by rollback to height h, balances equal the replayed prefix (fast-check, ≥ 200 runs).
- **A7.** `grep -rn "'sapling' | 'orchard'" packages apps/indexer/src` returns only the `ShieldedPool` definition site (no stale two-pool unions).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `chain-integrator` (Sonnet) owns the type widening and invariants; `backend-api` (Haiku) writes migration 003 from a written spec after PREFLIGHT (mechanical-rule dispatch); `test-engineer` (Haiku) the property test.
- director-quality: `security-auditor` reviews the migration runner transaction handling.

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
