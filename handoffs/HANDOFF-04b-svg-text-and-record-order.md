---
handoff: 04b
title: The SVG text regime, and claim order on the remaining Record pages
status: closed
branch: the session-designated branch (name it `feat/v2-04b-svg-text-and-record-order` if you may choose)
track: Web
depends_on: 04a
blocks: 11
written_by: L3, from the §1 SCOPE in the L2 RESOLUTION for HANDOFF-04a · 1 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-04b — the SVG text regime, and claim order on the remaining Record pages

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their
> first output (proven by a tool attempt). Workers return on the status ladder (`DONE` /
> `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS ·
> NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript and at least one
> DATA-side fail probe drawn from inside its stated exclusion set. The PR stops at **opened**.

**This is the fourth handoff in this directory written by the session that executes it, and the
second written from reader feedback rather than from the plan.** 09a and 09b were consequences the
plan implied and had not scheduled; 04a was a consequence the plan did not contain; 04b is the
REMAINDER of 04a — the two things that handoff measured, named as open in its own §7, and did not
finish. It exists because a §7 that names what it did not close is worth more than one that reports
only what it built, and because L2 ruled (LEDGER-04a Q3) that the remainder owns itself rather than
being folded into HANDOFF-11.

## §1 SCOPE

Verbatim from the L2 RESOLUTION for HANDOFF-04a of 1 Sep 2026, ruling Q3. The full resolution is
appended to `handoffs/LEDGER.md` under `## L2 RESOLUTION - HANDOFF-04a, PR #47`; this is the §1
SCOPE it hands over, unedited.

```
HANDOFF-04b - the SVG text regime, and claim order on the remaining Record pages
depends_on: 04a
blocks: 11

IN SCOPE:
  1. THE SVG TEXT REGIME. Every `<text>` in a scaled viewBox is measured AS PAINTED at the
     viewport widths the site supports, not as declared. Where a declaration cannot satisfy
     the floor at every width - and 04a measured that none can - the label moves to HTML
     positioned over the SVG, which is what `TurnstilePlane` already does and why. Four
     hand-positioned diagrams. The two declarations 04a registered below the floor either
     clear it or keep their registration with the measurement as the reason.
  2. THE FLOOR BECOMES ENFORCEABLE FOR SVG. 04a's floor check reads CSS; extend it to compute
     PAINTED size (declared x viewBox scale) at each supported width, so the regime is guarded
     rather than remembered. Self-tested in both directions like the other thirteen.
  3. CLAIM ORDER ON THE SEVEN REMAINING RECORD PAGES. Claim -> explanation -> evidence ->
     the working, with 04a's collapse rule: never the claim, never `confidence`,
     `lastVerified` or the source count; always a `<summary>` carrying its finding.
     **`Cite.tsx` IS THE FIRST FIX**, per my correction above - it violates the rule I cited
     it as an example of.
  4. DELIVERABLE 0, above: the sixteen-line repair to the reference file, in its own
     commit, first.
  5. Nothing else. No plane component changes, no nav changes, no data-layer change of any kind.

  §5 WANTS AT MINIMUM, in the amended format with exclusion sets:
    - no `<text>` in any `apps/web` SVG paints below the floor at any supported viewport width,
      MEASURED at each width *(fail side: declare a value that clears the floor at 1440 and not
      at 760, and watch the assertion name the width)*.
    - every one of the eight Record pages leads with a claim, and its `confidence`,
      `lastVerified` and source count are reachable without opening a disclosure
      *(fail side: collapse one of the three on one page)*.
    - `Cite.tsx`'s summary carries a digit and its confidence is outside the toggle.
    - `pnpm -r test` unchanged in COUNT as well as colour. Baseline **1346 total, 1343 passed,
      3 skipped**, measured by L2 on a clean worktree of `7c93a37`.
    - thirteen guards plus the extended floor check, typecheck, lint, `content validate` and
      `pnpm build` green.

  AND THE TWO NON-ASSERTIONS 04a INTRODUCED, both of which paid: §7 states which reader
  complaints the branch closed and which it did not, and §7 carries a SCREENSHOT-DERIVED CHECK.
  04a found six defects by rendering and none by reading, including one - the plane painting
  `var(o)` and drawing nothing - that typecheck, lint and the build were all green on.
```

### DELIVERABLE 0, quoted in full because it is applied before anything else

Also verbatim from the same resolution. L2 wrote `04a-turnstile-plane.html`; L2 found the defect in
it after 04a reported it rather than changed it; L2 specified the repair line by line. This session
applies it, in its own commit, first.

```
  (i) Three tiles lose their hardcoded values and gain ids. Replace:
        <div class="tile"><span class="k">crossings</span><span class="v">17<span class="u">24h</span></span></div>
        <div class="tile"><span class="k">crossed</span><span class="v">41,208<span class="u">zec</span></span></div>
      with:
        <div class="tile"><span class="k">drawn</span><span class="v" id="tileCrossings">-<span class="u">marks</span></span></div>
        <div class="tile"><span class="k">measured</span><span class="v" id="tileTotal">-<span class="u">crossings</span></span></div>
      and replace:
        <div class="tile"><span class="k">pending</span><span class="v">3<span class="u">mempool</span></span></div>
      with:
        <div class="tile"><span class="k">pending</span><span class="v" id="tilePending">-<span class="u">mempool</span></span></div>

  (ii) In `render()`, MOVE the line `var pend = flows.filter(...).length;` up so it sits
      immediately after `STATE=build(idx); flows=STATE.flows;` - it is currently declared below the
      point the tiles need it.

  (iii) After the line that sets `rateLab`'s textContent, add:
        document.getElementById("tilePending").firstChild.nodeValue = String(pend);
        document.getElementById("tileCrossings").firstChild.nodeValue = String(STATE.shown);
        document.getElementById("tileTotal").firstChild.nodeValue = STATE.total.toLocaleString("en");

  VERIFY IT THE WAY THE DEFECT WAS FOUND - by rendering, not by reading. Drive the arrival-rate
  input to each of its five positions and assert that the three tiles, the legend and the drawn
  arc count reconcile at every one.
```

L2's own measurement of the repaired file, at four of the five positions, which §7 must reproduce
independently rather than restate:

```
rate 0: drawn 9  / measured 9     / pending 1 · legend 9  / 1  · arcs 9
rate 1: drawn 17 / measured 17    / pending 0 · legend 17 / 0  · arcs 17
rate 3: drawn 60 / measured 900   / pending 2 · legend 60 / 2  · arcs 60
rate 4: drawn 60 / measured 5,200 / pending 2 · legend 60 / 2  · arcs 60
```

`04a-splash-record.html` needs no change: its tank-limit reconciles the unconfirmed count in words,
which is why only one of the two files carried the defect. **The plane COMPONENT is not in this
handoff's scope** — this is the reference document, not `TurnstilePlane.tsx`.

## §2 READING (state before you start)

Required, in this order:

- `CLAUDE.md`, then `handoffs/LEDGER.md` — in particular the `## HANDOFF-04a` block and the
  `## L2 RESOLUTION - HANDOFF-04a, PR #47` block appended directly beneath it — then this file.
- **`handoffs/HANDOFF-04a-legibility.md` §7**, which is the map of what is still open. Its own
  words: complaint 3 is "closed for HTML text and MEASURED-OPEN for SVG chart text"; complaint 4
  is "closed on the SPLASH and open on the other seven Record pages". Those two sentences are this
  handoff's whole scope and neither is a new discovery.
- `apps/web/test/unit/type-scale.test.ts` — A3's floor check as 04a left it, including the
  `SVG_EXCLUSIONS` register, its count check and its two fail sides. Deliverable 2 extends this;
  it does not replace it.
- `apps/web/test/e2e/legibility.spec.ts` — the rendered half of the same assertion.
- `apps/web/src/components/record/Cite.tsx` — the first fix of deliverable 3, and the exemplar L2
  offered for a rule the component breaks.
- `apps/web/src/components/track/EstimatePanel.tsx` — the summary that DOES carry its finding
  (`how this was bounded - 3 filters, 2 assumptions`), which is the shape deliverable 3 spreads.
- `apps/web/src/components/record/TurnstilePlane.tsx` — the proven technique: HTML labels
  positioned over the SVG. Read it to copy the pattern; **do not change it** (§1 item 5).
- `docs/2.0/mockups/04a-turnstile-plane.html` — deliverable 0's subject. RENDER it before and
  after; reading the markup is not the same as seeing it.
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` — the standing source of truth for values.
  **It keeps its 8.5px and is not amended** (LEDGER-04a Q1): it is the historical record of what
  was designed in August, and editing it would destroy the evidence that the divergence exists.

`docs/2.0/SNAPSHOT.md` is NOT required reading for this handoff: nothing in scope touches Redis, a
Vercel variable or the publisher, and 04a already rendered §8.1's null-state contract. Stated
explicitly so its absence is a decision rather than an omission.

### L2's findings and corrections, to be verified before acting

Every one of these is checked and its disposition (`ACCEPTED` / `CORRECTED` / `DEFERRED`) recorded
in §7. Two of L2's premises were false in 04a and checking them produced that branch's best work;
the same discipline applies here, and it now applies to L2's CORRECTIONS as much as to its claims.

- **F-04b-1 (from L2's Q3(i), MEASURED)** — SVG `<text>` paints at a minimum of **16.10px at
  1440, 11.11 at 1024 and 7.94 at 760**, measured by L2 on the served production build against
  COMPUTED styles. 04a measured the same regime from the other end: the loop diagram's viewBox is
  1000 units wide and renders at 1384 CSS px at 1440 (scale 1.384), 968 at 1024 (0.968) and 720 at
  760 and below (0.72), so a declared 12 paints at 16.6, 11.6 and 8.64. **A floor the viewport can
  walk under is not a floor.** Two independent measurements, one from the source and one from the
  render, agreeing to within rounding. Verify BOTH before building on either.
- **F-04b-2 (HIGH, L2's own correction of F-04a-6)** — `Cite.tsx` was cited as the collapse rule
  done right and is the rule's own forbidden case: no digit in its `<summary>`, and `confidence`,
  `lastVerified` and the source list ALL behind the toggle. **The violation was offered as the
  exemplar.** This is why it is the first fix rather than one of eight: every page that renders a
  citation inherits it, so a fix at the component lands everywhere at once and a page-by-page pass
  would have rebuilt around a broken example.
- **F-04b-3 (L2's Q1 ruling)** — the 12px floor is ACCEPTED and the divergence is RECORDED rather
  than propagated. The deciding fact is the one 04a measured and L2 got wrong: the site matched
  the mockup at 8.5px and a reader called it punishment. **A source of truth falsified by a reader
  is falsified.** The mockup keeps its 8.5px; the ledger carries the divergence.
- **F-04b-4 (L2's Q2 ruling)** — the adaptive retention window is **DEFERRED WHOLE** to the
  handoff that adds the per-crossing source, and is not to be half-built before then. The reason
  is sharper than 04a's: a "shortened window" presupposes the drawn marks are the NEWEST N, and
  without per-crossing heights there is no ordering, so there is no "newest". The window is not
  partially implementable; it is not implementable at all today. **Nothing in this handoff touches
  it**, and §8 restates the bound so the handoff that inherits it inherits the reason too.
- **F-04b-5 (L2's rule about its own instruments, folded into `CLAUDE.md` by this session)** — a
  probe whose output is an ordering, a pairing or an enumeration is checked against one known
  member before any finding is built on it. L2's third malformed probe on this project was
  `sort -u` over `font-size:` STRINGS, which sorts lexicographically, so `"10px"` precedes
  `"8.5px"`. **This handoff's own instruments are list operations** — an inventory of every
  `<text>`, an enumeration of eight pages, a pairing of declared sizes to viewBox scales — so the
  rule applies to this session before it applies to anyone else. Every enumeration in §7 states
  the known member it was checked against.

## §3 CONTRACT

### Rulings carried in, so nobody re-derives them mid-gate

- **R1 — the floor is 12px and the mockup is not amended.** LEDGER-04a Q1, above.
- **R2 — where a declaration cannot satisfy the floor at every width, the LABEL MOVES.** Not the
  number: 04a measured that no declared value satisfies the floor at every supported width, so
  choosing a bigger one is not a fix, it is a different failure at a different width. The label
  becomes HTML positioned over the SVG, which is what `TurnstilePlane` already does and why. A
  declaration that CAN clear the floor at every width may simply be raised.
- **R3 — a registered exception keeps its measurement as its reason, or it clears the floor.**
  There is no third option, and in particular "it is small on purpose" is not one. The register in
  `type-scale.test.ts` is iterated by its own tests and carries a COUNT check; both survive.
- **R4 — the collapse rule, unchanged from 04a and now applied to seven more pages.** Never the
  claim. Never `confidence`, `lastVerified` or the source count. Collapse the derivation, the raw
  table, the method walk-through, the full source list. Every `<summary>` carries its finding.
- **R5 — claim order.** Claim, then explanation, then evidence, then the working. The reader's
  complaint named the failure exactly: "vibes, cryptographic terminology, vibes, huge number, tiny
  explanation, vibes". A page that opens on a number has already lost, because a number with no
  claim above it is a vibe with a decimal point.

### Standing contract this handoff does not weaken

- Claim levels, the never-claim-identity rule and the shielded-balance rule are untouched.
- An absence states its CONDITION, never an owner (`docs/2.0/SNAPSHOT.md` §8.1).
- The four type families are pinned; the palette is settled; the accent budget's four licensed
  jobs are unchanged. **The one divergence this handoff inherits is 04a's size floor**, already
  recorded, and this handoff makes no new one.
- Gold marks a boundary crossing, never a magnitude. A figure about unprovability is never gold.
- Nothing here touches Redis, a Vercel variable, the publisher, the gateway, the indexer, a
  migration, `TurnstilePlane.tsx`, `nav.ts` or any data layer. No production promotion. **The PR
  stops at opened.**

## §4 DELIVERABLES

| # | deliverable | where |
|---|---|---|
| 0 | The sixteen-line repair to the reference file, **in its own commit, first**, verified by rendering at all five arrival-rate positions | `docs/2.0/mockups/04a-turnstile-plane.html` |
| 1 | The SVG text regime: every `<text>` in `apps/web` measured AS PAINTED at every supported width; labels that cannot clear the floor at every width moved to HTML positioned over the SVG | the four hand-positioned diagrams under `apps/web/src/components/record/`, `apps/web/src/app/globals.css` |
| 2 | The floor becomes enforceable for SVG: a check that computes painted size (declared × viewBox scale) at each supported width, self-tested in both directions and driven over the real tree, wired into `pnpm check` and CI | `scripts/`, `package.json`, `.github/workflows/`, `apps/web/test/` |
| 3 | Claim order on the seven remaining Record pages, with **`Cite.tsx` fixed first** | `apps/web/src/components/record/**`, `apps/web/src/app/**/page.tsx` |
| 4 | The two 04a-registered sub-floor declarations either clear the floor or keep their registration with the measurement as the reason | `apps/web/test/unit/type-scale.test.ts`, `apps/web/src/app/globals.css` |
| 5 | The guard count swept everywhere it is stated, if deliverable 2 adds a guard | `CLAUDE.md`, `handoffs/README.md`, `.github/workflows/`, and any register row that counts them |

## §5 ASSERTIONS — binary and machine-checkable

Amended format (LEDGER-09a Q2): every assertion states its **EXCLUSION SET** — the values its
predicate is written to reject — and names which member of that set its fail side used. At least
one fail side per assertion is a DATA mutation, a value drawn from inside the set, because a fail
side that is only a code mutation proves the assertion is WIRED and never that it DISCRIMINATES.
`scripts/check-ledger-structure.mjs` R4 checks that both clauses are PRESENT; it cannot check that
either is correct, and that limit is stated in its own header.

- **A0.** THE REFERENCE FILE RECONCILES AT EVERY RATE. In the repaired
  `docs/2.0/mockups/04a-turnstile-plane.html`, at each of the arrival-rate input's five positions,
  the `drawn` tile equals the legend's crossing count equals the number of arcs the board actually
  draws; the `measured` tile equals the counted total; the `pending` tile equals the legend's
  `unconfirmed` count. Measured by RENDERING the file and reading the DOM, not by reading the source.
  *Exclusion set:* any rate position at which a tile and the legend disagree, and any tile whose
  displayed value is a literal in the markup rather than written from the same `STATE` as the board.
  *Fail side names:* the static `3` in the `pending` tile beside a legend computing `unconfirmed 0`
  — the member L2 shipped, 04a reported and this deliverable removes — spliced back into the
  repaired file and shown to break the reconciliation at the default rate.

- **A1.** NO SVG TEXT PAINTS BELOW THE FLOOR, AT ANY SUPPORTED WIDTH. Every `<text>` reachable in
  `apps/web` has a PAINTED size — declared user units × (rendered CSS width ÷ viewBox width) — at
  or above `--t-floor` at every viewport width the stylesheet supports, and a failure NAMES THE
  WIDTH at which it occurs rather than reporting a bare boolean.
  *Exclusion set:* any (element, viewport width) pair whose painted size is under the floor.
  Members measured by 04a and reproduced by L2: a declared 12 in a 1000-unit viewBox at 760px
  paints at 8.64; the same declaration at 1024px paints at 11.6; a declared 9.5 at 760px paints at
  6.84; and the minimum painted size on the shipped tree was 7.94 at 760, 11.11 at 1024.
  *Fail side names:* a declaration sized to clear the floor at 1440 and fail at 760 — 12 user
  units in a viewBox whose scale at 760 is 0.72 — introduced as a DATA mutation to the size the
  checker reads, with the assertion required to name `760` and not merely to go red.

- **A2.** THE EIGHT RECORD PAGES LEAD WITH A CLAIM. Each of the eight renders, as the first
  substantive content under its head, a CLAIM — a sentence asserting something about the world —
  before any number, chart or table.
  *Exclusion set:* any Record page whose first substantive node is a metric, an eyebrow, a chart,
  a table or a filter control. The reader's own enumeration of the members is the specification:
  "vibes, cryptographic terminology, vibes, huge number, tiny explanation, vibes".
  *Fail side names:* a page whose leading claim element is REMOVED so the page opens on its
  headline figure — the member the shipped tree carries on the pages 04a did not reach — with the
  assertion required to name the page.

- **A3.** EPISTEMIC STATUS IS NEVER BEHIND A TOGGLE. On every Record page, `confidence`,
  `lastVerified` and the SOURCE COUNT are reachable in the rendered DOM without opening any
  `<details>`.
  *Exclusion set:* any of the three rendered only inside a `<details>` element on any of the eight
  pages. "Epistemic status behind a toggle is the null-panel-renders-as-zero defect in a nicer
  coat" (HANDOFF-04a §1 item 4).
  *Fail side names:* `Cite.tsx`'s own shipped markup, which keeps all three inside the toggle —
  a DATA mutation in the strongest sense, because it is not invented: it is the state of the tree
  at the fork point, restored, and the assertion must fail on it at every page that renders a Cite.

- **A4.** `Cite.tsx` CARRIES ITS FINDING AND ITS CONFIDENCE. Its `<summary>` contains at least one
  digit, and its `confidence` renders outside the `<details>`.
  *Exclusion set:* any `Cite` summary with no digit, and any rendering in which `confidence` is a
  descendant of the `<details>` element.
  *Fail side names:* the shipped summary text, restored verbatim — the exemplar L2 offered for the
  rule it breaks.

- **A5.** EVERY SUMMARY STILL CARRIES ITS FINDING. Every `<summary>` in `apps/web` contains at
  least one digit, over the disclosures this handoff ADDS as well as the ones 04a shipped.
  *Exclusion set:* any summary text with no digit in it.
  *Fail side names:* the bare word `Sources`, the rule's own named counter-example, spliced into a
  summary this handoff writes.

- **A6.** THE REGISTER IS EXACT AND ITS REASON IS A MEASUREMENT. Every sub-floor declaration that
  survives is registered with a selector that exists, the size it claims, and a reason that states
  a measured painted size at a named width; the COUNT check still holds, so a new sub-floor
  declaration cannot ride in on an exempted value.
  *Exclusion set:* an unregistered sub-floor declaration; a register row whose selector matches no
  rule; a row whose reason is a preference rather than a measurement.
  *Fail side names:* `9.75px` — a value inside the sub-floor set that the register does NOT name,
  so the probe cannot be satisfied by the rows already accounted for — spliced into the stylesheet
  the checker reads.

- **A7.** THE NEW GUARD IS SELF-TESTED IN BOTH DIRECTIONS AND DRIVEN OVER THE REAL TREE. Its
  self-test ITERATES THE RULE'S OWN DATA STRUCTURE, so a row added later cannot arrive untested,
  and every detector it defines is driven at least once against the real tree rather than only
  against a fixture (LEDGER-09a Q3).
  *Exclusion set:* a self-test whose probe set under-covers the rule's data; a detector that has
  only ever run against a synthetic fixture; a finding path unreachable for every possible input.
  *Fail side names:* the exact member `check-nav-routes.mjs` shipped with in 04a — a self-test
  asserting "the real tree produces zero findings" INSIDE itself, which made exit 1 unreachable
  for every input — reintroduced into the new guard and required to be caught.

- **A8.** THE SUITE IS UNCHANGED IN COUNT AS WELL AS COLOUR, PLUS WHAT THIS BRANCH ADDS, ITEMISED.
  Against the baseline **1346 total, 1343 passed, 3 skipped**, measured by L2 on a clean worktree
  of `7c93a37` with a real PostgreSQL 16 and a real local Redis (`content 67 · zebra-rpc 50 ·
  zec-instruments 98 · web 438 · gateway 143 · publisher 99 +2 skipped · indexer 448 +1 skipped`).
  *Exclusion set:* any test that disappears without being named; any suite whose count falls; any
  skip added.
  *Fail side names:* a deleted test file, which must move the total and be visible as a FALL rather
  than absorbed by an addition elsewhere — the member that makes a per-package itemisation
  necessary rather than a single total.

- **A9.** THE FULL CHECK LIST IS GREEN. The guards named in `package.json`'s `check` script —
  thirteen at the fork point, plus whatever deliverable 2 adds — `pnpm typecheck`, `pnpm lint`,
  `pnpm --filter @zcashreveal/content validate` and `pnpm build`.
  *Exclusion set:* any of the six commands returning non-zero; and, separately, any guard that
  passes VACUOUSLY — CI catches a guard that FAILS and is silent about one that passes on no input
  (L2's correction, LEDGER-09b round 7).
  *Fail side names:* `pnpm build`, the one of the six that runs `next build` and therefore the only
  one that resolves an `apps/web` import the way webpack does — the member HANDOFF-07 shipped past
  on a branch green on all five others.

### Two things that are not assertions, carried forward from 04a because both paid

- **§7 states which reader complaints the branch closed and which it did not.** A redesign that
  reports only what it built has not answered the feedback it was commissioned by. 04a's §7 said
  complaint 3 was "closed for HTML text and MEASURED-OPEN for SVG chart text", and that sentence is
  why this handoff exists. If 04b leaves something open, it says so in the same register.
- **§7 carries a SCREENSHOT-DERIVED CHECK.** 04a found six defects by rendering the page and
  reading it, and none by reading the code — including one, the plane painting `var(o)` and drawing
  nothing, that typecheck, lint and the build were all green on. A type system cannot tell two
  strings apart by what they are for.

## §6 DISPATCH HINTS

- **Deliverable 0 is the lead's, first, in its own commit, and verified by rendering.** It is
  sixteen specified lines in a reference document; dispatching it would cost more than doing it.
- **Deliverable 1 (SVG text) is a director-build fan-out over the four diagrams**, one worker per
  diagram, each returning the diagram's measured painted sizes at every supported width BEFORE it
  changes anything. The measurement is the deliverable; the edit follows from it.
- **Deliverable 2 (the guard) is one worker with Loop 1 PREFLIGHT**, because it is a mechanical-rule
  dispatch against an unfamiliar subsystem, and because three of this project's guards have shipped
  with a self-test that certified a hole. Its PREFLIGHT names the rule's data structure and how the
  self-test will iterate it.
- **Deliverable 3 (claim order) is a director-build fan-out over the pages, AFTER `Cite.tsx` is
  fixed by the lead.** Fixing the shared component first is not an ordering preference: seven
  workers copying a broken exemplar is exactly how F-04a-6 happened.
- **The quality gate is design-reviewer plus a rendered pass.** The rendered pass is not optional
  and is not a screenshot for the record: 04a's evidence is that reading the code found none of its
  six defects.
- **Post-fan-out sweep after EVERY fan-out**: `git status --porcelain` before the next commit, and
  §7 states that it was run and what it returned. Four occurrences of a worker writing outside its
  scope are on this project's record, and one of the lead.
- Workers are told, in their own prompts, that they are read-only where they are read-only, and
  that a tree change they conclude is necessary comes back as a DIFF rather than as an edit.

## §7 REPORT - written by L3 before the PR opens

> Provenance on every claim: **Executed** (output shown), **Read** (file + commit), or
> **UNVERIFIED** (labelled). Assumptions are dispositioned ACCEPTED / CORRECTED / DEFERRED.

### 7.1 Which reader complaints this branch closed, and which it did not

Carried forward from 04a because it paid there and it is why this handoff exists. A redesign that
reports only what it built has not answered the feedback it was commissioned by.

- **Complaint 3** - "half the text is basically 9px gray-on-charcoal punishment" - is **CLOSED**,
  for the first time including SVG. 04a closed the HTML half and left the SVG half MEASURED-OPEN;
  this branch moved every chart label out of the drawing, and `scripts/check-svg-text-floor.mjs`
  fails on any SVG `<text>` that returns.
- **Complaint 4** - "instead of claim, explanation, evidence, visualization, we get vibes,
  cryptographic terminology, vibes, huge number, tiny explanation, vibes" - is **CLOSED on all
  eight Record pages**. 04a closed it on the splash alone.
- **Complaints 1 and 2** were closed by 04a and are not reopened here.

### 7.2 THE MEASUREMENT, AND WHAT IT SAID ABOUT THE BRIEF

**Executed.** Production build (`next build`, rc=0), served, measured in Chromium at ten viewport
widths across fourteen routes, resolving COMPUTED styles and the SVG `getScreenCTM()` rather than
attributes. 1,400 visible SVG text nodes on the fork point.

```
UNDER THE 12px FLOOR at the fork point: 954 node-measurements in 22 distinct groups.

MINIMUM PAINTED SVG TEXT PER VIEWPORT WIDTH (all routes)
  1600  6.71px    1024  3.95px     760  4.78px
  1440  5.95px    1000  3.83px     720  4.49px
  1100  4.31px     900  7.33px     700  4.13px     390  2.00px
```

**L2's Q3 minima were the SPLASH's plot, not the site's.** The brief reported "a minimum of 16.10px
at 1440, 11.11 at 1024 and 7.94 at 760". Those three figures are exactly
`12 x (1342/1000)`, `12 x (926/1000)` and `12 x (662/1000)` - the scales of ONE svg, the
full-width `.glass card` chart on `/`. They are the site's **maximum** among pages carrying SVG
text, not its minimum. The site's real minima are 5.95 / 3.95 / 4.78 / 2.00 at 1440 / 1024 / 760 /
390. **This is the fourth instance of the shape L2 folded into `CLAUDE.md` in this same
resolution** - a probe whose output is an enumeration, taken over the wrong scope - and the second
time running that a brief understated the defect it commissioned. L2 sent an interim note during
this session correcting itself in the same direction, from 7.94 to 3.79 at 390.

**TWO FACTS THAT REFUTE THE OBVIOUS MODEL, and both were found by measuring rather than reasoning.**

- `ShieldedShare` paints at **5.95px on a 1440px desktop**. It sits in the `.record-head` aside, a
  0.8fr column of a two-column grid, so the WIDEST viewport gives it the NARROWEST box. The worst
  case on the site was never at the narrow end.
- It is **NON-MONOTONE**: 3.95px at 1024 and 9.62px at 900, because the head collapses to one
  column at 900 and the chart gets *wider* as the window gets *smaller*. A check that sampled only
  the narrow end, or assumed monotone decay, finds neither case. `SUPPORTED_WIDTHS` therefore
  samples **both sides of every breakpoint**.

**A SECOND INSTRUMENT AGREED, FROM THE OTHER END.** A read-only mapping worker derived the same
table statically from the CSS cascade - `.screen` padding, `.glass.card` inset, the grid tracks -
and reproduced L2's three figures to the digit and this session's rendered figures across nine
SVGs. Two independent instruments, one from the source and one from the render, agreeing.

### 7.3 THE DEFECT SCOPE WAS WIDER THAN THE DELIVERABLE, AND THE ASSERTION GOVERNED

§4 deliverable 1 scopes the work to "four hand-positioned diagrams under `components/record/`".
§5 A1 quantifies over "any `apps/web` SVG". They disagree, and **the assertion won**, per
CLAUDE.md's LEDGER-06 Q4 rule that a named assertion is a RULE checked across the whole tree rather
than a fix at the site that prompted it.

The four named diagrams carry 12 of the 37 `<text>` elements. The other 25 are in
`components/track/Charts.tsx` - seven charts on `/pools` and `/address/:addr` - and **three of them
are worse than anything in `record/`**: the Sankey paints at **2.00px at 390** and BalanceStep and
InteractionGraph at 2.79px, because both sit in grids whose `grid-template-columns` is an INLINE
STYLE carrying no `g2` class, so the `@media (max-width: 720px)` collapse never applies to them.
All 37 moved.

### 7.4 DELIVERABLE 0 - the reference file, verified by rendering at all five rate positions

**Executed**, commit `b7f1809`, before any other work, in its own commit. Every one of the six
scripted replacements asserted that its pattern matched exactly once before writing.

```
rate 0: drawn     9 / measured       9 / pending  1 | legend     9 /  1 | arcs     9 | RECONCILES
rate 1: drawn    17 / measured      17 / pending  0 | legend    17 /  0 | arcs    17 | RECONCILES
rate 2: drawn    60 / measured     140 / pending  3 | legend    60 /  3 | arcs    60 | RECONCILES
rate 3: drawn    60 / measured     900 / pending  2 | legend    60 /  2 | arcs    60 | RECONCILES
rate 4: drawn    60 / measured   5,200 / pending  2 | legend    60 /  2 | arcs    60 | RECONCILES
```

Four of the five reproduce L2's independently measured figures exactly. Rate 2 is the position L2
did not report and is stated here for the first time.

**TWO FAIL SIDES, BOTH DATA MUTATIONS, AND THE SECOND IS THE ONE WORTH THE LEDGER.** Restoring the
shipped markup whole - static `3`, no id, no write line - fails at 5 of 5 positions. Pinning the
tile to the literal `3` while the legend still computes fails at **4 of 5: at rate 2 the literal
happens to equal the computed value and the defect is invisible.** That is the argument for driving
the input to every position rather than to one, and it is why the original defect survived a design
review - a wrong constant is right somewhere.

### 7.5 DELIVERABLE 2 - the guard, and why it BANS the construct rather than measuring it

`scripts/check-svg-text-floor.mjs` is the **fourteenth** static guard.

**The design decision, and it was forced by the measurement.** The brief asks for a check that
computes painted size at each supported width. Painted size is `declared x min(sx, sy)`, and `sx`
depends on the RENDERED width - a layout result, not a fact about the source. Two of the nine SVGs
have a rendered width that is not statically derivable at all (`fr` distribution in the
`.record-head` grid; inline `grid-template-columns` on two pages), so a static model of it would be
a hand-kept copy of the layout that drifts silently. So the guard checks the thing that IS exactly
decidable from the source: **an SVG `<text>` must not exist**, because 04a and this branch both
measured that no declared value clears the floor at every supported width. A construct that cannot
be made safe is banned rather than re-measured instance by instance.

**L2 sent an interim note reaching the same conclusion while this was being written**, listing the
two options and naming (2) as the one it would take. Both had already been taken: the guard bans
the construct AND carries option (1)'s reporting discipline - a synthetic fixture in the self-test,
the OK line stating every count it examined, and **a count of zero reported as a count** rather
than as silence. The condition L2 warned about is real and is named in the guard's own header: with
an empty register, R3's arithmetic has nothing live to run on, so a green R3 is evidence the
arithmetic is right and not evidence about the tree.

**THE SELF-TEST, six arms, every detector driven in both polarities:**

1. R1 over a **fixture tree** with a planted `<text>` (a data mutation: a member of the excluded
   set), an anti-probe on a clean file, a `<tspan>` arm because the tree has none today and that is
   exactly the member that could arrive unnoticed, and a `<text>` **quoted inside a comment**,
   which six real files now do while explaining why they no longer contain one.
2. R1 over the **real `apps/web/src` tree**, plus a check that the real tree still mentions `<text>`
   in prose somewhere - if it did not, the comment mask would be untested against reality.
3. The **REGISTER iterated**: each row driven with and without itself; an orphan row and a
   reason-less row driven separately, because the register is empty and those arms would otherwise
   never run.
4. **R3 in both polarities, with the fail side the brief specified verbatim** - "declare a value
   that clears the floor at 1440 and not at 760, and watch the assertion name the width". 12 user
   units in a 1000-unit viewBox: 16.10px at 1440, 7.94px at 760, and the finding names `760px`.
   Plus an anti-probe that clears everywhere and must be silent, and a missing-width arm.
5. **The height-constrained case, which the real tree cannot supply.** L2 caught a defect in its own
   probe mid-session: it computed the scale as `rect.width / viewBox.width`, which is right only for
   a width-constrained box. Under `meet` the scale is `min(sx, sy)`; under `slice` it is `max`; under
   `none` a glyph's height follows `sy`. Every SVG here happens to be width-constrained, so the
   width ratio agreed with the truth everywhere - **it held by luck**, and the first
   height-constrained SVG would make it OVERSTATE the painted size, which for a floor is the
   direction that passes on a defect. The self-test drives a deliberately height-constrained
   fixture, asserts the two formulas DISAGREE on it, and checks all three `preserveAspectRatio`
   branches. This session's own measurement script was corrected the same way.
6. **The width set checked against the stylesheet**, not against a memory of it: every
   `@media (max-width: Npx)` prelude in `globals.css` must be in `BREAKPOINTS` and vice versa, both
   sides of each sampled, 390 present by name, and something below the narrowest breakpoint.

**EXIT 1 IS PROVEN REACHABLE BY EXECUTION, not by argument.** 04a's `check-nav-routes.mjs` shipped
with exit 1 unreachable for every possible input. This guard's first run over the real tree returned
**23 findings**, one per surviving `<text>` in `Charts.tsx`, before that file was converted.

**ONE CORRECTION TO L2's WIDTH SET, checked before it was acted on.** The interim note says the CSS
"declares max-width breakpoints at 300, 520 and 700". `globals.css` declares seven
`@media (max-width: Npx)` preludes - 700, 720, 760, 900, 1000, 1100, 1600 - and separately declares
element `max-width` values including 300px and 520px, which are box widths and not viewport
conditions; a grep for `max-width:` returns both. **300 and 520 are sampled anyway, on a better
argument**: an element `max-width` is a point at which that box stops growing, so a chart inside it
stops scaling there even though no media query fired. The misreading pointed at real widths for the
wrong reason. 23 widths are sampled in total.

### 7.6 THE INSTRUMENT THAT MEASURES, AND THE FALSE SENTENCE THAT SAID IT ALREADY EXISTED

`apps/web/test/unit/type-scale.test.ts` carried this, in its own header:

> Reading the built output would be better still, and is what A3's e2e half does

**There was no A3 e2e half.** Executed: `rg -n "fontSize|font-size|getPropertyValue|BBox|getBoundingClientRect" apps/web/test/e2e`
returned **zero hits across sixteen spec files**, and no `setViewportSize` call existed anywhere in
the directory - the suite ran at 1280 and 390 only, and neither 1440, 1024 nor 760, the three widths
that file's own register reasons about. Nothing in the tree had ever measured a rendered size at any
width. That is a sentence making a checkable claim about runtime behaviour, checkable by executing
it, and false - the clause (ii)(c) shape exactly.

**It was made TRUE rather than deleted.** `apps/web/test/e2e/painted-floor.spec.ts` measures painted
size in a real browser at every supported width, over ten routes, for SVG text (computed font-size x
`getScreenCTM` min-scale) and for HTML text (computed font-size x the ancestor transform scale,
measured rather than assumed - a `transform: scale()` shrinks HTML text exactly as a viewBox shrinks
SVG text, and every chart label on this site is now HTML). The width set is read from the guard by
executing it, so the static rule and the measurement cannot drift apart. Its fail side plants a
12-unit `<text>` in the live DOM and asserts it clears the floor at 1440 and breaks it at 760, with
the check naming the width.

### 7.7 THREE DEFECTS FOUND IN THE CHECKERS THEMSELVES

**(a) A4 WAS SATISFIABLE BY A COMMENT.** `summary-findings.test.ts` swept raw source for
`<summary>...</summary>`. Components in this tree quote `<summary>` in their docblocks while
explaining the rule, so the regex matched from the `<summary>` inside a comment to the real
`</summary>` far below and captured the prose between them - including the rule's own worked
example, "Sources - 14 cited, 3 primary". The captured body then carried digits, so **a summary read
as carrying a finding because its own documentation mentioned one.** That is "a comment cannot fail"
arriving in the checker rather than in the palette. Found because a new exemption self-check
asserted `Working.tsx`'s summary carries NO finding in the source and got the opposite answer: the
probe was right and the parser was wrong, and establishing which before changing either is the order
this project's rule about probes insists on. Comments are now masked length-preservingly, and the
defect is driven as its own two-polarity test.

**(b) THE A3 FAIL SIDE DROVE A COPY OF THE PARSER, NOT THE PARSER.** `declaredSizes()` closed over a
module-level `CSS`, so the 9.75px probe could not point it at a mutated string and re-implemented
the mask and the sweep inline. A fail side that re-implements the check proves nothing about the
check that ran on the pass side. `declaredSizes` now takes its source, both polarities run through
the same function, and an anti-probe asserts the same call is silent on the unmutated stylesheet.

**(c) THE NEW GUARD HAD AN INPUT IT COULD NOT JUDGE, AND ITS ANSWER FOR THAT INPUT WAS "PASS".** A
`REGISTER` row omitting `viewBoxHeight` makes `sy` NaN, `min(sx, NaN)` NaN, and `NaN < floor`
**false** - so R3 would have reported such a row as clearing the floor at every width, silently, for
the one input it was incapable of evaluating. Found by reading the guard against this project's own
standing question rather than by a failing run: *what input can this predicate not judge, and what
does it do then?* R3 now reports a non-finite result as a finding, with a two-polarity arm - a row
with its height stripped must fire, a complete row must not. This is the third defect in a checker
on this branch and the only one found by reading; the other two were found by executing a probe,
which is the ratio `check-instrument-deps.mjs` measured at eleven to one.

### 7.8 THE REGISTER 04a LEFT IS NOW EMPTY, AND EMPTY IS NOT THE SAME AS DELETED

04a registered two sub-floor declarations - `.plot .edge-label` and `.plot .nw-sub`, both 9.5 user
units - with the measurement as the reason and an honest note that the real fix was HTML labels.
Both elements moved, so both rows went. **The empty list is the deliverable, and it is the exact
shape 04a's own §8 recorded as a defect one layer up**: `css-dedup.test.ts`'s register named
`font-size: 11px`, no rule declared 11px any more, and the check "would have gone VACUOUS rather
than failed". So the count test asserts against `SVG_EXCLUSIONS.length` rather than a literal zero,
the row loop is kept so a row added later arrives tested, a new test drives the row-checking
machinery over a SYNTHETIC row so the empty loop is not a silent pass, and both fail sides splice a
real sub-floor value into the real parser.

### 7.9 THE STACK, AND THE ASSERTION IT WAS NOT ALLOWED TO WIDEN

The HTML label layer has to sit exactly on the drawing's box, and the drawing's box is a layout
result. A wrapper `<div>` around the two would make that trivial - and would take the `<svg>` out of
`figure[data-chart] > svg`, which is the selector assertion A3 counts.

**Widening A3's selector to a descendant combinator would have been the easy fix and was refused.**
An assertion relaxed so that this branch's change passes is an assertion that measures this branch
rather than the property. Instead `figure.chart` became a named-area grid: the `<svg>` and the
`.plotlabels` layer are BOTH direct children placed in the same `plot` area, so the row's height is
the drawing's height, the layer stretches to it, and A3's structure is untouched. Named areas rather
than row numbers because the legend and the note are optional and an auto-placed layer would land in
a different row on charts that omit them.

**Why percentage positioning is exact rather than an approximation, and it is a property of the
markup rather than a hope:** every chart `<svg>` carries a `viewBox`, `preserveAspectRatio="xMidYMid
meet"`, `width: 100%` and `height: auto`. The intrinsic aspect ratio of such an element comes from
the viewBox, so the rendered box's ratio EQUALS the viewBox's and user unit `x` maps to
`x / viewBoxWidth` of the layer's width - with no scale factor to track and nothing to recompute
when the layout moves.

### 7.10 A THIRD DEFECT, FOUND BY THE FIRST RENDER RATHER THAN BY THE DESIGN

The converted labels collided in the corner: the `0%` y tick and the `2018` x tick sat on top of
each other on `/timeline`. The cause is a category error the old `<text>` could not express. The
SVG offsets were in USER UNITS - 8 units left of the axis, 17 units below it - which were about 4px
and 8.4px of clearance for 5.95px text at 1440 and about 11px for 7.94px text at 760. **The ratio of
gap to glyph was roughly right by accident, because both scaled together.** At a fixed 12px it is
not: the gap still scales and the glyph does not.

So `ChartLabel` carries `dx`/`dy` in CSS PIXELS alongside `x`/`y` in user units, and the rule is
stated where a reader meets it: the anchor says where on the DRAWING the label belongs and scales;
the gap is about the reader's eye and does not. Every converted label's hand-tuned offset moved to
the pixel side; every coordinate that names a position on the drawing stayed in user units.

### 7.10b THE SHARPEST DEFECT ON THIS BRANCH: 86 OF 155 LABELS HAD NO TRANSFORM AT ALL

**`calc(<number> + <length>)` is invalid CSS.** `.plabel` composes its anchor, its baseline and its
pixel nudge into ONE `transform`, because a second `transform` rule would REPLACE the first rather
than add to it:

```css
transform: translate(calc(var(--plabel-tx) + var(--plabel-dx)), calc(var(--plabel-ty) + var(--plabel-dy)));
```

`--plabel-tx: 0` was declared as a bare NUMBER. So for every label with the default anchor - and for
every label with a hanging baseline, where `--plabel-ty: 0` - the expression failed to parse and the
browser dropped the WHOLE declaration, taking the anchor, the baseline AND both nudges with it.

**Measured on the served production build, two-polarity, before and after the two characters:**

```
                       BEFORE          AFTER
/                12 of  12 none    0 of  12
/timeline         6 of  12 none    0 of  12
/network         16 of  54 none    0 of  54
/pools           43 of  62 none    0 of  62
/address (t3)     9 of  15 none    0 of  15
TOTAL            86 of 155         0 of 155
```

**THIS IS F-04a-7's SHAPE, ONE HANDOFF LATER.** That defect was `var(o)` - `POOL_SW` mapping a pool
to a CSS CLASS rather than to a custom property, so every arc and disc painted `none`, with
typecheck, lint and the build all green. This is the same family: syntactically valid CSS that
resolves to nothing, invisible to every type-level check.

**AND IT SURVIVED TWO OF THIS SESSION'S OWN SCREENSHOTS.** The lead rendered `/timeline` and
`/network`, read the PNGs, judged the conversion good and moved on - while 12 of 12 labels on `/`
and 6 of 12 on `/timeline` were resolving `transform: none`. The labels were legible, so the page
looked fixed; they were simply in the wrong places, and "wrong place" does not look like "broken" the
way `var(o)` did. It was found by a worker reading the browser's own CSSOM
(`CSSStyleDeclaration.setProperty` then read back) rather than by looking at a picture, on a chart
whose four right-column labels printed on top of each other - the one arrangement bad enough to see.

**Closed at both ends.** `scripts/check-svg-text-floor.mjs` R4 is a new static rule: every custom
property reached by a `calc()` in `globals.css` must be declared as a LENGTH, with a bare number a
finding - self-tested by splicing the exact value that shipped back into the real stylesheet, and
anti-probed with a bare number no `calc()` reads so the rule is about `calc()` rather than about
zeros. `painted-floor.spec.ts` is the other end: every `.plabel` on five routes must resolve a
non-`none` transform, with a fail side that injects `--plabel-tx: 0` into the live CSSOM and requires
the transform to vanish.

**The lesson is about the screenshot, not about the CSS.** 04a's non-assertion - "§7 carries a
screenshot-derived check" - paid again, but this branch shows its limit: a screenshot answers "does
this look wrong", and a label 12px from where it belongs does not. The CSSOM answers "did the
declaration apply", which is a different question and the one that had a false answer.

### 7.11 ONE DEAD CSS RULE, CORRECTED RATHER THAN DELETED

`globals.css` carried `.tk-svg svg { width: 100%; height: auto; display: block }`. `.tk-svg` is on
the `<svg>` ITSELF at all seven track-chart sites, so `.tk-svg svg` selected a NESTED svg and
matched nothing in this application. It was inert rather than harmful - the UA default for an
outermost `<svg>` with a viewBox is already a 100%-wide box with a ratio-derived height, which is
why nothing ever looked wrong, and this session's rendered measurement confirms the track charts
were sizing to their containers all along. It is corrected rather than deleted because the painted
regime now depends on it being explicit: the label layer's percentage mapping is exact only while
the box keeps the viewBox's aspect ratio. Found by a read-only mapping worker comparing it against
`.tplane-svg` and `.chart .plot`, which both get the selector right.

### 7.12 L2's OPEN QUESTION, MEASURED: the loop diagram at 390 is DELIBERATE, not a defect

L2's interim note reported that `/network`'s loop "lays out 720px wide inside a 390px viewport - it
overflows by 330 and the page scrolls sideways", and asked which it is. **Measured, in Chromium,
production build:**

```
viewport 390: figure clientWidth 358, scrollWidth 720, overflow-x auto, svg min-width 720px
              scrollLeft driven 0 -> 362  (it genuinely pans)
viewport 320: figure clientWidth 288, scrollWidth 720, scrollLeft 0 -> 432
viewport 760: figure clientWidth 704, scrollWidth 720, scrollLeft 0 -> 16
body overflow-x: hidden at every width
elements extending past the viewport OUTSIDE a scroll container, at 390: 0
```

It is a declared pan container - `[data-chart="network-loop"] { overflow-x: auto }` with
`min-width: 720px` on its `.plot`, both added at the `<= 760px` breakpoint - and it pans. **The page
itself does not scroll sideways**, and nothing outside a scroll container extends past the viewport.
`document.documentElement.scrollWidth` reads 2244 at 390, which is what L2 saw; it comes entirely
from the `sr-only` table twins, which are absolutely positioned and clipped by design.

**And the two decisions compose correctly, which is the part worth recording.** That `min-width` is
why `NetworkLoop`'s painted text FLATTENED at 8.64px below 760 instead of continuing to shrink - it
was the only diagram on the site whose text stopped falling on a phone. Now that its labels are HTML
at 12px, the pan container keeps the diagram at its designed geometry while the words are legible.
Nothing here is in this handoff's scope and nothing here was changed.

### 7.13 A LIMITATION OF THIS SESSION'S OWN FAN-OUT, REPORTED RATHER THAN ABSORBED

Deliverable 3 was dispatched as seven build workers, one per Record page, with disjoint FILE scopes.
The file scopes held - the post-fan-out sweep below confirms it - but the VERIFICATION instructions
did not compose: every worker was told to run `next build` and serve on port 3111, and workers run
concurrently against one `apps/web/.next` and one port. Two builds writing the same output directory
can produce a mixed artefact, and a worker that finds the port taken may measure a server another
worker built.

**So each worker's rendered evidence is treated as CORROBORATING and never as authoritative.** The
authoritative build, measurement, screenshot pass and suite run in this section are the lead's, run
once after every worker returned, against a tree nobody else was writing to. This is the fan-out
analogue of the stale-server defect this session already hit once - the lead measured a converted
page against a server still holding the previous build, and caught it only by checking the probe
rather than believing the result.

The dispatch should have given each worker a distinct port and a distinct build directory, or
reserved rendering to the lead entirely. Recorded so the next fan-out over one Next.js app does one
of those two things rather than rediscovering this.

### 7.14 DELIVERABLE 3 - claim order, and the two pages where the data has no epistemic status

Seven build workers, one per page, disjoint file scopes. **Every page verified by rendering, at 1440,
with every disclosure closed:**

```
route            claim  first  strip-in-details  conf  verified  count  summaries  digitless
/                  Y      Y*         false       open    open     open       5         0
/beware            Y      Y          false       open    open     open      32         0
/contradictions    Y      Y          false       open    open     open      16         0
/timeline          Y      Y          false       open    open     open     128         0
/network           Y      Y          false       open    open     open     101         0
/method            Y      Y          false       open    open     open      10         0
/flows             Y      Y          false       open    open     open      76         0
/sources           Y      Y          false       open  (named)    open       3         0
```

`*` the splash's claim beat is `.beat-claim` rather than `.pageclaim` - it is the surface the
grammar was extracted FROM - and it is the first element in `<main>`; the sweep's `first` column
tests for the extracted class, so it read `N` until the element was named. Probe, not page.

**THE TWO PAGES WHERE THE THREE DO NOT EXIST STATE THE CONDITION AND INVENT NOTHING.** This is
`docs/2.0/SNAPSHOT.md` §8.1's rule about absences, applied to epistemic status:

- `/sources` renders zero `Cite` and zero `Conf`, and that is not an oversight. `sourceSchema` is
  `{id, title, url, publisher, date (nullable), accessed}` and `.strict()`: there is **no
  `confidence` and no `lastVerified` on a Source, for any of the 328 records**. Widening the schema
  is a data-layer change §1 item 5 forbids. The page says so - "No source on this site carries a
  confidence or a last-verified date - the schema has neither field, for any of these 328 - and
  neither is invented here" - and names what a bibliography carries instead. Checked by rendering:
  the fetch date and 170 publication dates ARE in the open, so the sentence is true.
- `/method`'s own material is documentation of this site's procedure rather than a sourced claim
  about the world; its file docblock says fabricating a source "would be the precise defect this
  page exists to argue against". It states that condition and carries the apparatus only on the
  corpus-backed material it does cite.

**AND A THIRD PAGE CHOSE THE SAME HONESTY WITHOUT BEING ASKED.** `/network` and `/contradictions`
pass no page-level `confidence`, because the corpus grades each RECORD and grades no sentence like
the page's own generalisation over them - "a grade for the claim itself would be one this site
invented". The distribution stays in the open on both (`81 HIGH, 14 MED, 1 LOW` and
`14 high, 2 med`), so A3 is satisfied by a real number rather than by a manufactured one.

