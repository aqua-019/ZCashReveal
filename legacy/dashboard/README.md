# legacy/dashboard — the parked v0.2 SPA

Status: **frozen, read-only, one release only.** Moved here from `apps/dashboard` by
[handoffs/HANDOFF-00-housekeeping.md](../../handoffs/HANDOFF-00-housekeeping.md). Nothing in
this directory is part of the 2.0 build.

## Why it still exists

Two reasons, both temporary:

1. **It is still the live deployment.** The Vercel project `z-cash-reveal-dashboard2` builds
   from this path and stays up in mock mode until the 2.0 cutover in
   [handoffs/HANDOFF-11-live-wiring.md](../../handoffs/HANDOFF-11-live-wiring.md). It used to be
   driven by the root `vercel.json`; HANDOFF-02 deleted that file, because Vercel applied it to
   every project in the repository and broke `apps/web`'s first production build. The build
   command and output directory now have to be set in that project's own UI settings, and the
   exact values are in [docs/2.0/DEPLOY-2.0.md](../../docs/2.0/DEPLOY-2.0.md) section 1. Until an
   operator types them in, this project fails to build.
2. **It is a harvest source.** `docs/2.0/ZECREVEAL-2.0-PLAN.md` §2 marks this app
   **REBUILD (harvest)**: `src/lib/tokens.ts`, `formatters.ts`, `parsers.ts`,
   `components/icons.tsx` and the panel logic (`CandidatesPanel` inference chain,
   `BoundaryFlowPanel`, `PoolStatePanel`) are ported into `apps/web` as React islands by
   [handoffs/HANDOFF-01-web-scaffold.md](../../handoffs/HANDOFF-01-web-scaffold.md) and
   [handoffs/HANDOFF-04-tracking-ui.md](../../handoffs/HANDOFF-04-tracking-ui.md). The SPA
   shell, the routing and the empty-state behaviour do not carry over.

Once `apps/web` is promoted to production, this directory is deleted (plan §10). The root
`vercel.json` that used to go with it is already gone, deleted by HANDOFF-02.

## Rules while it is parked

- Do not add features here. Fixes only if the live v0.2 deploy breaks.
- It is **not** held to the 2.0 conventions: the ZEC Forensic design system, the four-pool
  `Pool` union and the no-emoji/SVG-only rules apply to `apps/web`, not to this snapshot.
  `legacy/` is excluded from the repository-wide emoji scan for that reason.
- It has no `lint` or `test` script on purpose, so `pnpm lint` and `pnpm -r test` do not
  gate 2.0 work on frozen v0.2 code.
- It stays in the pnpm workspace (`pnpm-workspace.yaml` carries a `legacy/*` glob) so
  `pnpm --filter @zcashreveal/dashboard build` keeps working from the new path.

## Build it from the new path

```
pnpm --filter @zcashreveal/types build
pnpm --filter @zcashreveal/dashboard build
```

Output lands in `legacy/dashboard/dist`. Deployment settings for the surviving v0.2 project
are in the (superseded) root [DEPLOY.md](../../DEPLOY.md).
