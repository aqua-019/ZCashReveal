Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute the newest handoff in handoffs/ with status: open under the stack contracts. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-01 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of a17e7be, not relayed):
  pnpm install --frozen-lockfile rc=0 · pnpm typecheck 6/6 rc=0 · pnpm lint "1 problem (0 errors,
  1 warning)" rc=0, the warning being HANDOFF-00's pre-existing indexer finding ·
  pnpm --filter @zcashreveal/web build rc=0, 14 static pages · pnpm -r test: web 96 passed,
  gateway 7 passed, indexer 133 passed / 38 skipped (no database in this environment) ·
  pnpm test:e2e 19 passed in 41.9 s, including both polarities of A5 · check:tokens 15 ok, and
  drifting --gold to #ffcc00 produces "FAIL --gold expected #f4b728 found #ffcc00" rc=1 ·
  grep -rn 'Math.random' apps/web/src empty · scripts/check-no-emoji.sh rc=0 ·
  dev-surface gate re-tested from scratch: rm -rf .next, production build with NO environment
  variable set at all, next start - / 200, /dev/primitives 404, /nope 404, zero occurrences of
  __zr in the served HTML. The gate cannot fail open ·
  STEP A landed in full: CLAUDE.md carries the revolution protocol including ARCHIVE, HANDOFF-00
  is closed, the folds are present in 05, 06 and 10, LEDGER carries the L2 block verbatim, and
  handoffs/prompts/PROMPT-01.md is 11,014 bytes, byte-for-byte the prompt that started the
  session ·
  CI check run "typecheck, lint, test" SUCCESS on the PR head a17e7be (run 32608529590).
  Contrast recomputed independently (WCAG relative luminance): --ink-mute was 4.04:1 on --bg and
  is now 5.20:1; --ink-faint was 2.10:1 and is now 3.11:1. The report's numbers are accurate and
  slightly conservative.
  Verdict: every assertion holds under re-execution. Two gate rounds, converged, no finding.
  Lighthouse 99/100 is accepted on the session's evidence rather than reproduced here; the
  accessibility half of it was verified independently by the contrast computation above.