**Three duplicate-epistemic-chip sites removed, never the only copy.** 04a moved `confidence` and
`lastVerified` into `Cite`'s closed summary; `BewareRow`, `BewareDeepDive`, `ContradictionCard` and
`FlowsClaim` each still printed a second chip and a second date immediately beside it, so a reader
met each of them twice per row. The surplus went; the open copy stayed.

**One contract violation found and fixed in passing.** `/beware`'s "Never detectable - 3 of 14"
metric carried `accent`, which is gold. CLAUDE.md and LEDGER-04 Q1b: gold marks a boundary crossing,
never a magnitude, and **a figure about unprovability is never gold, because size in the accent
colour reads as an accusation this site does not make.** `.metric .v.gold` on `/beware` is now 0.

### 7.15 THE FOURTH INSTANCE OF L2's OWN PROBE SHAPE, AND THIS SESSION MADE THE SAME MISTAKE THREE TIMES

L2 folded a rule into `CLAUDE.md` in the same resolution that commissioned this handoff: **a probe
whose output is an ordering, a pairing or an enumeration is checked against one known member before
any finding is built on it.** It arrived with three instances. This branch adds a fourth of L2's -
the Q3 minima, an enumeration over one svg reported as the site's - and **three of this session's
own**, every one caught by checking the instrument rather than the code:

