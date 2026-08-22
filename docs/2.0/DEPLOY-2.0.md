# DEPLOY-2.0 — the `zecreveal` Vercel project

> **Scope of this version.** HANDOFF-01 writes the front-end half: the new Vercel project for
> `apps/web`, its build settings, and its environment variables. HANDOFF-10 extends this same
> file with the VPS half — zebrad, the indexer, the gateway, Postgres, the VPS Redis and the
> Cloudflare tunnel that terminates `wss://`. Until HANDOFF-10 lands, treat everything about the
> origin server as unspecified here.
>
> The v0.2 document [`DEPLOY.md`](../../DEPLOY.md) at the repo root still governs the parked
> Vite dashboard (`legacy/dashboard`, project `z-cash-reveal-dashboard2`). It is superseded for
> 2.0, not deleted: that project must keep building until the HANDOFF-11 cutover.

---

## 0. State at HANDOFF-01 — read this before hunting for a preview URL

**The `zecreveal` project does not exist yet.** HANDOFF-01 opens a PR; the operator creates the
project after that PR is open, using the click list below. Therefore:

- The absence of a Vercel preview deployment on the HANDOFF-01 PR is **expected**, not a failure.
- No agent creates the project, and no agent can. Project creation, environment variables and
  production promotion are operator clicks (see section 6).
- The red check that does appear on the PR comes from an orphaned project, not from this work.
  See section 7.

---

## 1. Create the project

| Setting | Value |
| --- | --- |
| Team | `aquatic-17b9f112` |
| Project name | `zecreveal` |
| Git repository | the existing `ZCashReveal` GitHub repo (same repo, second project) |
| Framework Preset | **Next.js** |
| Root Directory | **`apps/web`** |
| Include Source Files Outside of the Root Directory in the Build Step | **ON** |
| Install Command | **leave default** (override OFF) |
| Build Command | **leave default** (override OFF) |
| Output Directory | **leave default** (override OFF) |
| Node.js Version | **22.x** |

Why each of those is what it is:

- **Root Directory `apps/web`.** This is a pnpm workspace monorepo. The project builds one app,
  not the repo.
- **Include Source Files Outside of the Root Directory: ON.** Required. With it off, Vercel
  uploads only `apps/web` and the build fails the moment `apps/web` resolves a workspace
  dependency or the root `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `tsconfig.base.json`.
  HANDOFF-01's `apps/web` has no workspace deps yet, but `packages/content` arrives in
  HANDOFF-02 and `packages/zec-types` in HANDOFF-04. Turn it on now.
- **Install Command default.** Vercel detects pnpm from the root `pnpm-lock.yaml` and runs the
  workspace install itself. Do not paste a hand-written `pnpm install` here; the v0.2 project
  lost four redeploys to UI overrides fighting a config file.
- **Build Command default.** The Next.js preset runs `next build` inside `apps/web`.
- **Output default (`.next`).** Never set an Output Directory override on a Next.js project.
- **Node 22.** The repo's `.nvmrc` pins `22`; `apps/web` is written against Node 22 and
  `@types/node@^22`.

### Caution: the repo-root `vercel.json`

`/vercel.json` at the repo root belongs to the **legacy dashboard** project — it hard-codes
`outputDirectory: legacy/dashboard/dist` and a Vite build command. With Root Directory set to
`apps/web`, Vercel reads project configuration from `apps/web`, so that file is not expected to
apply to `zecreveal`. Confirm it on the first build anyway: the build log's install and build
steps must read as pnpm install plus `next build`, **not** as the dashboard's Vite build. If the
root file does leak in, the fix is an explicit `apps/web/vercel.json`, and that is a code change
in a handoff, not a UI override.

The root `.vercelignore` is likewise a v0.2 artefact (it excludes `apps/indexer`, `apps/gateway`,
`infra`). It is harmless for `zecreveal` but is not doing any work for it either.

---

## 2. Environment variables — public (`NEXT_PUBLIC_*`)

Everything with a `NEXT_PUBLIC_` prefix is **compiled into the client bundle and is public**.
Nothing secret is ever given that prefix. `apps/web/src/lib/env.ts` is the single reader.

| Variable | What it is for | Production | Preview | Development |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Gateway REST base, e.g. `https://api.example/`. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-05/11 | leave blank | blank or a local gateway |
| `NEXT_PUBLIC_WS_URL` | Gateway WebSocket, `wss://<tunnel>/stream`. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-11 | leave blank | blank or `ws://localhost:8080/stream` |
| `NEXT_PUBLIC_SNAPSHOT_URL` | Published snapshot document URL. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-09 | leave blank | blank |
| `NEXT_PUBLIC_DATA_MODE` | `fixture` \| `snapshot` \| `live`. Selects the data source and gates the dev-only surfaces. | **`snapshot`** | **`snapshot`** | `fixture` |

### `NEXT_PUBLIC_DATA_MODE` is a security setting, not only a data setting

`apps/web/src/lib/env.ts` derives `DEV_SURFACES` as `NODE_ENV === "development" || DATA_MODE === "fixture"`,
and `DEV_SURFACES` is what gates `/dev/primitives` and the `window.__zr` instrumentation.

**Leaving `NEXT_PUBLIC_DATA_MODE` at `fixture` on a deployed environment leaves `/dev/primitives`
publicly reachable.** Set it to `snapshot` in Production **and** in Preview. An unset variable
falls back to `fixture` in code, so "not set" is the same mistake as "set to fixture".

