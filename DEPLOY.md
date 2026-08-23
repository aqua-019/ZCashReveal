# Deploying ZCashReveal

> **Superseded.** This document describes the **v0.2** Vercel deployment of the parked
> Vite dashboard (`legacy/dashboard`, project `z-cash-reveal-dashboard2`). It is kept
> because that project must keep building until the 2.0 cutover. The 2.0 deployment
> (`apps/web` on the new `zecreveal` Vercel project, plus the VPS indexer/gateway) is
> specified in [docs/2.0/ZECREVEAL-2.0-PLAN.md](docs/2.0/ZECREVEAL-2.0-PLAN.md) §4 and
> delivered by [handoffs/HANDOFF-10-infra.md](handoffs/HANDOFF-10-infra.md), which
> replaces this file with `DEPLOY-2.0.md`. Do not treat anything below as current for 2.0.

The dashboard ships from `legacy/dashboard` (moved from `apps/dashboard` in HANDOFF-00) and lives at https://z-cash-reveal-dashboard2.vercel.app/. This doc captures the exact Vercel configuration that produces a clean build — every setting here was found by debugging, not by reading docs.

## Project settings (Vercel UI)

> **Superseded again, by HANDOFF-02.** The root `vercel.json` this section describes is **deleted**.
> Vercel applied it to every project in the repository regardless of Root Directory, which broke the
> first production build of `zecreveal`. These settings now have to live in the
> `z-cash-reveal-dashboard2` project's own UI settings; the exact values are in
> `docs/2.0/DEPLOY-2.0.md` section 1.

- **Root Directory:** `./` (project root, not `legacy/dashboard`)
- **Framework Preset:** Other
- **Build Command:** `pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard build` (UI override ON since HANDOFF-02)
- **Install Command:** `pnpm install --frozen-lockfile` (UI override ON since HANDOFF-02)
- **Output Directory:** `legacy/dashboard/dist` (UI override ON since HANDOFF-02)
- **Deployment Protection:** Disabled

The original pattern was to let `vercel.json` define everything and keep the UI clean. That is no
longer available: a root `vercel.json` cannot exist in this repository without breaking `apps/web`,
so the overrides are now the only place these settings can live.

## Environment variables

`VITE_MOCK_MODE=true` must be set in **Project Settings → Environment Variables** for all three scopes (Production, Preview, Development).

The `env` block in `vercel.json` does not propagate to Vite at build time. `import.meta.env.VITE_*` is inlined during `vite build`, and Vite only reads vars present in the build environment. Setting it in the UI is the only path that works. Four redeploys established this.

## Known good

- Commit: `fa4bd58`
- Deployment: `HepCvBhdED5XRXXLHo76ANfC7q9q`
- Live: https://z-cash-reveal-dashboard2.vercel.app/

If a deploy regresses, diff against `fa4bd58` first.

## Pitfalls (do not repeat)

- Do not set Root Directory to `legacy/dashboard`. The build runs from `./` and the workspace tooling depends on it. Setting it to the subdirectory produces "dist not found" errors.
- Do not enable the Output Directory override in the UI. Same failure mode.
- Do not rely on `vercel.json`'s `env` block for Vite vars. Set them in the UI.
- Delete the orphaned `z-cash-reveal-dashboard` Vercel project (singular, no `2`). It still listens to the GitHub repo and triggers a failing build on every push. The live project is `z-cash-reveal-dashboard2`.

## Vercel team

`aquatic-17b9f112`