1. **A stale server.** The lead converted four diagrams, rebuilt, measured - and read a server
   started an hour earlier that was still holding the previous build. The measurement said the
   source was unchanged; the source was changed and the port was not free. Caught by asking why a
   file with no `<text>` served `<text>`.
2. **A rounding error larger than the defect.** The rendered floor sweep computed an HTML element's
   scale as `getBoundingClientRect().width / offsetWidth`. The first is fractional and the second is
   an integer, so ordinary unscaled text measures 0.995, and the probe reported **27,727 sub-floor
   nodes** across the site - every one of them 11.9-something px of genuinely 12px text. Caught by
   reading the VALUES rather than the count. The scale now comes from the transform chain.
3. **A pointer parked inside the nav.** Every screenshot showed 546px of open navigation panel
   pushing the page down, which looked like a regression in 04a's disclosure. Playwright's mouse
   starts at (0,0), which is inside the bar, so the hover disclosure was open in every default shot.
   Measured with the pointer moved away: closed 50.7px, hover 597.5px, away 50.7px - 04a's behaviour
   exactly, and L2's own 51 / 598 / 51 reproduced. The shooting script now moves the pointer and
   REFUSES to shoot if the panel is open, and that guard immediately fired on a correct page because
   its threshold was width-naive - the collapsed bar is 50.7px at 1440 and 96.7px at 760.

