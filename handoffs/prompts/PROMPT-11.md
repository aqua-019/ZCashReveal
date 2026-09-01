# PROMPT-11 — the messages that steered the HANDOFF-11 session

Archived verbatim under Revolution protocol step 5. One file per handoff, each message under a
heading naming what it is and when it arrived. The first message lands in the same commit as the
reconcile; anything arriving mid-session is appended in the next commit (LEDGER-02 Q7).

## Kickoff prompt (operator, 1 Sep 2026) — carrying the L2 RESOLUTION for HANDOFF-04b / PR #48

Delivered as an uploaded file rather than pasted inline. Reproduced here byte for byte, including
its embedded `L2 RESOLUTION` block, which was separately appended to `handoffs/LEDGER.md` beneath
the HANDOFF-04b ledger blocks.

---

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff ALREADY EXISTS: `handoffs/HANDOFF-11-live-wiring.md`, status `queued`. You do not write it - you RECONCILE it, apply the L2 RESOLUTION below, and execute it. Report spawn mode first. Stop at PR opened. Fork from `main` at `76ea9e7` (PR #48 merged; 04b closed).

**THIS HANDOFF IS DIFFERENT FROM THE LAST FOUR AND THE DIFFERENCE IS THE FIRST RISK.** HANDOFF-11
was written by L2 on 22 August. Since then 04, 04a, 04b, 09, 09a and 09b have all shipped, and
several of its §5 assertions were written against a tree that no longer exists. **Reconciling §5
against what is actually there is deliverable 0, before any wiring.** An assertion executed against
a premise that stopped holding is this project's highest-rated defect shape, and there are eight
handoffs of evidence for it in the ledger. §7 names every assertion you changed, what it said, and
what made it stale.

L2 RESOLUTION

L2 RESOLUTION - HANDOFF-04b, PR #48 (Cowork, 1 Sep 2026)

VERDICT: MERGE. Verified on a clean worktree of `50ac7d9`: **1348 passed, 3 skipped, 1351 total**,
fourteen guards rc=0, typecheck 0, lint 0, `pnpm build` 0, `content validate` 0, tree clean.

  THE GUARD, DRIVEN RATHER THAN READ. I restored one banned `<text>` into two real source files -
  `Plot.tsx` and `Charts.tsx` - and got rc=1 on both. Not vacuous: the ban is enforced against the
  real tree, not only a fixture. Its OK line goes further than I asked, naming the count, the zero,
  AND the vacuity condition itself: "with an empty register it is driven by the self-test alone."
  First guard on this project to state the limit of its own evidence in its passing message.

  AT 390px ACROSS ALL NINE NAV ROUTES: zero SVG `<text>`, `htmlMin` exactly 12, zero sub-12 nodes.

  AND THE COMPARISON I NEARLY SKIPPED. I found horizontal page scroll at 390px on four routes and
  went looking for a cause. Then I built `01abc2e` in a worktree and measured the same routes on
  MAIN: `/network` 1854 -> 58, `/timeline` 1912 -> 0, `/` 635 -> 0, `/sources` 50 -> 0, and
  `/network`'s HTML floor 9.5px with twenty sub-12 nodes -> 12px with none. Every page improved,
  nothing regressed. Had I not built main I would have filed a large improvement as a defect.

  MY Q3 MINIMA WERE WRONG AGAIN AND YOUR DIAGNOSIS IS EXACT. Mine were the splash plot's three
  scales - one SVG of nine - and were the site's MAXIMUM among pages carrying SVG text. Verified on
  main with every `<details>` forced open: the real worst is **2.00px on `/pools`**, 62 text nodes.
  THE MECHANISM IS THE INSTRUCTIVE PART: my route list came from `SCREENS`, and `/pools` was not in
  `SCREENS` - it is one of the two routes **F-04a-3, my own finding, identified as having no nav
  entry**, and it carried the worst text on the site. I recorded that the enumeration source was
  incomplete one handoff earlier and then enumerated from it anyway. My sweep also skipped
  zero-box elements, so everything inside a collapsed `<details>` was invisible to it - which is
  exactly where a redesign built on progressive disclosure keeps its content.
  The CLAUDE.md rule therefore gains its second half: **check the probe against a known member, AND
  check that the enumeration's SOURCE is complete for the claim - especially when you are the one
  who recorded that it is not.**

  TWO FINDINGS I HAD NO MODEL FOR. `ShieldedShare` paints at 5.95px on a 1440px DESKTOP and 9.62px
  at 900 - non-monotone, because it sits in a 0.8fr column and the head collapses as the window
  narrows, so the chart gets WIDER as the viewport gets SMALLER. And `calc(<number> + <length>)` is
  invalid CSS, so `--plabel-tx: 0` made the browser drop the whole transform: 86 of 155 labels
  resolved `transform: none`, 34 on charts already screenshotted and called done.

  THE METHODOLOGICAL FINDING IS THE MOST VALUABLE THING ON THE BRANCH, and it corrects something I
  introduced. **A RENDERED CHECK ANSWERS "DOES IT LOOK WRONG". A CSSOM CHECK ANSWERS "DID IT
  APPLY".** `var(o)` was caught because it painted nothing; a dropped transform paints something
  plausible, and two of your own screenshot passes had already approved it. Both checks are now
  CLAUDE.md rules and both bind this handoff.

  NO FINDINGS. Recorded, not charged: horizontal page scroll at 390px persists on `/flows` (282px),
  `/method` (187px) and `/beware` (169px) - pre-existing, roughly halved, outside 04b's scope.

FOLDS FOR HANDOFF-11 - apply in a `docs(handoffs)` commit before any wiring, and record each.

  1. §5 IS RECONCILED AGAINST THE TREE FIRST. Read every assertion and ask what it assumed. Known
     stale, non-exhaustively: `/pools` and `/reveal` are now IN `SCREENS` (F-04a-3 was closed by
     adding them, so the table holds 11 entries and two carry no `idx` yet); the Record pages are
     claim-first as of 04b, so "renders its first claim" may now be trivially true and needs
     restating as something that can fail; and `apps/web` still has NO snapshot read path, which
     is this handoff's own work rather than a precondition. Find the rest yourself.

  2. THE THREE STATUS AFFORDANCES GO WHERE 04a's SURFACE LIST PUTS THEM. It is in
     `HANDOFF-04a-legibility.md` under "What HANDOFF-11 receives as a design input", and it exists
     because the whole reason 04a was ordered ahead of you was to stop these three landing on top
     of the problem it was commissioned to fix:
       staleness indicator -> the system bar, beside the epoch clock. It is a property of the
         DOCUMENT, not of any panel, and the bar is the one surface every route carries.
       `source:` chip -> inside the disclosure carrying the derivation, next to the count in the
         `<summary>`. Never floating beside a value - that is what made the PUBLISHED group
         unreadable and produced reader complaint 2.
       `UNVERIFIED` chip -> the chip row beside the claim, with `confidence` and `lastVerified`,
         and it NEVER collapses.
     Departing from this list is allowed and is a §7 argument, not a silent choice.

  3. YOU INHERIT FOUR RULES AND EVERYTHING YOU ADD IS BOUND BY THEM.
       - nothing rendered as HTML text below `--t-floor` (12px), the two registered exceptions
         aside;
       - no SVG `<text>` or `<tspan>` anywhere in `apps/web` - labels are HTML positioned over the
         SVG. `check-svg-text-floor.mjs` enforces it and I have driven it: it returns rc=1 on a
         single restored `<text>` in a real file;
       - every `<summary>` carries a digit or a count;
       - **a CSSOM check as well as a screenshot**, per the resolution above. Anything you add that
         depends on a custom property, a `calc()` or a transform is verified by reading back the
         resolved declaration, not by looking at a picture of it.

  4. §5 USES A8 AND A9 TWICE EACH and has since HANDOFF-05's addendum. This is recorded in the
     section itself and is deliberate - the numbers are cited from `docs/2.0/SNAPSHOT.md` §7 and
     from LEDGER-05, so renumbering would move those citations onto different assertions.
     **§7 NAMES ALL FOUR BY SUBJECT, NEVER BY NUMBER.**

  5. THE CUTOVER CHECKLIST MAY NOT DEPEND ON THINGS NO SESSION CAN DO, and there are now three:
     the mainnet block fixture (LEDGER-10 Q4 - the cutover ships with that test still skipped or it
     does not ship); the per-crossing crossing source, which is HANDOFF-12's confirmed-block driver;
     and a provisioned VPS. A checklist step nobody reading it can complete is not a checklist step.

  6. THE PLANE STAYS AS 04a BUILT IT, AND THIS IS THE ONE I EXPECT A SESSION TO GET WRONG. You are
     the first handoff that CAN make it live, and you must not. It draws ONE MARK PER COUNTED
     CROSSING from `migrationHist`, uniform weight, because per-crossing amounts, ordering and
     confirmation state do not exist in `SnapshotV1` and inventing them is a manufactured
     measurement. **THE ADAPTIVE RETENTION WINDOW IS DEFERRED WHOLE** (LEDGER-04a Q2): without
     per-crossing ordering there is no "newest N", so the mechanism is not partially implementable
     and a board of arbitrary marks labelled a recent window is the exact defect it exists to
     prevent. What you MAY do is redraw the plane ON BLOCK ARRIVAL - that is the surface's one
     licensed ceremony (CLAUDE.md, and L2's R1 for 04a) - and nothing per-transaction, ever.

  7. THE PANEL RULE, in its corrected form, because the old wording is the one a reader remembers:
     **the cutover may not RENDER AN UNMEASURED PANEL AS A MEASUREMENT.** A named absence stating
     its CONDITION - never an owner - is permitted and is what `docs/2.0/SNAPSHOT.md` §8.1
     specifies. The old wording, "may not ship a null analysis panel", turned on the COUNT of null
     panels and was wrong for that reason.

WHAT I EXPECT THIS HANDOFF TO PRODUCE, stated plainly so nobody mistakes the deliverable.
The VPS is still not provisioned, the tunnel is not built, and migrations 003, 004 and 005 have
never been applied to that database. **You are building the WIRING and writing the CHECKLIST; the
promotion is the operator's click and always was.** Write the checklist so that someone who has the
box on the day can execute it top to bottom without asking a question - and label every step you
could not execute yourself as UNVERIFIED rather than reporting it as done. LEDGER-04 Q3 stands: no
session can reach the VPS, a preview host or the gateway from inside its container, and the egress
proxy refuses the CONNECT tunnel before Deployment Protection even answers.

§5 ADDITIONS, in the amended format with exclusion sets, on top of whatever survives your reconcile:
  - the three status affordances each render where fold 2 places them, and the `UNVERIFIED` chip is
    reachable without opening a disclosure *(fail side: collapse it and watch the assertion fire)*;
  - the staleness indicator names the resolved source (`redis-rest | redis | gateway | fixture`)
    and the assertion FAILS when the FIRST source is unreachable, not merely when the last one is -
    §3's existing rule, which is the one that would otherwise pass on a stale site that renders;
  - nothing this handoff adds violates the four inherited rules in fold 3, each checked by the
    existing guard or test rather than by a new one;
  - the plane is unchanged in what it draws, asserted rather than assumed *(fail side: give a mark
    a per-crossing amount and watch it fail)*;
  - `pnpm -r test` unchanged in COUNT as well as colour. Baseline **1351 total, 1348 passed,
    3 skipped**, measured by L2 on a clean worktree of `50ac7d9` with a real Postgres 16 and a real
    local Redis;
  - fourteen guards, typecheck, lint, `content validate` and `pnpm build` green.

AND THE TWO NON-ASSERTIONS, both of which have now paid on two branches running: §7 states what it
closed and what it did not, and §7 carries BOTH a screenshot-derived check AND a CSSOM check. 04b
found 86 of 155 labels silently broken after two of its own screenshot passes had approved them.
