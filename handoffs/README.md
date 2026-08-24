# ZECReveal 2.0 — handoffs (Aqua Stack v4.1)

L2 (Cowork) writes these. L3 (Claude Code: lead → director-build / director-quality → crews) executes **the lowest-numbered `open`** one, unless the prompt names a file — and the prompt names one whenever more than one track is open (LEDGER-02 Q1). The PR stops at opened; the operator merges. L2 verifies the preview/logs, writes back §7 / `LOG.md` / memory, and appends §8 to `LEDGER.md` — which L2 reads before writing the next handoff.

## Status convention
`open` = ready for L3 now · `queued` = written, not yet released (dependencies unmerged) · `in-progress` = an L3 session owns it · `shipped` = PR opened · `closed` = merged and written back. Exactly one handoff per track is `open` at a time; to run tracks in parallel, open one per track and tell each Claude Code session which file it owns.

Statuses are maintained by the sessions themselves; see "Revolution protocol" in CLAUDE.md.

## Branch convention (resolved after HANDOFF-00)
The harness names the branch a session is opened on, so handoff front-matter no longer prescribes one: use the session's designated branch, and name it `feat/v2-NN-<slug>` only when you are free to choose. The stable key is the PR title, which always begins `HANDOFF-NN:`.

## Kickoff line for a Claude Code session
```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute the lowest-numbered handoff in handoffs/ with status: open. When more than one track is open I name the file, and that one is yours: handoffs/HANDOFF-NN-<slug>.md. If your handoff touches Redis, a Vercel variable or the publisher, read docs/2.0/SNAPSHOT.md first - the managed store is shared with an unrelated production project. Report spawn mode first. Stop at PR opened.
```

## Sequence

| # | Handoff | Branch | Track | Depends on | Status |
|---|---|---|---|---|---|
| 00 | [Housekeeping, docs import, CI runs tests, CLAUDE.md](HANDOFF-00-housekeeping.md) | `claude/aqua-stack-v4-1-handoff-818gb3` | Foundation — first | — | `closed` |
| 01 | [`apps/web` scaffold + the ZEC Forensic design system](HANDOFF-01-web-scaffold.md) | session-designated | Web | 00 (closed) | `closed` |
| 02 | [`packages/content` — zod schemas + research seeds](HANDOFF-02-content-package.md) | session-designated | Web | 00 | `closed` |
| 03 | [The Record — Splash, Beware, Contradictions, Timeline, Network, Method, Flows, Sources](HANDOFF-03-record-pages.md) | session-designated | Web | 01, 02 | `closed` |
| 04 | [ZEC Tracking UI in fixture mode — search, mempool, address, tx, pools, reveal](HANDOFF-04-tracking-ui.md) | session-designated | Web | 01, 02 (03 optional) | `closed` |
| 05 | [Gateway REST read API v2 + hardening (Zebra address-index RPCs with a cache)](HANDOFF-05-gateway-api.md) | `claude/gateway-api-handoff-05-12ogr3` | Data | 00 (uses the DTOs from 04 if merged; otherwise defines them) | `closed` |
| 06 | [Indexer: four pools + migration 003 + post-NU6.3 invariants](HANDOFF-06-four-pools.md) | `claude/new-session-s4er6f` | Data | 00 | `closed` |
| 07 | [Indexer: v6 / Ironwood decoder (module 7A.2) + migration detection](HANDOFF-07-v6-decoder.md) | `claude/new-session-ux5kkt` | Data | 06 (closed) | `shipped` |
| 08 | [Indexer analysis toolkit: echo, clustering, labels, posterior, taint (+ golden cases)](HANDOFF-08-analysis-toolkit.md) | session-designated | Data | 06 | `queued` |
| 09 | [Turnstile accounting, migration lens, Ironwood birth, snapshot publisher](HANDOFF-09-instruments-snapshot.md) | session-designated | Data | 06, 08 | `queued` |
| 10 | [Infra: Zebra 6.2.x compose, VPS runbook, tunnel, DEPLOY-2.0](HANDOFF-10-infra.md) | session-designated | Infra | 00 | `open` |
| 11 | [Live wiring: snapshot baseline → WS upgrade, smoke tests, cutover checklist](HANDOFF-11-live-wiring.md) | session-designated | Integration | 04, 05, 09, 10 | `queued` |
| 12 | [7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path](HANDOFF-12-runtime-poolstate.md) | session-designated | Integration | 06, 07, 08 | `queued` |
| 13 | [Mode A — viewing-key decryption in the browser (2.1; PLAN ONLY, stop for approval)](HANDOFF-13-mode-a-wasm.md) | session-designated | 2.1 — plan only | 04, 11 | `queued` |

