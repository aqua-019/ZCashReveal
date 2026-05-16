# Deploy

## Quickstart — GitHub + Vercel (dashboard only, mock mode)

This deploys the dashboard as a static site on synthetic mempool data.
Backend (indexer + gateway) stays local for now.

### 1. Push to GitHub
```bash
cd ZCashReveal
git add .
git commit -m "feat: ZCashReveal v0.1 scaffold"
git push origin main
```

### 2. Vercel
Vercel auto-detects `vercel.json` and builds:
- `pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard build`
- Output: `apps/dashboard/dist`
- Env: `VITE_MOCK_MODE=true`

First build: 2-4 min. Then your URL renders the dashboard with
synthetic data including the demo round-trip link.

### 3. Local full stack
```bash
docker compose up -d            # zebrad + postgres + redis
pnpm install
pnpm --filter @zcashreveal/indexer migrate
pnpm dev                        # all 3 apps
```
