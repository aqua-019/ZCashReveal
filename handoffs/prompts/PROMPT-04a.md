# PROMPT-04a — the messages that steered this session

Archived verbatim per the Revolution protocol step 5. One file per handoff; each
message under a heading naming what it is and when it arrived.

## 1. Session kickoff, from Aqua (L2 relay) — 31 Aug 2026, first message

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Your handoff is NEW and is written below as HANDOFF-04a - the legibility pass reader feedback commissioned, and the turnstile plane on the splash. Write it into `handoffs/HANDOFF-04a-legibility.md` from the §1 SCOPE here, set the index and LOG accordingly, then execute it. Report spawn mode first. Stop at PR opened. Fork from `main` at `452d586` (PR #46 merged and 09b closed at `3225a5c`; `452d586` adds the two design files named below and nothing else).

THE DESIGN REFERENCE IS IN THE REPO. Two files sit beside the existing source-of-truth mockup that `apps/web/src/styles/tokens.css` already cites:

```
docs/2.0/04a-splash-record.html    the splash and one Record page, in context
docs/2.0/04a-turnstile-plane.html  the plane at full size, with an arrival-rate control
                                   so the adaptive window can be seen moving

```

READ BOTH BEFORE PLANNING. Open them, and where you can, RENDER them - the composition is the specification and reading the markup is not the same as seeing it. The composition is APPROVED and is not yours to reopen. What is yours is building it against real data, and the boundary between what the snapshot can honestly feed it today and what it cannot is the whole difficulty - see deliverable 5.

Both files carry an annotations layer explaining each decision; the plane study's notes sit below the board and the splash mockup has an "Annotations" toggle in its footer bar. Those notes are the reasoning, and §7 should agree with them or say where it departs and why.

THEY ARE ALREADY COMMITTED, AT `docs/2.0/` RATHER THAN `docs/2.0/mockups/`. `git mv` both into `docs/2.0/mockups/` as part of deliverable 5, beside `zecreveal-2.0-mockups-v2.html`: that is where `apps/web/src/styles/tokens.css` says the design record of a value lives, and a handoff whose deliverable is a LOOK keeps its record in the same place. Use `git mv` rather than delete-and-add so the files keep their history. Nothing else about them changes.

PROVENANCE OF THE DESIGN DECISIONS, so §8 can cite them rather than re-derive them. They come from the D501 design catalogue in the project (optional reading - the decisions are already baked into the two files and into this brief):

* the hatched shielded pools and sharp boundaries: D3640, the privacy-fog register - what an outside observer sees IS the interface's resting state;
* fixed lane/node size with balance as the fill or swept arc: D0994, measured from mempool.space, whose shipped grammar is "stripes and water levels", not particles;
* confirmed engraved / pending provisional: D3646, ledger permanence typography;
* one budgeted ceremony on block arrival: D3628 + LAW-15;
* the seeded plane: D3649 and LAW-10, where determinism is the point - "provable atmosphere";
* one hover verb, and reduced motion honoured by architecture: LAW-02/03 and LAW-12.

L2 BRIEF - HANDOFF-04a (Cowork, 31 Aug 2026)

WHY THIS COMES BEFORE 11. Reader feedback, verbatim:

1. "The navbar is confusing: SPLASH, BEWARE, CONTRADICTIONS - am I browsing a website or selecting missions in Metal Gear Solid?"
2. "The floating PUBLISHED NULLIFIERS / ANCHORS / COMMITMENTS boxes are even better. Are they buttons? Filters? Evidence? A legend? Nobody knows."
3. "Typography is great looking, but everything competes for attention... Half the text is basically 9px gray-on-charcoal punishment."
4. "Instead of: Claim -> explanation -> evidence -> visualization, we get: Vibes -> cryptographic terminology -> vibes -> huge number -> tiny explanation -> vibes."

(4) IS THE DIAGNOSIS AND THE OTHER THREE ARE SYMPTOMS. The complaint is not volume, it is ORDER. A fix that reduces what is on screen without fixing sequence produces a tidier page with the same defect - which is why the panels in deliverable 4 are a container for the fix and not the fix.

HANDOFF-11 adds three more status affordances to these pages - a staleness indicator, a `source:` chip, an `UNVERIFIED` chip - onto a surface where a reader already cannot tell a button from a legend. It would add to the exact problem. The hierarchy that says where a status chip goes is therefore built first, and 11 receives that surface list as a design input.

L2 FINDINGS, MEASURED. Verify each before acting; two of my premises were false at 09b and the session that checked them built the better thing.

F-04a-1 THE NAV'S ANSWER TO "WHAT IS THIS PAGE" IS ALREADY WRITTEN AND NOT RENDERED. All nine entries in `apps/web/src/lib/nav.ts` carry a `dek`, and the file's own comment says the dek "feeds the meta description and the page dek". `ScreenNav.tsx` renders `s.idx` and `s.label` and nothing else. `/beware`'s dek is already "The exploit ledger: what was found, when it was disclosed, how long the window stayed open, and whether it was ever detectable." Complaint 1 is one field away and needs no new copy written.

F-04a-2 THE NAV ALREADY CARRIES A TWO-GROUP STRUCTURE IT FLATTENS. Every screen has `half: "record" | "instrument"`. Read per object rather than by pairing extracted lists: record 00 Splash · 01 Beware · 02 Contradictions · 03 Timeline · 04 Network · 06 Method · 08 Sources instrument 05 Track · 07 Flows Nine undifferentiated items read as a mission select; two named groups read as two purposes. Keep the two-digit index. `nav.ts` states its reason - "the Record is numbered like evidence, not labelled like a menu" - and that reason survives the complaint. The reader misread the numbering because the label beside it said nothing.

F-04a-3 (HIGH) `nav.ts` STATES A GUARANTEE THE TREE DOES NOT HOLD. Its docblock: "One source for the system bar, the route set, the metadata titles and the assertion A7 route list, so a route can never exist without a nav entry or be tested without being reachable." Measured: nine screens, sixteen `page.tsx` routes, and `/pools` and `/reveal` are top-level user-facing pages with NO nav entry. (`/address/[addr]`, `/block/[height]`, `/tx/[txid]`, `/track/flows` and `/dev/primitives` are dynamic or developer routes and are properly excluded.) Either the two routes join the table or the docblock stops claiming an invariant it does not enforce - and if it keeps claiming one, a guard enforces it. `/pools` is also the page the plane is about, so its being unreachable from the nav is not cosmetic.

F-04a-4 THE CONTRAST COMPLAINT IS RIGHT AND ITS EXPLANATION IS WRONG. WCAG ratios computed for every ink token against `bg #121110` and `surface #1a1816`: ink 15.19 / 14.26 AA pass ink-dim 8.11 / 7.61 AA pass ink-mute 5.20 / 4.88 AA pass - used 82 times ink-faint 3.11 / 2.92 fails AA text - used 3 times gold 10.46 / 9.82 AA pass The type scale bottoms at 10px. So the site passes automated contrast almost everywhere and still reads as punishment, because the failure is 10px JetBrains Mono at 4.88:1 - legal and unreadable. A palette fix would turn the numbers greener and change nothing a reader feels. The work is a SIZE FLOOR and a hierarchy that lets content recede without shrinking. CORRECTION TO MY OWN FINDING, and check it before acting: `--ink-faint` failing AA is NOT a defect. `tokens.css` states it is "reserved for non-text: hairline rules and inactive marks", which is why it has three uses. HANDOFF-01 already did this contrast pass and RAISED the ink tokens from the mockup's `#7c7366` / `#4f4840`. The palette work is done and documented; only the sizes are open.

F-04a-5 THE SIZE FLOOR IS A LEDGER QUESTION, NOT A FREE CHOICE, and this is the one thing in this handoff that needs recording rather than deciding. `tokens.css` names `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` as the source of truth for values, and that file floors at 8.5px; `apps/web` already floors at 10px, so the shipped site is ALREADY a divergence and an improvement. Raising further diverges further. The precedent is HANDOFF-01's own, in `tokens.css`: "This diverges from the mockup :root, which is why it is a ledger question rather than a silent edit." Same treatment. Set the floor, state the measured ratio at that size, and record the divergence in §8.

F-04a-6 THE DISCLOSURE PATTERN EXISTS IN YOUR TREE, DONE CORRECTLY, TWICE. `Cite.tsx` uses a native `<details>` and its comment already argues why. `EstimatePanel.tsx`'s summary reads `how this was bounded - 3 filters, 2 assumptions` - the closed state carries its finding. This handoff PROMOTES an existing pattern to page level. It does not invent one. `<details>` is FLOW CONTENT and cannot nest in a `<p>` - noted twice in your own tree (`RecordHead.tsx:42`, `app/page.tsx:155`). At component scale that is occasional; wrapping prose sections hits it constantly. Plan the markup rather than discovering it.

F-04a-7 THREE DEFECTS I SHIPPED INTO THE MOCKUP AND CAUGHT ON THE RENDER, recorded because each is a shape this project rates and each will recur in the build: (a) the plane drew 17 crossings while the reading beneath it said 1,284 - two numbers for one quantity on one screen; (b) the legend and per-node counts were computed from the fixture while the arcs were computed from the live board, so at a higher rate the picture said 60 and the legend said 17 - a stale legend beside a live picture; (c) a mempool row claimed three unconfirmed crossings the plane did not draw. All three are the same shape: TWO RENDERINGS OF ONE QUANTITY THAT DO NOT SHARE A SOURCE. §5 gets an assertion against it. I found all three by taking a screenshot and reading it, not by reading the code.

L2 RULINGS, so nobody re-derives them mid-gate.

R1 THE CEREMONY CLAUSE. CLAUDE.md pins "one ceremony per surface: block arrival". The plane IS the splash's one ceremony and BLOCK ARRIVAL is what drives it. The mempool may populate a dimmer PENDING register without animating. No per-transaction animation, ever.

R2 GOLD. Line colour is the ORIGIN pool, the arrowhead is GOLD, and gold's fourth licensed job - "value crossing a pool boundary" - is spent on the arrowhead, which is where the crossing LANDS. The five pool hues remain their own register. No contract amendment is needed for any of this, nor for the nav labels, nor for the type sizes, which are not pinned.

R3 EVERY OTHER PART OF THE APPROVED COMPOSITION is inside the existing contract: one hover verb (dim), one curve, SVG only, no emoji, `Math.random` banned, reduced motion honoured by not constructing the animation.

§1 SCOPE for HANDOFF-04a, which you write and then execute:

```
HANDOFF-04a - the legibility pass, and the turnstile plane
depends_on: 01, 02, 03, 04, 09b
blocks: 11 (both rewrite `apps/web` substantially and would conflict; this lands first)

IN SCOPE:

  1. THE NAV. Render each screen's `dek`; group the bar by `half`; resolve F-04a-3 in one
     direction or the other, with a guard if the invariant stays. Keep the two-digit index.
     **The bar collapses to one line and opens on approach** - the approved mockup shows it:
     a transparent strip below the bar so it opens as the cursor arrives rather than on
     contact, and it must ride with the bar as it grows. THREE WAYS IN, because hover alone
     excludes touch and the keyboard entirely: pointer, `:focus-within` on tab, and a real
     button with `aria-expanded`; Escape closes. The collapsed line still names the current
     screen - hiding the nav must not cost orientation, which was the complaint.

  2. TYPE HIERARCHY AND A SIZE FLOOR. Set and justify a minimum, with the measured ratio at
     that size, and record the divergence per F-04a-5. Establish a dominance order across the
     four families so something can recede without becoming small. The families are pinned and
     are not the problem.

  3. AFFORDANCE. Every element on a Record page is exactly one of: a control, a value, a
     label, or evidence - and reads as that one thing without being hovered. The floating
     PUBLISHED NULLIFIERS / ANCHORS / COMMITMENTS group is the worked case; it is a LEGEND,
     and §7 names what makes it read as one.

  4. PROGRESSIVE DISCLOSURE, native `<details>`, per F-04a-6. THE COLLAPSE RULE:
       NEVER collapse the claim. The claim is the page.
       NEVER collapse `confidence`, `lastVerified` or the source count. Epistemic status
         behind a toggle is the null-panel-renders-as-zero defect in a nicer coat.
       COLLAPSE the derivation, the raw table, the method walk-through, the full source list.
       EVERY `<summary>` CARRIES ITS FINDING - "Sources - 14 cited, 3 primary", never
         "Sources". `EstimatePanel` already does this; make it the rule.

  5. THE TURNSTILE PLANE, ON THE SPLASH. Build the approved composition, and the difficulty is
     entirely in what may honestly feed it.

     THE GEOMETRY, which is approved and specified: five ledgers on a perspective plane, four
     at inset corners and Ironwood raised at the centre with a drop-line. Placement is an
     argument - the two unsound circuits, `sprout` and `orchard`, sit on one diagonal;
     `transparent` is nearest the reader because it is the only ledger anyone can see into.
     Arcs are sampled in WORLD space and projected point by point so they foreshorten as
     objects rather than bowing as 2-D ribbons. Shielded nodes are hatched and their
     boundaries drawn sharp: solidity means observability, and a plane of five equal solid
     discs would claim a view the instrument does not have. Balance is an arc swept on each
     node's ring, never disc area - a 550x range makes area useless and sprout becomes a dot.

     WHAT MAY FEED IT TODAY, and this is the line that matters:
       MAY: `snapshot.pools` (five lanes, `balanceZat`, `share`) for the nodes.
            `migrationHist` for the crossing COUNT in the window.
       MAY NOT: per-crossing amounts, ordering, or confirmation state. `SnapshotV1` carries
            none, deliberately - `snapshotMigrationHistSchema` says in as many words that
            "there is nowhere in it to put a wallet, an address or a txid", and
            `pool_boundary_flows` has the right shape but `writePoolBoundaryFlow` HAS NO
            PRODUCTION CALLER; the confirmed-block driver is HANDOFF-12.
     SO 04a DRAWS **ONE MARK PER COUNTED CROSSING, UNIFORM WEIGHT** - the count is real and
     rendering it as marks is rendering the count. Giving each mark a distinct amount, time or
     pending state it does not have would be manufacturing a measurement, which is the defect
     this project refuses. The plane states that limit in its own caption. When 12 lands, the
     picture gets RICHER (thickness becomes amount, fade becomes age, pending arcs appear) and
     never DIFFERENT: same component, better input.

     THE ADAPTIVE RETENTION WINDOW, ruled by the operator and specified here:
       The board holds a constant visual DENSITY - the newest N_MAX crossings - and the WINDOW
       is whatever they span, clamped to [1 block, 24h]. A busy chain shows a SHORTER window
       rather than a denser picture. **N_MAX is a named constant; the approved study uses 60
       at full size and 42 on the splash, and §7 states which and why.**
       THE WINDOW IS THEREFORE THE READING and is rendered at the same weight as the counts.
       Two boards each holding 60 arcs are not comparable until a reader can see one covers
       47 minutes and the other twenty-four hours. Without that line the picture holds its
       density constant and quietly misreports how busy the chain is.
       AGE IS A PURE FUNCTION OF POSITION IN THE WINDOW, not a timer: opacity runs from
       engraved at the newest to nearly gone at the oldest. Recomputed ON BLOCK ARRIVAL per
       R1. **Stateless by construction** - the plane is a pure function of the snapshot - so
       a server render and a browser that loaded fifteen seconds later draw the same plane.
       A timer would drift them apart and two readers would see different boards from one
       document.
       WHEN THE CHAIN IS QUIET the plane is nearly empty and that is correct: value moving
       WITHIN a pool crosses nothing. A pool with no crossings says so in words
       (`closed - 0 crossings in window`), because an absence that looks like a rendering
       fault is not an absence. If nothing has crossed for the whole 24h ceiling, say when the
       last crossing was rather than showing a stale day.

     DETERMINISM: every position, fan spread and ordering derives from the tip hash through
     FNV-1a -> mulberry32. Same block, same plane, every visitor, re-derivable by anyone.

  6. THE HONEST NULL STATES already specified by `docs/2.0/SNAPSHOT.md` §8.1 as of 09b are
     rendered, not reinvented. An absence states its CONDITION, never an owner.

OUT OF SCOPE, named so it is not half-started:
  - THE PER-CROSSING SOURCE. It needs HANDOFF-12's confirmed-block driver to fill
    `pool_boundary_flows`, plus a new `SnapshotV1` field, which is publisher work and a
    deliberate decision about what this site publishes. **The cap in deliverable 5 is what
    makes that field affordable**: the publisher already spends `WIRE_COMMANDS_PER_TIP` = 5
    per tip, about 172,500 a month against a 200,000 ceiling, on a store shared with an
    unrelated production project. A field capped at the newest N is a fixed-size array; an
    unbounded one could not ship. Say so in §8 so the handoff that adds it inherits the bound.
  - Live/WS anything (HANDOFF-11), any gateway, indexer, publisher or migration change, and
    any production promotion.

§5 WANTS AT MINIMUM, in the amended format where every assertion states its EXCLUSION SET and
§7's fail side names which member it used:
  - **ONE SOURCE PER QUANTITY** (F-04a-7). Every number rendered twice on one screen comes
    from one computation: the plane's crossing count, the legend's per-pool counts, the node
    traffic lines and the readings below are one derivation with four renderings
    *(exclusion set: any pair of renderings that can disagree; fail side: feed the legend from
    the fixture while the arcs read the live board, and watch the assertion name the pair)*.
  - every rendered text style meets AA at its own size, COMPUTED from the token and the
    background in a test rather than read off the palette.
  - no rendered body text below the floor deliverable 2 sets, checked over the built CSS.
  - every `<summary>` in `apps/web` contains at least one digit or count.
  - every screen in `SCREENS` renders its `dek`; F-04a-3 closed in whichever direction was
    chosen, with the guard if the invariant stayed.
  - the nav opens by pointer, by `:focus-within`, and by the button, and closes on Escape;
    the collapsed bar names the current screen. **Touch is asserted, not assumed.**
  - the plane renders four honest states against fixture snapshots: crossings measured; a null
    `migrationHist`; a chain quiet for the whole ceiling; and a pool with zero crossings - and
    no state renders an unmeasured quantity as a zero.
  - the adaptive window: at a rate where the count exceeds N_MAX the board shows exactly
    N_MAX marks AND the header states the shortened window
    *(fail side: cap the marks without shortening the stated window, and watch the assertion
    fire - that is the failure the whole rule exists to prevent)*.
  - reduced motion: the nav disclosure and the plane's block-arrival step are NOT CONSTRUCTED
    rather than cancelled.
  - `pnpm -r test` unchanged in COUNT as well as colour. Baseline **1276 total, 1273 passed,
    3 skipped**, measured by L2 on a clean worktree of `e1a39f7` with a real Postgres 16 and a
    real local Redis.
  - twelve guards, typecheck, lint, `content validate` and `pnpm build` green.

AND TWO THINGS THAT ARE NOT ASSERTIONS:
  §7 states, in one line each, which of the four reader complaints the branch believes it
  closed and which it did not. A redesign that reports only what it built has not answered the
  feedback it was commissioned by.
  §7 also carries A SCREENSHOT-DERIVED CHECK of the splash and one Record page. I found all
  three of F-04a-7's defects by rendering the page and reading it, and none of them by reading
  the code. A visual handoff whose gate never looks at the picture is gating the wrong artefact.

```