Web (01→04), Data (05→09) and Infra (10) are independent once 00 is closed. 00, 01, 02, 03, 04, 05 and 06 are `closed` (PRs #31 `0031d7c`, #32 `0ed75ad`, #33 `8badaa3`, #34 `47ff9d5`, #35 `8d97e25`, #36 `31d5000`, #37 `eba5b03`). The Web track's first pass is finished — 04 was the last Web handoff in the sequence, so the Web track has nothing `open` and nothing `queued`. 06 merged, which freed the Data track's active position, and 07 has taken it and is `in-progress`. 08 and 09 stay `queued` behind it — a track holds one active handoff, and `in-progress` occupies it exactly as `open` and `shipped` do; 08's `depends_on` (06) is closed, so it is the one that opens the moment 07 leaves the position. 10 is `open` and unclaimed on purpose — the Infra track, which needs its own session told it owns HANDOFF-10 (LEDGER-02 Q1). 11 and 12 integrate and stay `queued` until 09 and 10, and 07 and 08, close. 13 is plan-only.

## Human clicks (L4 — nothing here is done by an agent)
| When | What the operator does |
|---|---|
| before 00 | **one upload**: copy `2026-08-22-pickup/` into the repo root as `_incoming/` (everything HANDOFF-00 needs is inside — docs, research, mockups + reference screenshots, the stack diagram, `CLAUDE.md.draft`, `v0.2-notes/`, `handoffs/` with `LEDGER.md`/`LOG.md`); HANDOFF-00 moves it into `docs/2.0/` + `handoffs/` and `_incoming/` disappears |
| every handoff | review the PR → merge → mark the handoff `closed` in its front-matter + `LOG.md` |
| after 00 | run the commands in `docs/2.0/BRANCH-CLEANUP.md` to delete the stale remotes, including `claude/build-leak-panel-I0181` — L2 reviewed it: an early 748-line LeakPanel superseded by the 527-line version on main, in an app that is now `legacy/` and retired at the HANDOFF-11 cutover |
| 01 — done | create the Vercel project `zecreveal` (Root Directory `apps/web`, Framework Next.js) from the repo. Done 23 Aug 2026: `prj_rNTLvGWnz92w5qcvROBchPUfdhIR`, and both v0.2 projects were deleted the same day, so it is now the only project on the account |
| 02 | **clear the stale build overrides on the `zecreveal` project** (Settings -> Build & Development): Framework Preset `Next.js`, and Build Command, Install Command and Output Directory overrides OFF. `apps/web/vercel.json` overrides them so the build no longer depends on this, but the legacy dashboard's build command is still stored on the new project and is a trap for whoever next edits that file |
| 03 — **withdrawn** | ~~turn on Protection Bypass for Automation on the `zecreveal` project~~ — **L2 has withdrawn this request** (LEDGER-04 Q3). HANDOFF-04 found a second wall behind Deployment Protection: the session container's egress proxy refuses the preview host outright (`curl` returns `CONNECT tunnel failed, response 403`, not a 302 to SSO), and L2 reproduced the same class of refusal from its own side. Lifting Deployment Protection therefore would not make a preview measurable by any session, so it is no longer worth toggling for L2's or L3's benefit — leave it as you prefer. The ruling that replaces it: the container Lighthouse number is the gate a session reports; the deployed number is the operator's, taken in a browser and pasted into the ledger. If you want one on the record, measure `zecreveal-git-main-aquatic-17b9f112.vercel.app/beware` yourself and paste the performance and accessibility figures |
| 03 — done | ~~rule on the two open questions in LEDGER-03~~ — answered in the L2 RESOLUTION for HANDOFF-03: the performance floor moves to the deployed page and a Record page of `/beware`'s size passes at 90 where no deployed measurement is reachable; gold has four licensed jobs, the fourth being the system-identity register. Both are folded into `CLAUDE.md` and HANDOFF-04 |
| 09 → 11 — **done 23 Aug 2026** | ~~connect the Marketplace **Redis** store to `zecreveal` and copy the names across~~ — the store `upstash-kv-blue-garden` is connected for Production and Preview under the variable prefix `SNAPSHOT_REDIS`, so Vercel injects the five names automatically and there is nothing to copy on that side. Two things remain yours: paste the `rediss://` TCP URL into the VPS `.env` when the publisher ships (HANDOFF-09), and **read `docs/2.0/SNAPSHOT.md` before touching that store by hand** — it is shared with an unrelated production project, and the destructive commands are forbidden there for that reason |
| 10 | provision the VPS, run the runbook, create the tunnel |
| 11 | cutover checklist → production promotion |

Redis is two instances on purpose: the VPS Redis (`REDIS_URL`) carries the hot path (pub/sub, `zcashreveal:mempool:live`, anchors) and never leaves the box; the managed Redis is **shared with an unrelated production project**, and this repository owns one namespace in it, `zecreveal:snapshot:*` (3 writes per block), so the public site can render from it when the VPS or the tunnel is down. Nothing before HANDOFF-09 needs the managed store — but **read `docs/2.0/SNAPSHOT.md` before any change that touches Redis, a Vercel variable or the publisher**: because that store holds someone else's live data, its rules (the namespace, the forbidden commands, the shared budget) are not negotiable by a handoff, and CI enforces the command list.

## Files
- `LEDGER.md` — the §8 ledger, append-only, read before every new handoff.
- `LOG.md` — one line per revolution: date · handoff · PR · status · gate rounds.
- `HANDOFF-NN-*.md` — the handoffs themselves (this README is the index).
- `prompts/PROMPT-NN.md` — the prompt that started each session, archived verbatim.