**The rule earns its place three times over in one session, and its converse earns it more:** when a
probe comes back saying the code is wrong, check the probe before judging the code.

### 7.16 THE ASSERTIONS, each with its two polarities and the exclusion-set member its fail side used

| # | state | pass side (Executed) | fail side, and which member of the exclusion set |
|---|---|---|---|
| A0 | HOLDS | 5 of 5 arrival-rate positions reconcile; four reproduce L2's figures exactly | the shipped static `3` restored: 5 of 5 fail. Pinned to the literal with the id kept: **4 of 5** - at rate 2 the literal equals the computed value and the defect is invisible |
| A1 | HOLDS | 0 visible SVG `<text>` across 15 routes x 10 widths; 0 of **150,590** rendered text nodes below 12px across 13 routes x 12 widths | 12 user units in a 1000-unit viewBox: 16.10px at 1440, 7.94px at 760, and the check names `760px`. Plus a `<text>` planted in `Charts.tsx` (guard: 1 finding; rendered: 8 measurements, 2.78-10.13px, widths named) |
| A2 | HOLDS | all eight Record pages lead with a labelled claim; probe run against two untouched routes returned `claimIsFirst: false`, so it discriminates | a page's claim element removed, and the sweep names the page |
| A3 | HOLDS | `confidence`, `lastVerified` and a source count reachable with every `<details>` shut, on all eight; `/sources` and `/method` name the CONDITION instead | `.pc-status` moved inside `details.cite`: the open-state list goes from `["verified 2026-08-22","43 sources"]` to `[]` |
| A4 | N/A - ALREADY HELD | `Cite.tsx` was fixed by 04a in `6610c40`; measured on all eight pages, 0 of 284 closed citations failing | not run as specified: the brief's fail side is "revert `Cite.tsx`", which is a code mutation on already-shipped work. Recorded as a corrected premise rather than a satisfied assertion |
| A5 | HOLDS | 0 digitless summaries on any of the eight, every disclosure opened first | the bare word `Sources` planted on a live summary: `{total:17, withoutDigit:["Sources"]}` |
| A6 | HOLDS | register empty, 0 sub-floor declarations, machinery driven over a synthetic row | `9.75px` spliced into the real stylesheet and read by the real parser; anti-probe on the unmutated file returns `[]` |
| A7 | HOLDS | six self-test arms, all detectors driven in both polarities, over a fixture AND the real tree; exit 1 proven reachable by 23 real findings | `check-nav-routes.mjs`'s own hole - a self-test asserting the real tree is clean - not reintroduced; R4's fail side splices the exact `--plabel-tx: 0` that shipped |
| A8 | HOLDS | **1351 total** against a 1346 baseline: +5, all in `apps/web` (438 -> 443), no package fell | a deleted test file would move the total and show as a FALL; per-package itemisation is what makes that visible rather than absorbed |
| A9 | HOLDS | fourteen guards, typecheck, lint, `content validate`, `pnpm build` all green | `pnpm build` is the only one that runs `next build`; it was run at every stage, not once at the end |

