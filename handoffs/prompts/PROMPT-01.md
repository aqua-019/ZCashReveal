Aqua Stack v4.1 session. Self-contained: everything you need is in this message and in the repository. Nothing is uploaded or copied from outside the repo, now or in future sessions.

STEP 0 — bring the clone up to date: git fetch origin, checkout main, git pull --ff-only, then branch from there. Confirm HEAD is at or after 0031d7c (the HANDOFF-00 merge). If it is not, stop and say so.

Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Then do STEP A and STEP B. Stop at PR opened.

================ STEP A — repo maintenance (one commit, before any HANDOFF-01 work) ================

A1. CLAUDE.md — insert this section immediately after "Operating model — Aqua Stack v4.1":

## Revolution protocol (handoffs/ maintains itself; no file uploads)

Every session, in this order:

1. RECONCILE — first commit on your branch, before any handoff work. Set every handoff whose PR is merged into main to `status: closed`; set the one you are executing to `status: in-progress`; for each track (Web 01-04, Data 05-09, Infra 10, Integration 11-12) set the lowest-numbered `queued` handoff whose `depends_on` are all closed to `status: open` — exactly one open per track; rewrite the Status column of the table in handoffs/README.md to match. Commit: `chore(handoffs): reconcile status before HANDOFF-NN`.
2. L2 RESOLUTION — if the prompt contains a block fenced as `L2 RESOLUTION`, append it verbatim to handoffs/LEDGER.md beneath the ledger block of the handoff it names, then apply every instruction under its FOLDS heading. L2 (Cowork) has no write access to this repository; that block is the only channel by which verification results, answers to ledger questions and amendments to future handoffs reach you. If there is no such block, skip.
3. EXECUTE the open handoff under its §1-§6.
4. WRITE-BACK — before the PR opens: fill §7 in your own handoff and set it to `status: shipped`; append your §8 block to handoffs/LEDGER.md (append-only — never rewrite an earlier block, including L2's); add one row to handoffs/LOG.md; update the handoffs/README.md table. The PR title MUST begin `HANDOFF-NN:` — LOG.md and LEDGER.md key on the title, not the branch, because the harness names branches. Stop at **opened**.

5. ARCHIVE — save the prompt that started your session verbatim to `handoffs/prompts/PROMPT-NN.md` in the same commit as RECONCILE. The repository, not anyone's desktop, is where the prompt history lives.

Status flips, the README table, LEDGER appends, LOG rows and the prompt archive are the only cross-handoff edits a session makes.

A2. handoffs/README.md — add a pointer line under "Status convention": `Statuses are maintained by the sessions themselves; see "Revolution protocol" in CLAUDE.md.`

A3. handoffs/HANDOFF-00-housekeeping.md — front matter only: `status: shipped` becomes `status: closed`. Change nothing else; its §7 report stays exactly as written.

A4. handoffs/HANDOFF-01-web-scaffold.md — front matter: `status: queued` becomes `status: open`, and `depends_on: 00` becomes `depends_on: 00 (closed)`.

A5. In handoffs/HANDOFF-01 through HANDOFF-13, replace the front-matter branch line with, using each file's own number and slug:
    branch: the session-designated branch (name it `feat/v2-NN-<slug>` if you may choose)

A6. handoffs/HANDOFF-01-web-scaffold.md §5 — replace assertion A8 with:
- **A8.** `./scripts/check-no-emoji.sh` exits 0 (the scanner HANDOFF-00 shipped). The raw `grep -rP '[\x{1F300}-...]'` written into HANDOFF-00 §5 is a false-negative generator on GNU grep and must not be reused in any handoff.

A7. handoffs/HANDOFF-01-web-scaffold.md §4 — add a final deliverable:
7. One-line correction in `docs/2.0/ZECREVEAL-2.0-PLAN.md` §10: the stale branch count is 20 `claude/*` (19 merged, 1 not) + 2 merged `feat/*`, not 22 — `docs/2.0/BRANCH-CLEANUP.md` is generated from live git and is authoritative (LEDGER-00 Q3).

A8. handoffs/HANDOFF-05-gateway-api.md §4 — add a final deliverable:
5. Fix the stale reference at `apps/gateway/src/ws-broker.ts:8` — it still points at `apps/dashboard/src/lib/ws.ts`, which moved to `legacy/dashboard/` in HANDOFF-00 (LEDGER-00 NOTICED; A8 there forbade touching it).

A9. handoffs/HANDOFF-06-four-pools.md §5 — replace assertion A1 with:
- **A1.** `pnpm --filter @zcashreveal/indexer test` passes with >= 171 tests and **no Postgres-gated test skipped** when a migrated database is reachable — assert with `node scripts/assert-no-skipped-integration.mjs`, not with a raw skip count: one test (`block-decoder.test.ts`, real mainnet fixture) stays skipped until HANDOFF-10 captures the fixture.

A10. handoffs/HANDOFF-10-infra.md §4 — add two deliverables:
2. **Mainnet block fixture** (LEDGER-00 Q4): capture one post-NU5 mainnet block from the synced Zebra into `apps/indexer/test/fixtures/blocks/mainnet-<height>.json` and commit it, so `block-decoder.test.ts` stops self-skipping. Record the height, hash and RPC command used in `RUNBOOK-VPS.md`.
3. Bump the pinned GitHub Actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `pnpm/action-setup`) to versions whose runtime is not deprecated — the HANDOFF-00 run warned that all four are being forced onto Node 24 (LEDGER-00 NOTICED).

