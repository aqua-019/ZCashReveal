---
handoff: 05
title: Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)
status: in-progress
branch: the session-designated branch (name it `feat/v2-05-gateway-api` if you may choose)
track: Data
depends_on: 00 (uses the DTOs from 04 if merged; otherwise defines them)
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-05 — Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Extend the existing Fastify gateway with the read API the Tracking UI needs, backed by Zebra 6.x address-index RPCs cached in Postgres for the transparent side and by the indexer tables for shielded metadata; add rate limiting and a WebSocket connection cap; move the Zebra RPC client into a shared package.

**Out of scope:** No historical full-chain index (deferred; see plan §9). No changes to the indexer's analysis.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `apps/gateway/src/index.ts`, `ws-broker.ts`, `config.ts`, `src/__tests__/ws-broker.test.ts`
- `apps/indexer/src/zebrad-rpc.ts` (to be moved), `apps/indexer/migrations/*.sql`
- Zebra 6.x RPC documentation for `getaddressbalance`, `getaddresstxids`, `getaddressutxos`, `getrawtransaction` (verbosity 1), `getblock` (verbosity 2), `getblockchaininfo` — cite the doc/source version read
- `packages/zec-types` DTOs (from HANDOFF-04) or the contract below

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Endpoints: `GET /api/search?q=`, `GET /api/address/:addr`, `GET /api/tx/:txid`, `GET /api/block/:height`, `GET /api/pools`, `GET /api/labels`, `GET /api/cases`, `GET /api/snapshot` (stub until HANDOFF-09). All responses validated against the Zod DTOs before sending.
- `packages/zebra-rpc`: typed client with retries/timeouts; JSON shapes validated with Zod; no `any`.
- Cache tables via migration `003a_gateway_cache.sql` in `apps/indexer/migrations`: `tx_cache(txid, height, json, refreshed_at)`, `address_cache(addr, balance_zat, received_zat, spent_zat, utxo_count, first_seen, last_seen, refreshed_at)`; cache-aside with TTL (config).
- Hardening: `@fastify/rate-limit` per IP (config), WsBroker connection cap (default 500) closing with code 1013, request-id logging, CORS from config. Existing 7 WS tests stay green.
- Redis topology (two instances, never confused): the gateway keeps the **VPS-local** Redis (`REDIS_URL`) for pub/sub and `zcashreveal:mempool:live`; the rate limiter uses the in-memory store unless `RATE_LIMIT_REDIS_URL` is set (then an `ioredis` store on that URL). The **Vercel-managed** Redis (`SNAPSHOT_REDIS_*`, HANDOFF-09/11) is never on the gateway hot path — no per-transaction traffic leaves the VPS.

## §4 DELIVERABLES

1. `packages/zebra-rpc` + removal of the duplicate client from the indexer (indexer imports the package).
2. Route modules under `apps/gateway/src/routes/` with Zod validation; labels/cases served from `packages/content`.
3. Migration `003a`; cache module with TTL; unit tests with a mocked RPC; one Postgres-gated integration test.
4. `docs/2.0/API.md` documenting every endpoint with example responses.
5. Fix the stale reference at `apps/gateway/src/ws-broker.ts:8` — it still points at `apps/dashboard/src/lib/ws.ts`, which moved to `legacy/dashboard/` in HANDOFF-00 (LEDGER-00 NOTICED; A8 there forbade touching it).
6. **(LEDGER-04 fold 5, Q4)** Make `Unverified.surface` nullable in `packages/content` and have `permalink()` return `null` rather than a dead anchor when it is absent; callers render plain text where they would have rendered a link. 24 of the 32 quarantined records render on no page, so a required `surface` had three quarters of the corpus asserting a surface it does not appear on. Record in §8 that a page for those 24 is owed to a later Web handoff.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/gateway test` exits 0 (≥ 7 + new tests); `pnpm --filter @zcashreveal/zebra-rpc test` exits 0.
- **A2.** `GET /api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` against a mocked RPC returning the known values responds with `balanceZat: "7818340930000"` and `label.labeller === 'consensus'` (route test). If a synced Zebra 6.x is reachable, the same request against it is Executed and the output pasted in §7; otherwise the live check is labelled UNVERIFIED.
- **A3.** Every route rejects a malformed input with 400 and a Zod issue list (tests for a 62-hex txid, a `t2` address on mainnet, a negative height).
- **A4.** Rate limiting: 120 requests in 10 s from one IP yield ≥ 1 response with status 429 (test with the plugin's test hooks); with `RATE_LIMIT_REDIS_URL` unset the gateway opens exactly two Redis connections — subscriber and reader — and no third (test spies the `ioredis` constructor) *(fail side: set `RATE_LIMIT_REDIS_URL` → a third connection is opened)*.
- **A5.** WS cap: with the cap set to 2, the third connection is closed with code 1013 (test).
- **A6.** Cache: a second `GET /api/address/...` within the TTL performs 0 RPC calls (mock call counter) *(fail side: set TTL to 0 → RPC called again)*.
- **A7.** No response leaks RPC credentials or internal hostnames (test greps serialised responses for `ZEBRAD_` values).
- **A8.** `grep -rn "from '../../indexer" apps/gateway` is empty — the gateway depends on packages, never on indexer sources.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- Two-hop: `chain-integrator` (Sonnet) writes the route contract + RPC client design; `backend-api` (Haiku) executes against the written contract after a PREFLIGHT (RPC/auth trigger). Loop 3 spec-author review applies.
- director-quality: `security-auditor` reviews rate limit, CORS, secret handling; `devops-deployer` runs the test matrix in CI.

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
