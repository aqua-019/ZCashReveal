---
handoff: 01
title: `apps/web` scaffold + the ZEC Forensic design system
status: queued
branch: feat/v2-01-web-scaffold
track: Web
depends_on: 00
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-01 — `apps/web` scaffold + the ZEC Forensic design system

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Scaffold `apps/web` (Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4) with the 2.0 design tokens and primitive components, a working shell (system bar, screen nav, block-height epoch clock, footer ledger), placeholder routes, and a dev-only primitives gallery. Deployable to a new Vercel project with Root Directory `apps/web`.

**Out of scope:** No real content pages (HANDOFF-03), no Tracking UI (HANDOFF-04), no API calls.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` — extract the `:root` tokens and the component classes (`sysbar`, `screens`, `block`, `block-head`, `glass`, `card`, `chip`, `conf`, `pill`, `metric`, `kv`, `ledger`/`lrow`, `tbl-wrap`, `reason`, `chain`, `subnav`, `search`, `mp`, `txt`) and the fog canvas + tide JS.
- `legacy/dashboard/src/lib/tokens.ts`, `src/index.css`, `src/components/icons.tsx`, `src/lib/formatters.ts`, `src/lib/parsers.ts` — harvest, do not import from legacy.
- `docs/2.0/mockups/reference/*.png` — the intended look with the real typefaces (1500 px wide; the HTML stays the source of truth for values; the PNGs are what `design-reviewer` compares against).
- Plan §6 (design system), DGIGA laws summarised there (restraint stack, one hover verb, one curve, one ceremony, determinism).

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- Tokens live in `apps/web/src/styles/tokens.css` exactly as the mockup defines them (bg `#121110`, surface `#1A1816`, ink `#EDE6D8`, gold `#F4B728`, blue-fn `#4C8DFF`, danger `#E4553F`, pools transparent `#3A8BD9` / sprout `#1F9E62` / sapling `#D9641E` / orchard `#C94F8F` / ironwood `#8B7FE6`, ease `cubic-bezier(.32,.72,0,1)`, durations 180/320/500 ms) and are exposed to Tailwind v4 via `@theme`.
- Fonts via `next/font`: Instrument Serif, Fraunces, JetBrains Mono, Manrope — with real fallback stacks.
- Hover grammar: siblings recede (dim); colour-only transitions; no transforms; focus ring uses `--blue-fn`.
- Ambience components accept a `seed` string (block hash) and derive all randomness via FNV-1a → mulberry32; the eslint rule from HANDOFF-00 enforces the ban on `Math.random`.
- `prefers-reduced-motion`: animation systems are not constructed (guard at construction, not amplitude).
- Env names are reserved now, wired later: public `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SNAPSHOT_URL`, `NEXT_PUBLIC_DATA_MODE`; server-only (never `NEXT_PUBLIC_`) `SNAPSHOT_REDIS_REST_URL`, `SNAPSHOT_REDIS_REST_TOKEN`, `SNAPSHOT_REDIS_URL` for the Vercel-managed Redis snapshot store (HANDOFF-09 writes it, HANDOFF-11 reads it). `apps/web/.env.example` lists all of them with one-line comments; nothing reads the `SNAPSHOT_*` names yet.

## §4 DELIVERABLES

1. `apps/web` in the workspace with turbo `build`/`dev`/`typecheck`/`lint`.
2. `src/components/ui/`: SysBar, ScreenNav, EpochClock, Block, Glass, Metric, Chip (gold/danger/ok/blue), Conf (high/med/low), Pill (exact/bounded/label/undefined), KV, Eyebrow, Quote, LedgerRow, DataTable (own `overflow-x` container), Reason, InferenceChain, SubNav, SearchBar, Tooltip (one shared, pointer-following).
3. `src/components/ambience/`: FogCanvas (seeded, idle-gated via IntersectionObserver + `document.hidden`), Tide (one ceremony per surface), Grain overlay.
4. Routes with the shell and plan-derived placeholder copy: `/`, `/beware`, `/contradictions`, `/timeline`, `/network`, `/method`, `/flows`, `/track`, `/sources`; metadata + OG image route; `/dev/primitives` (dev-only).
5. `docs/2.0/DEPLOY-2.0.md` (first version): new Vercel project `zecreveal`, Framework Next.js, Root Directory `apps/web`, env `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SNAPSHOT_URL`, `NEXT_PUBLIC_DATA_MODE`.
6. `apps/web/README.md` with the Lighthouse/axe budget (perf ≥ 95, a11y ≥ 95 on `/beware`) and how to verify reduced motion.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/web build` exits 0; `pnpm typecheck` and `pnpm lint` exit 0.
- **A2.** `apps/web/src/styles/tokens.css` defines every token listed in the contract with the exact hex values (script: grep each value; all 10 colour tokens + the curve present).
- **A3.** No file under `apps/web` contains `Math.random` (`grep -rn 'Math.random' apps/web/src` is empty) and the eslint run would flag it *(fail side: add it to a scratch component, run lint, observe the error, remove)*.
- **A4.** `/dev/primitives` renders every primitive listed in deliverables (Playwright: each `data-primitive="<Name>"` element exists).
- **A5.** With `prefers-reduced-motion: reduce` emulated (Playwright `emulateMedia`), `FogCanvas` schedules no `requestAnimationFrame` (instrument with a counter exposed on `window.__zr.rafCalls` in dev) and `Tide` adds no class over 90 s of simulated time.
- **A6.** Hover on any `ScreenNav` button changes only `color`/`background-color` of siblings — computed `transform` remains `none` (Playwright reads computed styles).
- **A7.** Every route in the deliverables list returns HTTP 200 from `next start` and contains the SysBar (`[data-ui=sysbar]`).
- **A8.** No emoji in `apps/web` (same grep as HANDOFF-00).

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- director-build: `ui-builder` (Sonnet) owns tokens, primitives, routes; `motion-designer` (Sonnet) owns FogCanvas/Tide/Grain and the reduced-motion architecture; `test-engineer` (Haiku) writes the Playwright checks for §5 after `ui-builder` returns.
- Loop 1 PREFLIGHT expected if any Haiku touches the Next.js config (unfamiliar subsystem).
- director-quality: `design-reviewer` runs the a11y pass on `/dev/primitives`; `devops-deployer` verifies the Vercel preview builds from Root Directory `apps/web`.

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
