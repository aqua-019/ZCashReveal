# ZECReveal 2.0 — Claude Code prompt pack

**Prepared:** 22 Aug 2026 · **Repo:** `github.com/aqua-019/ZCashReveal` · **Operator:** Aqua · **Discipline:** one prompt = one branch = one PR; Claude Code **halts before merge**, Aqua merges.
**Read first in every session:** `docs/2.0/ZECREVEAL-2.0-PLAN.md`, `docs/2.0/TRACKING-MATH.md`, `docs/2.0/RESEARCH-2026-08-DOSSIER.md`, `CLAUDE.md`, `RESEARCH.md`. The mockups (`docs/2.0/mockups/*.html`) are the visual spec; the artifact links are in the plan.

---

## Audit that shaped these prompts (22 Aug 2026)

| Finding | Consequence for the prompts |
|---|---|
| `main` = `cf5c775` (PR #30). 11.2k lines of TS/SQL. Indexer 171 tests (133 live, 38 Postgres-gated), gateway 7. | Keep the repo; build on it. Prompt 00 is housekeeping, not a rewrite. |
| CI (`.github/workflows/ci.yml`) only builds `types` + `dashboard`; **no tests run in CI**. | Prompt 00 adds `vitest` to CI (indexer + gateway), and Postgres as a service for the integration tests. |
| `lint` scripts call `eslint` but **eslint is not installed** anywhere (0 hits in the lockfile) → `pnpm lint` fails. | Prompt 00 either adds a flat `eslint.config.js` + deps or removes the scripts; it must not leave a broken script. |
| `packageManager: pnpm@9.12.0`, Node ≥ 20; Vercel project runs Node 24. | Pin Node 22 in `.nvmrc` and CI; keep pnpm 9.12.0 until the lockfile is migrated deliberately. |
| DB: `002_candidate_analysis.sql` has `CHECK (pool IN ('sapling','orchard'))` on four tables. No transparent/address tables; `leak_reports` holds mempool reports only. | Prompt 06 writes migration `003` (widen CHECKs, add `pool_snapshots`, `migrations_zip318`); the explorer's transparent side reads Zebra address-index RPCs with a cache (Prompt 05) until a historical index exists. |
| Decoder is v4/v5 (Sapling + Orchard); no `version` branching found in `block-decoder.ts`. | Prompt 07 adds v6/Ironwood decoding defensively (unknown → `UNSUPPORTED_TX`, never a crash). |
| Gateway already has REST (`/healthz`, `/api/mempool`, `/api/reports`, `/api/reports/:txid`) + WS `/stream` with `{channel,payload}` envelopes and `snapshotFrame`. No auth/rate-limit. | Prompt 05 extends this API rather than adding a new service; adds `@fastify/rate-limit` + WS connection cap. |
| `infra/zebrad/zebrad.toml` sets `enable_cookie_auth = false`, RPC loopback-bound; compose pins `zfnd/zebra:4.4.1` (off-consensus since 3 Jun 2026). | Prompt 10 pins `zfnd/zebra:6.2.x`, keeps the loopback posture, re-validates the flag on the new major. |
| Dashboard: Vite SPA, `VITE_MOCK_MODE === "true"`, `VITE_WS_URL`, Tailwind v4 tokens in `src/lib/tokens.ts`, 14 components, `motion` dep. Production bundle currently built in live mode (empty site). | Prompt 01 ports tokens/formatters/parsers/icons into `apps/web`; the SPA moves to `legacy/` in Prompt 00; the **snapshot baseline** (Prompt 09/11) makes an empty page impossible. |
| No `docs/` directory; `RESEARCH.md`, `DEPLOY.md`, `CLAUDE.md` at root; `.vercelignore` excludes indexer/gateway/infra; root `vercel.json` drives the old dashboard build. | Prompt 00 creates `docs/2.0/`, rewrites `CLAUDE.md`, retires root `vercel.json` when the new Vercel project (Root = `apps/web`) exists. |
| 22 stale `claude/*` branches + 2 merged `feat/*` branches on origin. | Prompt 00 lists the delete commands; Aqua runs them (destructive, needs consent). |

---

## How to run the pack

1. Open Claude Code at the repo root on a fresh `main`. Paste **Prompt 00** first. Let it plan (plan mode), review the plan, approve.
2. Each prompt ends with the **STOP** block. Review the PR; merge; `git checkout main && git pull`; delete the branch; paste the next prompt.
3. Prompts 01–04 (web) and 06–09 (indexer) are independent tracks; run them in two parallel Claude Code sessions if you like — they touch different directories.
4. If a prompt's acceptance criteria can't be met, Claude Code must say so and stop, not improvise around it.

**Global rules (repeat to yourself, Claude Code):** TypeScript strict as configured in `tsconfig.base.json`; ESM; `bigint` for zatoshi; lowercase hex without `0x`; SVG icons only, never emoji; ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); `cubic-bezier(.32,.72,0,1)`; reduced-motion honoured by architecture; every Record claim carries `sources[]` + `confidence` + `lastVerified`; no identity claims from chain data; never render a shielded balance without a viewing key; halt before merge.

---

## Prompt 00 — Housekeeping, docs import, CI, CLAUDE.md