Until HANDOFF-09 publishes a snapshot there is nothing for `snapshot` mode to read; the pages
render their committed placeholder state either way. Set it to `snapshot` now regardless — the
gate matters before the data does.

---

## 3. Environment variables — SERVER-ONLY (never `NEXT_PUBLIC_`)

These arrive with HANDOFF-09 (the publisher writes) and HANDOFF-11 (`apps/web` reads).
**Nothing in `apps/web` reads any of them today.** They are listed so the names are reserved and
so nobody invents a `NEXT_PUBLIC_` alias for them later.

| Variable | Read by | Set on Vercel? |
| --- | --- | --- |
| `SNAPSHOT_REDIS_REST_URL` | `apps/web`, server-side only (RSC / route handlers) | Yes, from HANDOFF-11: Production and Preview |
| `SNAPSHOT_REDIS_REST_TOKEN` | `apps/web`, server-side only | Yes, from HANDOFF-11: Production and Preview |
| `SNAPSHOT_REDIS_URL` | `apps/publisher`, running on the VPS | **No.** This one is never set on Vercel. |

If the Marketplace Redis integration is added through the Vercel dashboard it may inject its own
variable names. Map them onto the three names above rather than teaching the code a second
spelling, and never accept an injected name that carries a `NEXT_PUBLIC_` prefix.

### The two Redis instances, which are never the same instance

- **VPS Redis (`REDIS_URL`)** is the hot path: pub/sub, `zcashreveal:mempool:live`, the anchor
  registry. It is per-transaction traffic and it **never leaves the box**. It is not reachable
  from Vercel and no Vercel variable points at it.
- **Vercel-managed Marketplace Redis** holds exactly one thing: `zecreveal:snapshot:*`. The
  publisher on the VPS writes it over the REST endpoint on a slow cadence; `apps/web` reads it
  server-side so the public site still renders when the VPS or the tunnel is down.

No per-transaction traffic ever touches the managed Redis. If a design needs that, the design is
wrong.

---

## 4. Deployment protection

Leave Preview deployments protected by the team default. Production is public.

---

## 5. Verification checklist — run after the first deploy

1. **`/` returns 200.**
   `curl -sS -o /dev/null -w '%{http_code}\n' https://<deployment>/` prints `200`.
2. **The system bar renders.** Load `/` in a browser: the `00 SYSTEM` bar is present at the top.
   Machine form: the HTML contains `data-ui="sysbar"`.
   `curl -sS https://<deployment>/ | grep -c 'data-ui="sysbar"'` prints a non-zero count.
3. **`/dev/primitives` returns 404** when `NEXT_PUBLIC_DATA_MODE` is not `fixture`.
   `curl -sS -o /dev/null -w '%{http_code}\n' https://<deployment>/dev/primitives` prints `404`.
   If it prints `200`, `NEXT_PUBLIC_DATA_MODE` is unset or is `fixture` for that environment.
   Fix the variable and redeploy; a rebuild is required because the value is inlined at build time.
4. **Every public route returns 200.** `/` `/beware` `/contradictions` `/timeline` `/network`
   `/track` `/method` `/flows` `/sources`.
5. **The build log shows `next build`,** not a Vite build (see the caution in section 1).

---

## 6. What an agent must never do

- **No agent sets a Vercel environment variable.** Not through the dashboard, not through the
  CLI, not through an MCP tool. Every variable in sections 2 and 3 is typed by the operator.
- **No agent merges, deploys, or promotes.** Every PR stops at *opened*. Production promotion is
  a human click, always.
- No agent creates, renames, pauses or deletes a Vercel project.

An agent may read deployment status and build logs to diagnose a failure, and may propose the
exact settings change in prose. It stops there.

---

## 7. Project inventory and the orphan

| Project | Root Directory | Status |
| --- | --- | --- |
| `zecreveal` | `apps/web` | To be created by the operator after the HANDOFF-01 PR opens. |
| `z-cash-reveal-dashboard2` | `./` | Live v0.2 dashboard in mock mode. **Keep** until the HANDOFF-11 cutover, then delete. |
| `z-cash-reveal-dashboard` | `apps/dashboard` | **Orphan. Delete.** |

`z-cash-reveal-dashboard` (singular, no `2`) points its Root Directory at `apps/dashboard`, a
path that no longer exists — HANDOFF-00 moved that app to `legacy/dashboard`. The project is
still subscribed to the GitHub repo, so it starts a build on every push and that build fails
immediately. **This is the red check on every PR, including the HANDOFF-01 PR.** It is not a
signal about the branch under review.

Deleting it is an operator click and it is safe: nothing links to it, and the live v0.2 site is
`z-cash-reveal-dashboard2`.

---

## 8. Operator click list, in order

1. Delete the orphan project `z-cash-reveal-dashboard`.
2. Create project `zecreveal` in team `aquatic-17b9f112` with the section 1 settings.
3. Set the four `NEXT_PUBLIC_*` variables from section 2, with `NEXT_PUBLIC_DATA_MODE=snapshot`
   in Production and Preview.
4. Leave every variable in section 3 unset for now; they arrive with HANDOFF-09/11.
5. Deploy, then walk the section 5 checklist.
6. Promote to Production by hand once the checklist passes.