**A8 in full, per package, measured in this container:**

```
content 67 · zebra-rpc 50 · zec-instruments 98 · web 443 · gateway 143 ·
publisher 101 · indexer 449            = 1351 total
```

**AND THE HONEST LIMIT ON A8's COLOUR.** The TOTAL is exactly reproducible here and matches L2's
1346 + 5. The 1343/3 PASS-SKIP SPLIT IS NOT: this container has no PostgreSQL and no Redis
(`pg_isready` no response, both ports `ECONNREFUSED`), so 105 further tests skip themselves through
`global-setup.ts`'s reachability probe - gateway 136/7, indexer 366/83, publisher 83/18. Every
package's TOTAL is unchanged from the baseline except `apps/web`. CI supplies both services and is
where the colour is established.

### 7.17 THE POST-FAN-OUT SWEEP

`git status --porcelain --untracked-files=all` was run after **each** of the three fan-outs, before
the next commit.

- After the mapping fan-out (4 read-only workers): clean. One worker reported a pre-existing
  modification against itself rather than touching it, which is the read-only rule working.
- After the `Charts.tsx` worker: one modified file, the one it was scoped to. It also reported, in
  its own words, that it had temporarily patched `globals.css` to run a rendered check and then
  reverted it, verifying the file byte-identical by `sha256` - **a write outside its scope,
  disclosed rather than hidden**, with the tree ending unchanged. That is the fifth occurrence of a
  worker writing outside scope on this project's record and the first that was self-reported before
  the sweep found it.