```
You are working in the ZCashReveal monorepo (pnpm + Turbo; apps/indexer, apps/gateway, apps/dashboard, packages/zec-types). We are starting the 2.0 build. Read README.md, CLAUDE.md, RESEARCH.md, DEPLOY.md, .github/workflows/ci.yml, package.json, turbo.json, and skim apps/*/package.json before doing anything. Use plan mode first and show me the plan.

Goal: make the repo ready for a multi-session 2.0 build without changing any runtime behaviour.

Tasks
1. Create docs/2.0/ and move the files I have placed in ./_incoming/ (a copy of my `2026-08-22-pickup/` folder) into it: ZECREVEAL-2.0-PLAN.md, TRACKING-MATH.md, RESEARCH-2026-08-DOSSIER.md, HANDOFF-2026-08-22-v2.md, research/01..04*.md, mockups/zecreveal-2.0-mockups.html, mockups/zecreveal-2.0-mockups-v2.html. Move root RESEARCH.md to docs/RESEARCH-v0.2.md and leave a one-line pointer file at the root. Keep DEPLOY.md but add a banner: "v0.2 dashboard deploy — superseded by docs/2.0/DEPLOY-2.0.md when apps/web ships".
2. Rewrite CLAUDE.md for 2.0 using the text in _incoming/CLAUDE.md.draft (if absent, write it from the plan's §6 design system + §10 repository verdict + the global rules: strict TS, ESM, bigint zatoshi, lowercase hex, SVG-only icons, no emoji, gold accent budget, dim hover verb, one curve, reduced-motion by architecture, content schema with sources/confidence/lastVerified, no identity claims, no shielded balance without a key, halt before merge, branch naming feat/v2-<area>-<name>).
3. Fix CI: run `pnpm -r --filter ./apps/indexer --filter ./apps/gateway test` with a Postgres 16 service (DATABASE_URL pointing at it so the 38 integration tests run), plus typecheck for all packages. Pin Node 22 via .nvmrc and actions/setup-node; keep pnpm 9.12.0.
4. Lint: eslint is referenced by scripts but not installed. Add a minimal flat config (typescript-eslint recommended, no style rules that fight Prettier) and the devDependencies at the root, or remove the lint scripts — pick one and make `pnpm lint` succeed. Prefer adding it.
5. Move apps/dashboard to legacy/dashboard (git mv), update pnpm-workspace.yaml to include legacy/* so it still builds, and note in legacy/dashboard/README.md that it is the v0.2 mock dashboard kept for harvesting until apps/web ships. Do NOT delete it.
6. Write docs/2.0/BRANCH-CLEANUP.md listing the exact `git push origin --delete <branch>` commands for the 22 claude/* branches and the two merged feat/* branches (list them with `git branch -r`). Do not run them.
7. Update README.md: thesis unchanged, new structure, pointer to docs/2.0, status line "2.0 in progress".

Constraints: no behavioural changes to indexer/gateway; all existing tests still pass (`pnpm -r test`); `pnpm typecheck` and `pnpm lint` succeed; no emoji anywhere.

Branch: feat/v2-00-housekeeping. Commit in logical chunks. Open a PR with `gh pr create` using a heredoc body summarising the audit findings and what changed.

STOP before merging. Print the PR URL and the list of commands from BRANCH-CLEANUP.md for me to run.
```

---

## Prompt 01 — `apps/web` scaffold + design system

```
Read docs/2.0/ZECREVEAL-2.0-PLAN.md §4 and §6, CLAUDE.md, legacy/dashboard/src/lib/tokens.ts, legacy/dashboard/src/index.css, legacy/dashboard/src/components/icons.tsx, legacy/dashboard/src/lib/formatters.ts, legacy/dashboard/src/lib/parsers.ts, and open docs/2.0/mockups/zecreveal-2.0-mockups-v2.html — extract its :root tokens and the component classes (sysbar, screens, block, block-head, glass, card, chip, conf, pill, metric, kv, ledger/lrow, tbl-wrap, reason, chain, subnav, search, mp, txt). Plan first.

Goal: scaffold apps/web — Next.js 15 (App Router, React 19, TypeScript strict, Tailwind v4) — with the 2.0 design system as a token layer + primitive components, and a working shell (system bar with wordmark, screen nav, block-height epoch clock; footer ledger), deployable to a new Vercel project with Root Directory apps/web.

Tasks
1. `pnpm create next-app` equivalent by hand inside apps/web (no create-next-app interactivity). Add to the workspace; turbo `build`/`dev`/`typecheck`/`lint`.
2. Design tokens: apps/web/src/styles/tokens.css with the exact :root variables from the mockup (bg #121110, surface #1A1816, ink #EDE6D8, gold #F4B728, blue-fn #4C8DFF, danger #E4553F, pool hues transparent #3A8BD9 / sprout #1F9E62 / sapling #D9641E / orchard #C94F8F / ironwood #8B7FE6, fonts, ease cubic-bezier(.32,.72,0,1), durations 180/320/500ms). Expose them to Tailwind v4 via @theme. Google Fonts via next/font (Instrument Serif, Fraunces, JetBrains Mono, Manrope) with real fallbacks.
3. Primitives in apps/web/src/components/ui/: SysBar, ScreenNav, EpochClock, Block (idx/title/right), Glass, Metric, Chip (variants gold/danger/ok/blue), Conf (high/med/low), Pill (exact/bounded/label/undefined), KV, Eyebrow, Quote, Ledger row, DataTable (overflow-x container), Reason (inference list), InferenceChain, SubNav, SearchBar, Tooltip (single shared, pointer-following). Hover grammar: the dim verb only (siblings recede), colour-only transitions, no transforms. Focus ring = --blue-fn outside the palette.
4. Grain overlay and the tide ceremony as in the mockup; ambience seeded by FNV-1a→mulberry32 from a `seed` prop (block hash) — `Math.random` is banned (add an eslint rule `no-restricted-properties` for it).
5. prefers-reduced-motion: do not construct the animation systems at all (guard at construction, not amplitude).
6. Routes (placeholders with the shell, real copy from the plan): / , /beware, /contradictions, /timeline, /network, /method, /flows, /track, /sources. Metadata + OG image route. 
7. Lighthouse/axe budget documented in apps/web/README.md (perf ≥ 95, a11y ≥ 95 on /beware).
8. Vercel: add apps/web/vercel.json only if needed; document the new project settings in docs/2.0/DEPLOY-2.0.md (Framework Next.js, Root Directory apps/web, env NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_SNAPSHOT_URL).

Acceptance: `pnpm --filter @zcashreveal/web build` succeeds; typecheck + lint clean; no emoji; every primitive has a story-like demo at /dev/primitives (dev-only route) that I can screenshot; reduced-motion verified by toggling the media query in DevTools (document how).

Branch feat/v2-01-web-scaffold. PR with heredoc body. STOP before merge.
```

