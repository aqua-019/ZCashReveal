# `@zcashreveal/web`

The 2.0 public site: a Next.js 15 App Router application (React 19, TypeScript strict,
Tailwind v4) carrying the "ZEC Forensic" design system. It is the front half of ZCashReveal —
the **Record** (what was found, when it was disclosed, what the marketing said) and the
**Instrument** (the live turnstile view).

## What HANDOFF-01 delivers, and what it does not

**Delivers.** The workspace app itself; the design tokens; the primitive component set; the
shell (system bar, screen nav, block-height epoch clock, footer ledger); the three ambience
components and the reduced-motion architecture; the nine public routes with plan-derived
placeholder copy; a dev-only primitives gallery; and the deployment runbook at
[`docs/2.0/DEPLOY-2.0.md`](../../docs/2.0/DEPLOY-2.0.md).

**Does not deliver.** No real content (HANDOFF-02 ships `packages/content`, HANDOFF-03 the
Record pages). No Tracking UI (HANDOFF-04). **No network calls of any kind** — the env names in
`src/lib/env.ts` are reserved and read by nothing; the first live read is HANDOFF-11. Every
number visible today is a committed fixture.

## Commands

Run from anywhere in the repo.

```bash
pnpm --filter @zcashreveal/web dev          # next dev on :3000
pnpm --filter @zcashreveal/web build        # next build (production)
pnpm --filter @zcashreveal/web start        # next start, serves the production build
pnpm --filter @zcashreveal/web typecheck    # tsc --noEmit
pnpm --filter @zcashreveal/web lint         # eslint src test scripts
pnpm --filter @zcashreveal/web test         # vitest run (unit)
pnpm --filter @zcashreveal/web test:e2e     # playwright test
pnpm --filter @zcashreveal/web check:tokens # asserts tokens.css against the contract
```

Repo-wide gates (all of these must pass before a PR opens):

```bash
pnpm -r test && pnpm typecheck && pnpm lint
./scripts/check-no-emoji.sh
```

From HANDOFF-02, `pnpm --filter @zcashreveal/content validate` joins that list. It cannot run
yet: `packages/content` does not exist, and the filter would fail with a pnpm error rather than
a gate failure, which is worse than not running it.

**The build needs network.** `next/font/google` fetches Instrument Serif, Fraunces, JetBrains
Mono and Manrope from `fonts.googleapis.com` and `fonts.gstatic.com` during `next build`, and
caches them into `.next` so nothing is fetched at runtime. A failed fetch is a hard build error,
not a fall back to the declared stacks - so CI and Vercel both need egress to those two hosts.
If that ever becomes a problem, the fix is to vendor the four families and switch to
`next/font/local`, which is the only spelling of `next/font` that is fully hermetic.

**Playwright.** The browsers are pre-installed at `/opt/pw-browsers`
(`PLAYWRIGHT_BROWSERS_PATH`) and the version is pinned to 1.56.1. **Never run
`playwright install`** — it re-downloads into the wrong prefix and takes the suite offline.

## Routes

| Idx | Route | Screen | Half |
| --- | --- | --- | --- |
| 00 | `/` | Splash | Record |
| 01 | `/beware` | Beware | Record |
| 02 | `/contradictions` | Contradictions | Record |
| 03 | `/timeline` | Timeline | Record |
| 04 | `/network` | The Network | Record |
| 05 | `/track` | Track | Instrument |
| 06 | `/method` | Method | Record |
| 07 | `/flows` | Flows | Instrument |
| 08 | `/sources` | Sources | Record |

`src/lib/nav.ts` is the single source for that table: the system bar, the route set, the page
metadata and the assertion A7 route list all read `SCREENS`, so a route cannot exist without a
nav entry or be tested without being reachable.

**`/dev/primitives`** — the primitives gallery. It exists only when `DEV_SURFACES` is true
(`src/lib/env.ts`), which means: any non-production build, or a production build where
`NEXT_PUBLIC_ENABLE_DEV_SURFACES=1` is set explicitly. The same flag gates the `window.__zr`
instrumentation described below.

That gate **fails closed**, deliberately. An earlier spelling keyed it to
`NEXT_PUBLIC_DATA_MODE === "fixture"`, and since `fixture` is also the fallback for an unset
variable, a deployment that forgot one Vercel setting would have published the gallery. No agent
is permitted to set a Vercel environment variable (CLAUDE.md), so the safe default has to live
in the code. The only place `NEXT_PUBLIC_ENABLE_DEV_SURFACES` is ever set is
`playwright.config.ts`, so assertions A4 and A5 still run against a real production build.

