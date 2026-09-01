# PROMPT-04b — every message that steered the HANDOFF-04b session

Archived verbatim per the Revolution protocol step 5 (`CLAUDE.md`). One file per handoff, each
message under a heading naming what it is and when it arrived. The first message lands in the
same commit as RECONCILE; anything arriving mid-session is appended in the next commit.

---

## Message 1 — the kickoff, with the L2 RESOLUTION for HANDOFF-04a and the §1 SCOPE for 04b inline (1 Sep 2026, session start)

Delivered as an uploaded file (`PROMPT04b.md`) referenced from the session's first turn. Verbatim
below, fenced so the `L2 RESOLUTION` block inside it is not mistaken for this file's own heading
structure.

```text
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff is NEW and is written below as HANDOFF-04b - the two things 04a measured and did not finish. Write it into `handoffs/HANDOFF-04b-svg-text-and-record-order.md` from the §1 SCOPE here, set the index and LOG accordingly, then execute it. Report spawn mode first. Stop at PR opened. Fork from `main` at `01abc2e` (PR #47 merged).

L2 RESOLUTION

L2 RESOLUTION - HANDOFF-04a, PR #47 (Cowork, 1 Sep 2026)

VERDICT: MERGE.

VERIFY (Executed by L2 on a clean worktree of **7c93a37**, main at `452d586`, 10 commits, 38 files,
+6454 / -624, with a real PostgreSQL 16 and a real local Redis):

    content 67 · zebra-rpc 50 · zec-instruments 98 · **web 438** · gateway 143 ·
    publisher 99 +2 skipped · indexer 448 +1 skipped
    **1343 passed, 3 skipped, 1346 total**, rc=0
  Your figures exactly, and `apps/web` 368 -> 438 with the skip count unchanged. Thirteen guards
  rc=0, typecheck 0, lint 0, `pnpm build` 0, `content validate` 0. Tree clean under
  `--untracked-files=all`.

  THE VISUAL GATE, WHICH IS THE POINT OF THIS HANDOFF. I served the production build and resolved
  COMPUTED styles rather than attributes, which is the method that found your sharpest defect:
    the plane: **102 of 102 painted elements resolve, 0 unresolved `var()`.**
    sub-12px HTML text nodes on the rendered splash: **none.**
    nav: closed 51px · hover 598px · pointer away 51px · toggle 598px · **Escape -> 51px with
      focus on `BUTTON.here`** - the three-measurement bug is genuinely closed, and closed at the
      right layer: scoping `:focus-within` to the PANEL is correct, because the toggle is the
      control and focusing a shut disclosure's own button must not open it.
    Q3 REPRODUCED INDEPENDENTLY, and it is worse than a rounding issue: SVG `<text>` paints at a
      minimum of **16.10px at 1440, 11.11 at 1024 and 7.94 at 760**. A floor the viewport walks
      under is not a floor, and your phrasing is exactly right.

TWO OF MY PREMISES WERE FALSE AND BOTH ARE MINE. You were asked to check them and checking them is
what produced the branch's best work, so they go on the record before anything else.

  (a) I WROTE THAT `apps/web` "ALREADY FLOORS AT 10px". IT FLOORED AT 8.5px, and I know the
      mechanism. I measured with `sort -u` over `font-size:` STRINGS, which sorts
      LEXICOGRAPHICALLY: `"10px"` precedes `"8.5px"` because `'1' < '8'`. My "smallest sizes" list
      therefore began at 10 and never showed the 8.5 or the twenty-four declarations at 9.5.
      Re-measured with `sort -g`: 8.5 x1, 9 x2, **9.5 x24**, 10 x27, 10.5 x15, 11 x22.
      THE CONSEQUENCE IS WORSE THAN THE ERROR. Both halves of my sentence were false - the site
      did not floor at 10, and it was not "already a divergence and an improvement"; it MATCHED
      the mockup exactly, so the source of truth and its implementation were wrong together. And
      it softened the reader's "half the text is basically 9px" from a measurement into a figure
      of speech. **A brief that understates the defect it commissions licenses a smaller fix**,
      and the only reason it did not get one is that you measured instead of believing me.
      THIS IS MY THIRD MALFORMED PROBE ON THIS PROJECT and the three have one shape: the nav-table
      read that paired two extracted lists positionally, this lexicographic sort, and the
      `pg_constraint` enumeration that read CREATE TABLE and missed an ALTER. Every one is a LIST
      OPERATION over the wrong ordering, pairing or scope. Into CLAUDE.md as a rule about L2's own
      instruments: **a probe whose output is an ordering, a pairing or an enumeration is checked
      against one known member before any finding is built on it.** Had I asked "does my sorted
      list contain 9.5?" the answer was one line away.

  (b) F-04a-6's SECOND EXAMPLE WAS WRONG. I cited `Cite.tsx` as the collapse rule done right. It
      carries no digit in its summary AND keeps confidence, lastVerified and the source list all
      behind the toggle - the rule's own forbidden case. I offered the violation as the exemplar.

  AND ONE THAT WENT THE OTHER WAY, worth as much: `tokens.css` stated `--ink-faint` at 3.05:1 and
  it is 3.11:1 - my brief's figure. The tree was wrong at four sites, through two handoffs and a
  design review, and it surfaced because A2 COMPUTES the ratio from the token and the ground
  rather than reading it off the palette. A COMMENT CANNOT FAIL is the right lesson and it is now
  demonstrated rather than argued.

THE SEVENTH DEFECT WAS MINE AND IT IS FIXED. You reported rather than changed
`04a-turnstile-plane.html`'s static `PENDING 3 mempool` beside a computed `unconfirmed 0`, because
the brief said the composition was not yours to reopen. That was the correct call and the finding
was correct: F-04a-7's own shape, in the file documenting the fix for it, visible at the default
rate. Reproduced and repaired - every tile that can move now writes from the same `STATE` as the
board, verified at four arrival rates:
    rate 0: drawn 9  / measured 9     / pending 1 · legend 9  / 1  · arcs 9
    rate 1: drawn 17 / measured 17    / pending 0 · legend 17 / 0  · arcs 17
    rate 3: drawn 60 / measured 900   / pending 2 · legend 60 / 2  · arcs 60
    rate 4: drawn 60 / measured 5,200 / pending 2 · legend 60 / 2  · arcs 60
**YOU APPLY THE FIX, AS DELIVERABLE 0, BEFORE ANY OTHER WORK.** It is sixteen lines in
`docs/2.0/mockups/04a-turnstile-plane.html` and it is specified exactly below, because a reference
file that demonstrates the defect it documents will be read for guidance by someone.

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
  arc count reconcile at every one. L2 measured the repaired file at four:
      rate 0: drawn 9  / measured 9     / pending 1 · legend 9  / 1  · arcs 9
      rate 1: drawn 17 / measured 17    / pending 0 · legend 17 / 0  · arcs 17
      rate 3: drawn 60 / measured 900   / pending 2 · legend 60 / 2  · arcs 60
      rate 4: drawn 60 / measured 5,200 / pending 2 · legend 60 / 2  · arcs 60

  `04a-splash-record.html` needs no change: its tank-limit reconciles the unconfirmed count in
  words, which is why only one of the two files carried the defect. **The plane itself is not in
  this handoff's scope** - this is the reference document, not the component. Record in §8 that
  the shape was found in the reference file, by whom, and that L2 wrote it.

NO FINDINGS. I looked for one and the closest is not a defect: an open nav panel covers the top of
the plane, which is what a hover disclosure does, and the collapsed bar is 51px.

RULINGS.

  Q1 - THE 12px FLOOR IS ACCEPTED, and record the divergence rather than propagating it. The
     mockup is the source of truth for VALUES - the hues, the curve, the ramp's relationships -
     and HANDOFF-01 already ruled that a value failing an accessibility floor is RAISED and
     RECORDED rather than inherited, which is the same class of decision. The deciding fact is the
     one you measured and I got wrong: the site matched the mockup at 8.5px and a reader called it
     punishment. **A source of truth falsified by a reader is falsified.**
     DO NOT AMEND `zecreveal-2.0-mockups-v2.html`. It is a historical record of what was designed
     in August, and editing it would destroy the evidence that the divergence exists. The ledger
     carries the divergence; the mockup keeps its 8.5px.

  Q2 - THE SUBSTITUTION IS ACCEPTED, AND IT IS BETTER THAN THE ASSERTION I WROTE. You were right
     to refuse rather than approximate, and the reason is sharper than the one you gave:
     **a "shortened window" presupposes the drawn marks are the NEWEST N.** Without per-crossing
     heights there is no ordering, so there is no "newest" - which means the adaptive window is
     not PARTIALLY implementable, it is not implementable AT ALL today. Drawing 42 arbitrary marks
     and labelling them a recent window would have been precisely the manufactured measurement
     this handoff exists to refuse.
     What you shipped carries more than my assertion asked for: "1,284 crossings measured over
     1,152 blocks, board drawing 42 of them", plus a caption stating that what is drawn is a
     SAMPLE and the count above is the measurement. That keeps the real window - in BLOCKS, which
     `migrationHist` actually carries - and names the sampling relationship rather than hiding it.
     MY ASSERTION WAS WRITTEN AGAINST THE STUDY, AND THE STUDY CHEATED. It prints "47 min" because
     its fixture invented a block time. You caught that; I did not, and I wrote the rule.
     **THE ADAPTIVE WINDOW IS THEREFORE DEFERRED WHOLE**, to the handoff that adds the
     per-crossing source, and is not to be half-built before then. §8 of that handoff inherits it
     along with the bound.

  Q3 - IT OWNS ITSELF: HANDOFF-04b, ON THE WEB TRACK, AHEAD OF 11, and it carries complaint 4's
     remainder with it. Reasons, in order:
     (i) COMPLAINT 3 IS NOT CLOSED while four diagrams paint text at 8.64px at 760px wide, and
         your own §7 says so - "closed for HTML text and MEASURED-OPEN for SVG chart text". The
         narrowest viewport is where most readers are. That is the original complaint, still live,
         on the pages a reader reaches from the nav this branch just fixed.
     (ii) THE TECHNIQUE IS ALREADY PROVEN in this branch - the turnstile plane positions its
         labels as HTML over the SVG, and that decision is now justified by measurement rather
         than taste. Four diagrams is bounded work against a demonstrated pattern.
     (iii) COMPLAINT 4 - "closed on the SPLASH and open on the other seven Record pages" - is by
         your own account "the largest thing this branch did not finish", and it is the same track,
         the same pages and the same reviewers. Splitting them across two handoffs would put two
         Web branches into `apps/web` at once, which is the collision 04a was ordered before 11 to
         avoid.
     The Web track is otherwise empty, so this costs no contention.

  §1 SCOPE for HANDOFF-04b, which you write and then execute:

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

---

## Message 2 - L2 INTERIM, HANDOFF-04b, Q3's minima (Cowork, 1 Sep 2026, arrived mid-session while the floor guard was being written)

```text
L2 INTERIM - HANDOFF-04b, Q3's minima (Cowork, 1 Sep 2026)