---

## Prompt 02 — `packages/content` (schemas + seeds)

```
Read docs/2.0/RESEARCH-2026-08-DOSSIER.md (all sections), docs/2.0/research/03-history-exploits-governance.md (Part C timeline table), docs/2.0/research/02-promotion-network.md (§1, §2.1, §4), docs/2.0/research/04-exchange-inflows-insider-selling.md (§2, §3, §6, §7), and docs/2.0/TRACKING-MATH.md §1.5. Plan first.

Goal: a typed content package the Record pages render from, seeded from the research, validated at build time.

Tasks
1. packages/content with zod schemas in src/schema.ts:
   - Source { id, title, url, publisher, date, accessed }
   - Claim base { id, title, summary, body? (markdown), sources: SourceRef[] (≥1), confidence: 'high'|'med'|'low', lastVerified: ISO date, tags[] }
   - BewareEntry extends Claim { discovered, disclosed, fixed, discoverer, rootCause, detectable: 'yes'|'no'|'partial'|'n/a', window: {from,to}, severity: 'crit'|'high'|'mid' }
   - Contradiction extends Claim { claim, reality }
   - TimelineEvent extends Claim { date (ISO or ISO-month), category: 'LAUNCH'|'FUND'|'GOV'|'LEAD'|'EXPLOIT'|'TECH'|'MARKET'|'REG'|'NET', height? }
   - NetworkEdge { from, to, what, amount?, date, sources, confidence } and NetworkEntity { id, name, role, location?, exposure?, sources }
   - Phrase { text, origin, date, amplifiers[], tension, confidence }
   - AddressLabel { address, label, labeller: 'consensus'|'owner-filing'|'exchange'|'analyst'|'behaviour', method, confidence, lastVerified, sources }
   - Case { id, title, steps: [{time, height?, from, to, amount, note}], verdict, confidence, sources }
   - Unverified { claim, status, why }
2. Seed JSON files in packages/content/data/: beware.json (B1–B14), contradictions.json (C1–C16), timeline.json (the full Part C table, ~110 rows), network.json (entities + edges from the loop and the Cypherpunk ledger), phrases.json (the catalogue, excluding the three marked NOT VERIFIED), labels.json (ZIP 271 multisig; the Lookonchain-labelled and unattributed addresses with their provenance), cases.json (2 Jan 2026 event; lockbox disbursement; 202,076 unshield), unverified.json (dossier §G + research 04 §7), sources.json (every URL referenced, de-duplicated).
3. A `validate` script (tsx) that parses every file with zod, checks every SourceRef resolves, every claim has ≥1 source and a lastVerified date, and that no entry in unverified.json is referenced by any other file as a fact. Wire it into `pnpm -r test` and CI.
4. Export typed loaders (`getBeware()`, `getTimeline({category})`, `getCase(id)`, …) and claim-ID permalink helpers (`/beware#B2`, `/timeline#T2026-06-04`).

Acceptance: `pnpm --filter @zcashreveal/content validate` passes; counts printed (beware 14, contradictions 16, timeline ≥ 100, labels ≥ 7, cases 3); no emoji; the three NOT-VERIFIED phrases and the Korean-exchange/21Shares/bot-network claims appear ONLY in unverified.json.

Branch feat/v2-02-content. PR. STOP before merge.
```

---

## Prompt 03 — The Record pages

```
Read docs/2.0/mockups/zecreveal-2.0-mockups-v2.html screens 00–03, 05, 06 (Splash, Beware, Timeline, Network, Method, Flows) and packages/content. Plan first.

