---
handoff: 04b
title: The SVG text regime, and claim order on the remaining Record pages
status: in-progress
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
