# Branch cleanup — commands only, not executed

Generated during [handoffs/HANDOFF-00-housekeeping.md](../../handoffs/HANDOFF-00-housekeeping.md).
Deleting a remote branch is an operator action (L4), so nothing here has been run. Every
command below is exact and copy-pasteable; run them from a clone with `origin` pointing at
`github.com/aqua-019/ZCashReveal`.

## State when this list was generated

    generated  : 2026-08-22 22:42 UTC
    origin/main: 30b2a35
    remote refs: 22 (excluding main)

The plan (`docs/2.0/ZECREVEAL-2.0-PLAN.md` §10) and HANDOFF-00 §2 both record "22 stale
`claude/*` + 2 merged `feat/*`". The live remote carries **20** `claude/*` branches, not 22,
and one of them is **not merged**. The verified breakdown is below; prefer it over the
audit note.

## Section 1 — safe to delete: fully merged into `origin/main`

Each of these is an ancestor of `origin/main` (`git merge-base --is-ancestor` returns true,
`git rev-list --count origin/main..<branch>` is 0). Deleting them discards no unique commit.

```bash
git push origin --delete claude/add-core-utilities-zPwZ2
git push origin --delete claude/add-decoder-layer-uO7H3
git push origin --delete claude/add-mock-leak-data-Xp3f9
git push origin --delete claude/add-shielded-leak-types-6vc1x
git push origin --delete claude/add-transaction-types-r7olf
git push origin --delete claude/build-gateway-server-644Hd
git push origin --delete claude/create-documentation-RERZJ
git push origin --delete claude/create-leak-analyzer-59URD
git push origin --delete claude/create-types-package-RTpDN
git push origin --delete claude/indexer-zebrad-io-CLFmL
git push origin --delete claude/indexer-zebrad-io-MR1yk
git push origin --delete claude/left-rail-components-uvDwV
git push origin --delete claude/link-engine-indexer-bekKx
git push origin --delete claude/mempool-persistence-setup-s6XM8
git push origin --delete claude/right-rail-components-bXry1
git push origin --delete claude/setup-dashboard-scaffold-UJOn2
git push origin --delete claude/setup-docker-ci-Q7U8t
git push origin --delete claude/setup-monorepo-config-8TOhp
git push origin --delete claude/setup-tailwind-design-tokens-ax2GJ
git push origin --delete feat/v0.2-module-7y-zebra-auth
git push origin --delete feat/v0.2-module-7z-gateway-ws-envelope
```

Or, as a single command:

```bash
git push origin --delete \
  claude/add-core-utilities-zPwZ2 \
  claude/add-decoder-layer-uO7H3 \
  claude/add-mock-leak-data-Xp3f9 \
  claude/add-shielded-leak-types-6vc1x \
  claude/add-transaction-types-r7olf \
  claude/build-gateway-server-644Hd \
  claude/create-documentation-RERZJ \
  claude/create-leak-analyzer-59URD \
  claude/create-types-package-RTpDN \
  claude/indexer-zebrad-io-CLFmL \
  claude/indexer-zebrad-io-MR1yk \
  claude/left-rail-components-uvDwV \
  claude/link-engine-indexer-bekKx \
  claude/mempool-persistence-setup-s6XM8 \
  claude/right-rail-components-bXry1 \
  claude/setup-dashboard-scaffold-UJOn2 \
  claude/setup-docker-ci-Q7U8t \
  claude/setup-monorepo-config-8TOhp \
  claude/setup-tailwind-design-tokens-ax2GJ \
  feat/v0.2-module-7y-zebra-auth \
  feat/v0.2-module-7z-gateway-ws-envelope
```

## Section 2 — REVIEW BEFORE DELETING: not merged

### `claude/build-leak-panel-I0181`

- tip: `83c1152` (2026-05-16) — dashboard: add LeakPanel and wire App root component
- commits not on `main`: **1**
- files it touches: apps/dashboard/src/App.tsx apps/dashboard/src/components/LeakPanel.tsx 

Assessment (Executed, `git diff` against `origin/main`): the work is **superseded, not
missing**. `main` carries its own `LeakPanel.tsx` (527 lines) and `App.tsx` (106 lines),
reworked past this branch's versions (748 and 102 lines) by `fa4bd58` and then
`7387816` (v0.2 module 6). Nothing on `main` regresses if this branch is deleted, but the
commit itself is the only copy of that earlier 748-line variant, so the call is Aqua's:

```bash
# only after confirming the older LeakPanel variant is not wanted
git push origin --delete claude/build-leak-panel-I0181
```

## Section 3 — do not delete

- `main` — default branch.
- `claude/aqua-stack-v4-1-handoff-818gb3` — the branch this handoff is delivered on. It is
  not in the list above because it did not exist on the remote when this list was
  generated; it must survive until its PR is merged.
- Any `feat/v2-*` branch created by handoffs 01 onward.

## Related operator cleanup (not a git command)

`DEPLOY.md` records a second Vercel project to remove: the orphaned
`z-cash-reveal-dashboard` (singular, no `2`), which still listens to this repository and
fails a build on every push. The live project is `z-cash-reveal-dashboard2` and it must
survive until the 2.0 cutover in `handoffs/HANDOFF-11-live-wiring.md`.

This is now more than cosmetic. The orphan's Vercel Root Directory is `apps/dashboard`,
which no longer exists after HANDOFF-00, so its build can never succeed again and it will
put a permanent red check on every pull request. Confirmed on both branches: the combined
commit status reports `Vercel - z-cash-reveal-dashboard: failure` on `origin/main` as well
as on the handoff branch, while `z-cash-reveal-dashboard2` reports success from the new
`legacy/dashboard/dist` output. Deleting the orphan project in the Vercel dashboard clears
it; no repository change is involved.
