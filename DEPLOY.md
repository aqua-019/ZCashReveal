# Deploying ZCashReveal

> **Superseded, and now historical.** This document describes the **v0.2** Vercel deployment of
> the Vite dashboard in `legacy/dashboard`. That deployment no longer exists: the operator deleted
> the `z-cash-reveal-dashboard2` project, along with the orphaned `z-cash-reveal-dashboard`, on
> 23 August 2026. `zecreveal` (Root Directory `apps/web`) is the only Vercel project on the
> account, and [docs/2.0/DEPLOY-2.0.md](docs/2.0/DEPLOY-2.0.md) is the only deployment document
> that describes something that is running.
>
> Nothing below is current. It is kept because it records what was configured and why - every
> setting in it was found by debugging rather than by reading documentation, and the pitfalls at
> the foot are still the right warnings for anyone who ever redeploys a Vite app from this
> workspace. `legacy/dashboard` still exists in the tree and still builds locally; HANDOFF-11
> retires the directory itself.

The dashboard shipped from `legacy/dashboard` (moved from `apps/dashboard` in HANDOFF-00) and was
live at `z-cash-reveal-dashboard2.vercel.app` until the project was deleted.

## Project settings (Vercel UI)

> **Superseded again, by HANDOFF-02.** The root `vercel.json` this section describes is **deleted**.
> Vercel applied it to every project in the repository regardless of Root Directory, which broke the
> first production build of `zecreveal`. HANDOFF-02 then asked the operator to move these settings
> into the dashboard project's own UI; the project was deleted instead, on 23 August 2026, so there
> is nowhere for them to go and nothing that needs them.

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
- Live: was `z-cash-reveal-dashboard2.vercel.app`; the project was deleted on 23 August 2026.

This is the last known good state of a deployment that no longer exists. It is recorded rather
than removed, because `fa4bd58` is still the commit to diff against if the Vite app is ever built
again.

## Pitfalls (do not repeat)

- Do not set Root Directory to `legacy/dashboard`. The build runs from `./` and the workspace tooling depends on it. Setting it to the subdirectory produces "dist not found" errors.
- Do not enable the Output Directory override in the UI. Same failure mode.
- Do not rely on `vercel.json`'s `env` block for Vite vars. Set them in the UI.
- ~~Delete the orphaned `z-cash-reveal-dashboard` Vercel project.~~ Done on 23 August 2026, along with `z-cash-reveal-dashboard2`. It had been triggering a failing build on every push to the repository, which is why three handoffs' worth of PRs carried a red Vercel check that had nothing to do with them.

## Vercel team

`aquatic-17b9f112`