The Record half is **zero-motion**: nothing on `/beware`, `/contradictions`, `/timeline`,
`/network`, `/method` or `/sources` animates on its own.

## The design system, in one paragraph

Dark-committed and print-derived: ground `#121110`, surface `#1A1816`, ink `#EDE6D8`. ZEC gold
`#F4B728` is a **budget, not a decoration** — it is spent on exactly three things (the primary
action, the active state, and value crossing a pool boundary) and everything else uses ink.
Functional blue `#4C8DFF` sits deliberately outside the palette and is reserved for focus rings
and links; danger `#E4553F` is reserved for Beware severity. The five pool hues are fixed in
order: transparent `#3A8BD9`, sprout `#1F9E62`, sapling `#D9641E`, orchard `#C94F8F`, ironwood
`#8B7FE6`. Four typefaces, each with a job: Instrument Serif displays, Fraunces sets numerals,
JetBrains Mono carries tabular data, Manrope carries prose. One hover verb (siblings **dim** —
colour only, never a transform), one curve (`cubic-bezier(.32,.72,0,1)`), one ceremony per
surface (block arrival). No emoji anywhere; SVG icons only.

Source of truth, in this order:

1. [`docs/2.0/mockups/zecreveal-2.0-mockups-v2.html`](../../docs/2.0/mockups/zecreveal-2.0-mockups-v2.html)
   — the authority for **values** and component class names.
2. [`src/styles/tokens.css`](src/styles/tokens.css) — those values harvested verbatim and
   exposed to Tailwind v4 via `@theme`. `pnpm --filter @zcashreveal/web check:tokens` asserts
   every contract token against this file.
3. `docs/2.0/mockups/reference/*.png` — what it should look like with the real typefaces;
   what `design-reviewer` compares against.

Where the mockup and `docs/2.0/ZECREVEAL-2.0-PLAN.md` §6 disagree on the pool hues, the mockup
wins (it marks its set "validated, fixed order" and HANDOFF-01 §3 names those exact values).

## The budget

**Lighthouse performance >= 95 and accessibility >= 95 on `/beware`.**

