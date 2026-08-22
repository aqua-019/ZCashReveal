# ZECReveal 2.0 — handoffs (Aqua Stack v4.1)

L2 (Cowork) writes these. L3 (Claude Code: lead → director-build / director-quality → crews) picks **the newest `open`** one and executes it. The PR stops at opened; the operator merges. L2 verifies the preview/logs, writes back §7 / `LOG.md` / memory, and appends §8 to `LEDGER.md` — which L2 reads before writing the next handoff.

## Status convention
`open` = ready for L3 now · `queued` = written, not yet released (dependencies unmerged) · `in-progress` = an L3 session owns it · `shipped` = PR opened · `closed` = merged and written back. Exactly one handoff per track is `open` at a time; to run tracks in parallel, open one per track and tell each Claude Code session which file it owns.

## Kickoff line for a Claude Code session
```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then pick the newest handoff in handoffs/ with status: open (or the one I name) and execute it under the stack contracts. Report spawn mode first. Stop at PR opened.
```

## Sequence

| # | Handoff | Branch | Track | Depends on | Status |
|---|---|---|---|---|---|
| 00 | [Housekeeping, docs import, CI runs tests, CLAUDE.md](HANDOFF-00-housekeeping.md) | `feat/v2-00-housekeeping` | Foundation — first | — | `open` |
| 01 | [`apps/web` scaffold + the ZEC Forensic design system](HANDOFF-01-web-scaffold.md) | `feat/v2-01-web-scaffold` | Web | 00 | `queued` |
| 02 | [`packages/content` — zod schemas + research seeds](HANDOFF-02-content-package.md) | `feat/v2-02-content` | Web | 00 | `queued` |
| 03 | [The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources](HANDOFF-03-record-pages.md) | `feat/v2-03-record-pages` | Web | 01, 02 | `queued` |
| 04 | [ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal](HANDOFF-04-tracking-ui.md) | `feat/v2-04-tracking-ui` | Web | 01, 02 (03 optional) | `queued` |
| 05 | [Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)](HANDOFF-05-gateway-api.md) | `feat/v2-05-gateway-api` | Data | 00 (uses the DTOs from 04 if merged; otherwise defines them) | `queued` |
| 06 | [Indexer: four pools + migration 003 + post-NU6.3 invariants](HANDOFF-06-four-pools.md) | `feat/v2-06-four-pools` | Data | 00 | `queued` |
| 07 | [Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection](HANDOFF-07-v6-decoder.md) | `feat/v2-07-v6-decoder` | Data | 06 | `queued` |
| 08 | [Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)](HANDOFF-08-analysis-toolkit.md) | `feat/v2-08-analysis-toolkit` | Data | 06 | `queued` |
| 09 | [Turnstile accounting, migration lens, Ironwood birth, snapshot publisher](HANDOFF-09-instruments-snapshot.md) | `feat/v2-09-instruments-snapshot` | Data | 06, 08 | `queued` |
| 10 | [Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0](HANDOFF-10-infra.md) | `feat/v2-10-infra` | Infra | 00 | `queued` |
| 11 | [Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist](HANDOFF-11-live-wiring.md) | `feat/v2-11-live` | Integration | 04, 05, 09, 10 | `queued` |
| 12 | [7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path](HANDOFF-12-runtime-poolstate.md) | `feat/v2-12-runtime-poolstate` | Integration | 06, 07, 08 | `queued` |
| 13 | [Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)](HANDOFF-13-mode-a-wasm.md) | `feat/v2-13-mode-a (plan only)` | 2.1 — plan only | 04, 11 | `queued` |

Web (01→04), Data (05→09) and Infra (10) are independent once 00 is closed. 11 and 12 integrate. 13 is plan-only.

## Human clicks (L4 — nothing here is done by an agent)
| When | What the operator does |
|---|---|
| before 00 | **one upload**: copy `2026-08-22-pickup/` into the repo root as `_incoming/` (everything HANDOFF-00 needs is inside — docs, research, mockups + reference screenshots, the stack diagram, `CLAUDE.md.draft`, `v0.2-notes/`, `handoffs/` with `LEDGER.md`/`LOG.md`); HANDOFF-00 moves it into `docs/2.0/` + `handoffs/` and `_incoming/` disappears |
| every handoff | review the PR → merge → mark the handoff `closed` in its front-matter + `LOG.md` |
| 01 | create the Vercel project `zecreveal` (Root Directory `apps/web`, Framework Next.js) from the repo; keep `z-cash-reveal-dashboard2` until the cutover |
| 09 → 11 | connect the existing Vercel Marketplace **Redis** store to `zecreveal` (project → Storage); copy the REST URL + read-only token into `SNAPSHOT_REDIS_REST_URL` / `SNAPSHOT_REDIS_REST_TOKEN` (Vercel env) and the `rediss://` URL into `SNAPSHOT_REDIS_URL` in the VPS `.env` — the publisher's only managed-store writer |
| 10 | provision the VPS, run the runbook, create the tunnel |
| 11 | cutover checklist → production promotion |

Redis is two instances on purpose: the VPS Redis (`REDIS_URL`) carries the hot path (pub/sub, `mempool:live`, anchors) and never leaves the box; the managed Redis holds only `zecreveal:snapshot:*` (3 commands per block) so the public site can render from it when the VPS or the tunnel is down. Nothing before HANDOFF-09 needs the managed store.

## Files
- `LEDGER.md` — the §8 ledger, append-only, read before every new handoff.
- `LOG.md` — one line per revolution: date · handoff · PR · status · gate rounds.
- `HANDOFF-NN-*.md` — the handoffs themselves (this README is the index).
