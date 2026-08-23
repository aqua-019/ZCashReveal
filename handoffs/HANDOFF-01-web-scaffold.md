---
handoff: 01
title: `apps/web` scaffold + the ZEC Forensic design system
status: shipped
branch: the session-designated branch (name it `feat/v2-01-web-scaffold` if you may choose)
track: Web
depends_on: 00 (closed)
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
7. One-line correction in `docs/2.0/ZECREVEAL-2.0-PLAN.md` §10: the stale branch count is 20 `claude/*` (19 merged, 1 not) + 2 merged `feat/*`, not 22 — `docs/2.0/BRANCH-CLEANUP.md` is generated from live git and is authoritative (LEDGER-00 Q3).

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

- **A1.** `pnpm --filter @zcashreveal/web build` exits 0; `pnpm typecheck` and `pnpm lint` exit 0.
- **A2.** `apps/web/src/styles/tokens.css` defines every token listed in the contract with the exact hex values (script: grep each value; all 10 colour tokens + the curve present).
- **A3.** No file under `apps/web` contains `Math.random` (`grep -rn 'Math.random' apps/web/src` is empty) and the eslint run would flag it *(fail side: add it to a scratch component, run lint, observe the error, remove)*.
- **A4.** `/dev/primitives` renders every primitive listed in deliverables (Playwright: each `data-primitive="<Name>"` element exists).
- **A5.** With `prefers-reduced-motion: reduce` emulated (Playwright `emulateMedia`), `FogCanvas` schedules no `requestAnimationFrame` (instrument with a counter exposed on `window.__zr.rafCalls` in dev) and `Tide` adds no class over 90 s of simulated time.
- **A6.** Hover on any `ScreenNav` button changes only `color`/`background-color` of siblings — computed `transform` remains `none` (Playwright reads computed styles).
- **A7.** Every route in the deliverables list returns HTTP 200 from `next start` and contains the SysBar (`[data-ui=sysbar]`).
- **A8.** `./scripts/check-no-emoji.sh` exits 0 (the scanner HANDOFF-00 shipped). The raw `grep -rP '[\x{1F300}-...]'` written into HANDOFF-00 §5 is a false-negative generator on GNU grep and must not be reused in any handoff.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- director-build: `ui-builder` (Sonnet) owns tokens, primitives, routes; `motion-designer` (Sonnet) owns FogCanvas/Tide/Grain and the reduced-motion architecture; `test-engineer` (Haiku) writes the Playwright checks for §5 after `ui-builder` returns.
- Loop 1 PREFLIGHT expected if any Haiku touches the Next.js config (unfamiliar subsystem).
- director-quality: `design-reviewer` runs the a11y pass on `/dev/primitives`; `devops-deployer` verifies the Vercel preview builds from Root Directory `apps/web`.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: DONE-WITH-ASSUMPTIONS

BRANCH / PR: claude/aqua-v4-handoff-setup-94hbvt (harness-designated; LEDGER-00 Q1 released the
  front-matter branch name). PR title begins "HANDOFF-01:" per the revolution protocol.
  Commits: 7c6086c reconcile + L2 write-back · dd2395a scaffold · 34851cb tests + docs ·
  9b796a7 gitignore · bc7267a playwright server reuse · 0d9431d gate + review round 1 ·
  befead7 review round 2.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  Spawn mode ENABLED, proven before any planning by a Haiku subagent returning "SPAWN-OK"
  (Agent tool, general-purpose, 0 tool uses).
  director-build  -> docs-scribe · test-engineer:unit · test-engineer:e2e   (3 workers, parallel,
                     disjoint file sets; Workflow run wf_b6e54b42-b28)
  director-quality -> spec-conformance · design-reviewer · a11y-reviewer · adversarial-critic
                     (4 workers, parallel, read-only; Workflow run wf_bfafa5f1-fa9)
  Subagents did not nest. The lead wrote the token layer, the primitives, the ambience, the shell
  and the routes directly: those are one design language and do not survive being split.

