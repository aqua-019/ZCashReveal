# ZECReveal 2.0 — Production Plan

**Prepared:** Saturday, 22 August 2026 · **For:** Aqua (`aqua-019`) · **Repo:** `github.com/aqua-019/ZCashReveal` (public) · **Vercel team:** `aquatic-17b9f112`
**Companion docs:** `RESEARCH-2026-08-DOSSIER.md` (sourced content for Beware / Timeline / Network), `HANDOFF-2026-08-22-v2.md` (corrected state), `research/01–03*.md` (raw dossiers), `mockups/zecreveal-2.0-mockups.html`.

> **Thesis, unchanged and sharpened:** *Shielded ≠ Silent.* The zk-SNARK hides note values and endpoints; the chain still publishes nullifiers, anchors, commitments, every boundary amount — and, since NU6.3, every Orchard→Ironwood migration amount. Twice in ten years (Sprout 2016–18, Orchard 2022–26) the pools ran on an unsound circuit, and neither window can ever be cryptographically cleared. ZECReveal 2.0 is the public instrument that makes the boundary legible and the public record that keeps the receipts. **Report uncertainty, not identity.**

---

## 0. Verified state of the world (22 Aug 2026)

| Item | HANDOFF said | Verified today |
|---|---|---|
| PR #30 / module 7Y | "OPEN — verify" | **Merged** (`cf5c775`, 5 Jun 2026). `main` = 7Y. No open PRs; 22 stale `claude/*` branches + 2 `feat/*` branches remain on origin. |
| Module 7X (Redis) | "not started" | **Code is done**: `redis` service is in `docker-compose.yml`, `REDIS_URL` wired in indexer+gateway. What remains is *operational* (run it, point `.env` at it). |
| Tests | 171 indexer + 7 gateway | **Reproduced today**: indexer 133 pass / 38 skip (Postgres-gated) of 171; gateway 7/7; dashboard builds clean in mock mode. |
| Vercel `VITE_MOCK_MODE` | "deleted — re-add before next deploy" | **Already shipped broken.** The production bundle (`/assets/index-B7wcWexO.js`) has the mock flag compiled to `false` and `ws://localhost:8080/stream` as the WS URL → visitors see the empty "offline / waiting for transactions" state. Fix: Vercel → Settings → Environment Variables → `VITE_MOCK_MODE=true` (Production, Preview, Development) → Redeploy. |
| Orphan project `z-cash-reveal-dashboard` | "delete it" | Still exists; **every deployment is ERROR**, still linked to the repo. Disconnect Git or delete. |
| Node | Zebra 4.4.1 forked at 3,364,604 | Unchanged (not reachable from here). The chain is now past **NU6.2 (3,364,600)** and **NU6.3 Ironwood (3,428,143)**; tip ≈ **3,456,854** today. **zcashd is EOL** (auto-halted at 3,417,100 on 18 Jul 2026) — Zebra is the only node. |
| Pools the code knows | Sapling, Orchard | Chain now has **Sprout (~22.6k ZEC, never resolved) · Sapling (~529k) · Orchard (~709k, exit-only) · Ironwood (~3.13M, new)** + transparent (~12.5M, 74%). |

