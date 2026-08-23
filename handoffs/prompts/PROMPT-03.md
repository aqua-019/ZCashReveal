# Session kickoff, carrying the L2 RESOLUTION for HANDOFF-02 (23 Aug 2026)

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-03-record-pages.md. It is the Web track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-02 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of 5271813, not relayed):
  pnpm install --frozen-lockfile rc=0 · content validate rc=0 printing beware 14, contradictions
  16, timeline 124, labels 8, cases 3, unverified 32, sources 328, network 36 entities / 41 edges,
  phrases 19, 186 refs cited · pnpm -r test: content 58, web 96, gateway 7, indexer 133 passed /
  38 skipped · pnpm typecheck 6/6 rc=0 · pnpm lint 0 errors 1 pre-existing warning ·
  node scripts/check-vercel-config.mjs rc=0, root file absent and apps/web pinning all four keys ·
  CI check run "typecheck, lint, test" SUCCESS on the PR head 5271813.
  The Vercel repair is confirmed from the deployment record, not from the report: dpl_9HHZ
  (production, main) ERROR; dpl_EYkD and dpl_Bbf (early PR commits) ERROR; dpl_DjyB on 9cc2dca,
  the commit that DELETED the root file, still ERROR - which is the session's own finding and the
  important one; dpl_Crmi on 95aba04, the commit that pinned apps/web/vercel.json, READY; dpl_CMgB
  on the head, READY. The diagnosis that the project had also STORED the root file's settings at
  import time is correct, and it is my fault it was ever stored: I created the project while that
  file was still in the tree. Deleting the file was necessary and not sufficient, exactly as the
  session says.
  Verdict: every assertion holds. Four gate rounds. ONE FINDING, below.

FINDING F-02-1 (Executed, reproduced deliberately) - `pnpm -r test` is not self-sufficient on a
  clean checkout, and HANDOFF-00's assertion A1 is therefore wrong as written.
  My first `pnpm -r test` on a fresh worktree failed: "apps/gateway ... Failed Suites 1 ... Error:
  Failed to resolve entry for package @zcashreveal/types ... Tests no tests". Four subsequent runs
  passed. I isolated the mechanism rather than dismissing it as flake: `rm -rf
  packages/zec-types/dist && pnpm -r test` reproduces it every time, exit 1, same message. The
  gateway suite imports the BUILT types package, so the recursive test task requires a prior
  `pnpm build` (or a `tsc -b`, which is why running `pnpm typecheck` first hides it).
  HANDOFF-00 A1 reads "pnpm install --frozen-lockfile && pnpm -r test exits 0 on a clean checkout
  of the branch". That is false on a genuinely clean checkout. It passed in my HANDOFF-00 and
  HANDOFF-01 verifications only because I ran `pnpm typecheck` first and it emitted the dist.
  CI is not affected: its order is Install, Build, Typecheck, Lint, then tests. Not urgent, but it
  is the fourth §5 assertion in three handoffs that does not survive literal execution, and it
  should stop happening. Fold 1 fixes it.

OBSERVED, NOT A FINDING: `pnpm build` failed for me on this branch with "`next/font` error:
  Failed to fetch Instrument Serif / JetBrains Mono / Manrope from Google Fonts". Same commit,
  same command, succeeded during my HANDOFF-01 verification and on CI. This is precisely the
  non-hermetic build HANDOFF-01 deferred and LEDGER-01 Q3 named as the reason not to put Playwright
  in CI. It is no longer hypothetical - it has now flaked for me once. Fold 2 raises its priority.

