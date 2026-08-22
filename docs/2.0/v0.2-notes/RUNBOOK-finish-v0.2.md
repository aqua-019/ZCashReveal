# ZCashReveal — Finish v0.2 Runbook

_Generated 2026-06-09 from a live audit of GitHub `main`, Vercel, and the project memory. Supersedes the stale "Module 7X not started" note._

## TL;DR — where the project actually is

- **All v0.2 code is merged.** `main` is at `cf5c775` (PR #30, Module 7Y). Modules 1, 2, 3, 4, 5A, 5B, 6, 7A, 7Z, 7Y are all in. No feature branches or PRs are in flight.
- **Module 7X (Redis) is effectively done in-repo** — not "not started." `zcashreveal-redis` is defined in `docker-compose.yml`, `REDIS_URL` is wired into both `apps/indexer/src/config.ts` and `apps/gateway/src/config.ts`, both instantiate `ioredis`, and `apps/indexer/src/decoder/anchor-depth.ts` uses Redis as the hot tier over Postgres. **What remains is operational: run the container and point the services at it** — no code change.
- **Live site is healthy.** Vercel `z-cash-reveal-dashboard2` latest production deploy (`cf5c775`) = `READY`, mock mode.
- **DEPLOY.md is already written** and accurate.

So "finishing v0.2 → Phase A live flip" is now **operational + cleanup**, not feature work.

## Remaining blockers (all on the dev machine)

### 1. zebrad stalled — WSL2 clock drift after host sleep
Symptom: zebrad sync frozen. Fix:
```powershell
wsl --shutdown
# then restart Docker Desktop, then:
docker compose up -d zebrad
docker logs -f zcashreveal-zebrad   # confirm peers + verified blocks climbing
```

### 2. Bring up Redis + Postgres, then run the services (Module 7X runtime)
```bash
docker compose up -d postgres redis
docker ps                              # expect zcashreveal-{zebrad,postgres,redis} all Up/healthy
pnpm --filter @zcashreveal/indexer run migrate   # apply migrations 001 + 002
pnpm --filter @zcashreveal/indexer run dev        # should publish to Redis, no empty-reply
pnpm --filter @zcashreveal/gateway run dev        # subscribes to Redis, serves WS+REST on :8080
pnpm --filter @zcashreveal/dashboard run dev      # set VITE_MOCK_MODE=false locally to test the live path
```

### 3. Postgres host-port collision (5432) — two options
The committed default maps host **5432:5432**, which collides with a Postgres already listening on 5432 on this machine.

- **Option A (local-only, recommended — matches your gitignored-override convention):** add a `docker-compose.override.yml` (already gitignored) remapping just the host port, and set `DATABASE_URL` in your local `.env` to `...@localhost:5433/...`. Nothing committed.
  ```yaml
  # docker-compose.override.yml (gitignored)
  services:
    postgres:
      ports: ["5433:5432"]
  ```
- **Option B (commit the new default):** a ready patch is saved at `postgres-port-5433.patch` in this folder (remaps host→5433 in `docker-compose.yml`, `.env.example`, indexer/gateway config, and the integration test setup). Apply with `git apply postgres-port-5433.patch` from the repo root, then commit/PR.

Recommendation: **Option A** — the collision is a property of this host, not the project.

## Cleanup

### Orphan Vercel project `z-cash-reveal-dashboard` (singular)
Confirmed: **every deployment is `ERROR`** and it still listens to the GitHub repo, so it fails on every push. `live: false`. DEPLOY.md already flags it.
- Fix: in the Vercel dashboard → `z-cash-reveal-dashboard` → Settings → Git → **Disconnect** (stops the failing builds), or **Settings → Delete Project** to remove it entirely. The live project `z-cash-reveal-dashboard2` is untouched.

## Phase A — live flip (after 1–3 above are green)
1. `cloudflared tunnel` from the gateway (`:8080`) to a public hostname.
2. In Vercel `z-cash-reveal-dashboard2` → Settings → Environment Variables: set `VITE_WS_URL` / `VITE_API_URL` to the tunnel host and flip `VITE_MOCK_MODE=false` (all three scopes — UI, not `vercel.json`, per DEPLOY.md).
3. Redeploy. Diff against known-good `fa4bd58` if anything regresses.

## On the horizon (post-live, from memory)
- v0.3 **Orchard boundary-flow detection** as the priority drama feature (informed by the early-June 2026 Orchard circuit exploit disclosure).
- Project Tachyon pool-coverage considerations (seed-phrase-only recovery breaks).
