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
- `claude/aqua-stack-v4-1-handoff-818gb3` — the branch HANDOFF-00 was delivered on. It is
  not in the list above because it did not exist on the remote when this list was
  generated. Its PR (#31) has since merged, so it is now deletable.
- Any branch in section 4 whose PR has not merged. At the time of writing that is
  `claude/handoff-08-completion-wngbjj` alone (#43, HANDOFF-10, open).
- Any `feat/v2-*` branch created by handoffs 01 onward.

## Section 4 — branch names are harness artefacts: which branch carried which handoff

Added during [handoffs/HANDOFF-10-infra.md](../../handoffs/HANDOFF-10-infra.md), because by
then the mapping had stopped being inferable and a reader looking for HANDOFF-10's work would
have looked at a branch named after HANDOFF-08.

`CLAUDE.md` specifies `feat/v2-<NN>-<name>`. **Not one 2.0 revolution has been delivered on a
branch of that shape.** The harness names the branch when it starts a session, the session
cannot choose it, and HANDOFF-00 already recorded the divergence for itself in `LOG.md`
("Delivered on branch `claude/aqua-stack-v4-1-handoff-818gb3`, not `feat/v2-00-housekeeping`").
This is the once that the record says so for all of them. It is also why `LOG.md` and
`LEDGER.md` key on the PR title, which must begin `HANDOFF-NN:`, rather than on the branch.

Executed: `git log --oneline --merges origin/main` for the branch of each merge, cross-read
against the handoff column of `handoffs/LOG.md`.

| handoff | PR(s) | branch |
|---|---|---|
| 00 housekeeping | #31 | `claude/aqua-stack-v4-1-handoff-818gb3` |
| 01 web scaffold | #32 | `claude/aqua-v4-handoff-setup-94hbvt` |
| 02 content package | #33 | `claude/aqua-stack-v4-l2-resolution-7v7qvw` |
| 03 record pages | #34 | `claude/handoff-03-record-pages-3jzxm1` |
| 04 tracking ui | #35 | `claude/prompt04-p86caa` |
| 05 gateway api | #36 | `claude/gateway-api-handoff-05-12ogr3` |
| 06 four pools | #37 | `claude/new-session-s4er6f` |
| 07 v6 decoder | #38 | `claude/new-session-ux5kkt` |
| 08 analysis toolkit | #39, #40, #41, #42 | `claude/handoff-08-analysis-toolkit-bjvz3i` |
| 10 infra | #43 | `claude/handoff-08-completion-wngbjj` |

Two rows carry the whole point of this section.

**`claude/handoff-08-analysis-toolkit-bjvz3i` carried four PRs, not one.** HANDOFF-08's gate did
not converge inside one PR: #39 merged mid-gate, so rounds 3 and 4 landed as follow-ups off the
merged head rather than as more commits on an open PR. One branch, four merges, one handoff.

**`claude/handoff-08-completion-wngbjj` carries HANDOFF-10, and nothing of HANDOFF-08.** The
name is the harness's, assigned when the session was started to finish HANDOFF-08's write-back;
the operator then stood that session down — another session was already doing that work — and
reassigned it to HANDOFF-10, the INFRA track's open handoff. The branch name was fixed by then.
Read the PR title, not the branch.

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
`legacy/dashboard/dist` output - a directory HANDOFF-11 has since deleted from the tree entirely.
Deleting the orphan project in the Vercel dashboard clears
it; no repository change is involved.
