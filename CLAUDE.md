# Claude workflows for ZCashReveal (2.0)

Read docs/2.0/ZECREVEAL-2.0-PLAN.md, docs/2.0/TRACKING-MATH.md and docs/2.0/RESEARCH-2026-08-DOSSIER.md before changing anything. Owner: Aqua. Claude halts before merge; Aqua merges.

## Operating model — Aqua Stack v4.1 (docs/2.0/AQUA-STACK-v4.1.png)
- L2 (Cowork) writes a handoff in `handoffs/` (§1 SCOPE · §2 READING · §3 CONTRACT · §4 DELIVERABLES · §5 binary ASSERTIONS · §6 DISPATCH HINTS). L3 (this session: lead → director-build / director-quality → crews) executes the lowest-numbered `status: open` handoff, unless the prompt names a file — and the prompt names one whenever more than one track is open (LEDGER-02 Q1). L4 (GitHub → Vercel): production promotion is always a human click.
- Session start: read this file, then `handoffs/LEDGER.md`, then the handoff. Report spawn mode first (proven by a tool attempt). Directors name every worker they spawn; subagents do not nest.
- Crews: build — ui-builder, motion-designer, chain-integrator (Sonnet), backend-api, test-engineer, researcher (Haiku); quality — design-reviewer, security-auditor, devops-deployer, docs-scribe (Haiku).
- Loop 1 PREFLIGHT (READING / FILES / DONE MEANS / INFERRED / NOT-MATCHED) before a Haiku touches an unfamiliar subsystem, anything payment/RPC/auth, a spec longer than a screen, a re-dispatch after a gate FAIL, or a mechanical-rule dispatch.
- Loop 2 status ladder on every return: `DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH` with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED.
- Loop 3 spec-author review of executed work: `MATCHES-SPEC` / `DIVERGES` / `SPEC-WAS-AMBIGUOUS`.
- Loop 4 bounded convergence: gate FAIL → at most 3 rounds **per finding**, fingerprinted file · rule · severity; a round that surfaces only NEW findings, from a different reviewer or a different file, is not a repeat round. `NOT CONVERGING` — the same finding resisting a third fix — goes to the operator. Never ship a known false statement about a named person to keep a counter down: escalate, or fix it and say so in §7 (LEDGER-02 Q6).
- Evidence: every §5 assertion gets a two-polarity transcript (pass state and fail state). Every claim in §7 carries provenance — Executed (output shown) / Read (file + commit) / UNVERIFIED (labelled). Assumptions are dispositioned ACCEPTED / CORRECTED / DEFERRED; deferrals go to §8.
- Finish: fill §7 REPORT in the handoff, append §8 to `handoffs/LEDGER.md`, add a `LOG.md` line, set `status: shipped`, open the PR (`gh pr create`, heredoc body, no emoji). **Every PR stops at opened.** No merge, no deploy, no Vercel env changes, no `docker compose up`, no branch deletion — those are operator clicks.

## Revolution protocol (handoffs/ maintains itself; no file uploads)

Every session, in this order:

