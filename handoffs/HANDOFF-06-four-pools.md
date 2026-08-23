---
handoff: 06
title: Indexer: four pools + migration 003 + post-NU6.3 invariants
status: in-progress
branch: the session-designated branch (name it `feat/v2-06-four-pools` if you may choose)
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
- **Gates fetch `origin/main` before fanning out** (L2 RESOLUTION for HANDOFF-05, fold 8). HANDOFF-05's round-2 gate reviewed the whole project as its diff because the local base was stale, which is most of why it cost 14 agents and 29 minutes. A gate whose diff is the whole tree is not a gate on this change.

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

2. **`pnpm --filter @zcashreveal/indexer migrate` works on a clean checkout** (L2 RESOLUTION for HANDOFF-05, fold 1, finding F-05-1). On a fresh worktree, after `pnpm install` and before any build, the documented migrate command dies: `Cannot find module '.../packages/zec-types/dist/index.js' imported from apps/indexer/src/config.ts`. This is F-02-1's shape in a place fold 1 of the HANDOFF-04 resolution did not reach: turbo's `test: dependsOn ^build` fixed the test task, and `migrate` is not a turbo task. It does not affect CI, whose order is Install, Build, then migrate. It DOES affect the operator, because HANDOFF-10's runbook will tell a human to run migrations on a VPS from a fresh clone, and this is the command they will run. Fix it with a `premigrate`, or by routing the task through turbo with `dependsOn: ["^build"]`.

3. **Correct ZIP 317 in `docs/2.0/TRACKING-MATH.md` §3.5 and the `/method` component that renders it** (L2 RESOLUTION for HANDOFF-05, fold 4, LEDGER-05 Q3). State ZIP 317's exact transparent term `max(ceil(inSize/150), ceil(outSize/34))`, cite Zebra `zebra-chain/src/transaction/unmined/zip317.rs:160-173`, and keep the count form beside it labelled as the P2PKH-only simplification it is. Add the worked lockbox case: two 2-of-3 P2SH inputs give `L = 4` and a 20,000 zatoshi conventional fee, against the count form's `L = 2` and 10,000. This is not pedantry - the ZIP 271 lockbox is a 2-of-3 P2SH multisig, the divergence lands exactly there, and "the lockbox did not pay the conventional fee" is a false statement about the one address this project exists to track. Sweep every restatement of the count form in the tree in the same commit, per CLAUDE.md's corrected-fact rule.

4. **Compute the transaction fee by summing the outputs a transaction spends, and carry it on the analysis path so `feeZat` is real rather than `0n`** (L2 RESOLUTION for HANDOFF-05, fold 5, LEDGER-05 Q4). A fee is a property of the inputs a transaction spends, so it must be computed by summing the spent outputs, which is the indexer's job and not the boundary's: no node sends a fee field, Zebra's `TransactionObject` has none and neither does zcashd's `getrawtransaction`. Two wallet signatures (NIGHTHAWK, ZCASHD_RUST) and every `isZip317Conventional` call are blind until it exists. §8 MUST record that HANDOFF-08's golden cases depend on this AND on the `expiryheight` fix being merged, and may not be captured before both - for the same reason the fingerprint fix had to precede them: a baseline captured over an analyser that cannot see fees freezes the blindness into the record of correct behaviour.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/indexer test` passes with >= 171 tests and **no Postgres-gated test skipped** when a migrated database is reachable — assert with `node scripts/assert-no-skipped-integration.mjs`, not with a raw skip count: one test (`block-decoder.test.ts`, real mainnet fixture) stays skipped until HANDOFF-10 captures the fixture.
- **A2.** Applying migrations on a fresh DB and on a DB migrated through 001→002 both succeed; re-running is idempotent (integration test).
- **A3.** A `pool_commitments` insert with `pool='ironwood'` succeeds and with `pool='tachyon'` fails the CHECK (integration test, both polarities).
- **A4.** `poolsActiveAt(3_428_142)` excludes `ironwood`; `poolsActiveAt(3_428_143)` includes it (unit test).
- **A5.** Applying a `BoundaryDelta` with `pool='orchard'`, `height=3_428_200`, `deltaZat=-1n` throws `ExitOnlyViolation`; the same delta at `height=3_428_100` is accepted (unit test, both polarities).
- **A6.** Property test: for any sequence of deltas across four pools followed by rollback to height h, balances equal the replayed prefix (fast-check, ≥ 200 runs).
- **A7.** `grep -rn "'sapling' | 'orchard'" packages apps/indexer/src` returns only the `ShieldedPool` definition site (no stale two-pool unions).
- **A8.** On a tree with `packages/*/dist` deleted, `pnpm install && pnpm --filter @zcashreveal/indexer migrate` exits 0 *(fail side: revert the fix, run the same command, observe the module-resolution error)*. F-05-1, L2 RESOLUTION for HANDOFF-05 fold 1.
- **A9. A CLASS THAT NAMES THE TRANSPARENT SIDE IS NEVER APPLIED TO A TRANSACTION THAT HAS NO TRANSPARENT SIDE.** Added mid-session by the operator, and it is not an ordinary correctness assertion: "shielded value left the pool for the transparent side" is the exact claim class this project exists to make carefully, and the analyser was making it about every NU6.3 migration. Pass state, both halves: an Orchard-to-Ironwood migration with no transparent output classifies as `MIGRATION_O2I` when the Ironwood balance is supplied, and never as `Z_TO_T`, `T_TO_Z` or any other transparent-naming class with it withheld; and a transaction that genuinely pays a transparent output still classifies `Z_TO_T`. *(Fail side: revert the requirement that a transparent-naming class needs a transparent recipient, and watch the migration fixture flip to `Z_TO_T` while the same report carries `netTransparentInflowZat: 0n`.)*

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
