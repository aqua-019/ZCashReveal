# DEPLOY-2.0 — the `zecreveal` Vercel project

> **Scope of this version.** HANDOFF-01 writes the front-end half: the new Vercel project for
> `apps/web`, its build settings, and its environment variables. HANDOFF-10 extends this same
> file with the VPS half — zebrad, the indexer, the gateway, Postgres, the VPS Redis and the
> Cloudflare tunnel that terminates `wss://`. Until HANDOFF-10 lands, treat everything about the
> origin server as unspecified here.
>
> `zecreveal` is now the ONLY Vercel project on the account. The operator deleted both v0.2
> projects on 23 August 2026 - `z-cash-reveal-dashboard` (the orphan pointing at a path that no
> longer existed) and `z-cash-reveal-dashboard2` (the parked Vite dashboard). `legacy/dashboard`
> still exists in the tree and still builds locally; it simply has no deployment any more, and
> HANDOFF-11 retires the directory itself.

---

## 0. State at HANDOFF-01 — read this before hunting for a preview URL

**Historical note, kept because it explains the shape of this document.** When HANDOFF-01 wrote
this section the `zecreveal` project did not exist yet, and the absence of a preview on that PR
was expected rather than a failure. The project has existed since 23 August 2026
(`prj_rNTLvGWnz92w5qcvROBchPUfdhIR`) and a preview is now expected on every PR. What follows
described the gap:

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

### RESOLVED at HANDOFF-03: the build no longer needs Google Fonts, or any egress

Until HANDOFF-03 `apps/web` fetched Instrument Serif, Fraunces, JetBrains Mono and Manrope at
**build time** through `next/font`'s remote loader. A visitor never contacted Google - the files
were self-hosted from `_next/static/media` afterwards - but the build did, and a failed fetch is a
hard build error rather than a fall back to the declared stacks. It failed for HANDOFF-01 once and
for L2 once more while verifying HANDOFF-02.

The four families are now committed under `apps/web/src/fonts` and loaded with `next/font/local`.
`pnpm build` makes no font request at all: HANDOFF-03 assertion A9 runs the build inside an empty
network namespace, where DNS resolves nothing, and it reaches `Generating static pages (14/14)`.
Provenance, the exact CSS2 requests each file came from, the OFL texts and the refresh procedure
are in `apps/web/src/fonts/README.md`. Nothing about this is a dashboard setting.

`apps/web/vercel.json` pins `"framework": "nextjs"` so the preset is recorded in the repository
rather than only in the project settings.

### RESOLVED: the repo-root `vercel.json` applied to every project, and is now deleted

HANDOFF-01 recorded as UNVERIFIED the assumption that Vercel resolves `vercel.json` relative to a
project's Root Directory. **It does not.** L2 executed the first production build of `zecreveal`
(`prj_rNTLvGWnz92w5qcvROBchPUfdhIR`, Root Directory `apps/web`, framework Next.js) and it failed:
deployment `dpl_9HHZKwUpk798aLxSdMAjy3UDnQNm`, `errorCode NEXT_OUTPUT_DIR_MISSING`. The build log
shows Vercel ran the **root** file's `buildCommand` verbatim, built `legacy/dashboard`, and then
looked for the root file's `outputDirectory` at `/vercel/path0/apps/web/legacy/dashboard/dist`.
`apps/web/vercel.json` was ignored entirely.

The root file is read for **every** project in this repository and overrides the one inside the
Root Directory. HANDOFF-02 therefore deleted it. `scripts/check-vercel-config.mjs` runs in CI and
fails if it ever comes back.

### Deleting it was necessary but NOT sufficient

The preview deployment on the very commit that deleted the root file
(`dpl_DjyBB8byMZYASmu7TA65yg8Y1n6h`, commit `9cc2dca`) **failed the same way**. Its build log shows
Vercel still running

```
Running "install" command: `pnpm install --frozen-lockfile`...
Running "pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard build"
Error: The Next.js output directory "legacy/dashboard/dist" was not found at
       "/vercel/path0/apps/web/legacy/dashboard/dist".
```

with no root `vercel.json` in the tree at all. **The same six settings are also stored on the
`zecreveal` project itself**, adopted when the project was imported from a repository that still
had the root file. A file deletion cannot remove a stored project setting.