FILES (created / modified / moved):
  Created, apps/web (69 files): package.json · tsconfig.json · next.config.ts ·
    postcss.config.mjs · vercel.json · vitest.config.ts · playwright.config.ts · next-env.d.ts ·
    .env.example · README.md · scripts/check-tokens.mjs ·
    src/styles/tokens.css · src/app/{globals.css,layout.tsx,page.tsx,not-found.tsx,
    opengraph-image.tsx} · src/app/{beware,contradictions,timeline,network,method,flows,track,
    sources,dev/primitives}/page.tsx ·
    src/components/ui/ (19 primitives) · src/components/ambience/{FogCanvas,Tide,Grain}.tsx ·
    src/components/shell/{Shell,SysBar via ui,FooterLedger,RecordHead,Pending}.tsx ·
    src/components/icons.tsx · src/lib/{seed,format,nav,env,chain,diagnostics}.ts ·
    test/unit/ (5 suites, 96 tests) · test/e2e/ (5 suites, 19 tests)
  Created, elsewhere: docs/2.0/DEPLOY-2.0.md · handoffs/prompts/PROMPT-01.md
  Modified: CLAUDE.md (revolution protocol) · turbo.json · eslint.config.js · .gitignore ·
    scripts/check-no-emoji.sh · .github/workflows/ci.yml · pnpm-lock.yaml ·
    docs/2.0/ZECREVEAL-2.0-PLAN.md (one line, §10) · handoffs/ (status flips, folds, LEDGER,
    LOG, README)
  Moved: none.

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED)

  A1  build + typecheck + lint all exit 0.
      PASS (Executed): `pnpm --filter @zcashreveal/web build` rc=0, 14 static pages;
        `pnpm typecheck` "Tasks: 6 successful, 6 total" rc=0; `pnpm lint` "1 problem (0 errors,
        1 warning)" rc=0 - the warning is the pre-existing indexer one HANDOFF-00 recorded.
      FAIL (Executed): appended `export const BROKEN: number = "not a number";` to
        src/lib/nav.ts -> `src/lib/nav.ts(114,14): error TS2322: Type 'string' is not assignable
        to type 'number'.` rc=2. Reverted; rc=0 again.

  A2  tokens.css defines every contracted token with the exact value.
      PASS (Executed): `pnpm --filter @zcashreveal/web check:tokens` printed 15 ok lines -
        the ten colours, the curve and the three durations - and "OK - 15 tokens present with
        the contracted values", rc=0.
      FAIL (Executed): changed --gold to #ffcc00 -> "FAIL - 1 of 15 token(s) wrong or absent",
        rc=1. Restored; git diff empty.
      NOTE: the script holds the contract's own spelling of the curve, `cubic-bezier(.32,.72,0,1)`,
        and normalises whitespace and leading zeros before comparing. Restating it in the file's
        prettier formatting would have made the check unable to detect the drift it exists for.

  A3  no Math.random under apps/web/src, and eslint would flag it.
      PASS (Executed): `grep -rn 'Math.random' apps/web/src` rc=1, no output.
      FAIL (Executed): wrote a scratch probe calling it -> eslint rc=1, "error 'Math.random' is
        restricted from being used ... no-restricted-properties"; grep rc=0. Both reverted.
      CORRECTED: two comments in seed.ts and FogCanvas.tsx originally spelled the banned symbol
        while explaining the ban, so the literal grep was non-empty. Reworded, because the
        assertion is written as a raw grep and a spec that only passes under a charitable reading
        is a spec nobody can run.

  A4  /dev/primitives renders every primitive.
      PASS (Executed): `pnpm test:e2e test/e2e/primitives.spec.ts`, 4 tests - all 22
        data-primitive names, the four Chip tones, the three Conf levels and the four Pill kinds.
      FAIL (Executed): removed <Quote> from the gallery -> "no [data-primitive="Quote"] on
        /dev/primitives", 1 failed / 3 passed. Restored.
      NOTE: the first attempt at this fail transcript PASSED, which was itself the finding.
        `reuseExistingServer: !CI` let the run answer from a previous build, so the suite was
        measuring code that was not on disk. Now `reuseExistingServer: false` and the command
        clears .next first, because NEXT_PUBLIC_* values are inlined at build time.

  A5  under prefers-reduced-motion, FogCanvas schedules no rAF and Tide adds no class in 90 s.
      PASS (Executed): reduced-motion.spec.ts describe 1 - window.__zr.rafCalls === 0,
        constructed === [], refused.FogCanvas set, and after page.clock.fastForward(90_000) the
        .tide element has no "on" class and tidePulses === 0.
      FAIL (Executed): describe 2 in the same file, reducedMotion "no-preference" - rafCalls > 0
        and tidePulses >= 1 and the class does appear. This is a permanent second polarity rather
        than a one-off: without it, "rafCalls === 0" would also be satisfied by a page that
        failed to hydrate.

  A6  hovering ScreenNav changes only colour on siblings; computed transform stays none.
      PASS (Executed): hover-grammar.spec.ts - every link's transform is "none" before and during
        hover, and a sibling's computed colour changes, so the pass is not vacuous.
      FAIL (Executed): added `transform: translateY(-1px)` to .screens a:hover ->
        "ScreenNav link 0 carries a transform while link 0 is hovered. Expected: "none"
        Received: "matrix(1, 0, 0, 1, 0, -1)"". Reverted.
      Also (Executed): zero geometric transforms in the whole tree -
        `grep -nE '(^|[^-])\btransform\s*:' globals.css | grep -v text-transform` is empty, and
        translate/scale/rotate appear nowhere under apps/web/src.

  A7  every route returns 200 from next start and contains the SysBar.
      PASS (Executed): routes.spec.ts, 10 tests - the nine public routes each 200 with
        [data-ui=sysbar], one h1 and a non-empty title, plus /dev/primitives under the opt-in.
      FAIL (Executed): removed data-ui="sysbar" from SysBar -> all nine failed with
        "<route> rendered without the system bar". Reverted.

  A8  ./scripts/check-no-emoji.sh exits 0.
      PASS (Executed): "OK - no emoji in *.md, *.ts, *.tsx, *.yml, *.css, *.mjs, *.js", rc=0.
      FAIL (Executed): planted U+1F680 in apps/web/src/lib -> "FAIL - emoji found", rc=1,
        naming the file and line. Removed; rc=0.
      EXTENDED: the scanner did not look at css, mjs, cjs or js. HANDOFF-01 is the first tree
        with user-visible copy in those types (CSS carries content strings through ::before), so
        the include list was widened and .next excluded.

  Deliverable 6 budget (Executed, Lighthouse 12, production build, mobile preset, simulated
  throttling, on /beware): performance 99, accessibility 100, zero failing accessibility audits.
  FCP 0.8 s · LCP 1.9 s · TBT 80 ms · CLS 0.005. Both budget floors are >= 95.
  Starting point before the quality round was performance 93 and accessibility 95 with two
  failing audits; what moved them is recorded in apps/web/README.md, not just here.

  Full gate, final state (Executed): pnpm -r test - web 96 passed, gateway 7 passed, indexer
  133 passed / 38 skipped (Postgres-gated, no database in this environment; unchanged by this
  handoff). pnpm typecheck 6/6. pnpm lint 0 errors. pnpm install --frozen-lockfile rc=0.
  Playwright 19 passed.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):
  1. CORRECTED - the dev-surface gate. First spelling keyed /dev/primitives to
     NEXT_PUBLIC_DATA_MODE === "fixture", and "fixture" is also the fallback for an unset
     variable, so a deployment that forgot one Vercel setting would have published the gallery.
     CLAUDE.md forbids an agent from setting a Vercel variable, so nothing here could have
     corrected it. Now NODE_ENV !== "production" || NEXT_PUBLIC_ENABLE_DEV_SURFACES === "1".
     Verified on a clean production build with no environment set at all: / 200,
     /dev/primitives 404, __zr absent from the HTML.
  2. CORRECTED - --ink-mute and --ink-faint. The mockup's values are 4.04:1 and 2.10:1 against
     the ground and are used for real text at 9.5-12px, so neither cleared WCAG AA. Raised to
     #8f8576 and #6a6157, with --ink-faint retired from text. This diverges from the mockup
     :root, which is a §8 question for L2 rather than a silent edit.
  3. CORRECTED - FIXTURE_TIP.hash was 65 hex characters, harvested verbatim from the mockup,
     which carries the same typo. A block hash is 32 bytes. Corrected to 64 and pinned by a
     unit test.
  4. CORRECTED - seedLabel elided the raw hash and so rendered "0000...c21e" for the fixture
     and "0000..." for every block that will ever exist. Strips the proof-of-work zero run
     first; now "5f3a...c21e", which is what the mockup and the reference PNG show.
  5. ACCEPTED - Next.js 15.5.23, not 16. §1 says "Next.js 15"; the plan says "15+". 15 is the
     literal reading and the lower-risk one.
  6. ACCEPTED - branch names in the front matter of 02-13 were derived from each file's own
     slug (HANDOFF-02-content-package -> feat/v2-02-content-package), which differs from the
     README's earlier feat/v2-02-content for three files. The field is advisory now, so the
     deterministic rule was preferred.
  7. ACCEPTED - the assertion suite runs against a production build with
     NEXT_PUBLIC_ENABLE_DEV_SURFACES=1 rather than next dev, so A4-A7 measure shipped output.
  8. DEFERRED - the Playwright suite is not wired into CI (browser download). The vitest suite
     now is. See §8.
  9. DEFERRED - next/font/google makes the build non-hermetic. Documented in the README and
     DEPLOY-2.0.md; the hermetic alternative is next/font/local with the families vendored.