Not a resolution. Sent now because you are writing the floor guard, and my figures would bias it.

MY Q3 MINIMA WERE INCOMPLETE, NOT WRONG, AND THE GAP IS THE PART THAT MATTERS.

  I measured at 1440, 1024 and 760 and reported a worst case of 7.94px. I stopped at 760 because
  that is the breakpoint 04a's §7 named. THE SITE SUPPORTS FAR NARROWER: its own CSS declares
  max-width breakpoints at 300, 520 and 700, and breakpoints at
  700 · 720 · 760 · 900 · 1000 · 1100 · 1600. A phone at 390 is squarely inside the supported
  range and I never went there.

  Re-measured on `01abc2e`, production build, both diagrams `display: block` and visible:
      /          1440  16.10   1024  11.11   760  7.94   **390  3.79**
      /network   1440  13.15   1024   9.20   760  6.84   **390  4.30**  (25 text nodes)
  At 390 that is not small text. It is illegible, at the width most readers use, on a Record page
  reached from the nav 04a just fixed. Your "measured-open" was right and my number understated it
  by roughly half.

CONSEQUENCE FOR §5, WHICH IS WHY THIS INTERRUPTS YOU. My assertion says "at any supported viewport
width" and never defines the set - so a guard could satisfy it at 760 and be vacuous at 390, which
is exactly where the defect lives. DEFINE THE SET FROM THE CSS RATHER THAN FROM ME: every declared
breakpoint, one width below the narrowest, and 390 named explicitly as the common phone. An
assertion whose width set excludes the worst case is not a weak assertion, it is one that passes
for the wrong reason.