`vercel.json` takes precedence over stored project settings, so `apps/web/vercel.json` now pins the
build explicitly rather than trusting the project's settings to be clean:

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "next build",
  "outputDirectory": ".next"
}
```

`outputDirectory` is the one that matters most: `.next` is what the Next.js builder wants, and
`legacy/dashboard/dist` is what the stored setting was feeding it. `scripts/check-vercel-config.mjs`
asserts all four, so a later edit cannot quietly hand control back to the dashboard.

**Verified.** The deployment on the commit that added the pin succeeded:
`dpl_CrmijWHtimk842w65Tkux7vibZg1`, `READY`, built in 19 s, log reading
`Running "next build"` and `Build Completed`, all twelve routes prerendered.

**Operator click, one — clear the stale build overrides on the `zecreveal` project.** Settings →
Build & Development. `apps/web/vercel.json` overrides them so the build no longer depends on this,
but leaving the legacy dashboard's build command stored on the new project is a trap for whoever
next edits that file. Set Framework Preset to `Next.js` and turn the Build Command, Install Command
and Output Directory overrides OFF.

**Operator click, two — done, and no longer needed.** HANDOFF-02 deleted the root `vercel.json`
and this document carried its six settings so the operator could move them into the
`z-cash-reveal-dashboard2` project and keep the legacy dashboard building. That project was
deleted on 23 August 2026 instead, which settles the question: there is nothing to move the
settings into, `legacy/dashboard` has no deployment, and the red check it used to produce on
every PR is gone with it. The values are not reproduced here any more, because a table of
settings for a project that does not exist is a trap rather than a record; HANDOFF-02's own
ledger block in `handoffs/LEDGER.md` holds them if they are ever wanted.

The root `.vercelignore` stays. It is a v0.2 artefact (it excludes `apps/indexer`, `apps/gateway`,
`infra`) and does no work for `zecreveal`, but unlike `vercel.json` it does no harm either.

> **RESOLVED at HANDOFF-03: `buildCommand` now builds the workspace dependency.** HANDOFF-02 left
> this note because `buildCommand` was a bare `next build`, which is correct only while `apps/web`
> has no workspace dependencies, and HANDOFF-03 makes it depend on `@zcashreveal/content`.
>
> `apps/web/vercel.json` now pins
> `pnpm --filter @zcashreveal/content build && next build`, and
> `scripts/check-vercel-config.mjs` asserts that exact string.
>
> The `transpilePackages` alternative the note offered does **not** work here, and it is worth
> saying why so nobody tries it again: `transpilePackages` changes how Next compiles a package, not
> how Node resolves it. `@zcashreveal/content` declares `"exports"` pointing at `dist/src/index.js`,
> so resolution fails before Next's compiler is ever consulted unless something has emitted `dist`.
> Naming the build in the command is the honest fix.
>
> Never fix this by restoring a root `vercel.json`, and never by editing the project settings in the
> dashboard.

---

## 2. Environment variables — public (`NEXT_PUBLIC_*`)

Everything with a `NEXT_PUBLIC_` prefix is **compiled into the client bundle and is public**.
Nothing secret is ever given that prefix. `apps/web/src/lib/env.ts` is the single reader.

| Variable | What it is for | Production | Preview | Development |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Gateway REST base, e.g. `https://api.example/`. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-05/11 | leave blank | blank or a local gateway |
| `NEXT_PUBLIC_WS_URL` | Gateway WebSocket, `wss://<tunnel>/stream`. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-11 | leave blank | blank or `ws://localhost:8080/stream` |
| `NEXT_PUBLIC_SNAPSHOT_URL` | Published snapshot document URL. Nothing reads it in HANDOFF-01. | leave blank until HANDOFF-09 | leave blank | blank |
| `NEXT_PUBLIC_DATA_MODE` | `fixture` \| `snapshot` \| `live`. Selects the data source. | **`snapshot`** | **`snapshot`** | `fixture` |
| `NEXT_PUBLIC_ENABLE_DEV_SURFACES` | Exposes `/dev/primitives` and `window.__zr`. **Do not set it.** | do not set | do not set | do not set |

### The dev surfaces are gated in code, not by an operator setting