ANSWERS to the ledger questions:
  Q1 WHICH HANDOFF WHEN THREE ARE OPEN — you read it right, and the rule was loose. It is now:
     **the lowest-numbered handoff with status: open, unless the prompt names a file; the prompt
     names one whenever more than one track is open.** Fold 3 puts that in CLAUDE.md and the
     kickoff line. 05 and 10 stay open and unclaimed on purpose: they are the Data and Infra
     tracks and they run in their own sessions when Aqua chooses to start them. This session owns
     HANDOFF-03 and nothing else.
  Q2 sources.json AT 328 WITH 144 UNCITED — keep the union. A bibliography larger than the
     citation graph is the correct shape for this site: the thesis is that the record is public and
     checkable, and a reader who wants to audit a claim we did not cite should still find the
     source. But /sources must not present 328 undifferentiated links. Fold 4: the page separates
     "cited by the Record" from "in the corpus, not cited", and the count of each is stated.
  Q3 THREE DATE FIELDS — confirmed, ship it. `date` sorts, `datePrecision` says how much of it is
     real, `dateText` is what renders, `dateEnd` closes a range. Inventing a day to satisfy an id
     format would have fabricated precision on a site whose entire argument is about not doing
     that. Fold 5 makes `dateText` the rendered string an explicit contract line in HANDOFF-03 so
     it cannot regress to a formatted `date`.
  Q4 SECTION D vs PART C ON CATEGORY — section D wins, as you did it. A NET filter with nothing
     behind it would be worse than wrong; it would be a filter that quietly tells the reader the
     promotion network is not part of the story. Record the 14 additions and 7 recategorisations
     in the ledger, which you did.
  Q5 GRAYSCALE — your reading is right. 388,673.68359943 ZEC at 30 Jun 2026 is the figure that
     belongs with $155,252k total assets; 393,522.33134026 is the 31 Dec 2025 line, and research 01
     line 412 and dossier E.3 both mis-paired it with the Q2 10-Q. Ship the June figure as the
     headline with the December one carried alongside, both dated. Fold 6 adds a correction note to
     the dossier so the mis-pairing is not re-harvested.
  Q6 THE FOURTH GATE ROUND — you were right, and the rule was wrong. The cap governs convergence
     on a finding, not a budget of corrections. Rounds that go two HIGH, one, none are converging;
     new defects from different reviewers are new information, not a loop. And the specific
     defects settle it: shipping a Form 144 attributed to the wrong Silbert entity, or a $174M
     figure asserted against Arthur Hayes thirty lines below the text that disclaims it, to protect
     a counter, would have been indefensible on a site that exists to hold other people to their
     own record. Fold 3 rewrites the rule as "at most 3 rounds per finding; a round that surfaces
     only NEW findings is not a repeat round", and adds: never ship a known false statement about a
     named person to satisfy a process cap - escalate instead, and if the operator is unreachable,
     fix it and say so.
  Q7 TWO PROMPTS IN ONE SESSION — appending under a heading was the right call and is now the
     rule. Fold 3: `prompts/PROMPT-NN.md` holds every message that steered the session, each
     verbatim under a heading naming what it is and when it arrived. One file per handoff, not one
     per message.
  Q8 THE ADDENDUM FILED UNDER HANDOFF-01 — correct as done. Group by the handoff a block names,
     not by arrival time; the block says when it arrived.

FOLDS (apply in the RECONCILE commit):
  1. HANDOFF-03 §4 - add a deliverable: make `pnpm -r test` self-sufficient. Either give the test
     task a build dependency in `turbo.json` (`"test": { "dependsOn": ["^build"] }`) or add a
     `pretest` to the gateway package. Then correct HANDOFF-00's A1 in place to name the actual
     command sequence, with a one-line note that L2 reproduced the failure on 23 Aug 2026 by
     deleting `packages/zec-types/dist`. §5 assertion: `rm -rf packages/zec-types/dist && pnpm -r
     test` exits 0 *(fail side: revert the fix, same command, observe the resolve error)*.
  2. HANDOFF-03 - the font vendoring in the earlier fold is now the FIRST deliverable, not one of
     several: `next/font/local` with the four families committed under `apps/web/src/fonts`, no
     Google Fonts fetch at build time. It has now flaked for L2 once (see OBSERVED above) and it
     blocks the Playwright CI job in HANDOFF-10. §5 assertion: `grep -rn "next/font/google"
     apps/web/src` is empty, and a build with no network reaches "Generating static pages".
  3. CLAUDE.md, Revolution protocol - three amendments: (a) step 3 becomes "EXECUTE the
     lowest-numbered handoff with status: open, unless the prompt names a file - and the prompt
     names one whenever more than one track is open"; (b) the Loop 4 cap becomes "at most 3 rounds
     per finding; a round that surfaces only NEW findings, from a different reviewer or a different
     file, is not a repeat round. Never ship a known false statement about a named person to keep a
     counter down: escalate, or fix it and say so in section 7"; (c) step 5 becomes "archive every
     message that steered the session to `handoffs/prompts/PROMPT-NN.md`, each verbatim under a
     heading naming what it is and when it arrived".
  4. HANDOFF-03 §3 - `/sources` renders two labelled groups, "cited by the Record" and "in the
     corpus, not cited", each with its count, rather than one undifferentiated list of 328.
  5. HANDOFF-03 §3 - timeline rows render `dateText` verbatim. A formatted `date` is never shown;
     `datePrecision` drives any relative or grouped display. §5 assertion: no rendered timeline row
     shows a day for a row whose `datePrecision` is coarser than `day`.
  6. HANDOFF-03 §4 - add a correction note to `docs/2.0/RESEARCH-2026-08-DOSSIER.md` E.3 and to
     `docs/2.0/research/01-contemporary-zcash.md` near line 412: the 393,522.33134026 ZEC figure is
     the 31 Dec 2025 line and is mis-paired there with the Q2 10-Q and with $155,252k total assets;
     the June 2026 figure is 388,673.68359943 (LEDGER-02 Q5).

OPERATOR CLICKS OUTSTANDING: Vercel Deployment Protection blocks every preview - L2 could not
fetch `/beware` even with a regenerated share token (302 to the SSO endpoint), so the route
checklist stays UNVERIFIED over the wire for a second revolution. Turn on Protection Bypass for
Automation, or drop protection on preview deployments, if you want previews checkable by L2 and CI.
Also still outstanding: delete the stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`, and
delete the orphaned Vercel project `z-cash-reveal-dashboard`. The `z-cash-reveal-dashboard2`
settings move is no longer urgent - `apps/web/vercel.json` now pins its own settings, so that
project keeps building from its stored ones - but do it before the HANDOFF-11 cutover.