AND A DEFECT IN MY PROBE YOUR GUARD MUST NOT INHERIT. I computed the scale as
`rect.width / viewBox.width`. Under `preserveAspectRatio="xMidYMid meet"` - the default, and what
every diagram here uses - THE SCALE IS `min(rect.width/vb.width, rect.height/vb.height)`. My
formula is correct only when the SVG is width-constrained. I re-ran with both and they agree at
every width on every diagram here, so the numbers above hold - but they hold BY LUCK, because
these diagrams all happen to be width-constrained. The first height-constrained SVG the site gains
would make that formula silently overstate the painted size, and a floor guard that overstates is
one that passes on the defect. **Use `min(sx, sy)`, and handle `slice` (max) and `none` (sy) as
their own cases.** Self-test it against a deliberately height-constrained fixture - the real tree
cannot currently produce one, so that arm would go vacuous if driven from the real tree alone.

ONE THING I DO NOT KNOW, reported rather than ruled on. At 390 the `/network` loop lays out
**720px wide inside a 390px viewport** - it overflows by 330 and the page scrolls sideways. That
may be deliberate (a wide diagram you pan) or it may be the same defect wearing another hat. It is
not in your §1 SCOPE and I am not adding it: measure it, say which it is in §7, and if it is a
defect it belongs to whoever takes the next Web handoff.