`apps/web/src/lib/env.ts` derives `DEV_SURFACES` as
`NODE_ENV !== "production" || NEXT_PUBLIC_ENABLE_DEV_SURFACES === "1"`, and `DEV_SURFACES` is what
gates `/dev/primitives` and the `window.__zr` instrumentation.

**Nothing you do, or forget to do, in the Vercel dashboard can expose those surfaces.** A production
build has them off unless `NEXT_PUBLIC_ENABLE_DEV_SURFACES=1` is set explicitly, and the only place
that ever happens is `apps/web/playwright.config.ts`, so the assertion suite can exercise the
gallery against a real production build. Do not add the variable to the Vercel project.

An earlier draft keyed the gate to `NEXT_PUBLIC_DATA_MODE === "fixture"`. Because `fixture` is also
the code's fallback for an unset variable, a single forgotten setting would have been enough to
publish the gallery — and CLAUDE.md forbids any agent from setting a Vercel variable, so nothing in
the repository could have corrected it. The gate now fails closed.

`NEXT_PUBLIC_DATA_MODE` is therefore back to being what its name says: the data source. Set it to
`snapshot` in Production and Preview. Until HANDOFF-09 publishes a snapshot there is nothing for
that mode to read and the pages render their committed placeholder state either way, so this is a
correctness setting rather than an urgent one.
---

## 3. Environment variables — SERVER-ONLY (never `NEXT_PUBLIC_`)

These are read by HANDOFF-09 (the publisher writes) and HANDOFF-11 (`apps/web` reads).
**Nothing in `apps/web` reads any of them today.** The store itself is already connected.

**These names are the ones the integration injects, read out of the Vercel project by the
operator on 23 August 2026 — not names this repository chose.** The store
`upstash-kv-blue-garden` is connected to `zecreveal` for Production and Preview with the custom
variable prefix `SNAPSHOT_REDIS`; the prefix is deliberate, because an unprefixed connect injects
a bare `REDIS_URL`, which is already this repository's name for the VPS Redis.

| Variable | Read by | Set on Vercel? |
| --- | --- | --- |
| `SNAPSHOT_REDIS_KV_REST_API_URL` | `apps/web`, server-side only (RSC / route handlers) | Yes — injected, Production and Preview |
| `SNAPSHOT_REDIS_KV_REST_API_READ_ONLY_TOKEN` | `apps/web`, server-side only. **This is the one `apps/web` uses.** | Yes — injected, Production and Preview |
| `SNAPSHOT_REDIS_KV_REST_API_TOKEN` | nothing on Vercel — it is read-write, and the only writer is the publisher, which does not run on Vercel | Yes — injected, but unused there |
| `SNAPSHOT_REDIS_KV_URL` | `apps/publisher`, running on the VPS | Injected, but the publisher reads it from the VPS `.env` |
| `SNAPSHOT_REDIS_REDIS_URL` | `apps/publisher` — Upstash injects both TCP spellings | Injected, same |

**This corrects an earlier instruction in this file.** It previously listed the names as
`SNAPSHOT_REDIS_REST_URL`, `SNAPSHOT_REDIS_REST_TOKEN` and `SNAPSHOT_REDIS_URL`, and told the
operator to "map them onto the three names above rather than teaching the code a second spelling".
Those three names are injected by nothing. The instruction is withdrawn for a concrete reason: on
Vercel, "mapping" means adding three more variables by hand holding copies of the integration's
secrets, and the integration rotates its own variables while hand-made copies do not rotate with
them. **The injected names are canonical and the code reads them.** Never accept an injected name
carrying a `NEXT_PUBLIC_` prefix, which is unchanged.

### The two Redis instances, which are never the same instance

- **VPS Redis (`REDIS_URL`)** is the hot path: pub/sub, `zcashreveal:mempool:live`, the anchor
  registry. It is per-transaction traffic and it **never leaves the box**. It is not reachable
  from Vercel and no Vercel variable points at it.
- **Vercel-managed Marketplace Redis** holds exactly one thing OF OURS, `zecreveal:snapshot:*` — and the live data of an unrelated production project alongside it (see below). The
  publisher on the VPS writes it on a slow cadence; `apps/web` reads it server-side so the public
  site still renders when the VPS or the tunnel is down.

No per-transaction traffic ever touches the managed Redis. If a design needs that, the design is
wrong.