The research dossiers corrected several premises in the brief (no Korean-exchange dominance; no 21Shares ZEC ETP; ticker is ZCSH not ZCH; Shielded Labs was founded by Jason McGee, not Jack Gavigan; Cypherpunk's CEO is Douglas Onsi, CIO Will McEvoy; no evidence of ECC layoffs in 2023–24; the "bot network" claim is unverified). The site must not publish those.

---

## 1. What 2.0 is

Two halves, one identity:

**A. The Record** — static, citable, zero-motion (DGIGA TP05 *Research Register*, DY10 *Credible institution*).
- **Beware** — the exploit ledger (18 entries; the five that matter in depth), each with discovered / disclosed / fixed / discoverer / root cause / *detectable?* / window / sources / confidence.
- **Contradictions** — 16 marketing claims vs. on-chain reality, evidence-linked.
- **Timeline** — launch → funding → governance → leadership → exploits → market, 2013 → today, filterable by category.
- **The Network** — who promotes, who holds, who pays whom: Cypherpunk (CYPH) purchase ledger, the Winklevoss loop, Grayscale/DCG, ZODL's cap table, ZCG's promotional grant book, the phrase catalogue ("encrypted Bitcoin is the winning meme" — Zooko, 26 Jan 2026), with the *fairness panel* (what cuts the other way).
- **Sources** — every claim carries a source URL + confidence + last-verified date; claim IDs are permalinks (`/beware#B5`, `/timeline#T2026-06-04`).

**B. The Instrument** — live, deterministic, chain-seeded (DGIGA TP03 *Generative Crypto Surface* + GC01/GC03).
- **Turnstile Ledger** — per-pool balances (Sprout/Sapling/Orchard/Ironwood/transparent), in/out flows, the **Unprovable Residual** (Orchard + Sprout balances that can never be cryptographically cleared), Orchard drain progress, Ironwood verified share.
- **Ironwood Birth** — the new pool's commitment tree grows from zero, so early anchors bound tiny candidate sets; live `N_eff` distribution for Ironwood spends (the honest, timely signal: *a pool is born naked*).
- **Migration Lens** — ZIP 318 makes every Orchard→Ironwood crossing amount public in `n×10^k` denominations: bucket histogram, velocity (ZEC/h), stranded dust (< 0.01 ZEC rule).
- **Live Mempool** (the v0.2 dashboard, extended to four pools + v6 transactions) — findings, candidate sets, inference chain, round-trip links across all pool paths.
- **Stale-but-honest contract** — the public page never depends on a live socket to be non-empty: a snapshot publisher writes the last-known-good state; the page shows block-height age (D3626 epoch clock) rather than a blank.

---

## 2. Salvage inventory (what carries over from v0.2)

Verdicts: **KEEP** (port as-is, already tested), **EXTEND** (keep + grow for Ironwood/v6), **REBUILD** (redo for 2.0), **RETIRE**.

| Area | Files | Verdict | Why |
|---|---|---|---|
| Formal model | `RESEARCH.md` (state tuple `S^p_h = (T, Roots, NFSet, Bal)`, `Cand_0(nf)`, filter stack, `H`, `N_eff = 2^H`, claim levels, turnstile flows, Orchard arity) | **KEEP → extend** | It is the spine. Add §Ironwood, §Turnstile accounting, §Migration lens (below). |
| Entropy | `analysis/entropy.ts` (`entropyBitsUniform`, `effectiveSetSize`) | **KEEP** | Pure, tested, precision notes are correct. |
| Claim levels | `analysis/claim-classifier.ts` (10 / 100 / 1000 thresholds, lower-inclusive) | **KEEP** | Coarse on purpose; do not retune without calibration data. |
| Raw candidate set | `analysis/candidate-set.ts` (`rawCandidateRange` from anchor `maxPosition`) | **KEEP** | The only universally-correct filter. |
| Filter stack | `analysis/scoring.ts` (`applyFilters` with audit trail, `timeWindowFilter` anchored at `heightCreated`, `amountMatchFilter` two-sided interval intersection) | **KEEP** | Audit trail design is exactly what the Instrument's "inference chain" UI renders. |
| Assessment | `analysis/assessment.ts` (`assessRaw`, `assessFiltered`, 0-count short-circuit) | **KEEP** | |
| Round-trip | `analysis/round-trip.ts` (Kappos matcher, EXACT > FEE_TOLERANT, HIGH/MEDIUM/LOW ladder, injectable clock) | **EXTEND** | Generalise `pool` to the 4-pool union; add the `orchard→ironwood` path as a first-class, *public-by-construction* migration record. |
| Constants | `analysis/constants.ts` (`FEE_TOLERANCE_ZAT = 5,000 × 4 × 8 = 160,000`, 7-day window) | **KEEP** | Document derivation on the site ("Assumptions" panel). |
| State machine | `state/{commitment,anchor,nullifier}-index.ts`, `value-pool.ts`, `pool-state.ts`, `errors.ts` (`<P extends Pool>` generics, `bigint` values) | **EXTEND** | Widen `Pool` to `"sprout" \| "sapling" \| "orchard" \| "ironwood"`; add the post-NU6.3 invariant `valueBalanceOrchard ≥ 0` (exit-only) as a hard check like the non-negative balance rule. |
| Persistence | `persistence/*`, `migrations/001,002.sql`, `replay.ts` (replay/rollback) | **KEEP → extend** | Add `pool` CHECK for the new enum; add tables `migrations_zip318`, `pool_snapshots`. |
| Decoder | `decoder/block-decoder.ts`, `sapling.ts`, `orchard.ts`, `anchor-depth.ts`, `fingerprint.ts`, `leak-analyzer.ts`, `activation-heights.ts` | **EXTEND** | v6 transaction format (ZIP 229) + Ironwood bundle; activation heights for NU6 2,726,400 · NU6.1 3,146,400 · soft-fork 3,363,426 · NU6.2 3,364,600 · NU6.3 3,428,143; wallet fingerprints for Zodl/Vizor/Zkool/Zingo/Cake; `LeakClass` gains `MIGRATION_O2I`, `IRONWOOD_*`. |
| Types | `packages/zec-types/*` (branded `Hex`, `Zatoshi`, leak taxonomy, `ClaimAssessment`, `FilterApplication` union) | **EXTEND** | Same widening. |
| Gateway | `apps/gateway` (Fastify + ws, `{channel,payload}` envelope, `snapshotFrame`) | **EXTEND** | Add `@fastify/rate-limit`, WsBroker connection cap, and a **snapshot publisher** (below). |
| Dashboard | `apps/dashboard` (Vite SPA, Tailwind v4 tokens, 14 components, mock fixtures) | **REBUILD** (harvest) | Keep the panel logic (`CandidatesPanel` inference chain, `BoundaryFlowPanel`, `PoolStatePanel`, `parsers.ts`, `formatters.ts`, `tokens.ts`, icons) as React islands inside the new app; the SPA shell, routing and the empty-state behaviour go. |
| Infra | `docker-compose.yml`, `infra/zebrad/zebrad.toml` (4.4.1, cookie-auth off, loopback RPC) | **REBUILD** | Zebra 6.2.x; wipe forked state; re-validate `enable_cookie_auth` semantics on the new major; keep loopback bind. |
| Prototype | Project docs `*.jsx` / `*.html` (Splash, Mempool, Tracker, Pool) | **RETIRE as code, KEEP as reference** | Their grammar (numbered `00 · SYSTEM` blocks, mono eyebrows, italic serif display, footer ledger, pool-flow colour semantics) is carried into 2.0's design system. |
| Python scratchpad | `tools/zc-analyzer/` (not present in `main`) | **RETIRE** | Nothing to salvage on `main`. |

**Test baseline to preserve:** 171 indexer (133 live) + 7 gateway. 2.0 adds dashboard tests (vitest + testing-library + jsdom) and content-schema tests.

---

## 3. New mathematics for 2.0 (additions to RESEARCH.md)

All of it stays inside the mantra — these are bounds and public aggregates, never identities.

**3.1 Turnstile accounting, four pools.** For pool `p ∈ {sprout, sapling, orchard, ironwood}`, `Bal^p_h` is already defined as the running sum of public boundary deltas. Add the post-NU6.3 consensus invariants as first-class state checks: `Bal^p_h ≥ 0` (ZIP 209, all pools incl. Ironwood) and, for every tx after 3,428,143, `valueBalanceOrchard ≥ 0` (ZIP 2006 — Orchard is exit-only). A violation in our replay means *our* decoder is wrong (throw), never "the chain is wrong".

**3.2 The Unprovable Residual.** Define `U_h = Bal^sprout_h + Bal^orchard_h` — value still inside pools whose circuits were unsound during their lifetime and which can only be cleared by emptying. Publish `U_h`, `U_h / Supply_h`, and the **verified share** `V_h = 1 − U_h / Supply_h`. Today: `U ≈ 22.6k + 708.8k ≈ 731k ZEC ≈ 4.3%` of supply (CipherScan, 22 Aug). This is the site's headline instrument number and it is strictly a public aggregate.

**3.3 Orchard drain.** `D_h = 1 − Bal^orchard_h / Bal^orchard_{3,428,143}`. Velocity `dD/dt` from block timestamps (ZEC/hour, 24h and 7d windows). Expected completion is *undefined* (no deadline; dust < 0.01 ZEC is stranded by ZIP 318's `MAX_RESIDUAL_VALUE`) — show the asymptote, do not forecast a date.

**3.4 Migration lens (ZIP 318).** Each migration tx spends exactly one Orchard note → one Ironwood output, with the net amount public and quantised to `n × 10^k, n ∈ {1,2,5}`, `DENOM_CAP = 10,000 ZEC`. Per block: count, sum, denomination histogram `M_h[d]`. Derived, with stated assumptions: the *minimum* number of notes `≥ ⌈amount / DENOM_CAP⌉`; an *upper bound* on distinct migrating wallets per window `≤ Σ counts` (no lower bound is claimable). Bucketing + scheduling are heuristic privacy defences, so the lens reports **distributions only**, never wallet attributions.

**3.5 Ironwood birth (small-tree anonymity sets).** Because `|T^ironwood_h|` started at 0 on 28 Jul 2026, `Cand_0(nf) = {cm : pos(cm) ≤ maxPos(A)}` for early anchors is small by construction. Track the time series of `N_eff` for Ironwood spends and the fraction below each claim threshold; expect the `requires_disclosure`/`small_heuristic_set` share to decay as the tree grows. This is new, timely, and entirely public.

**3.6 Posterior weighting (2.1, optional).** v0.2 treats the filtered set as uniform. A later module can weight candidates by note age under an explicit, logged prior (e.g. exponential with half-life `τ`), computing `H = −Σ p log₂ p` directly (the entropy primitive already accepts the general case in spirit; the code path is a small extension). Gate behind a visible "assumption chip" in the UI.

---

## 4. Architecture 2.0

```
Zebra 6.2.x (VPS) ── RPC/ZMQ ──▶ indexer (decode v4/v5/v6 · 4-pool state · analysis)
                                   │            │
                                   ▼            ▼
                              Postgres        Redis pub/sub ──▶ gateway (Fastify WS, rate-limited, capped)
                                   │                                   │
                                   └──▶ snapshot publisher ──▶ snapshot.json (Vercel Blob/KV or R2)
                                                                      │
                      Vercel ◀─── Next.js app ───────────────────────┘
                      ├─ /            Splash (The Record + Instrument summary, chain-seeded ambience)
                      ├─ /beware      Exploit ledger            ┐
                      ├─ /contradictions                        │ static, RSC, content collections
                      ├─ /timeline                               │ (zod-validated JSON), ISR for
                      ├─ /network     Promotion lattice / holders│ snapshot-backed numbers
                      ├─ /sources                                ┘
                      └─ /instrument  Live client islands (WS) over the snapshot baseline
```

Decisions:
1. **Next.js (App Router) on Vercel** replaces the Vite SPA for the public site. Reason: The Record must be crawlable, citable and fast; RSC renders it static; client islands host the live panels. (Astro + React islands is the acceptable alternative if Aqua prefers; the content model is identical.)
2. **Snapshot baseline** (new): the gateway (or a small `apps/publisher`) writes `snapshot.json` every block (`{height, time, pools, residual, drain, migrationHist, lastReports[]}`) to object storage. The site renders from it at build/ISR time; the WS layer upgrades it live. Empty dashboards become structurally impossible.
3. **Node on a VPS, not the Windows desktop.** A 24/7 forensic feed cannot live on a machine that sleeps and clock-drifts (WSL2). Target: Hetzner/OVH-class box, ≥4 vCPU, 16 GB RAM, **≥500 GB NVMe** (the chain tripled during sandblasting), Debian 12, Docker Compose, Cloudflare Tunnel for the WS. The desktop stays the dev box. Budget ≈ $30–60/month.
4. **Content as data.** `content/beware.json`, `timeline.json`, `contradictions.json`, `network.json`, `phrases.json`, `sources.json` — each entry `{id, date, title, claim, evidence:[{url,title,date}], confidence:'high'|'med'|'low', lastVerified}`; a build step fails on missing sources or confidence. The three research dossiers are the seed.
5. **Design system** from DGIGA, applied totally (see §6).

---

## 5. Phased delivery

**Phase 0 — Make production safe (today).**
- Vercel: add `VITE_MOCK_MODE=true` (3 scopes) → redeploy; disconnect/delete the orphan project.
- Commit `research/`, `RESEARCH-2026-08-DOSSIER.md`, this plan, the v2 handoff, and the mockups to the repo under `docs/2.0/`.
- Prune the 22 stale `claude/*` branches (`git push origin --delete …`) to keep the repo legible.

**Phase 1 — The Record ships (weeks 1–2).** No node required.
- Scaffold `apps/web` (Next.js 15+, React 19, Tailwind v4, the token system ported from `apps/dashboard/src/lib/tokens.ts`).
- Content collections + zod schemas; seed from the dossiers (Beware 18 entries, Contradictions 16, Timeline ~110 rows, Network tables, Phrase catalogue ~20).
- Pages: Splash, Beware, Contradictions, Timeline, Network, Sources; claim-ID permalinks; OG images; RSS for ledger changes.
- Vercel: new project `zecreveal-web` (or repoint `z-cash-reveal-dashboard2`), Framework = Next.js, Root = `apps/web`. Keep the mock Instrument reachable at `/instrument` (islands fed by `MOCK_REPORTS` until Phase 3).
- Definition of done: Lighthouse ≥ 95 perf/a11y/SEO on `/beware`; every claim resolves to a source; reduced-motion honoured by architecture (LAW-12).

**Phase 2 — Node modernization + Ironwood awareness (weeks 2–4).** Can run in parallel with Phase 1.
- Provision the VPS; `docker-compose.yml` → `zfnd/zebra:6.2.x` (pin exact tag), fresh `zebrad-data`, RPC loopback-bound, re-validate cookie-auth flags on the 6.x major (the 7Y posture may need re-expressing); budget a from-genesis sync (Zebra's checkpoints make it hours-to-a-day on NVMe; verify).
- Module **7A.2 — v6/Ironwood decoder**: parse ZIP 229 v6 transactions (new bundle fields; canonical `proofsOrchard` length rule `2720 + 2272·n` post-NU6.2), emit Ironwood actions into the 4-pool state; `activation-heights.ts` gains NU6 → NU6.3 + the soft-fork height; `Pool` union widened; per-pool `CHECK` constraint migrated.
- Fixture capture (7A.1) against the NU6.3 node: one pre-NU6.3 block, one post-NU6.3 block with a migration, one with Ironwood spends → un-skips the guarded decoder test.
- Definition of done: `getblockchaininfo` advancing past 3,456,854; decoder round-trips real v6 blocks; replay from NU6.3 height reconstructs `Bal^ironwood` to the explorer's figure within rounding.

**Phase 3 — The Instrument 2.0 goes live (weeks 4–6).**
- 7X runtime (Redis/Postgres), 7B (runtime `PoolState` replay → `onConfirmedBlock`), 7C (assessment wire-up: `chainState` in `AnalyzeContext`, per-spend `assessRaw`, per-link `assessFiltered` with `timeWindow` + `amountMatch`).
- New analysis modules: `turnstile-accounting.ts` (§3.1–3.3), `migration-lens.ts` (§3.4), `ironwood-birth.ts` (§3.5); tests for each (target ≥ 220 indexer tests).
- Snapshot publisher; gateway hardening (`@fastify/rate-limit`, connection cap, Cloudflare Tunnel + WAF rule); supervisor (`docker compose` with `restart: unless-stopped` for everything, healthchecks, uptime ping).
- Vercel flip: `NEXT_PUBLIC_WS_URL=wss://<tunnel>/stream`; islands hydrate from snapshot, then upgrade.
- Definition of done: real mempool + real migration events rendering publicly; staleness indicator proven by killing the gateway (page stays populated, shows "snapshot age: N blocks").

**Phase 4 — Polish and permanence (weeks 6–8).**
- Dashboard tests; content-verification cron (re-fetch sources monthly, flag 404s, bump `lastVerified`); `DEPLOY.md` rewrite; monitoring + alerting (snapshot age > 20 blocks → alert).
- Editorial: "What changed" changelog on the ledger; `/cite` pages; a one-page printable Beware PDF.
- Positioning: publish the Unprovable Residual + Migration Lens as the first public Ironwood-native forensic instruments.

---

## 6. Design system (from DGIGA D500, applied totally)

- **Palette — "ZEC Forensic"** (authored in OKLCH, shipped as hex): `BG #121110` · `SURFACE #1A1816` · `PRIMARY/ACCENT #F4B728` (ZEC gold, **the accent is a budget** — primary action, active state, and exactly one semantic meaning: *value crossing a boundary*) · `TEXT #EDE6D8`. Pool hues: transparent `#8FB3C9`, Sprout `#6FB58C`, Sapling `#E0B15A`, Orchard `#D77BAA`, Ironwood `#9B8CFF`. Functional blue `#4C8DFF` *outside* the palette for focus/links (PALRULE-03). Danger register `#E4553F` for *Beware* severity only.
- **One hover verb:** **dim** (OpenAI grammar) — and per GPAIR-17 it carries semantics: *what recedes is what the proof hides; what lifts from the fog is what the chain publishes.* No transforms, no lifts, colour-only transitions (GX01).
- **One motion curve:** `cubic-bezier(0.32, 0.72, 0, 1)` (Vaul lineage), durations 180/320/500 ms; scroll arms, clocks play (LAW-04); reduced-motion refuses to construct the animation system (LAW-12).
- **Ceremony budget:** exactly one — **block arrival** (D3628): epoch clock increments, a slow luminance tide. Migration events settle via confirmation-depth choreography (D3627); nothing else animates.
- **Determinism:** all ambience is seeded from the tip block hash (FNV-1a → mulberry32; D3649). Same block, same fog, for every visitor. `Math.random` is banned.
- **Type:** Instrument Serif (display, italic for the wordmark), JetBrains Mono (all chain data, tabular lining numerals), Manrope (prose). Fluid headings, fixed body (LAW-07). Confirmed data in the *engraved* register (letterspaced tabular), pending data in the *provisional* register (D3646).
- **Surfaces:** glass dark with grain overlay kept; the Record pages are **zero-motion** (D3405) with a footnote apparatus (D3123) and measure lock (GX04).
- **Icons:** SVG only. **No emoji anywhere.**

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Resync time/disk on the node | NVMe ≥ 500 GB; Zebra checkpoints; start the sync on day 1 of Phase 2 while 7A.2 is written against fixtures. |
| v6 format drift (ZIP 229 is still *Draft*) | Pin the Zebra version; decode defensively (unknown bundle → structured `UNSUPPORTED_TX` report, never a crash); fixture tests per version. |
| Zebra monoculture + 41 advisories in 5 months | Track GHSAs; compose `restart` + `image` pinning; keep one block of headroom in replay (rollback on reorg already exists). |
| Legal exposure of The Record | Every entry sourced with confidence; "fairness panel" on Network; no identity claims; allegations labelled; the Unverified list stays unpublished. |
| "Empty dashboard" regression | Snapshot baseline + CI check that the production bundle contains `MOCK`/snapshot fallback; a smoke test hitting the live URL after every deploy. |
| Scope creep | Phase gates with definitions of done; 2.1 parking lot (§3.6, Tachyon coverage, Sapling→Ironwood paths, wallet fingerprints). |

---

## 8. Immediate next actions for Aqua

1. Vercel → `z-cash-reveal-dashboard2` → Environment Variables → `VITE_MOCK_MODE=true` (all scopes) → Redeploy. Then disconnect/delete `z-cash-reveal-dashboard`.
2. Review the mockups (`mockups/zecreveal-2.0-mockups.html`) and pick: Next.js vs Astro; VPS vs desktop-host.
3. Green-light Phase 1 — I can scaffold `apps/web` and port the content collections on the next session (halt-before-merge discipline kept).


---

## 9. Addendum (22 Aug 2026, later session) — the ZEC Tracking suite replaces "The Instrument"

The live half of 2.0 is now an **explorer**, not a dashboard. Spec: `TRACKING-MATH.md`. Mockup: `mockups/zecreveal-2.0-mockups-v2.html` (artifact `581a6b81…`).

**Surfaces** — `/track` (search + high-fidelity mempool) · `/address/:addr` (exact transparent balance/history/counterparties, boundary events with pool-side estimates, balance step chart, interaction graph, reasoning panel) · `/tx/:txid` (public fields, inference chain → `N_eff` → claim level, round-trip links) · `/pools` (inter-pool flow Sankey, balances, history, drain, migration lens, Ironwood birth) · `/flows` (exchange inflows + the insider question, reproducible case files, labelled-address registry with provenance, rich list) · `/reveal` (viewing-key mode, client-side decryption).

**What the explorer promises** — transparent: exact; shielded: bounded (or exact with the user's own viewing key, decrypted in-browser, never uploaded); labels ranked consensus › owner filing › exchange confirmation › analyst › behaviour; no identity claims, ever.

**Architecture additions**
- `apps/gateway` gains a **REST read API** (`/api/address/:a`, `/api/tx/:id`, `/api/block/:h`, `/api/pools`, `/api/flows`) over Postgres; WS stays for the mempool.
- `apps/indexer` gains a **historical sync** (genesis → tip: transparent inputs/outputs + address index, shielded metadata per tx, per-block pool deltas) — or, to ship faster, the transparent side reads Zebra's address-index RPCs (`getaddressbalance`, `getaddresstxids`, `getaddressutxos`, `getrawtransaction` verbosity 1) with a Postgres cache, while our indexer owns shielded metadata + analysis. Decide in Phase 2 after measuring Zebra's RPC latency on the VPS.
- New analysis modules: `clustering.ts` (CIO, change detection, exchange shapes), `echo.ts` (exact / fee-tolerant / **relative ε** / **subset-sum k≤3** matching — calibrated on the 2 Jan 2026 case), `labels.ts` (consensus-defined addresses: ZIP 271 multisig, ZIP 1014/1015/1016 streams, Founders' Reward set, TEX detection), `posterior.ts` (weights → `H` → `N_eff` → claim), `taint.ts` (≤3-hop flow estimate with unresolved-mass residual), plus `turnstile-accounting.ts`, `migration-lens.ts`, `ironwood-birth.ts` from §3.
- `packages/content` gets `labels.json` (address → label, labeller, method, confidence, lastVerified) and `cases.json` (the reproducible case files: 2 Jan 2026, lockbox, 202k unshield).
- `packages/wasm-keys` (Phase 4): `zcash_keys` + `zcash_note_encryption` compiled to WASM for Mode A; until then `/reveal` ships as the ceremony UI with a "coming in 2.1" gate.

**Calibration findings already in hand** — the v0.2 absolute fee tolerance (0.0016 ZEC) would have missed the real 50,000.960 → 50,000.5541 round-trip (Δ 0.4059, 8.1×10⁻⁶ relative, 52 min); the relative rule catches it. The lockbox's 7,875 → 7,438.2295 (Δ 5.5%, 20 min, same address) must grade LOW — a test for the grader's restraint.

**Research to carry into `/flows`** — `research/04-exchange-inflows-insider-selling.md`: Grayscale custodies at Coinbase Custody (388,673.68 ZEC, 30 Jun); Cypherpunk custodies at **Gemini** (own 10-Q), not Coinbase Prime; the ZIP 271 lockbox is 99.28% untouched and spends shielded by mandate; the "74,002 ZEC to Binance" event is two-thirds a round trip and the 202,076.207 ZEC tranche has never moved; no Arkham/Whale Alert coverage of ZEC exists; Silbert's Form 144s are OTCQX shares, not ZEC. **No evidence of insider selling on-chain was found**; the site publishes the case files and the "not supported" box side by side.

## 10. Repository verdict — keep it, restructure it, add `apps/web`

**Keep** (the moat): `apps/indexer` (analysis, state machine, persistence, decoder, 171 tests), `apps/gateway`, `packages/zec-types`, `RESEARCH.md`, git history, AGPL licence, the public GitHub ↔ Vercel link.
**Retire** after harvesting: `apps/dashboard` → `legacy/dashboard` for one release (harvest `tokens.ts`, `formatters.ts`, `parsers.ts`, `icons.tsx`, the panel logic into `apps/web` islands), then delete. Root `vercel.json` goes with it (the new Vercel project points at `apps/web`).
**Delete now**: 20 stale `claude/*` branches (19 merged, 1 not) + the 2 merged `feat/*` branches; the orphan Vercel project. Corrected from 22 by HANDOFF-01: `docs/2.0/BRANCH-CLEANUP.md` is generated from live git and is authoritative (LEDGER-00 Q3).
**Add**: `apps/web` (Next.js App Router, React 19, Tailwind v4), `apps/publisher` (snapshot), `packages/content`, `docs/2.0/` (this plan, the dossier, `TRACKING-MATH.md`, handoff), an updated `CLAUDE.md` (2.0 conventions: content schema, label provenance, halt-before-merge, SVG-only), a rewritten `README.md`.
**New Vercel project**: yes — `zecreveal` with Root Directory `apps/web`, Framework Next.js, env `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`; keep `z-cash-reveal-dashboard2` in mock mode until cutover, then delete.
**Do not** start a fresh repository: the tests and module history are exactly what a Claude Code session needs as ground truth, and the repo is already public under the right licence.