Goal: render the Record from packages/content with React Server Components in apps/web — zero-motion pages (DGIGA TP05), footnote apparatus, measure lock, claim-ID permalinks.

Tasks
1. /beware: header with the two quotes; the ledger (severity stripe, detectable chip, confidence); the B2 deep-dive (code diff panel + timeline steps); Contradictions grid. Each row has an id anchor and a "cite this" popover (claim id, URL, lastVerified, sources).
2. /timeline: year rails, category filter chips (client island, URL-synced via searchParams, no history writes in iframes — wrap in try/catch), the shielded-share chart as inline SVG.
3. /network: the loop diagram (inline SVG, labels with paint-order halo), edge table, Cypherpunk ledger table, statements-vs-price chart (inline SVG, log scale, staggered annotations), phrase catalogue, paid-content + fairness panels.
4. /method: render TRACKING-MATH.md sections as designed in the mockup (tables, formula block, claim-level card, golden cases).
5. /flows: the full case file from research/04 as designed (executive summary cards, dated transfers table, labelled addresses, rich list + the false-inference warning box, reserves, dev-fund, allegations vs evidence, not verified).
6. /sources: every source grouped by publisher with accessed dates.
7. / (Splash): hero with the fog canvas (seeded, idle-gated, reduced-motion → static frame), leaks column, metrics row (values from a `stats.json` in packages/content for now), the two-windows diagram, pool snapshot bar, entry cards, footer ledger.
8. Charts follow the dataviz rules: thin marks, 2px surface gaps, legends for ≥2 series, direct labels sparingly, text in ink tokens never series colours, a table twin for every chart (visually hidden but reachable).
9. RSS feed of ledger changes (/beware.xml) and JSON export (/api/content/beware.json).

Acceptance: build clean; axe has no serious violations on /beware and /timeline; every claim id resolves; Lighthouse perf ≥ 95 on /beware (document the run); screenshots of all six pages at 1440px committed under docs/2.0/screens/ (PNG, no fonts substituted — run with network access so Google Fonts load).

Branch feat/v2-03-record-pages. PR. STOP before merge.
```

---

## Prompt 04 — Tracking pages (snapshot/mock mode)

```
Read docs/2.0/TRACKING-MATH.md, docs/2.0/mockups/zecreveal-2.0-mockups-v2.html screen 04 (all six sub-views), packages/content/data/cases.json + labels.json, and legacy/dashboard/src/hooks/useMempool.ts + lib/parsers.ts + components/CandidatesPanel.tsx. Plan first.

Goal: the Tracking suite UI in apps/web, driven by a typed API client with a fixture-backed implementation so the pages are complete before the gateway API exists.