### The managed store is SHARED, and that is not a detail

The other project's data sits beside ours in that database, and the operator accepted that trade
deliberately on the free tier. It changes what may be run there: every key of ours begins
`zecreveal:`, the destructive commands are forbidden outright, the enumerating ones expose their
keys as well as ours, and the 500K monthly command allowance is spent by both of us. Full rules
are in [`SNAPSHOT.md`](SNAPSHOT.md), enforced in CI by `scripts/check-redis-safety.mjs`, and no
handoff may weaken them. **Read that file before running anything against this store by hand** —
including a read, because a command that enumerates does not have to name a key to expose one.

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
3. **`/dev/primitives` returns 404.**
   `curl -sS -o /dev/null -w '%{http_code}\n' https://<deployment>/dev/primitives` prints `404`.
   This holds with no environment variables set at all. If it prints `200`, someone has added
   `NEXT_PUBLIC_ENABLE_DEV_SURFACES=1` to the project: remove it and redeploy. A rebuild is
   required either way, because the value is inlined at build time.
4. **Every public route returns 200.** `/` `/beware` `/contradictions` `/timeline` `/network`
   `/track` `/method` `/flows` `/sources`.
5. **The build log shows `next build`,** not a Vite build. Before HANDOFF-02 deleted the root
   `vercel.json`, it did not: the first production build ran the dashboard's Vite command and
   failed with `NEXT_OUTPUT_DIR_MISSING`. See section 1.
6. **No `vercel.json` at the repository root.** `node scripts/check-vercel-config.mjs` exits 0.
   CI runs it; if the root file returns, `apps/web` breaks again in exactly the same way.

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

## 7. Project inventory

| Project | Root Directory | Status |
| --- | --- | --- |
| `zecreveal` | `apps/web` | The only project on the account. `prj_rNTLvGWnz92w5qcvROBchPUfdhIR`, created 23 Aug 2026. |

There is one project and there are no others. Both v0.2 projects were deleted by the operator on
23 August 2026: `z-cash-reveal-dashboard`, the orphan whose Root Directory pointed at
`apps/dashboard` after HANDOFF-00 moved that app to `legacy/dashboard`, and
`z-cash-reveal-dashboard2`, the parked Vite dashboard.

Two consequences worth stating, because three handoffs of ledger reasoned around them:

- **The red check on every PR is gone.** It was the orphan project failing to build, on every
  push, for reasons that had nothing to do with the branch under review. A red Vercel check on a
  PR from here on is about that PR.
- **`legacy/dashboard` has no deployment.** The directory still exists and still builds locally,
  and HANDOFF-11 retires it. Nothing needs to keep it deployable in the meantime.

---

## 8. Operator click list, in order

1. ~~Delete the orphan project `z-cash-reveal-dashboard`.~~ **Done, 23 Aug 2026.**
2. Create project `zecreveal` in team `aquatic-17b9f112` with the section 1 settings.
   **Done** as of 23 Aug 2026: `prj_rNTLvGWnz92w5qcvROBchPUfdhIR`.
3. ~~Move the deleted root `vercel.json`'s settings into `z-cash-reveal-dashboard2`.~~ **Moot:
   that project was deleted on 23 Aug 2026 rather than repaired.**
4. Set the four `NEXT_PUBLIC_*` variables from section 2, with `NEXT_PUBLIC_DATA_MODE=snapshot`
   in Production and Preview.
5. ~~Leave every variable in section 3 unset for now.~~ **Done differently, 23 Aug 2026:** the
   store `upstash-kv-blue-garden` is connected to `zecreveal` for Production and Preview under the
   variable prefix `SNAPSHOT_REDIS`, so Vercel injects all five names in the section 3 table
   automatically and there is nothing to set, and nothing to leave unset, by hand. No code reads
   them until HANDOFF-09/11. **Do not hand-create variables alongside them** — the integration
   rotates its own and hand-made copies do not rotate with it. See [`SNAPSHOT.md`](SNAPSHOT.md) §3.
6. Redeploy `zecreveal`, then walk the section 5 checklist. The first build failed with
   `NEXT_OUTPUT_DIR_MISSING`; the cause is fixed in code and a fresh build is needed to prove it.
7. Promote to Production by hand once the checklist passes.