A11. handoffs/HANDOFF-10-infra.md §5 — add an assertion:
- **A8.** With the fixture committed, `pnpm --filter @zcashreveal/indexer test` reports 0 skipped and `node scripts/assert-no-skipped-integration.mjs` prints no `skipped (allowed)` line *(fail side: move the fixture aside → the test self-skips again)*.

A12. handoffs/LOG.md — append this row:
| 2026-08-22 | 00 housekeeping | [#31](https://github.com/aqua-019/ZCashReveal/pull/31) | closed (merged 0031d7c) | 0 | L2 re-executed all nine assertions on a clean worktree of 514ae4c: all hold, transcripts accurate. CI green on the PR head (run 32603703571). Vercel red check confirmed pre-existing on main. Ledger questions 1-4 answered; folds applied to 01, 05, 06, 10. HANDOFF-01 opened. |

A13. handoffs/README.md — set HANDOFF-00's Status cell to `closed` and HANDOFF-01's to `open`; add under "Status convention":

## Branch convention (resolved after HANDOFF-00)
The harness names the branch a session is opened on, so handoff front-matter no longer prescribes one: use the session's designated branch, and name it `feat/v2-NN-<slug>` only when you are free to choose. The stable key is the PR title, which always begins `HANDOFF-NN:`.

and add two rows to the "Human clicks" table:
| after 00 | run the commands in `docs/2.0/BRANCH-CLEANUP.md` to delete the stale remotes, including `claude/build-leak-panel-I0181` — L2 reviewed it: an early 748-line LeakPanel superseded by the 527-line version on main, in an app that is now `legacy/` and retired at the HANDOFF-11 cutover |
| after 00 | delete the orphaned Vercel project `z-cash-reveal-dashboard` (Root Directory `apps/dashboard`, a path that no longer exists) — it is the only red check on every PR and is caused by none of them |

A14. handoffs/LEDGER.md — append the block below verbatim, beneath the HANDOFF-00 block.

L2 RESOLUTION — HANDOFF-00 (Cowork, 22 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of 514ae4c, not relayed):
  pnpm install --frozen-lockfile rc=0 · pnpm typecheck 5/5 rc=0 · pnpm lint "1 problem (0 errors, 1 warning)" rc=0 ·
  pnpm -r test: gateway 7 passed, indexer 133 passed / 38 skipped with no database present, rc=0 ·
  pnpm --filter @zcashreveal/dashboard build "built in 1.94s" rc=0 from legacy/dashboard ·
  Math.random ban fires on a probe file rc=1 · scripts/check-no-emoji.sh rc=0 clean, rc=1 on a planted U+1F680 ·
  scripts/assert-no-skipped-integration.mjs rc=1 with no database, naming all 37 gated tests individually ·
  docs/2.0 top level exactly the seven specified files, research 4, mockups 2 html + 12 reference png, v0.2-notes 2,
  handoffs 14 + LEDGER + LOG + README, _incoming and 2026-08-22-pickup both gone, CLAUDE.md byte-identical to the
  draft L2 shipped, A8 diff empty · CI check run "typecheck, lint, test" SUCCESS on the PR head 514ae4c (run
  32603703571), not merely on the 0eb45d4 cited in §7 · Vercel z-cash-reveal-dashboard FAILURE reproduced on base
  commit 30b2a35 on main, so it is pre-existing, not a regression.
  Verdict: every §5 assertion holds under re-execution; the §7 transcripts are accurate. No finding.

ANSWERS to the ledger questions:
  Q1 BRANCH NAME — the harness wins. Front-matter for 01-13 now reads "the session-designated branch". The stable
     key is the PR title, which must begin "HANDOFF-NN:"; LOG.md and this ledger key on that, never on the branch.
  Q2 UNMERGED BRANCH — delete claude/build-leak-panel-I0181. L2 read it: one commit, 83c1152, a 748-line LeakPanel
     and a 102-line App.tsx. main carries a reworked 527-line LeakPanel, the app is now legacy/dashboard, and it is
     retired at the HANDOFF-11 cutover. Nothing in 2.0 imports it. Move it to the safe-delete list.
  Q3 BRANCH COUNT — BRANCH-CLEANUP.md, generated from live git, is authoritative: 20 claude/* + 2 merged feat/*.
     HANDOFF-01 carries a one-line correction to plan §10.
  Q4 MAINNET FIXTURE — accepted into HANDOFF-10 as an explicit deliverable, with an assertion that the skip then
     disappears.

FOLDS applied by this session: items A3-A11 of the prompt that carried this block — HANDOFF-00 closed, HANDOFF-01
opened, branch fields relaxed, the emoji assertion pointed at scripts/check-no-emoji.sh, plan §10 correction added to
01, ws-broker.ts:8 fix added to 05, the "0 skipped" assertion in 06 replaced, mainnet fixture and Actions bump added
to 10.

OPERATOR CLICKS OUTSTANDING: delete the stale remote branches per BRANCH-CLEANUP.md; delete the orphaned Vercel
project z-cash-reveal-dashboard; create the Vercel project zecreveal with Root Directory apps/web for HANDOFF-01.

A15. handoffs/prompts/PROMPT-01.md — create the directory and save this entire prompt to that file, verbatim, from the first line to the last. Add a line to handoffs/README.md under "Files": `- \`prompts/PROMPT-NN.md\` — the prompt that started each session, archived verbatim.`

Commit STEP A as: chore(handoffs): L2 write-back for HANDOFF-00 and the revolution protocol

NOTE ON VERCEL: the project `zecreveal` (Root Directory `apps/web`) does not exist yet — the operator creates it after this PR opens. Do not create, configure or authenticate against any Vercel project, and do not treat the absence of a preview deployment as a failure. `docs/2.0/DEPLOY-2.0.md` documents what the operator will click. The existing red `z-cash-reveal-dashboard` check is a pre-existing orphan project, not caused by your work.

================ STEP B — execute the handoff ================

Execute handoffs/HANDOFF-01-web-scaffold.md under the stack contracts, then WRITE-BACK per the protocol above and open the PR titled `HANDOFF-01: apps/web scaffold + the ZEC Forensic design system`. Stop at opened.
