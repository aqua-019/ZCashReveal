---
handoff: 09
title: Turnstile accounting, migration lens, Ironwood birth, snapshot publisher
status: queued
branch: the session-designated branch (name it `feat/v2-09-instruments-snapshot` if you may choose)
track: Data
depends_on: 06, 08
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-09 — Turnstile accounting, migration lens, Ironwood birth, snapshot publisher

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

The pool-level instruments (Unprovable Residual, drain, migration lens, Ironwood-birth N_eff series) and `apps/publisher`, which writes `snapshot.json` every block so the public site can never render empty.

**Out of scope:** No web wiring (HANDOFF-11).

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- Plan §3.1–3.5 and §4 decision 2
- `apps/indexer/src/index.ts`, `state/value-pool.ts`, `apps/gateway/src/ws-broker.ts`
- `migrations_zip318`, `pool_snapshots` from HANDOFF-06

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `analysis/turnstile-accounting.ts`: per-pool `Bal`, in/out per window, `U_h = Bal_sprout + Bal_orchard`, `V_h = 1 − U_h/Supply_h`, drain `D_h = 1 − Bal_orchard,h / Bal_orchard,NU6.3` and velocity (24 h / 7 d). Supply from `getblockchaininfo` `valuePools`/issuance — document the source.
- `analysis/migration-lens.ts`: denomination histograms per block/window; session bounds (note-count lower bound `⌈B/10,000⌉`, wallet upper bound = denomination runs); stranded-dust estimate — distributions only.
- `analysis/ironwood-birth.ts`: `N_eff` series for Ironwood spends since `3_428_143` and the share per claim level.
- `apps/publisher`: writes `snapshot.json` `{height, hash, time, pools, residual, drain, migrationHist, neffSeries, lastReports (≤ 50), labelsVersion}` on every tip to **every configured sink**; schema `SnapshotV1` in `packages/zec-types`. Sinks: `file` (`SNAPSHOT_FILE`, dev + the gateway's local copy), `redis` (`SNAPSHOT_REDIS_URL`, a `rediss://` URL — the Vercel-managed Marketplace Redis store Aqua already has; the publisher is its only writer), optional `blob` (`SNAPSHOT_BLOB_URL`/token; stub allowed). Sinks are independent: a failing sink is logged as `{sink, err}` and the others still write; the process never exits on a sink failure.
- Redis sink keys (one `MULTI` per tip): `zecreveal:snapshot:latest` (JSON, no TTL), `zecreveal:snapshot:<height>` (JSON, TTL 86,400 s), `zecreveal:snapshot:height` (integer string). Budget: 3 commands per block, ~1,150 blocks/day → ≈ 3.5 k commands/day, far inside any managed tier; **never** write per-mempool-transaction data to the managed store (that stays on the VPS Redis).
- Gateway: `GET /api/snapshot` serves the latest; WS sends a `snapshot` frame on connect.

## §4 DELIVERABLES

1. Three analysis modules + tests; `apps/publisher` (Dockerfile included) with the `file` + `redis` sinks; gateway snapshot route/frame; `.github/workflows/ci.yml` gains a `redis:7` service for the sink test; `docs/2.0/SNAPSHOT.md` (schema, cadence, sinks, the two-Redis topology, how the operator connects the Marketplace store to the `zecreveal` Vercel project and where `SNAPSHOT_REDIS_URL` goes — the VPS `.env`, never git).

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** Residual: with fixture balances sprout 22,621, orchard 708,841, supply 16,889,987 → `U = 731,462`, `V = 0.95669 ± 1e-5` (unit test).
- **A2.** Drain: `Bal_orchard` 3,660,000 at NU6.3 and 708,841 now → `D = 0.8063 ± 1e-4`; velocity over a 24 h fixture window equals (Δbalance / 24) within 1e-6.
- **A3.** Migration lens: a fixture of 847 crossings yields a histogram whose bucket counts sum to 847 and whose amounts are all canonical *(fail side: inject a 499.5 ZEC crossing → flagged non-canonical and counted separately)*.
- **A4.** Ironwood birth: a fixture of spends with N_eff values {5, 50, 500, 5000} produces shares 25/25/25/25 across the four claim levels.
- **A5.** `snapshot.json` produced by a dev run validates against `SnapshotV1` (Executed: the validation output pasted in §7).
- **A6.** Publisher writes exactly once per new tip (fake tip stream of 5 heights with one duplicate → 5 writes; unit test).
- **A7.** Redis sink against the CI `redis:7` service: after one publish, `GET zecreveal:snapshot:latest` parses and validates as `SnapshotV1`, `GET zecreveal:snapshot:height` equals the tip, and `TTL zecreveal:snapshot:<height>` is in (0, 86400] (integration test) *(fail side: point `SNAPSHOT_REDIS_URL` at a closed port → the file sink still writes, the process stays up, and the log line carries `sink=redis`)*.
- **A8.** `grep -rn 'rediss\?://[^$"]' apps/publisher docker-compose*.yml .env.example` matches only the `.env.example` placeholder — no real Redis URL or password is committed.
- **A9.** `GET /api/snapshot` returns the latest file with `Cache-Control: max-age=60`; the WS `snapshot` frame is the first frame a new client receives (test).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `chain-integrator` (Sonnet) for the accounting math; `backend-api` (Haiku) builds the publisher from a written contract after PREFLIGHT; `test-engineer` (Haiku) for §5.
- director-quality: `devops-deployer` verifies the publisher container builds and the CI redis service; `security-auditor` confirms `SNAPSHOT_REDIS_URL` (it carries a password) only ever comes from env and that the managed store receives snapshot keys only.

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