1. RECONCILE — first commit on your branch, before any handoff work. Set every handoff whose PR is merged into main to `status: closed`; set the one you are executing to `status: in-progress`; for each track (Web 01-04, Data 05-09, Infra 10, Integration 11-12) set the lowest-numbered `queued` handoff whose `depends_on` are all closed to `status: open` — exactly one open per track; rewrite the Status column of the table in handoffs/README.md to match. Commit: `chore(handoffs): reconcile status before HANDOFF-NN`.
2. L2 RESOLUTION — if the prompt contains a block fenced as `L2 RESOLUTION`, append it verbatim to handoffs/LEDGER.md beneath the ledger block of the handoff it names, then apply every instruction under its FOLDS heading. L2 (Cowork) has no write access to this repository; that block is the only channel by which verification results, answers to ledger questions and amendments to future handoffs reach you. If there is no such block, skip.
3. EXECUTE the lowest-numbered handoff with `status: open`, unless the prompt names a file — and the prompt names one whenever more than one track is open — under its §1-§6.
4. WRITE-BACK — before the PR opens: fill §7 in your own handoff and set it to `status: shipped`; append your §8 block to handoffs/LEDGER.md (append-only — never rewrite an earlier block, including L2's); add one row to handoffs/LOG.md; update the handoffs/README.md table. The PR title MUST begin `HANDOFF-NN:` — LOG.md and LEDGER.md key on the title, not the branch, because the harness names branches. Stop at **opened**.
5. ARCHIVE — save every message that steered your session to `handoffs/prompts/PROMPT-NN.md`, each verbatim under a heading naming what it is and when it arrived; one file per handoff, not one per message. The first message lands in the same commit as RECONCILE; a message that arrives mid-session is appended in the next commit (LEDGER-02 Q7).

Status flips, the README table, LEDGER appends, LOG rows and the prompt archive are the only cross-handoff edits a session makes.

## Stack
pnpm + Turbo monorepo · packages/zec-types (shared types + DTOs) · packages/content (zod schemas + research data) · packages/zebra-rpc (typed Zebra client) · apps/indexer (Node 22, Zebra RPC/ZMQ, Postgres + Redis, analysis) · apps/gateway (Fastify REST + WS) · apps/publisher (snapshot.json → file + managed Redis) · apps/web (Next.js App Router, React 19, Tailwind v4) · legacy/dashboard (v0.2, read-only).

Two Redis instances, never confused: the VPS Redis (`REDIS_URL`) carries pub/sub, `zcashreveal:mempool:live` and the anchor registry and never leaves the box; the Vercel-managed Marketplace Redis holds only `zecreveal:snapshot:*` (`SNAPSHOT_REDIS_URL` for the publisher, `SNAPSHOT_REDIS_REST_URL` + `SNAPSHOT_REDIS_REST_TOKEN` server-only in apps/web) so the public site renders even when the VPS or tunnel is down.

## Conventions
- TypeScript strict (tsconfig.base.json); ESM; `bigint` for zatoshi; heights/counts `number`; lowercase hex, no 0x; `Hex` is branded and validated at the RPC boundary.
- Pools: 'sprout' | 'sapling' | 'orchard' | 'ironwood'; generics `<P extends Pool>`; DB CHECKs mirror the union.
- Every analysis estimator is pure and emits a FilterApplication audit record {filter, params, countIn, countOut}.
- Claim levels: >1000 aggregate_only · 100–1000 broad_candidate_set · 10–100 small_heuristic_set · ≤10 requires_disclosure. Never claim identity from public data. Never render a shielded balance without a viewing key (Mode A, client-side only).
- Content: every Record claim has sources[] (≥1), confidence (high|med|low), lastVerified; unverified items live only in unverified.json.
- Labels precedence: consensus > owner filing > exchange confirmation > analyst > behaviour — always displayed.
- Env names: public `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SNAPSHOT_URL`, `NEXT_PUBLIC_DATA_MODE`; server-only `SNAPSHOT_REDIS_*`, `REDIS_URL`, `RATE_LIMIT_REDIS_URL`, `DATABASE_URL`, `ZEBRAD_*`. Secrets only via env; `.env.example` documents every variable with a one-line comment.

## Design system ("ZEC Forensic")
bg #121110 · surface #1A1816 · ink #EDE6D8 · gold #F4B728 (accent budget: primary action, active state, value-crossing-boundary) · functional blue #4C8DFF (focus/links, outside palette) · danger #E4553F (Beware severity only) · pools: transparent #3A8BD9, sprout #1F9E62, sapling #D9641E, orchard #C94F8F, ironwood #8B7FE6.
Type: Instrument Serif (display), Fraunces (numerals), JetBrains Mono (data, tabular), Manrope (prose). One hover verb: dim. One curve: cubic-bezier(.32,.72,0,1). One ceremony per surface: block arrival. Ambience seeded by the tip hash (FNV-1a → mulberry32); Math.random is banned (eslint). Reduced motion: do not construct animation systems. SVG icons only. **No emoji anywhere** — code, copy, commits, PR bodies, transcripts.

## Workflow
Branch `feat/v2-<NN>-<name>` (NN = the handoff number); small commits; `gh pr create` with a heredoc body that links the handoff; STOP before merge. Tests must pass: `pnpm -r test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @zcashreveal/content validate`.

## Handoffs directory
`handoffs/README.md` (index + kickoff line + the operator's click list) · `handoffs/HANDOFF-NN-<slug>.md` (status: open | queued | in-progress | shipped | closed) · `handoffs/LEDGER.md` (§8, append-only) · `handoffs/LOG.md` (one line per revolution). Web track 01→04, Data 05→09, Infra 10, Integration 11–12, 13 plan-only.

## Don'ts
No deterministic deanonymisation claims · no emoji · no Tailwind soup outside the token layer · no secrets in git · no destructive git/docker commands without Aqua's explicit go · no per-transaction traffic to the managed Redis · no agent sets a Vercel environment variable.