NOTICED (outside scope, not acted on):
  - docs/2.0/ZECREVEAL-2.0-PLAN.md still says 22 stale branches in two more places, lines 14 and
    126. Deliverable 7 authorised one line in §10 and that is all that was changed.
  - Root DEPLOY.md says HANDOFF-10 creates DEPLOY-2.0.md; HANDOFF-01 deliverable 5 did.
  - Root .env.example has no SNAPSHOT_* names and still carries the v0.2 VITE_* block.
  - Root vercel.json still points the repo at legacy/dashboard. It should not affect a project
    whose Root Directory is apps/web, and apps/web/vercel.json now pins the preset regardless;
    plan §10 retires the root file at the HANDOFF-11 cutover.
  - /dev/primitives, when gated off, returns Next's bare error shell rather than the styled 404
    (an unmatched route like /nope gets the good one). Harmless while the route is 404 by
    design; noted so nobody mistakes it for a rendering bug.
  - The mockup's .mp and .txt tracking-table classes were not ported; they belong to HANDOFF-04.

UNVERIFIED (labelled):
  - Everything in DEPLOY-2.0.md about Vercel UI behaviour. The zecreveal project does not exist
    yet, so no setting, no build log and no environment scope was observed.
  - That Vercel resolves vercel.json relative to the Root Directory. Documented as a first-build
    check; apps/web/vercel.json makes the outcome the same either way.
  - Lighthouse numbers are from this container. They are directionally right and the changes
    behind them are real, but a Vercel deployment will differ.
  - The reference PNGs were compared by eye against the built pages, not pixel-diffed.