Tasks
1. apps/web/src/lib/api/: `ZecApi` interface (searchKind(q), getAddress(a), getTx(id), getBlock(h), getPools(), getMempool(), getFlows(), getLabels()) with Zod response schemas shared from packages/zec-types (add the DTOs there: AddressView, TxView, PoolsView, MempoolView, Estimate{ candidates, filters[], nEff, claim, assumptions[] }). Two implementations: FixtureApi (reads packages/content cases + a fixtures/ directory) and HttpApi (fetches NEXT_PUBLIC_API_URL; not wired yet).
2. Routes: /track (search + mempool), /address/[addr], /tx/[txid], /block/[height], /pools, /flows (summary that links to the Record's /flows), /reveal.
3. Search bar detects type (t1/t3 P2PKH/P2SH, zs1/u1/zc shielded, uview/zxview/zivk keys, 64-hex txid, height) and routes; shielded addresses route to /reveal with the Mode B explanation.
4. /address: header with label + provenance chip, exact balance tiles, balance step chart, interaction graph (SVG), transactions table with pool-side estimate column, Reasoning panel. Fixture = the ZIP 271 lockbox case.
5. /tx: public-fields panel, inference chain (raw → spent-count → time window → amount echo → N_eff → claim), round-trip ledger. Fixture = 7ae85864… (2 Jan 2026).
6. /pools: Sankey (inline SVG, normalised node heights, hover), balances table, Unprovable Residual, pool history (stacked area with the two unsound bands), drain / migration lens / Ironwood birth panels.
7. /track mempool: dense table (txid, age, version, flow, pools, valueBalance, fee→L, wallet guess, findings, severity) + detail panel with the per-class reasoning; WS client stub with reconnect (port legacy ws.ts) — mock stream in fixture mode.
8. /reveal: Mode B pane (fogged) + Mode A ceremony UI; the key input does nothing yet except validate the prefix client-side and explain what each key type reveals; a "coming in 2.1" gate on decryption.
9. Every estimate renders its assumptions and the claim chip; never render a shielded balance anywhere except inside the Mode A pane (which is gated).

Acceptance: all routes render in fixture mode; typecheck/lint clean; unit tests for searchKind and for the estimate rendering (vitest + testing-library + jsdom — add the dashboard test infra that never shipped); screenshots under docs/2.0/screens/track-*.png.

Branch feat/v2-04-tracking-ui. PR. STOP before merge.
```

---

## Prompt 05 — Gateway REST read API v2 + hardening

```
Read apps/gateway/src/index.ts, ws-broker.ts, config.ts, the tests, packages/zec-types (the DTOs added in Prompt 04), and docs/2.0/ZECREVEAL-2.0-PLAN.md §9 "Architecture additions". Plan first.

Goal: the read API the Tracking UI needs, served by the existing Fastify gateway, with the transparent side backed by Zebra's address-index RPCs (cached in Postgres) and the shielded metadata by our indexer tables.

Tasks
1. Endpoints: GET /api/address/:addr (balance, received, spent, utxo count, first/last seen, txs page, boundary events with estimates when available, label from packages/content labels.json), GET /api/tx/:txid (public fields + leak report if indexed + estimates), GET /api/block/:height, GET /api/pools (balances from pool state or snapshot), GET /api/labels, GET /api/cases, GET /api/search?q= (kind detection). All responses validated against the Zod DTOs.
2. Zebra RPC client additions in a shared package (move apps/indexer/src/zebrad-rpc.ts to packages/zebra-rpc): getaddressbalance, getaddresstxids, getaddressutxos, getrawtransaction (verbosity 1), getblock (verbosity 2), getblockchaininfo; retries and timeouts; typed JSON schemas.
3. Postgres cache tables (migration 003a in apps/indexer/migrations, shared DB): tx_cache(txid, height, json), address_cache(addr, balance, received, spent, utxo_count, first_seen, last_seen, refreshed_at) with TTLs; cache-aside.
4. Hardening: @fastify/rate-limit (per-IP), WsBroker connection cap (configurable, default 500) with a 429-style close frame, request-id logging, CORS from config.
5. Tests: route tests with mocked RPC + a Postgres-gated integration test; keep the 7 existing WS tests green.

Acceptance: `pnpm --filter @zcashreveal/gateway test` green; `curl /api/address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo` against a running Zebra 6.x returns balance 78,183.4093 ZEC (document the run, or the mocked equivalent if the node is not yet synced).

Branch feat/v2-05-gateway-api. PR. STOP before merge.
```

---

## Prompt 06 — Indexer: four pools + migration 003

```
Read packages/zec-types/src/{analysis,shielded,leaks}.ts, apps/indexer/src/state/*, apps/indexer/src/persistence/*, apps/indexer/migrations/*, apps/indexer/src/decoder/activation-heights.ts, and docs/2.0/ZECREVEAL-2.0-PLAN.md §3.1. Plan first.

Goal: widen the pool model to sprout | sapling | orchard | ironwood without breaking the 171 tests, and add the post-NU6.3 invariants.

Tasks
1. `Pool` union → 'sprout'|'sapling'|'orchard'|'ironwood' (ShieldedPool stays the single source of truth). Fix every exhaustive switch; keep the `<P extends Pool>` generics.
2. Migration 003: widen the CHECK constraints on pool_commitments/pool_anchors/pool_nullifiers/pool_boundary_flows; add pool_snapshots(height, pool, balance_zat, commitment_count, nullifier_count, anchor_count, ts) and migrations_zip318(txid, height, amount_zat, denom_n, denom_k, ts). Make the migration runner transactional (plan §12 deferred item).
3. activation-heights.ts: add NU6 2,726,400; NU6.1 3,146,400; ORCHARD_MITIGATION 3,363,426; NU6_2 3,364,600; NU6_3 3,428,143 (+ testnet 4,048,500 / 4,052,000 / 4,134,000); export a `poolsActiveAt(height)` helper.
4. ValuePool/PoolState: enforce `Bal ≥ 0` for all pools (exists) and the exit-only invariant `deltaV_orchard ≥ 0` for heights ≥ 3,428,143 — violation throws (our decoder is wrong, never the chain).
5. LeakClass gains 'MIGRATION_O2I' and Ironwood variants; poolPath gains 'orchard→ironwood'; RoundTripIndex handles four pools.
6. Tests: extend state/persistence tests for the new pools; property test (fast-check) that replay/rollback conserves balances across all pools.

Acceptance: all previous tests pass (count ≥ 171) plus new ones; migration applies cleanly on a fresh Postgres and on a DB migrated through 001→002.

Branch feat/v2-06-four-pools. PR. STOP before merge.
```

---

## Prompt 07 — Indexer: v6 / Ironwood decoder (module 7A.2)

```
Read apps/indexer/src/decoder/*.ts, test/fixtures/blocks/README.md, apps/indexer/src/zebrad-rpc.ts (or packages/zebra-rpc after Prompt 05), and ZIP 229 / ZIP 258 / ZIP 2005 / ZIP 318 (fetch them). Check Zebra 6.x `getrawtransaction` / `getblock` verbosity-2 JSON for v6 transactions (read the Zebra 6 RPC docs or source for the field names of the Ironwood bundle). Plan first.

Goal: decode v6 transactions and Ironwood actions into the four-pool state; never crash on an unknown shape.

Tasks
1. decoder/ironwood.ts mirroring orchard.ts (actions → nullifiers, commitments, anchor, valueBalanceIronwood, flags); decoder/v6.ts for version dispatch; block-decoder.ts emits Ironwood commitments/anchors/nullifiers and boundary deltas; unknown version or bundle → a structured `UNSUPPORTED_TX` leak report with severity INFO (not a throw).
2. Migration detection: a tx with valueBalanceOrchard > 0 and valueBalanceIronwood < 0 and no transparent components → MIGRATION_O2I; record amount + canonical denomination (n×10^k, n∈{1,2,5}) into migrations_zip318; flag non-canonical amounts.
3. NU6.2 rule: proofsOrchard canonical length 2720 + 2272·nActions — record a finding when violated (should never happen post-NU6.2; it is a decoder sanity check).
4. Fixtures: add three real blocks captured from a Zebra 6.x node (one pre-NU6.3 v5, one with migrations, one with Ironwood spends) under test/fixtures/blocks/ — if the node is not available yet, add synthetic fixtures mirroring the RPC shape and leave the real-fixture test `skipIf`-guarded as today.
5. Wallet fingerprints: extend fingerprint.ts with expiryDelta/padding signatures for Zodl 3.x, Vizor, Zkool, Zingo, Cake (document each as a hypothesis with the source of the signature).

Acceptance: decoder tests green incl. new v6 cases; `pnpm --filter @zcashreveal/indexer test` ≥ 200 tests; no `any` introduced.

Branch feat/v2-07-v6-decoder. PR. STOP before merge.
```

---

## Prompt 08 — Indexer analysis: echo, clustering, labels, posterior, taint

```
Read docs/2.0/TRACKING-MATH.md §1, §3, §4, §6, apps/indexer/src/analysis/*.ts and their tests, and packages/content/data/{cases,labels}.json. Plan first.

Goal: the process-of-elimination toolkit as pure, audited, tested modules, keeping the v0.2 FilterApplication audit-record contract.

Tasks
1. analysis/echo.ts: exact / fee-tolerant (existing constant) / relative (ε = 1e-4) / subset-sum (k ≤ 3, window-bounded, amounts quantised to 1e4 zat) matchers; grading HIGH/MEDIUM/LOW per the spec; injectable clock; audit records.
2. analysis/clustering.ts: common-input-ownership union-find, change heuristic with p_change parameter, exchange-shape detectors (change-to-self withdrawal, many-to-one sweep), P2SH multisig flag.
3. analysis/labels.ts: consensus-defined labels (ZIP 271 multisig mainnet/testnet; funding-stream addresses per ZIP 1014/1015/1016 — pull them from Zebra's parameters or the ZIPs and cite; TEX/ZIP 320 detection); precedence enum consensus > owner-filing > exchange > analyst > behaviour; loads packages/content labels.json for the non-consensus tiers.
4. analysis/posterior.ts: weights = L_amount · L_time · L_fp · L_struct (spec §4), normalisation, H, N_eff, claim via the existing classifier; returns top-k with p_j and the assumption sentences.
5. analysis/taint.ts: ≤3-hop flow estimate with cut p < 0.02 and the unresolved-mass residual.
6. Golden tests (from TRACKING-MATH §6): 2 Jan 2026 round-trip must grade MEDIUM with relative Δ 8.1e-6; lockbox partial echo must grade LOW; 202,076.207 unshield must be aggregate_only; transparent sum exact. Property tests: conservation (§3.11) never violated by any estimator output.

Acceptance: tests green; every module pure (no I/O); audit records serialise to the wire shape the UI already parses.

Branch feat/v2-08-analysis-toolkit. PR. STOP before merge.
```

---

## Prompt 09 — Turnstile accounting, migration lens, Ironwood birth, snapshot publisher

```
Read docs/2.0/ZECREVEAL-2.0-PLAN.md §3.1–3.5 and §4 decision 2, apps/indexer/src/index.ts, state/value-pool.ts, apps/gateway/src/ws-broker.ts. Plan first.

Goal: the pool-level instruments and the snapshot baseline that makes an empty public page impossible.

Tasks
1. analysis/turnstile-accounting.ts: per-pool Bal, in/out per window, U_h = Bal_sprout + Bal_orchard, V_h = 1 − U_h/Supply_h, Orchard drain D_h and velocity (24h/7d), with supply from getblockchaininfo or a computed issuance schedule (document which).
2. analysis/migration-lens.ts: per-block and per-window denomination histograms from migrations_zip318, session bounds (note-count lower bound, wallet upper bound), stranded-dust estimate — distributions only.
3. analysis/ironwood-birth.ts: time series of N_eff for Ironwood spends since 3,428,143 and the share per claim level.
4. apps/publisher: a small Node service (or an indexer task) that writes snapshot.json every block: { height, hash, time, pools, residual, drain, migrationHist, neffSeries, lastReports[≤50], labelsVersion } to a configurable sink (Vercel Blob or S3/R2 via env; local file in dev). Include the block hash so the web ambience can seed from it.
5. Gateway: GET /api/snapshot proxies the latest snapshot; WS sends a `snapshot` channel frame on connect.

Acceptance: unit tests for each module; an end-to-end dev run (docker compose up postgres redis + fixture replay) produces a snapshot.json that validates against a Zod schema in packages/zec-types.

Branch feat/v2-09-instruments-snapshot. PR. STOP before merge.
```

---

## Prompt 10 — Infra: Zebra 6.2.x, VPS compose, tunnel, runbook, DEPLOY-2.0

```
Read docker-compose.yml, infra/zebrad/zebrad.toml, DEPLOY.md, docs/2.0/HANDOFF-2026-08-22-v2.md §1, and the Zebra 6.x docs (config reference, cookie auth, state format, checkpoints, disk requirements). Plan first. Do not run docker commands; produce files and a runbook.

Goal: a production compose for a Linux VPS (Debian 12, Docker) running Zebra 6.2.x + Postgres 16 + Redis 7 + indexer + gateway + publisher, with Cloudflare Tunnel for the public WS/API, and a dev override for Aqua's Windows box.

Tasks
1. docker-compose.yml: pin zfnd/zebra:6.2.x (exact tag), healthchecks for all services, restart: unless-stopped, named volumes, Postgres on 5433 externally (the host collision from RUNBOOK-finish-v0.2.md), Redis AOF, indexer/gateway/publisher built from the repo (multi-stage Dockerfiles, Node 22-alpine), cloudflared service reading a token from env.
2. infra/zebrad/zebrad.toml for 6.x: re-validate `enable_cookie_auth = false` and the loopback-bound RPC; enable the address indexes needed by Prompt 05 (document the exact keys); ZMQ if still supported, else document the polling fallback the indexer already has.
3. docs/2.0/RUNBOOK-VPS.md: provisioning (≥4 vCPU / 16 GB / ≥500 GB NVMe), first sync expectations with checkpoints, wipe-and-resync procedure, backups of Postgres, upgrade procedure within one Zebra major, alerting on snapshot age > 20 blocks, the cloudflared tunnel steps (`cloudflared tunnel create zecreveal-gateway`, DNS route, ingress to gateway:8080).
4. docs/2.0/DEPLOY-2.0.md: the new Vercel project (zecreveal; Root Directory apps/web; Framework Next.js; env vars NEXT_PUBLIC_API_URL=https://<tunnel>/api, NEXT_PUBLIC_WS_URL=wss://<tunnel>/stream, NEXT_PUBLIC_SNAPSHOT_URL), the cutover from z-cash-reveal-dashboard2, and the post-deploy smoke test (fetch the built JS and assert the snapshot fallback is present).
5. .env.example updated for all services; secrets never committed.

Acceptance: `docker compose config` validates; Dockerfiles build locally (`docker build` is allowed; `docker compose up` is not — Aqua runs it); runbook reviewed for every command being copy-pasteable.

Branch feat/v2-10-infra. PR. STOP before merge.
```

---

## Prompt 11 — Live wiring + smoke tests

```
Read apps/web/src/lib/api (HttpApi), apps/gateway routes, apps/publisher output schema, docs/2.0/DEPLOY-2.0.md. Plan first.

Goal: the public site reads the snapshot at build/ISR time, upgrades to live WS in the browser, and can never render empty.

Tasks
1. HttpApi wired to NEXT_PUBLIC_API_URL with Zod validation; ISR (revalidate 60s) for /pools and / using the snapshot; the mempool island hydrates from the snapshot's lastReports then subscribes to WS; a staleness indicator shows "snapshot age: N blocks" (D3626 epoch clock) when the socket is down; never a blank panel.
2. Feature flag NEXT_PUBLIC_DATA_MODE = fixture | snapshot | live; production default snapshot+live.
3. Playwright smoke tests (apps/web/e2e): every Record page renders its first claim; /track renders ≥1 mempool row or the staleness indicator; /address/t3ev37Q2uL1sfTsiJQJiWJoFzQpDhmnUwYo shows 78,183.4093 when the API is up; no console errors (history writes in iframes are try/caught).
4. CI: run e2e against a fixture-mode build on every PR; a post-deploy job hits the production URL and fails if the mock/snapshot fallback is missing from the bundle.

Acceptance: e2e green locally and in CI; document the cutover checklist.

Branch feat/v2-11-live. PR. STOP before merge.
```

---

## Prompt 12 — 7B / 7C runtime wiring (carried from v0.2)

```
Read docs/2.0/HANDOFF-2026-08-22-v2.md, the v0.2 plan items 7B/7C in docs/2.0/ZECREVEAL-2.0-PLAN.md §5 Phase 3, apps/indexer/src/index.ts, state/pool-state.ts, persistence/replay.ts, analysis/assessment.ts. Plan first.

Goal: the live indexer maintains PoolState for all four pools from chain data and attaches assessments to every spend and link.

Tasks: replayInto on startup before zmq.start(); onConfirmedBlock driver (decode → state append → persistence write → snapshot row); AnalyzeContext gains chainState; per-spend assessRaw; per-link assessFiltered with timeWindow + amountMatch + the new echo/posterior modules; the orphan zcashreveal:links channel is either subscribed by the gateway or removed; reorg rollback test.

Acceptance: integration tests against Postgres green; a 1,000-block replay from a fixture range reproduces pool balances within rounding of an explorer's figures (document which heights).

Branch feat/v2-12-runtime-poolstate. PR. STOP before merge.
```

---

## Prompt 13 — Mode A: viewing-key decryption in the browser (2.1)

```
Read docs/2.0/TRACKING-MATH.md §5 and apps/web/app/reveal. Research the current crate names and WASM story for Zcash note decryption (zcash_keys, zcash_note_encryption, orchard, sapling-crypto; wasm-bindgen/wasm-pack; existing browser wallets such as the Zingo/Zcash web efforts) before proposing a design. Plan first, and stop after the plan for my approval — this is a security-sensitive build.

Goal (after approval): packages/wasm-keys exposing parseUfvk(), trialDecryptOutputs(ivk, outputs[]), deriveNullifiers(fvk, notes[]), decryptOutgoing(ovk, outputs[]), compiled to WASM, consumed by /reveal; compact-output fetching from the gateway; strict CSP; the key never leaves the tab; a ceremony UI that states what is and is not revealed.
```

---

## Appendix A — `CLAUDE.md` draft for the repo (2.0)

```markdown
# Claude workflows for ZCashReveal (2.0)

Read docs/2.0/ZECREVEAL-2.0-PLAN.md, docs/2.0/TRACKING-MATH.md and docs/2.0/RESEARCH-2026-08-DOSSIER.md before changing anything. Owner: Aqua. Claude halts before merge; Aqua merges.

## Stack
pnpm + Turbo monorepo · packages/zec-types (shared types + DTOs) · packages/content (zod schemas + research data) · apps/indexer (Node 22, Zebra RPC/ZMQ, Postgres + Redis, analysis) · apps/gateway (Fastify REST + WS) · apps/publisher (snapshot.json) · apps/web (Next.js App Router, React 19, Tailwind v4) · legacy/dashboard (v0.2, read-only).

## Conventions
- TypeScript strict (tsconfig.base.json); ESM; `bigint` for zatoshi; heights/counts `number`; lowercase hex, no 0x; `Hex` is branded and validated at the RPC boundary.
- Pools: 'sprout' | 'sapling' | 'orchard' | 'ironwood'; generics `<P extends Pool>`; DB CHECKs mirror the union.
- Every analysis estimator is pure and emits a FilterApplication audit record {filter, params, countIn, countOut}.
- Claim levels: >1000 aggregate_only · 100–1000 broad_candidate_set · 10–100 small_heuristic_set · ≤10 requires_disclosure. Never claim identity from public data. Never render a shielded balance without a viewing key (Mode A, client-side only).
- Content: every Record claim has sources[] (≥1), confidence (high|med|low), lastVerified; unverified items live only in unverified.json.
- Labels precedence: consensus > owner filing > exchange confirmation > analyst > behaviour — always displayed.

## Design system ("ZEC Forensic")
bg #121110 · surface #1A1816 · ink #EDE6D8 · gold #F4B728 (accent budget: primary action, active state, value-crossing-boundary) · functional blue #4C8DFF (focus/links, outside palette) · danger #E4553F (Beware severity only) · pools: transparent #3A8BD9, sprout #1F9E62, sapling #D9641E, orchard #C94F8F, ironwood #8B7FE6.
Type: Instrument Serif (display), Fraunces (numerals), JetBrains Mono (data, tabular), Manrope (prose). One hover verb: dim. One curve: cubic-bezier(.32,.72,0,1). One ceremony per surface: block arrival. Ambience seeded by the tip hash (FNV-1a → mulberry32); Math.random is banned. Reduced motion: do not construct animation systems. SVG icons only. **No emoji anywhere.**

## Workflow
Branch `feat/v2-<NN>-<name>`; small commits; `gh pr create` with a heredoc body; STOP before merge. Tests must pass: `pnpm -r test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @zcashreveal/content validate`.

## Don'ts
No deterministic deanonymisation claims · no emoji · no Tailwind soup outside the token layer · no secrets in git · no destructive git/docker commands without Aqua's explicit go.
```

## Appendix B — Mockup → route/component map

| Mockup screen | Route | Key components |
|---|---|---|
| 00 Splash | `/` | Hero(fog canvas, leaks), MetricRow, TwoWindows, PoolBar, EntryCards, FooterLedger |
| 01 Beware | `/beware`, `/contradictions` | QuotePair, Ledger(LedgerRow), B2DeepDive(CodeDiff, Steps), ContradictionGrid |
| 02 Timeline | `/timeline` | ShieldShareChart, CategoryFilter(client), TimelineRail(YearMarker, Event) |
| 03 Network | `/network` | LoopDiagram(svg), EdgeTable, CypherpunkLedger, PriceStatementsChart, PhraseCatalogue, PaidContent, FairnessPanel |
| 04 Tracking | `/track`, `/address/[a]`, `/tx/[id]`, `/block/[h]`, `/pools`, `/reveal` | SearchBar, CanGoCards, MempoolTable + MempoolDetail, AddressHeader, StepChart, InteractionGraph, TxTable, ReasonPanel, InferenceChain, RoundTripLedger, Sankey, PoolHistory, Drain/Denoms/Neff, ModeB/ModeA panes |
| 05 Method | `/method` | ClaimLevels, QueryTable, ClusteringCards, EstimatorTable, PosteriorBlock, CeremonyGrid, GoldenCases |
| 06 Flows | `/flows` | SummaryCards, TransfersTable, CaseReconstruction(pre), LabelsTable, RichList + WarnBox, LabellingInfra, ReservesTable, DevFundPanels, AllegationsTable, Unverified |
```