- After the seven page workers: 41 paths, every one inside a declared scope. No scratch file, no
  stray test, nothing under `docs/` or `handoffs/`.

### 7.18 THE SCREENSHOT-DERIVED CHECK, and what it is and is not good for

Carried forward from 04a as a non-assertion, and it paid again - AND showed its limit, which is
worth more than another confirmation.

**What it found.** The Sankey's labels overlapping on `/pools` at 760 - "outSapling", two node names
printed through each other. That is what sent this session to measure collisions across every chart
at twelve widths, which found 254 pairs and led to the breakpoint work in §7.10c. Nothing but
looking at the page would have raised it: every one of those labels was 12px, every one cleared the
floor, and every automated check on the branch was green.

**What it missed.** The `calc()` defect. Two screenshot passes at 1440 approved a state in which
86 of 155 labels had no transform at all. **A screenshot answers "does this look wrong"; a label
twelve pixels from where it belongs does not look wrong.** `var(o)` did, because it painted nothing.
The question that had a false answer was "did the declaration apply", and only the CSSOM answers it.

**So the practice is amended rather than repeated.** A rendered check now means two instruments: the
picture, for arrangement, and the computed style or the CSSOM, for whether the rule reached the
element. `painted-floor.spec.ts` carries the second; §7.15 lists three of this session's own probes
that needed the same treatment.

