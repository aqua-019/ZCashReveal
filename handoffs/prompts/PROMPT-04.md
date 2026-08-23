# PROMPT-04 — the messages that steered the HANDOFF-04 session

Archived under the revolution protocol, step 5: every message that steered this session, verbatim,
under a heading naming what it is and when it arrived. One file per handoff, not one per message.

## 1. Session kickoff — the message that opened the session (23 Aug 2026)

Arrived as an attached file, `PROMPT04.md`, with the covering line "prompt04 attached". Reproduced
here byte-for-byte, including the fenced `L2 RESOLUTION` block that the protocol's step 2 consumes.

```
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md, then execute handoffs/HANDOFF-04-tracking-ui.md. It is the Web track's open handoff and it is the one you own. Report spawn mode first. Stop at PR opened.

L2 RESOLUTION

L2 RESOLUTION — HANDOFF-03 (Cowork, 23 Aug 2026)

VERIFY (Executed by L2 on a clean worktree of 652c366, not relayed):
  pnpm install --frozen-lockfile rc=0 · pnpm typecheck 6/6 · pnpm lint 0 errors, 1 pre-existing
  warning · check-no-emoji rc=0 · check-vercel-config rc=0 · content validate rc=0, 190 refs cited
  / 138 uncited · Playwright 68 passed in 1.7 m · Vercel status on the head: SUCCESS.
  FOLD 1 PROVEN: `rm -rf packages/zec-types/dist && pnpm -r test` now exits 0 - content 58,
  gateway 7, indexer 133 / 38 skipped, web 139. That is the exact command that failed before, so
  finding F-02-1 is closed by the turbo `test: dependsOn ^build`.
  FOLD 2 PROVEN HERMETICALLY, and harder than the assertion asks: I built `apps/web` inside a
  network namespace with no interface at all (`unshare -rn ... next build`), rc=0, all routes
  emitted. The build no longer touches the network. That is the strongest form of the claim and
  it holds.
  INDEPENDENT SOURCE CHECK, the highest-stakes claim in this PR. I did not take the Form 144
  correction on trust; I read it from SEC EDGAR myself. `data.sec.gov` confirms two distinct
  filers - Barry E. Silbert, CIK 0001976415, and Silbert Family Investments LLC, CIK 0001979086 -
  and the LLC's only Form 144 in that window is accession 0001979086-25-000009, filed
  2025-11-05. Its `primary_doc.xml` reads: issuer **Grayscale Zcash Trust (ZEC)**, class common,
  9,753 units, aggregate market value **$407,312.59**, approximate sale date 5 November 2025,
  exchange OTCQX. Every element of the corrected reading matches the primary document. I also
  checked the arithmetic that the ledger prose states loosely: $41.76 is 407,312.59 / 9,753, and
  in the shipped data it is attached to the 9,753-share line, not to the 1,000-share one. The
  ledger sentence is ambiguous; `timeline.json`, `network.json`, `contradictions.json`,
  `FlowsAllegations.tsx` and `flows/page.tsx` are all correct and unambiguous. No finding.
  Verdict: every assertion holds. Four gate rounds, converging. NO FINDINGS.

ANSWERS to the ledger questions:
  Q1 THE PERFORMANCE FLOOR — (c) then (b), as you recommended, and the reasoning matters more
     than the number. You took the page from 89 to 94 with four real reductions and then stopped,
     rather than shaving a noisy metric until it happened to clear. That is exactly right and I
     want it repeated: a budget exists to make a page fast, not to make a number look a certain
     way, and a floor cleared by luck teaches nobody anything. So: the authoritative measurement
     moves to the deployed page, not `next start` in a container, because brotli and a CDN are
     part of what the reader actually gets. That measurement is currently impossible - see the
     operator click below - so until it exists, 94 on /beware is ACCEPTED as passing. If the
     deployed number still misses, Record pages of this size get a floor of 90 and the splash
     keeps 95, recorded with this reason. Fold 3 writes both into HANDOFF-04.
  Q2 THE ACCENT BUDGET — the two documents disagree because CLAUDE.md is incomplete, not because
     the mockup is wrong. Ruling: gold has FOUR licensed jobs, not three. The primary action; the
     active state; value crossing a pool boundary; and the system-identity register - the
     wordmark, the screen index, the entry letters, the clock dot. That last one is what the
     mockup has always spent gold on and what the crews reproduced faithfully. Everything else is
     ink. Your two calls stand: the shielded-share series is a quantity and is correctly ink, and
     gold on the network loop's money edges is correct because a disclosed payment between two
     parties is precisely value crossing a boundary. Fold 4 amends CLAUDE.md so this cannot be
     re-litigated.
  Q3 SWEEPING A CORRECTION ACROSS EVERY FILE — yes, and this is the best process finding of the
     three revolutions. A fact corrected in one file while two others still state it is worse
     than the original error, because the site now contradicts itself about a named person. Fold
     4 adds it to CLAUDE.md: when a gate round corrects a claim of fact, grep the whole tree for
     every restatement of it, fix all of them in the same commit, and list the swept files in
     section 7.
  Q4 THE QUARANTINE HAS NO HOME PAGE — add `surface` to the `Unverified` schema, and let the seed
     say where it renders instead of two files having to agree. Assigned to HANDOFF-04 in fold 5,
     since 04 touches `packages/content` for the tracking DTOs anyway.
  Q5 THE FOUR ROUTE STYLESHEETS — the consolidation stays; one render-blocking request is worth
     more than authorial tidiness, and a 1,370 ms measurement settles it. The de-duplication is
     its own pass and belongs at the START of HANDOFF-04, not after it: 04 adds the largest CSS
     surface in the project, and collapsing three mono treatments and a five-step inset ladder is
     cheaper before that than after. Fold 6.

FOLDS (apply in the RECONCILE commit):
  1. HANDOFF-04 §3 - add: `apps/web` takes `@zcashreveal/types` as a dependency, and `/method`
     imports the `ClaimLevel` union rather than restating it (LEDGER-03 INFERRED).
  2. HANDOFF-04 §3 - add: the timeline contract from LEDGER-02 Q3 binds here too - any date the
     tracking UI renders prints its own `dateText`, never a formatted sort key, and a coarse
     precision never renders a day.
  3. HANDOFF-04 §5 - the Lighthouse assertion reads: performance >= 95 and accessibility >= 95
     measured on the deployed preview; where no deployed measurement is reachable, the container
     number is recorded instead and a Record page of `/beware`'s size passes at >= 90 with the
     reason cited (LEDGER-03 Q1). Accessibility stays at >= 95 with no exception, on any surface.
  4. CLAUDE.md - two amendments. (a) Design system: gold has four licensed jobs, not three - the
     primary action, the active state, value crossing a pool boundary, and the system-identity
     register (wordmark, screen index, entry letters, clock dot). Any other gold mark is a
     finding. (b) Revolution protocol, a new line under the gate: when a gate round corrects a
     claim of fact, sweep the whole tree for every restatement of that fact, correct all of them
     in the same commit, and list the swept files in section 7. A correction that lands in one
     file while another still states the error is a HIGH finding, not a LOW one.
  5. HANDOFF-04 §4 - add a deliverable: a `surface` field on the `Unverified` schema in
     `packages/content`, carrying the route each quarantined record renders beside, with
     `permalink()` reading it rather than a prefix rule; retire the split module in `apps/web`
     that currently holds that mapping (LEDGER-03 Q4).
  6. HANDOFF-04 §4 - add as the FIRST deliverable: the `globals.css` de-duplication pass named in
     LEDGER-03 Q5 - three preformatted-mono treatments to one, two compact-cell registers to one,
     seven card insets onto the five-step ladder - before any tracking CSS is written. §5
     assertion: the three collapsed patterns each appear once, and the page renders identically
     before and after (a Playwright screenshot comparison on `/beware` and `/flows`).

OPERATOR CLICKS OUTSTANDING, and the first one is now blocking:
  - Vercel Deployment Protection. Three revolutions in a row have ended with the route checklist
    and now the performance floor UNVERIFIED over the wire, because every preview returns 302 to
    the SSO endpoint - I could not fetch `/beware` even with a regenerated share token. Turn on
    Protection Bypass for Automation, or drop protection on preview deployments. Until then
    nobody, L2 or CI, can measure the page a reader would actually get.
  - Delete the stale remote branches per `docs/2.0/BRANCH-CLEANUP.md`.
  - Delete the orphaned Vercel project `z-cash-reveal-dashboard`.
  - Before the HANDOFF-11 cutover: move the old root `vercel.json` settings into the
    `z-cash-reveal-dashboard2` project settings.
```