NOTHING ELSE CHANGES. The three deliverables, the collapse rule, `Cite.tsx` as the first fix and
deliverable 0 all stand as written.
```

## Message 3 - L2 INTERIM 2, the guard (Cowork, 1 Sep 2026, arrived while the guard was being written)

```text
L2 INTERIM 2 - the guard you are writing right now (Cowork, 1 Sep 2026)

One point, and it is time-critical because your own fix creates the condition.

YOU JUST WROTE "SVG TEXT IS GONE FROM ALL FOUR RECORD DIAGRAMS." IF THAT HOLDS ACROSS `apps/web`,
THEN A GUARD THAT MEASURES THE PAINTED SIZE OF SVG `<text>` HAS NOTHING TO MEASURE. It will exit 0
on the real tree because the set is EMPTY, not because anything is correct - and it will keep
exiting 0 for every future diagram until someone drives it with something other than the current
tree.

THIS IS THE SHAPE YOUR OWN PREDECESSOR FOUND, ONE LAYER UP. 04a's §8 records
`css-dedup.test.ts`: its register named `font-size: 11px`, no rule declared 11px any more, and the
check "would have gone VACUOUS rather than failed - `[]` never equals `[\".cp\"]`, so it failed on
the equality and not on the emptiness." Same branch lineage, same week, and the Q3 fix rebuilds the
condition for the guard written to close Q3. It is also LEDGER-09a Q3's standing count: three of
this project's guards have shipped with a self-test certifying a hole, and 04a's own
`check-nav-routes.mjs` made exit 1 unreachable for every possible input.

TWO WAYS OUT. I am not choosing for you - you have just done the work and you know which
exceptions are real - but the second is the one I would take.

  (1) KEEP THE MEASUREMENT GUARD, AND MAKE EMPTY DISTINGUISHABLE FROM CLEAN.
      - the probe set is a SYNTHETIC fixture carrying `<text>` below the floor at some width,
        driven and shown to fail; the real tree cannot supply one any more, so a self-test driven
        from the real tree alone proves nothing;
      - the OK line STATES THE COUNT it examined, the way `assert-no-skipped-integration` names
        the packages it saw so a count cannot be satisfied by one suite;
      - **a count of zero is itself reported**, because "no SVG text exists" is a fact about
        today's tree, not a property of the codebase, and it stops being true the first time
        someone adds a diagram.

  (2) BAN THE CONSTRUCT INSTEAD OF MEASURING IT. `no <text> element in any apps/web SVG; chart
      labels are HTML positioned over the SVG`. It cannot go vacuous - it fails the moment anyone
      adds one - it needs no rendering, no viewport sweep and no scale arithmetic, and it is
      statically checkable in a few lines.
      **Your own measurement is the argument for it**: no declared value satisfies the floor at
      every supported width, so every SVG `<text>` is suspect by construction rather than by
      degree. A rule that says "this construct cannot be made safe here" is stronger and cheaper
      than one that re-measures whether each instance happens to be.
      If you take this one, any `<text>` you deliberately keep is a REGISTERED exception carrying
      its measurement, exactly as you registered the two sub-floor declarations.

WHICHEVER YOU TAKE, the `min(sx, sy)` correction from my last note still applies to any scale
arithmetic that survives, and the width set still comes from the CSS - 300 / 520 / 700 / 720 /
760 / 900 / 1000 / 1100 / 1600, plus 390 named as the common phone, where I measured 3.79 and 4.30.

Nothing else changes.
```
