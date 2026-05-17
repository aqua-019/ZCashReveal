# Deploying ZCashReveal

The dashboard ships from `apps/dashboard` and lives at https://z-cash-reveal-dashboard2.vercel.app/. This doc captures the exact Vercel configuration that produces a clean build — every setting here was found by debugging, not by reading docs.

## Project settings (Vercel UI)

- **Root Directory:** `./` (project root, not `apps/dashboard`)
- **Framework Preset:** Other
- **Build Command:** unset (UI override OFF — `vercel.json` drives it)
- **Install Command:** unset (UI override OFF)
- **Output Directory:** unset (UI override OFF)
- **Deployment Protection:** Disabled

The pattern: let `vercel.json` define everything, keep the UI clean. Toggling any override on top of `vercel.json` reintroduces the "dist not found" failures we already debugged.

## Environment variables

`VITE_MOCK_MODE=true` must be set in **Project Settings → Environment Variables** for all three scopes (Production, Preview, Development).

The `env` block in `vercel.json` does not propagate to Vite at build time. `import.meta.env.VITE_*` is inlined during `vite build`, and Vite only reads vars present in the build environment. Setting it in the UI is the only path that works. Four redeploys established this.

## Known good

- Commit: `fa4bd58`
- Deployment: `HepCvBhdED5XRXXLHo76ANfC7q9q`
- Live: https://z-cash-reveal-dashboard2.vercel.app/

If a deploy regresses, diff against `fa4bd58` first.

## Pitfalls (do not repeat)

- Do not set Root Directory to `apps/dashboard`. The build runs from `./` and the workspace tooling depends on it. Setting it to the subdirectory produces "dist not found" errors.
- Do not enable the Output Directory override in the UI. Same failure mode.
- Do not rely on `vercel.json`'s `env` block for Vite vars. Set them in the UI.
- Delete the orphaned `z-cash-reveal-dashboard` Vercel project (singular, no `2`). It still listens to the GitHub repo and triggers a failing build on every push. The live project is `z-cash-reveal-dashboard2`.

## Vercel team

`aquatic-17b9f112`