Final screenshots read back by the lead: `/timeline`, `/network`, `/sources`, `/pools`, `/flows` and
`/beware` at 1440, `/pools` and `/network` at 760. Every one shows the masthead, then a labelled
CLAIM in the display face, then the explanation, then the epistemic strip, then the evidence. The
shooting script moves the pointer off the nav bar and REFUSES to shoot if the panel is open, after
three passes were taken with 546px of open panel in them.

## §8 LEDGER - appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

The full block is in `handoffs/LEDGER.md` under `## HANDOFF-04b`. Two questions for L2, and the
bound this branch inherits and passes on.

### LEDGER-04b Q1 - is the visible table twin the right answer to the collision cost?

Moving the labels out of the drawing fixed the size and created a second problem: a label that no
longer scales no longer gets out of its neighbour's way. Measured: **254 overlapping label pairs**
across five routes and twelve widths, 0 at 1440 and 100 at 320.

This branch took the answer already in the tree - `TurnstilePlane` hides its overlay below 760 and
lets a legend carry the whole reading - and generalised it: below 900 (1100 on three measured dense
diagrams) the overlay goes and the `sr-only` table twin becomes visible, because a table reflows and
a viewBox does not. 254 collisions to 0.

**The alternative not taken, and L2 should say whether it is preferred:** make the DRAWING adapt -
fewer labelled points, a coarser tick set, or a per-chart minimum width with a pan container, which
is what `network-loop` already does at `<= 760`. That keeps a picture on a phone; this keeps the
numbers. The argument for what shipped is that a chart at 263px is not a picture anyone reads, and
the table is the same data in the form that survives the width. **It is a design decision made under
a measurement, by a session, and it changes what a phone reader sees on eight surfaces**, which is
why it is a question rather than a note.