Both are hard numbers, not aspirations. Measured on a **production build** and the **mobile**
preset (Lighthouse's default), which is the slower of the two and therefore the honest one.

**Measured at HANDOFF-01: performance 99, accessibility 100** (Lighthouse 12, mobile,
simulated throttling; FCP 0.8 s, LCP 1.9 s, TBT 80 ms, CLS 0.005). Two changes were needed to
get there and both are load-bearing, so do not undo them casually:

- **Only Manrope is preloaded** (`src/app/layout.tsx`). It carries the body copy and is the LCP
  element on every Record page. Preloading all four families put 213 KiB of font requests in
  front of it and held LCP at 3.0 s; dropping the other three to `preload: false` moved it to
  1.9 s. They still load immediately from the same origin - they simply stop competing for the
  first round of bandwidth. The cost is CLS 0.005, which is a twentieth of the 0.1 threshold.
- **The system bar does not prefetch** (`src/components/ui/ScreenNav.tsx`). Nine links on every
  page meant eight RSC payloads fetched on every load.

Accessibility reached 100 by fixing three real defects rather than by tuning: `--ink-mute` and
`--ink-faint` were 4.04:1 and 2.10:1 against the ground and are used for body-size text, the
Track search field had `outline: none` and so no focus indicator at all, and the exploit ledger
used ARIA list roles on elements that cannot carry them. See the HANDOFF-01 ledger block.

`/beware` is the budget page because it is the densest zero-motion Record surface: the most
DOM, the most tabular data, the most severity chips, and no ambience to hide behind. If
`/beware` holds the number, the rest of the Record holds it. The Instrument surfaces (`/track`,
`/flows`) are measured separately once they carry real behaviour in HANDOFF-04.

Measure it like this:

```bash
pnpm --filter @zcashreveal/web build
pnpm --filter @zcashreveal/web start &          # serves :3000

npx lighthouse http://localhost:3000/beware \
  --only-categories=performance,accessibility \
  --chrome-flags="--headless=new" \
  --output=json --output-path=./lh-beware.json
```

Do **not** pass `--preset=desktop`. Desktop scores flatter and are not the budget. The default
form factor is mobile with mobile throttling, and that is what the numbers above refer to.

Read the two scores out of the report:

```bash
node -e 'const r=require("./lh-beware.json");for(const k of["performance","accessibility"])console.log(k,Math.round(r.categories[k].score*100))'
```

Run it three times and take the median; a single cold run on a loaded machine is noise.

This is **not wired into CI in this handoff.** It is a manual gate the reviewer runs before the
PR is approved. Automating it is a later handoff's work.

Accessibility also gets an axe pass over `/dev/primitives` from `design-reviewer`; the
Lighthouse a11y score is the floor, not the whole check.

## How to verify reduced motion

The claim under test is architectural (see the next section), so verifying it means reading what
the components *report*, not watching the screen. Follow this exactly.

**Preconditions.** `window.__zr` exists only when `DEV_SURFACES` is true — that is, in
`next dev`, or in a production build started with `NEXT_PUBLIC_ENABLE_DEV_SURFACES=1`. If
`window.__zr` is `undefined`, you are on a snapshot build and this procedure cannot run; restart
with `NEXT_PUBLIC_ENABLE_DEV_SURFACES=1`.

1. **Emulate the preference and read the report.**
   Open DevTools, then the **Rendering** panel (Command Palette: "Show Rendering"). Set
   **Emulate CSS media feature `prefers-reduced-motion`** to **`reduce`**. Reload `/`. In the
   console:

   ```js
   window.__zr
   ```

   Expect `rafCalls === 0` and `refused.FogCanvas` set to `"prefers-reduced-motion: reduce"`.
   `constructed` must not contain `"FogCanvas"` or `"Tide"`.

2. **Confirm the ceremony never fires.** Leave the page for **90 seconds** (longer than the
   75 s tide period) and confirm the element with class `tide` never gains the class `on`:

   ```js
   document.querySelector(".tide").className   // stays "tide", never "tide on"
   window.__zr.tidePulses                      // stays 0
   ```

3. **Prove the check can fail — the fail-state half.** Turn the emulation **off**, reload, and
   read `window.__zr` again. `rafCalls` must now climb on repeated reads and `constructed` must
   contain `"FogCanvas"`. A check that cannot distinguish the two states is not a check; step 3
   is what makes steps 1 and 2 evidence.

4. **The automated form.** All of the above is assertion A5:

   ```bash
   pnpm --filter @zcashreveal/web test:e2e
   ```

   Playwright emulates the media feature, reads `window.__zr`, and fast-forwards the clock past
   one tide period.

## Architecture, not amplitude

Reduced motion here means **the animation system is never constructed** — not that it runs with
its amplitude damped to zero. A loop spinning at zero amplitude still schedules frames, still
wakes the CPU, and still costs battery on the machine of the person who asked for less motion.
It also looks identical from the outside, which is exactly why the components self-report.

Enforced at two places, both an early return before any loop is built:

- [`src/components/ambience/FogCanvas.tsx`](src/components/ambience/FogCanvas.tsx) — the
  `prefers-reduced-motion` branch returns before any `requestAnimationFrame`, before the
  `IntersectionObserver`, and before the resize listener. One static frame is painted ahead of
  the branch so the surface keeps its texture; the branch then calls
  `noteRefused("FogCanvas", ...)` and stops.
- [`src/components/ambience/Tide.tsx`](src/components/ambience/Tide.tsx) — the interval is never
  created, so the `.on` class can never be applied. The ceremony does not exist rather than
  existing at zero amplitude.

[`src/lib/diagnostics.ts`](src/lib/diagnostics.ts) holds the reporting surface (`rafCalls`,
`tidePulses`, `constructed[]`, `refused{}`). It installs nothing on `window` unless
`DEV_SURFACES` is true, so a deployed build carries no instrumentation at all.

## Determinism: `Math.random` is banned

`Math.random` is forbidden across the repo and the ban is enforced by eslint
(`no-restricted-properties`), not by convention. Two reasons: a forensic instrument whose
ambience differs per visitor cannot be cited, and a non-deterministic render cannot be
diff-reviewed.

The sanctioned replacement is [`src/lib/seed.ts`](src/lib/seed.ts): FNV-1a hashes a chain seed
(the tip block hash) into a 32-bit integer, `mulberry32` turns that into a PRNG, and
`seededRng(seed, namespace)` gives each consumer an independent stream from the same seed. Every
ambience component takes a `seed` string and derives all randomness from it, so the same block
hash produces the same field for every visitor, forever.

If you need a random number, take a seed.