GATE ROUNDS: 2 (of 3 permitted)
  Round 1 - fingerprints: src/lib/env.ts · dev-surface gate fails open · blocker;
    components/ui/LedgerRow.tsx · aria-required-children · should-fix;
    app/dev/primitives/page.tsx · shell singletons remounted (SysBar, Tide, Grain) · should-fix;
    lib/seed.ts · seedLabel elides the zero run · should-fix;
    lib/chain.ts · 65-character hash · should-fix;
    ambience/FogCanvas.tsx · schedules while idle, contradicting its own docstring · should-fix;
    scripts/check-tokens.mjs · curve restated, not compared · nit;
    README.md · unrunnable gate listed · nit.
  Round 2 - fingerprints: app/page.tsx · pool bar collapses to 2px slivers · blocker;
    app/globals.css · .fair applied and undefined · blocker;
    styles/tokens.css · --ink-mute 4.04:1 and --ink-faint 2.10:1 on body text · blocker;
    app/globals.css · .search input outline:none removes the focus ring · blocker;
    components/ui/Tooltip.tsx · data-tip and title give two popups · should-fix;
    components/ui/LedgerRow.tsx · two columns and the source column dropped · should-fix;
    app/globals.css · hide-m deletes the ledger dates below 1000px · should-fix;
    .github/workflows/ci.yml · no step runs apps/web tests · should-fix;
    turbo.json · caches .next/cache, does not hash tsconfig.base.json · should-fix;
    next.config.ts · percent-encoded pathname · nit.
  Converged. No third round required.

PREVIEW URL (if any): none, and none is expected. The Vercel project `zecreveal` does not exist
  until the operator creates it after this PR opens (docs/2.0/DEPLOY-2.0.md §0). The red
  z-cash-reveal-dashboard check on this PR is the orphan project L2 confirmed pre-existing on
  main at commit 30b2a35; it is caused by no PR and is on the operator's click list.
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
