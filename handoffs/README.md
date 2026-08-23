# ZECReveal 2.0 — handoffs (Aqua Stack v4.1)

L2 (Cowork) writes these. L3 (Claude Code: lead → director-build / director-quality → crews) picks **the newest `open`** one and executes it. The PR stops at opened; the operator merges. L2 verifies the preview/logs, writes back §7 / `LOG.md` / memory, and appends §8 to `LEDGER.md` — which L2 reads before writing the next handoff.

## Status convention
`open` = ready for L3 now · `queued` = written, not yet released (dependencies unmerged) · `in-progress` = an L3 session owns it · `shipped` = PR opened · `closed` = merged and written back. Exactly one handoff per track is `open` at a time; to run tracks in parallel, open one per track and tell each Claude Code session which file it owns.

Statuses are maintained by the sessions themselves; see "Revolution protocol" in CLAUDE.md.

## Branch convention (resolved after HANDOFF-00)
The harness names the branch a session is opened on, so handoff front-matter no longer prescribes one: use the session's designated branch, and name it `feat/v2-NN-<slug>` only when you are free to choose. The stable key is the PR title, which always begins `HANDOFF-NN:`.

## Kickoff line for a Claude Code session
```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then pick the newest handoff in handoffs/ with status: open (or the one I name) and execute it under the stack contracts. Report spawn mode first. Stop at PR opened.
```

## Sequence

| # | Handoff | Branch | Track | Depends on | Status |
|---|---|---|---|---|---|
| 00 | [Housekeeping, docs import, CI runs tests, CLAUDE.md](HANDOFF-00-housekeeping.md) | `claude/aqua-stack-v4-1-handoff-818gb3` | Foundation — first | — | `closed` |
| 01 | [`apps/web` scaffold + the ZEC Forensic design system](HANDOFF-01-web-scaffold.md) | session-designated | Web | 00 (closed) | `closed` |
| 02 | [`packages/content` — zod schemas + research seeds](HANDOFF-02-content-package.md) | session-designated | Web | 00 | `in-progress` |
| 03 | [The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources](HANDOFF-03-record-pages.md) | session-designated | Web | 01, 02 | `queued` |
| 04 | [ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal](HANDOFF-04-tracking-ui.md) | session-designated | Web | 01, 02 (03 optional) | `queued` |
| 05 | [Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)](HANDOFF-05-gateway-api.md) | session-designated | Data | 00 (uses the DTOs from 04 if merged; otherwise defines them) | `open` |
| 06 | [Indexer: four pools + migration 003 + post-NU6.3 invariants](HANDOFF-06-four-pools.md) | session-designated | Data | 00 | `queued` |
| 07 | [Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection](HANDOFF-07-v6-decoder.md) | session-designated | Data | 06 | `queued` |
| 08 | [Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)](HANDOFF-08-analysis-toolkit.md) | session-designated | Data | 06 | `queued` |
| 09 | [Turnstile accounting, migration lens, Ironwood birth, snapshot publisher](HANDOFF-09-instruments-snapshot.md) | session-designated | Data | 06, 08 | `queued` |
| 10 | [Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0](HANDOFF-10-infra.md) | session-designated | Infra | 00 | `open` |
| 11 | [Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist](HANDOFF-11-live-wiring.md) | session-designated | Integration | 04, 05, 09, 10 | `queued` |
| 12 | [7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path](HANDOFF-12-runtime-poolstate.md) | session-designated | Integration | 06, 07, 08 | `queued` |
| 13 | [Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)](HANDOFF-13-mode-a-wasm.md) | session-designated | 2.1 — plan only | 04, 11 | `queued` |

Web (01→04), Data (05→09) and Infra (10) are independent once 00 is closed. 00 is `closed` (PR #31 merged as `0031d7c`) and 01 is `closed` (PR #32 merged as `0ed75ad`), so the Web track has advanced to 02, and the Data and Infra tracks release at their lowest unblocked handoff: 05 and 10 are `open`. 03 and 04 stay `queued` until 02 closes; 06–09 stay `queued` behind 05's track position. 11 and 12 integrate. 13 is plan-only.

## Human clicks (L4 — nothing here is done by an agent)
| When | What the operator does |
|---|---|
| before 00 | **one upload**: copy `2026-08-22-pickup/` into the repo root as `_incoming/` (everything HANDOFF-00 needs is inside — docs, research, mockups + reference screenshots, the stack diagram, `CLAUDE.md.draft`, `v0.2-notes/`, `handoffs/` with `LEDGER.md`/`LOG.md`); HANDOFF-00 moves it into `docs/2.0/` + `handoffs/` and `_incoming/` disappears |
| every handoff | review the PR → merge → mark the handoff `closed` in its front-matter + `LOG.md` |
| after 00 | run the commands in `docs/2.0/BRANCH-CLEANUP.md` to delete the stale remotes, including `claude/build-leak-panel-I0181` — L2 reviewed it: an early 748-line LeakPanel superseded by the 527-line version on main, in an app that is now `legacy/` and retired at the HANDOFF-11 cutover |
| after 00 | delete the orphaned Vercel project `z-cash-reveal-dashboard` (Root Directory `apps/dashboard`, a path that no longer exists) — it is the only red check on every PR and is caused by none of them |
| 01 | create the Vercel project `zecreveal` (Root Directory `apps/web`, Framework Next.js) from the repo; keep `z-cash-reveal-dashboard2` until the cutover |
| 09 → 11 | connect the existing Vercel Marketplace **Redis** store to `zecreveal` (project → Storage); copy the REST URL + read-only token into `SNAPSHOT_REDIS_REST_URL` / `SNAPSHOT_REDIS_REST_TOKEN` (Vercel env) and the `rediss://` URL into `SNAPSHOT_REDIS_URL` in the VPS `.env` — the publisher's only managed-store writer |
| 10 | provision the VPS, run the runbook, create the tunnel |
| 11 | cutover checklist → production promotion |

Redis is two instances on purpose: the VPS Redis (`REDIS_URL`) carries the hot path (pub/sub, `mempool:live`, anchors) and never leaves the box; the managed Redis holds only `zecreveal:snapshot:*` (3 commands per block) so the public site can render from it when the VPS or the tunnel is down. Nothing before HANDOFF-09 needs the managed store.

## Files
- `LEDGER.md` — the §8 ledger, append-only, read before every new handoff.
- `LOG.md` — one line per revolution: date · handoff · PR · status · gate rounds.
- `HANDOFF-NN-*.md` — the handoffs themselves (this README is the index).
- `prompts/PROMPT-NN.md` — the prompt that started each session, archived verbatim.