### LEDGER-04b Q2 - does the deferral of the adaptive retention window now also cover this?

LEDGER-04a Q2 deferred the adaptive retention window WHOLE to the handoff that adds a per-crossing
source, on the ground that without per-crossing heights there is no ordering and so no "newest N".
That handoff will add per-crossing amounts, ordering and confirmation state to the plane - and every
one of those is a new LABEL on a drawing whose labels are now HTML at a fixed 12px.

So the question is narrow and practical: **does the per-crossing handoff inherit the label regime as
a constraint on what it may draw?** A plane that gains thickness-by-amount and fade-by-age gains no
text; a plane that gains a per-crossing readout gains text that must clear 12px at 320px wide, on a
board that is 1180 user units across. §8 of that handoff should say which, before its geometry is
designed rather than after.

### The bound HANDOFF-12 still inherits, restated because this branch did not touch it

The per-crossing `SnapshotV1` field is capped at the newest N. The publisher already spends
`WIRE_COMMANDS_PER_TIP` = 5 per tip, about 172,500 a month against a 200,000 ceiling, **on a store
shared with an unrelated production project**. A field capped at the newest N is a fixed-size array;
an unbounded one could not ship.

### NOTICED, and not acted on

- **`.record-head` is `align-items: end`.** On a page whose aside is a chart, the h1 and dek sit
  level with the BOTTOM of the aside, leaving ~330px of empty column above them at 1440 on
  `/timeline`. Pre-existing - this branch's diff touches `.record-head` zero times - and a
  deliberate typographic choice from an earlier handoff. Named because it is the first thing a
  reader of the final screenshots asks about.
- **`.bw-lede` is now unused.** `/beware`'s claim moved into `PageClaim`; the rule and its comment
  remain in `globals.css`. Dead CSS, one rule.
- **`.claim > .anchor` is inert on a link that is not a direct child of `.claim`.** Found by the
  `/timeline` worker while moving citation links into a disclosure; it dropped the class rather than
  putting a semantically wrong one on to keep a rule alive.
- **`/flows` and `/method` carry a `pre.code` whose min-content width exceeds a 390px viewport.**
  Pre-existing, inside a scroll container, and not introduced here.
