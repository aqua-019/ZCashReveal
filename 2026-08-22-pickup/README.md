# `_incoming/` — ZECReveal 2.0 pickup (22 Aug 2026)

This folder is the single upload from L2 (Cowork) into the repo. It is consumed by `handoffs/HANDOFF-00-housekeeping.md`, which moves everything below into `docs/2.0/` and `handoffs/` and then removes `_incoming/`. Nothing in here is runtime code.

**Session one only:** the repo's `CLAUDE.md` is still the v0.2 one and the handoffs have not moved yet, so the kickoff is:

```
Aqua Stack v4.1 session. Read _incoming/CLAUDE.md.draft (it replaces CLAUDE.md in this handoff), then _incoming/handoffs/LEDGER.md, then execute _incoming/handoffs/HANDOFF-00-housekeeping.md under the stack contracts. Report spawn mode first. Stop at PR opened.
```

From HANDOFF-01 on, use the kickoff line in `handoffs/README.md`.

## Contents

| Path | What it is | Goes to |
|---|---|---|
| `ZECREVEAL-2.0-PLAN.md` | the 2.0 production plan (§9 tracking suite, §10 repo verdict) | `docs/2.0/` |
| `RESEARCH-2026-08-DOSSIER.md` | site-ready research synthesis (ten facts, Beware B1–B14, contradictions C1–C16, timeline, network, corrections, unverified) | `docs/2.0/` |
| `TRACKING-MATH.md` | the explorer math contract (exact / bounded / never claimed) | `docs/2.0/` |
| `HANDOFF-2026-08-22-v2.md` | the corrected v0.2 handoff (what was actually left unfinished) | `docs/2.0/` |
| `CLAUDE-CODE-PROMPTS.md` | the flat prompt pack the handoffs were derived from — reference only | `docs/2.0/` |
| `CLAUDE.md.draft` | the 2.0 `CLAUDE.md` with the Aqua Stack v4.1 contracts | replaces `CLAUDE.md` |
| `AQUA-STACK-v4.1.png` | the operating-model diagram `CLAUDE.md` points at | `docs/2.0/` |
| `research/01–04` | raw research dossiers (contemporary Zcash, promotion network, history/exploits/governance, exchange inflows) | `docs/2.0/research/` |
| `mockups/zecreveal-2.0-mockups.html` | mockup v1.1 (Splash, Beware, Timeline, Network, Instrument) — full standalone document | `docs/2.0/mockups/` |
| `mockups/zecreveal-2.0-mockups-v2.html` | mockup v2.1 — the build target (Splash, Beware, Timeline, Network, Tracking, Method, Flows) | `docs/2.0/mockups/` |
| `mockups/reference/*.png` + `README.md` | 12 reference screenshots of v2.1 rendered with the real typefaces | `docs/2.0/mockups/reference/` |
| `v0.2-notes/` | `RUNBOOK-finish-v0.2.md`, `postgres-port-5433.patch` — the v0.2 VPS notes HANDOFF-10 reads | `docs/2.0/v0.2-notes/` |
| `handoffs/` | `README.md` (index + kickoff + operator clicks), `HANDOFF-00…13`, `LEDGER.md`, `LOG.md` | `handoffs/` |

No emoji anywhere in this folder; SVG icons only in anything built from it.