ANSWERS to the ledger questions:
  Q1 MUTED INKS — ACCEPTED, and the new values are now canonical. The mockup's --ink-mute
     (#7c7366, 4.04:1) and --ink-faint (#4f4840, 2.10:1) fail WCAG AA for normal text and were
     being used for real text at 9.5-12px, so the mockup was wrong and the correction is right.
     #8f8576 and #6a6157 stand, --ink-faint stays retired from text as a hairline token, and the
     accessibility budget outranks mockup fidelity wherever the two disagree again. The mockup
     files stay as the historical artefact; the token file is the source of truth for these two
     values from here.
  Q2 65-CHARACTER HASH — ACCEPTED. The mockup literal is a typo; the corrected 64-character
     fixture and its unit test stand. Nothing may harvest that literal (fold below).
  Q3 PLAYWRIGHT IN CI — YES, it should gate, but not on every PR. Folded into HANDOFF-10 as a
     separate e2e job with a paths filter on apps/web, installing chromium in the job. The Google
     Fonts flake that argued against it is removed at the root by vendoring the fonts (fold into
     HANDOFF-03), which also settles DEFERRED assumption 9.
  Q4 WEBFONT BUDGET — ACCEPTED as a standing constraint: four families, Manrope preloaded alone,
     no fifth family without an explicit L2 decision. Recorded in the HANDOFF-03 fold.

FOLDS (apply now, in the RECONCILE commit):
  1. HANDOFF-02 §4 - add a deliverable: correct the two remaining "22 stale branches" claims in
     `docs/2.0/ZECREVEAL-2.0-PLAN.md` (lines 14 and 126) to 20 `claude/*` + 2 merged `feat/*`,
     matching the §10 line HANDOFF-01 already fixed.
  2. HANDOFF-02 §4 - add a deliverable: in `docs/2.0/mockups/reference/README.md`, record that
     the mockup's tip hash literal is 65 hex characters (one zero too many in the leading run)
     and that the canonical fixture is the 64-character value in `apps/web/src/lib/chain.ts`, so
     no later handoff harvests the typo.
  3. HANDOFF-03 §3 - add to the contract: the four families are vendored with `next/font/local`
     rather than fetched from Google at build time, so the build is hermetic and CI cannot flake
     on a font fetch. Manrope alone is preloaded; a fifth family, or a second preload, needs an
     explicit L2 decision (LEDGER-01 Q4). Keep the Lighthouse floors of performance >= 95 and
     accessibility >= 95 on `/beware` as a §5 assertion.
  4. HANDOFF-03 §3 - add: `--ink-mute` #8f8576 and `--ink-faint` #6a6157 are canonical and
     `--ink-faint` is a non-text token (hairlines, rules) only. Where a mockup value and WCAG AA
     for normal text disagree, AA wins and the divergence is recorded in §8.
  5. HANDOFF-04 §3 - add: the tip-hash fixture is the 64-character value from
     `apps/web/src/lib/chain.ts`. Never copy the 65-character literal out of the mockup HTML.
  6. HANDOFF-10 §4 - add a deliverable: a Playwright e2e CI job, separate from the main verify
     job, triggered only by a paths filter on `apps/web/**`, installing chromium in the job
     (`playwright install --with-deps chromium`), running `pnpm --filter @zcashreveal/web
     test:e2e` (LEDGER-01 Q3).
  7. HANDOFF-10 §4 - add to the `.env.example` deliverable: the root `.env.example` still carries
     the v0.2 `VITE_*` block and no `SNAPSHOT_*` names. Remove the former, add the latter
     (LEDGER-01 NOTICED).

NOTED, NOT ACTED ON: root `vercel.json` still points at `legacy/dashboard` - HANDOFF-11 retires
it at the cutover, and `apps/web/vercel.json` makes the outcome the same either way. The bare
error shell on a gated-off `/dev/primitives` is cosmetic and stays.

OPERATOR CLICKS OUTSTANDING: create the Vercel project `zecreveal` (Root Directory `apps/web`,
Framework Next.js) if not yet done; delete the stale remote branches per
`docs/2.0/BRANCH-CLEANUP.md`; delete the orphaned Vercel project `z-cash-reveal-dashboard`.

---

# Second message of the same session (mid-session, 23 Aug 2026)

The revolution protocol archives "the prompt that started your session". This session received a
second prompt after the PR had been opened, carrying an L2 RESOLUTION addendum. Everything above
this rule is byte-for-byte the prompt that started the session; everything below is the second
message, also verbatim.

---

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-01 addendum, Vercel (Cowork, 23 Aug 2026)

This block arrives mid-session. Apply it in your next commit, before the PR opens. It is two
extra folds and does not change HANDOFF-02's scope.

FINDING (Executed by L2, not relayed). The `zecreveal` Vercel project now exists
(prj_rNTLvGWnz92w5qcvROBchPUfdhIR, Root Directory `apps/web`, framework Next.js, no environment
variables, no custom domain). Its first production build FAILED:
dpl_9HHZKwUpk798aLxSdMAjy3UDnQNm, errorCode NEXT_OUTPUT_DIR_MISSING. The build log shows Vercel
ran the ROOT `vercel.json`'s buildCommand verbatim -
"pnpm --filter=@zcashreveal/types build && pnpm --filter=@zcashreveal/dashboard build" - built
`legacy/dashboard`, then looked for the root file's outputDirectory at
`/vercel/path0/apps/web/legacy/dashboard/dist`. `apps/web/vercel.json` was ignored entirely.
This RESOLVES the HANDOFF-01 §7 UNVERIFIED line "that Vercel resolves vercel.json relative to
the Root Directory": it does not. The root file is read for every project in this repository and
overrides the one inside the Root Directory.

FOLDS (apply to THIS handoff, HANDOFF-02):
  8. §4 - add as the FIRST deliverable: delete the root `vercel.json`. `apps/web` has no
     workspace dependencies, so with that file gone the Next.js preset builds it with no custom
     command and `apps/web/vercel.json` (`{"framework":"nextjs"}`) is finally the one that
     applies. The operator moves the deleted file's settings into the `z-cash-reveal-dashboard2`
     project settings so that project keeps building until the HANDOFF-11 cutover - Framework
     Other, Install `pnpm install --frozen-lockfile`, Build `pnpm --filter=@zcashreveal/types
     build && pnpm --filter=@zcashreveal/dashboard build`, Output `legacy/dashboard/dist`,
     environment variable `VITE_MOCK_MODE=true`. Record those exact values in
     `docs/2.0/DEPLOY-2.0.md` and add the click to the `handoffs/README.md` operator table.
     Delete the file whether or not the operator has done it yet, and say which in §7: the
     dashboard is legacy, and a red check on it is not a reason to keep the new project broken.
  9. §5 - add an assertion: no `vercel.json` exists at the repository root, and
     `apps/web/vercel.json` contains `"framework": "nextjs"` *(fail side: restore the root file
     in a scratch commit, observe it present, revert)*.

Nothing else in HANDOFF-02 changes. The seven folds you already applied stand.
