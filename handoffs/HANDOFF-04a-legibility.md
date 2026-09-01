---
handoff: 04a
title: The legibility pass, and the turnstile plane
status: shipped
branch: the session-designated branch (name it `feat/v2-04a-legibility` if you may choose)
track: Web
depends_on: 01, 02, 03, 04, 09b
blocks: 11
written_by: L3, from the §1 SCOPE in the L2 BRIEF for HANDOFF-04a · 31 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-04a — the legibility pass, and the turnstile plane

## §1 SCOPE

Verbatim from the L2 BRIEF of 31 Aug 2026. The composition is APPROVED and is not this
session's to reopen; what is this session's is building it against real data, and the boundary
between what the snapshot can honestly feed it today and what it cannot.

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
```

### The reader feedback this handoff was commissioned by, verbatim

1. "The navbar is confusing: SPLASH, BEWARE, CONTRADICTIONS - am I browsing a website or
   selecting missions in Metal Gear Solid?"
2. "The floating PUBLISHED NULLIFIERS / ANCHORS / COMMITMENTS boxes are even better. Are they
   buttons? Filters? Evidence? A legend? Nobody knows."
3. "Typography is great looking, but everything competes for attention... Half the text is
   basically 9px gray-on-charcoal punishment."
4. "Instead of: Claim -> explanation -> evidence -> visualization, we get: Vibes ->
   cryptographic terminology -> vibes -> huge number -> tiny explanation -> vibes."

**(4) is the diagnosis and the other three are symptoms.** The complaint is not volume, it is
ORDER. A fix that reduces what is on screen without fixing sequence produces a tidier page
with the same defect — which is why the panels in deliverable 4 are a container for the fix
and not the fix.

HANDOFF-11 adds three more status affordances to these pages — a staleness indicator, a
`source:` chip, an `UNVERIFIED` chip — onto a surface where a reader already cannot tell a
button from a legend. The hierarchy that says where a status chip goes is therefore built
first, and 11 receives that surface list as a design input.

## §2 READING (state before you start)

Required, in this order:

- `CLAUDE.md`, then `handoffs/LEDGER.md`, then this file.
- **`docs/2.0/mockups/04a-splash-record.html`** and **`docs/2.0/mockups/04a-turnstile-plane.html`** —
  the approved composition. RENDER them; reading the markup is not the same as seeing it.
  Both carry an annotations layer: the plane study's notes sit below the board, the splash
  mockup has an "Annotations" toggle in its footer bar. §7 agrees with those notes or says
  where it departs and why. (They arrive at `docs/2.0/` and are `git mv`d into
  `docs/2.0/mockups/` by deliverable 5 — that is where `apps/web/src/styles/tokens.css` says
  the design record of a value lives.)
- `docs/2.0/mockups/zecreveal-2.0-mockups-v2.html` — the standing source of truth for values,
  which `tokens.css` cites and which this handoff diverges from on ONE axis (the size floor).
- `docs/2.0/SNAPSHOT.md` §8.1 — the null-state rendering contract as of 09b. Rendered, not
  reinvented.
- `apps/web/src/lib/nav.ts`, `apps/web/src/styles/tokens.css`,
  `apps/web/src/components/record/Cite.tsx`, `apps/web/src/components/track/EstimatePanel.tsx`.

`docs/2.0/SNAPSHOT.md` is required reading here even though nothing in scope touches Redis,
a Vercel variable or the publisher, because §8.1 is the contract deliverable 6 renders.

### Provenance of the design decisions, so §8 cites rather than re-derives

They come from the D501 design catalogue in the project; the decisions are already baked into
the two files and into this handoff.

| decision | catalogue |
|---|---|
| hatched shielded pools, sharp boundaries | D3640 — the privacy-fog register: what an outside observer sees IS the interface's resting state |
| fixed lane/node size, balance as fill or swept arc | D0994 — measured from mempool.space, whose shipped grammar is "stripes and water levels", not particles |
| confirmed engraved / pending provisional | D3646 — ledger permanence typography |
| one budgeted ceremony on block arrival | D3628 + LAW-15 |
| the seeded plane | D3649 + LAW-10 — determinism is the point: "provable atmosphere" |
| one hover verb; reduced motion honoured by architecture | LAW-02 / LAW-03 / LAW-12 |

### L2's findings, to be verified before acting

Two of L2's premises were false at 09b and the session that checked them built the better
thing. Each of these is checked and its disposition recorded in §7.

- **F-04a-1** — the nav's answer to "what is this page" is already written and not rendered.
  All nine entries in `nav.ts` carry a `dek`; `ScreenNav.tsx` renders `idx` and `label` only.
  Complaint 1 is one field away and needs no new copy written.
- **F-04a-2** — the nav already carries a two-group structure it flattens. Every screen has
  `half: "record" | "instrument"`. Nine undifferentiated items read as a mission select; two
  named groups read as two purposes. Keep the two-digit index — `nav.ts` states its reason
  ("the Record is numbered like evidence, not labelled like a menu") and that reason survives
  the complaint. The reader misread the numbering because the label beside it said nothing.
- **F-04a-3 (HIGH)** — `nav.ts` states a guarantee the tree does not hold: "a route can never
  exist without a nav entry or be tested without being reachable", while `/pools` and
  `/reveal` are top-level user-facing pages with no nav entry. Either the two routes join the
  table or the docblock stops claiming an invariant it does not enforce — and if it keeps
  claiming one, a guard enforces it. `/pools` is the page the plane is about, so its being
  unreachable from the nav is not cosmetic.
- **F-04a-4** — the contrast complaint is right and its explanation is wrong. Every ink token
  passes AA except `--ink-faint`, which `tokens.css` reserves for non-text. The failure is
  10px JetBrains Mono at 4.88:1 — legal and unreadable. A palette fix would turn the numbers
  greener and change nothing a reader feels. **The work is a SIZE FLOOR** and a hierarchy that
  lets content recede without shrinking. HANDOFF-01 already did the palette pass and RAISED
  the ink tokens from the mockup's `#7c7366` / `#4f4840`; only the sizes are open.
- **F-04a-5** — the size floor is a ledger question, not a free choice. `tokens.css` names
  `zecreveal-2.0-mockups-v2.html` as the source of truth for values and that file floors at
  8.5px; `apps/web` already floors at 10px, so the shipped site is ALREADY a divergence and an
  improvement. The precedent is HANDOFF-01's own, in `tokens.css`: "This diverges from the
  mockup :root, which is why it is a ledger question rather than a silent edit." Same
  treatment: set the floor, state the measured ratio at that size, record the divergence in §8.
- **F-04a-6** — the disclosure pattern exists in the tree, done correctly, twice. `Cite.tsx`
  uses a native `<details>` and argues why in its own comment; `EstimatePanel.tsx`'s summary
  reads `how this was bounded - 3 filters, 2 assumptions`. This handoff PROMOTES an existing
  pattern to page level; it does not invent one. `<details>` is FLOW CONTENT and cannot nest
  in a `<p>` — noted twice in the tree already. Plan the markup rather than discovering it.
- **F-04a-7** — three defects L2 shipped into the mockup and caught ON THE RENDER: (a) the
  plane drew 17 crossings while the reading beneath it said 1,284; (b) the legend and per-node
  counts were computed from the fixture while the arcs were computed from the live board;
  (c) a mempool row claimed three unconfirmed crossings the plane did not draw. All three are
  one shape: **TWO RENDERINGS OF ONE QUANTITY THAT DO NOT SHARE A SOURCE.** A1 is written
  against it. L2 found all three by taking a screenshot and reading it, not by reading code.

## §3 CONTRACT

### L2's rulings, so nobody re-derives them mid-gate

- **R1 — the ceremony clause.** `CLAUDE.md` pins "one ceremony per surface: block arrival".
  The plane IS the splash's one ceremony and BLOCK ARRIVAL is what drives it. The mempool may
  populate a dimmer PENDING register without animating. **No per-transaction animation, ever.**
- **R2 — gold.** Line colour is the ORIGIN pool; the arrowhead is GOLD. Gold's fourth licensed
  job — "value crossing a pool boundary" — is spent on the arrowhead, which is where the
  crossing LANDS. The five pool hues remain their own register. No contract amendment is
  needed for this, nor for the nav labels, nor for the type sizes, which are not pinned.
- **R3 — everything else in the approved composition** is inside the existing contract: one
  hover verb (dim), one curve `cubic-bezier(.32,.72,0,1)`, SVG only, no emoji, `Math.random`
  banned, reduced motion honoured by NOT CONSTRUCTING the animation.

### Standing contract this handoff does not weaken

- Claim levels, the never-claim-identity rule, and the shielded-balance rule are untouched.
- An absence states its CONDITION, never an owner (`docs/2.0/SNAPSHOT.md` §8.1).
- The four type families are pinned and are not the problem; the palette is settled and is not
  reopened. The ONE divergence this handoff makes is the size floor, recorded in §8.
- Nothing here touches Redis, a Vercel variable, the publisher, the gateway, the indexer or a
  migration. No production promotion. The PR stops at opened.

## §4 DELIVERABLES

| # | deliverable | where |
|---|---|---|
| 1 | The nav: `dek` rendered, grouped by `half`, collapsing bar with three ways in and Escape to close, collapsed line names the current screen | `apps/web/src/components/ui/ScreenNav.tsx`, `SysBar.tsx`, `apps/web/src/lib/nav.ts`, `apps/web/src/styles/` |
| 2 | The type scale: a named size floor, a dominance order across the four families, and the divergence recorded | `apps/web/src/styles/tokens.css` + the consumers below the old floor |
| 3 | Affordance: control / value / label / evidence, each reading as one thing unhovered; the PUBLISHED NULLIFIERS group rebuilt as a legend | `apps/web/src/components/**`, named in §7 |
| 4 | Progressive disclosure at page level, native `<details>`, collapse rule obeyed, every `<summary>` carrying its finding | `apps/web/src/components/**` |
| 5 | The turnstile plane on the splash, fed only by what the snapshot honestly carries, with the adaptive retention window stated as a reading. **Both design files `git mv`d into `docs/2.0/mockups/`.** | new component under `apps/web/src/components/`, mounted on `/`; `docs/2.0/mockups/` |
| 6 | The honest null states of `SNAPSHOT.md` §8.1 rendered, not reinvented | the plane and the splash readings |
| 7 | F-04a-3 closed in one direction, with a guard if the invariant stays | `apps/web/src/lib/nav.ts` + `scripts/` + `package.json` `check` |

## §5 ASSERTIONS - binary and machine-checkable

Amended format (LEDGER-09a Q2): every assertion states its **EXCLUSION SET** - the values its
predicate is written to reject - and names which member of that set its fail side used. At
least one fail side per assertion is a DATA mutation, a value drawn from inside the set, because
a fail side that is only a code mutation proves the assertion is WIRED and never that it
DISCRIMINATES. `scripts/check-ledger-structure.mjs` R4 checks that both clauses are PRESENT; it
cannot check that either is correct, and that limit is stated in its own header.

- **A1.** ONE SOURCE PER QUANTITY. Every number rendered twice on one screen comes from one
  computation: the plane's crossing count, the legend's per-lane counts, the node traffic lines
  and the readings below are one derivation with four renderings.
  *Exclusion set:* any pair of renderings of one quantity that can disagree for some input.
  *Fail side names:* a legend fed from the fixture while the marks are built from the live
  board - the member F-04a-7(b) is an instance of - and the assertion must name the pair.

- **A2.** CONTRAST AT SIZE. Every rendered text style meets WCAG AA at its own size, COMPUTED
  from the token and the background in a test rather than read off the palette.
  *Exclusion set:* any (token, background, size, weight) tuple whose computed ratio is below its
  AA threshold - 4.5:1 for normal text, 3:1 for large.
  *Fail side names:* the mockup's original `--ink-mute` value `#7c7366`, which measures 4.04:1
  on `--bg` and is a member HANDOFF-01 already removed once.

- **A3.** THE FLOOR HOLDS. No rendered text below the floor deliverable 2 sets, checked over the
  BUILT CSS rather than the source.
  *Exclusion set:* any font-size reachable by rendered text whose computed value is under the
  floor - 8.5px, 9px, 9.5px, 10px, 10.5px, 11px and 11.5px are the seven the tree carried.
  *Fail side names:* `9.5px`, the size 24 declarations used, spliced back into the built
  stylesheet.

- **A4.** EVERY SUMMARY CARRIES ITS FINDING. Every `<summary>` in `apps/web` contains at least
  one digit.
  *Exclusion set:* any summary text with no digit in it.
  *Fail side names:* the bare word `Sources`, which is the rule's own named counter-example.

- **A5.** EVERY SCREEN RENDERS ITS `dek`. Every entry in `NAV_ENTRIES` renders its `dek` text
  into the bar.
  *Exclusion set:* any `NAV_ENTRIES` member whose `dek` string reaches no rendered node.
  *Fail side names:* a `ScreenNav` that renders `idx` and `label` only - the state the tree was
  in before this handoff, and the member F-04a-1 names.

- **A6.** F-04a-3 CLOSED. Every user-facing static route under `apps/web/src/app` has a nav
  entry or is excluded by name with a reason, enforced by a guard rather than by a docblock.
  *Exclusion set:* any static route with a `page.tsx`, no `NAV_ENTRIES` entry and no exclusion.
  *Fail side names:* `/pools` - the member that was actually open for four handoffs - restored
  to the unlisted state by removing its entry, plus a fresh route the table has never seen.

- **A7.** THREE WAYS IN, AND OUT. The index opens by pointer, by `:focus-within` and by the
  button, and closes on Escape; the collapsed bar names the current screen. Touch is asserted,
  not assumed.
  *Exclusion set:* any of the three entry paths that leaves the index collapsed, an Escape that
  leaves it open, and a collapsed bar that does not name the current screen.
  *Fail side names:* the Escape path, measured against the state this session shipped first,
  where Escape set `aria-expanded="false"` and the computed `grid-template-rows` stayed at its
  open value because returning focus to the toggle re-satisfied `:focus-within`.

- **A8.** FOUR HONEST STATES, AND NO UNMEASURED ZERO. The plane renders four states against
  fixture snapshots - crossings measured; a null `migrationHist`; a window whose count is zero;
  and a lane outside every measured relation - and no state renders an unmeasured quantity as a
  zero.
  *Exclusion set:* any state in which a quantity the document does not carry reaches the DOM as
  `0`, or as a count with no condition beside it.
  *Fail side names:* a lane with no measured crossing relation rendered as
  `closed - 0 crossings in window` - which is the member the approved study itself renders under
  `sprout`, so the fail side is drawn from the specification rather than invented.

- **A9.** THE CAPPED BOARD STATES THE TRUE COUNT. When the counted crossings exceed `N_MAX` the
  board draws exactly `N_MAX` marks AND the header states the measured count, not the drawn one.
  *Exclusion set:* any rendering in which the marks are capped and the header reports only the
  number drawn - the pair "density held constant, traffic silently misreported".
  *Fail side names:* `drawnMarks` substituted for `countedCrossings` in the header, at a fixture
  rate where the two differ (42 against 1,284).

- **A10.** REDUCED MOTION BY ARCHITECTURE. The nav disclosure and the plane construct no
  animation system: nothing to cancel rather than something cancelled.
  *Exclusion set:* any rAF callback, interval, timer or Web Animations object created on the
  splash under `prefers-reduced-motion: reduce`.
  *Fail side names:* a constructed animation, planted with `element.animate()` on the splash,
  which the same probe must then report.

- **A11.** UNIFORM WEIGHT. Every mark the plane draws carries the same stroke weight, and no
  per-crossing amount, ordering or confirmation state reaches the renderer.
  *Exclusion set:* any per-mark visual property that varies with a quantity `SnapshotV1` does
  not carry - thickness by amount, fade by wall-clock age, a dashed pending arc.
  *Fail side names:* a per-mark stroke width drawn from a seeded amount, which is what the
  full-size study does and what this build must not.

- **A12.** DETERMINISM. Two builds of the same snapshot produce byte-identical plane geometry,
  and the plane's only entropy source is the tip hash through FNV-1a to mulberry32.
  *Exclusion set:* `Math.random`, `Date.now`, `new Date()`, and any input outside the snapshot
  argument.
  *Fail side names:* a second snapshot differing only in `hash`, which must produce a different
  plane - the discriminating half, since identical output for every input would also satisfy a
  naive equality check.

- **A13.** THE SUITE IS UNCHANGED IN COUNT, PLUS WHAT THIS BRANCH ADDS, ITEMISED. Against the
  baseline **1276 total, 1273 passed, 3 skipped** measured by L2 on a clean worktree of
  `e1a39f7` with a real Postgres 16 and a real local Redis. Guards, typecheck, lint,
  `content validate` and `pnpm build` green.
  *Exclusion set:* any test that disappears without being named, and any suite whose count falls.
  *Fail side names:* a deleted test file, which must move the total and be visible as a fall
  rather than absorbed by an addition elsewhere.

### Two things that are not assertions

- §7 states, in one line each, **which of the four reader complaints the branch believes it
  closed and which it did not.** A redesign that reports only what it built has not answered
  the feedback it was commissioned by.
- §7 carries **a screenshot-derived check** of the splash and one Record page. L2 found all
  three of F-04a-7's defects by rendering the page and reading it, and none by reading code.
  A visual handoff whose gate never looks at the picture is gating the wrong artefact.

## §6 DISPATCH HINTS

- The nav, the type scale and the disclosure pass are three independent surfaces and fan out
  cleanly; the plane is one component and does not.
- Loop 1 PREFLIGHT before any Haiku touches `tokens.css` or the plane — both are
  spec-longer-than-a-screen.
- The plane is pure and testable without a browser: it takes a snapshot and returns geometry.
  Build it that way and A12 is cheap.
- A2 and A3 want the BUILT CSS, not the source, so they run after `next build` or over the
  compiled stylesheet.
- Post-fan-out sweep (`git status --porcelain`) after every fan-out, before the next commit.

## §7 REPORT - written by L3 before the PR opens

Provenance on every claim: **Executed** (output shown or reproduced in this session),
**Read** (file and commit), **UNVERIFIED** (labelled as such). Numbers in this section were
measured on this branch unless they name another commit.

### 7.0 SPAWN MODE

**Executed.** Subagents are available and were proven by a tool attempt before any work began:
a `general-purpose` subagent returned `SPAWN-OK` in 1.8s. The Workflow tool is also available
and was used once, for the eight-way tree map that opened the session. Three fan-outs ran in
total; the post-fan-out sweep after each is in §7.9.

### 7.1 THE FOUR READER COMPLAINTS - what this branch closed, and what it did not

The handoff was commissioned by feedback, so this comes before what was built.

1. **"The navbar is confusing... am I browsing a website or selecting missions in Metal Gear
   Solid?"** - **CLOSED.** Every entry now renders the `dek` that was already written for it,
   and the bar is grouped into The Record and The Instrument by the `half` field that was
   already on every screen. No new copy was written. The two-digit index stays.
2. **"The floating PUBLISHED NULLIFIERS / ANCHORS / COMMITMENTS boxes... Are they buttons?
   Filters? Evidence? A legend? Nobody knows."** - **CLOSED.** They were an unlabelled list of
   pill-shaped boxes floating over the hero fog whose only statement of what they were lived in
   an `aria-label`. Four things now say it is a legend and none of them is a colour: it is a
   definition list, so each row is a NAME and WHAT IT IS; the heading names the group on the
   surface at reading size; it sits in document flow inside "the working" rather than over an
   image; and nothing in the group is interactive, so there is no hover state to mistake for a
   control.
3. **"Half the text is basically 9px gray-on-charcoal punishment."** - **CLOSED FOR HTML TEXT,
   NOT CLOSED FOR SVG CHART TEXT, and the second half is measured rather than conceded.** 94
   live declarations below 12px are gone; the floor is 12px and a test resolves every
   declaration through the token layer to prove it. **SVG text inside a scaled `viewBox` is not
   CSS pixels and cannot be fixed by choosing a bigger number:** the loop diagram's viewBox is
   1000 units wide and renders at 1384 CSS px on a 1440px viewport (scale 1.384), at 968px on a
   1024px viewport (0.968), and at 720px on anything 760px or narrower (0.72) - so a declared 12
   paints at 16.6, 11.6 and **8.64** CSS px respectively. Two declarations are registered
   below the floor with a measured reason (§7.4); the real fix is HTML labels over the SVG, which
   the turnstile plane already does and which §8 names as work.
4. **"Instead of: Claim -> explanation -> evidence -> visualization, we get: Vibes ->
   cryptographic terminology -> vibes -> huge number -> tiny explanation -> vibes."** -
   **CLOSED ON THE SPLASH, NOT ON THE OTHER SEVEN RECORD PAGES.** The splash now opens with a
   falsifiable one-sentence claim carrying the figure, then Evidence, then The working, with the
   beats LABELLED so the order is visible rather than implied. Nothing was deleted to achieve it.
   `/beware`, `/contradictions`, `/timeline`, `/network`, `/method`, `/flows` and `/sources` keep
   the order they had; the type pass and the disclosure rule reached them, the beat structure did
   not. **This is the largest thing this branch did not finish**, and it is the complaint L2
   called the diagnosis.

### 7.2 L2's FINDINGS, DISPOSITIONED

| finding | disposition | evidence |
|---|---|---|
| F-04a-1 the `dek` is written and not rendered | **ACCEPTED** | Read. `ScreenNav.tsx` rendered `s.idx` and `s.label` only. Now renders `.screendek` per entry; A5 checks all eleven. |
| F-04a-2 the nav flattens a two-group structure | **ACCEPTED** | Read. `half` on every screen, unrendered. `NAV_GROUPS` now partitions `NAV_ENTRIES`; `nav.test.ts` checks the partition is exact. |
| F-04a-3 `nav.ts` states a guarantee the tree does not hold | **ACCEPTED, and it was worse than stated** | Executed. The docblock claimed the invariant; the `TRACK_FAMILY` comment ninety lines below carved the exception out of it, arguing from two counts that were both wrong - "a seven-item screen index" when `SCREENS` has held nine since HANDOFF-03, and "six sub-views of one of those seven" when one of the six IS `/track`, so there were five. Closed by giving the two routes entries AND by `scripts/check-nav-routes.mjs`. |
| F-04a-4 the contrast complaint is right, its explanation is wrong | **ACCEPTED with two corrections** | Executed, and both corrections are L2's own premises. (a) **The tree did not floor at 10px, it floored at 8.5px** - 94 live sub-12px declarations across seven sizes, 24 of them at 9.5px, so the reader's "9px" was literal rather than rhetorical. (b) `--ink-faint` measures **3.11:1** on `--bg`, not the 3.05:1 `tokens.css` stated at four sites - L2's own brief has 3.11 and the tree was wrong. Swept at all four sites in one commit. |
| F-04a-5 the size floor is a ledger question | **ACCEPTED** | Set at 12px, recorded in `tokens.css` on HANDOFF-01's own precedent, and put to L2 as LEDGER-04a Q1. |
| F-04a-6 the disclosure pattern exists in the tree, twice | **ACCEPTED, and one of the two was not correct** | Executed. `EstimatePanel` was exactly as described. **`Cite.tsx` was not**: it carried no digit AND kept `confidence`, `lastVerified` and the source list all behind the toggle - the collapse rule's own forbidden case. Its summary now reads `<id> HIGH VERIFIED <date> CITE - 4 SOURCES`, count from `sources.length`. |
| F-04a-7 three defects L2 caught on the render | **ACCEPTED, and a fourth is still live in the approved study** | Executed. A1 is written against the shape. See §7.7. |

### 7.3 WHERE THIS BUILD DEPARTS FROM THE APPROVED STUDY, AND WHY

The composition was not reopened. These five are data-binding and token decisions the study
could not settle, and each is argued rather than asserted.

1. **A lane outside the measured relation says "not measured", never "closed - 0 crossings in
   window".** `SnapshotV1` carries ONE crossing count - `migrationHist`, the ZIP 318 migration
   lens, Orchard to Ironwood - and no shield, unshield or other boundary count at all. Four of
   five lanes are therefore outside every relation this document measures, and a zero under them
   would be a measurement the instrument never took. **The study renders the forbidden form: it
   prints `closed - 0 crossings in window` under `sprout`, whose own `EDGES` table contains no
   sprout edge, two lines below its own comment saying "A pair that cannot occur is absent, never
   drawn at zero."** The departure is in the study's favour on the study's own principle.
2. **The retention window is stated in BLOCKS and the board says when it is capped, rather than
   shortening the window.** The study's mechanism needs per-crossing times; `migrationHist`
   carries `lowHeight`, `highHeight` and a count, and nothing else. Reporting a shortened window
   would mean assuming the crossings are spread evenly across it - an inference about arrival
   times from data containing none - and reporting it in minutes would need a block time for
   `lowHeight` that no snapshot carries (the study prints "47 min" because its fixture invented
   one). The defect the rule exists to prevent is closed on the derivable quantity instead: the
   header prints **the measured count beside the drawn one** ("1,284 crossings measured over
   1,152 blocks - board drawing 42 of them"), so two boards holding 42 marks are told apart by
   the numbers rather than by the density. A9 is asserted in that form. **This is the one place
   where a §5 assertion as L2 worded it could not be implemented as worded**, and it goes to L2
   as LEDGER-04a Q2.
3. **The fog is kept, demoted from an opening to a bounded backdrop.** The study drops it. Two
   reasons, the weaker first: assertions A5 and A6 prove the reduced-motion contract by checking
   that `FogCanvas` REFUSED to construct on `/`, and a splash with no ambience proves that
   vacuously. The stronger: the fog's argument is cited in the tree and is true - what stays in
   the haze is what the proof hides. Behind a claim it supports an assertion; in front of one it
   WAS the assertion, which is what the reader objected to.
4. **The beat tag is `--ink-mute`, not the study's `--ink-faint`.** `tokens.css` reserves
   `--ink-faint` for non-text at 3.11:1. The beat tag is the label that makes the order visible,
   which is the whole fix; setting it in the one ink that fails AA would have shipped the
   reader's third complaint inside the answer to it.
5. **`N_MAX` is 42, the study's splash value, not the full-size 60.** The board is 1180x560 here
   against 1500x830 in the study, which is where the two numbers come from; the study made that
   call and this build takes it. It is a parameter rather than a literal so `/pools` can render
   the same component at the study's density without a second implementation. **A first version
   of the constant's comment justified 42 with a measurement of fan spacing that nobody took.**
   Removed and replaced with the truth, because a fabricated justification for a correct number
   is worse than none: the next reader trusts it.

### 7.4 THE TYPE SCALE

**Executed.** `tokens.css` gains seven named rungs and a `--t-floor`. 134 declarations in
`globals.css` moved onto them, of which **94 were below 12px**: 8.5px x1, 9px x2, 9.5px x24,
10px x27, 10.5px x15, 11px x22, 11.5px x3.

**The collapse is monotone, and the first version was not.** All seven sub-floor bands land on
the floor. The first map sent the 11px band to `--t-data` (13px), because 11px sites are mostly
mono data and the mockup sets mono data at 13 - which put them ABOVE the nine sites already at
12px, so a rule that had been smaller than another became larger. `tokens.css` claimed
monotonicity in the same commit that broke it. **Caught by writing the property over the whole
map rather than checking the rungs one at a time**: every rung was at or above the floor in both
versions, so a per-rung check would have been green on the defect.

**Measured at the floor** (computed in `test/unit/type-scale.test.ts`, not read off the palette):

| ink | on `--bg` | on `--surface` | on `--surface-2` | AA at 12px |
|---|---|---|---|---|
| `--ink` #ede6d8 | 15.19 | 14.26 | 13.21 | pass |
| `--ink-dim` #b3a996 | 8.11 | 7.61 | 7.06 | pass |
| `--ink-mute` #8f8576 | 5.20 | 4.88 | 4.52 | pass |
| `--gold` #f4b728 | 10.46 | 9.82 | 9.10 | pass |
| `--ink-faint` #6a6157 | 3.11 | 2.92 | 2.70 | non-text, and asserted to paint none |

**Two declarations are registered below the floor, with a measured reason**, in
`SVG_EXCLUSIONS`: `.plot .edge-label` and `.plot .nw-sub`, both 9.5 user units. The register is
iterated by the tests, each row must name a real selector carrying the value it claims, and a
separate count check makes the total number of sub-floor declarations equal the number of rows -
so a third one cannot be waved through on the exempted value. **The round trip is recorded
rather than tidied away**: they were raised to 12, which overflowed the diagram (a node sub-line
at 223 units against a 200-unit box; an edge label at 173 units into a 150-unit gap), the box
was widened to 244, that fixed the node labels and broke the edge labels by narrowing the gap to
106, and `PLOT.width` is shared by every chart so the coordinate space cannot grow for one of
them. Reverted, registered, and the follow-up named in §8.

### 7.5 THE NAV, AND F-04a-3 CLOSED

**Executed.** `SCREENS` is unchanged at nine, `00` through `08`, consecutive and closed. `VIEWS`
carries `/pools` and `/reveal` as UNNUMBERED instrument views; `NAV_ENTRIES` is the concatenation
and is what the bar renders and what `ROUTES` walks. A second list rather than two more `SCREENS`
members, because `idx: "--"` would have made "unique two-digit index" false and the honest repair
for that is a second list rather than a weaker assertion. `/pools` and `/reveal` left
`TRACK_FAMILY`, so they light themselves rather than lighting `/track` as well.

**The thirteenth guard.** `scripts/check-nav-routes.mjs`: every static route under
`apps/web/src/app` has a `NAV_ENTRIES` entry or a row in `EXCLUSIONS` with a reason. Three
detectors (unaccounted route; exclusion covering no route; exclusion for a route the bar carries
anyway). Its self-test iterates `EXCLUSIONS`, drives the real app tree, drives a `mkdtempSync`
fixture tree, and treats a vacuous scan as a finding. **Its own fail side found a defect in it**:
the first draft asserted "the real tree produces zero findings" INSIDE the self-test, so adding a
real unlisted route exited 2 ("the detectors are broken") rather than 1 - exit 1, the entire
finding path, was unreachable for every possible input. The count was swept from twelve to
thirteen at `CLAUDE.md` (three statements), `README.md`, `.github/workflows/ci.yml` and the
`R4-GUARDS` row of `check-finding-sites.mjs`.

### 7.6 THE PLANE

**Executed.** `lib/plane.ts` is pure and takes a `SnapshotV1`. **The input type is
load-bearing rather than tidy**: the fixture `PoolsView` carries a `flows: {from, to, zat}[]`
field that would draw a five-edge plane immediately, and that `SnapshotV1` has no field for at
all - so an honest picture would have become a dishonest one silently at the cutover. Taking the
snapshot type makes that unreachable rather than discouraged.

`apps/web` has **no snapshot read path**, and this branch does not add one - that is HANDOFF-11's
and is out of scope. `NEXT_PUBLIC_SNAPSHOT_URL` has two readers, neither of which fetches. What
this adds is the SHAPE: a fixture `SnapshotV1` built from `getStats()` - the same call the metric
row makes - with no pool figure typed into it, so a balance can be wrong but cannot be
inconsistent. The cutover replaces one function.

### 7.7 THE SCREENSHOT-DERIVED CHECK

L2 found all three of F-04a-7's defects by rendering the page and reading it. So did this
session, and **eight defects on this branch were found that way and none of them by reading the
code**:

1. **The plane drew nothing.** `POOL_SW` maps a pool to its `.sw` MODIFIER CLASS ("t", "sp",
   "o"), not to a custom property, so `var(${POOL_SW[lane]})` produced `var(o)` - syntactically
   valid, silently resolving to nothing. Every arc and every disc painted `none`. Typecheck,
   lint and the build were all green.
2. **Every plane label sat a hundred pixels low.** The label layer is `inset: 0`, and it was
   positioned against the whole `<figure>` - which also holds the header and the caption - rather
   than against the SVG's own box. The near row landed inside the caption text.
3. **Escape closed the state and not the picture.** `aria-expanded` went to `false` and
   `data-open` disappeared while the computed `grid-template-rows` stayed at `546.844px`, because
   Escape returns focus to the toggle and `:focus-within` on the bar re-opened it. **An
   attribute-only assertion would have been green on this**, which is why A7 asserts the computed
   rows; the e2e spec plants the pre-fix rule back and shows exactly that.
4. **The first fix moved the defect rather than closing it.** `data-closed` beat `:focus-within`,
   and then `onPointerLeave` cleared it - so with the pointer moved away the bar re-opened.
   Scoping `:focus-within` to the PANEL rather than the bar is what actually closed it: the
   toggle is the control, not the content.
5. **The touch path did not exist.** On a 390px viewport the full-width panel wrapped ABOVE the
   toggle inside the flex row and buried it under eleven rows of nav; Playwright could not tap
   the button because the panel intercepted every attempt. The panel is now a sibling of the row.
6. **Sticky hover opened the bar on a device with no hover.** `(hover: hover)` false and
   `.sysbar:hover` matching anyway - the panel was open on load and re-opened after every tap
   meant to close it. The pointer path is now gated on `@media (hover: hover) and (pointer:
   fine)`, which is the three-ways-in argument written where the browser can read it.
7. **SVG text rendered through its own boxes on `/network`** - §7.4.
8. **The regenerated visual baselines captured the nav OPEN.** Chromium's synthetic pointer
   starts at the origin, which is inside the system bar, so a `fullPage` capture renders five
   hundred pixels of nav no reader sees on load. Committing that would have coupled two CSS
   baselines to the nav's copy: changing a `dek` would have broken `/beware` and `/flows`. The
   spec now parks the pointer and asserts the collapsed state before the shot.

**AND ONE MORE WAS FOUND BY RUNNING THE SUITE RATHER THAN BY LOOKING AT THE PICTURE**, which
belongs here because it is the same lesson from the other side. `track.spec.ts` asserted that the
Track item lights `/track` on all seven routes of its family - true when none of them had an
entry of its own, and false the moment F-04a-3 gave `/pools` and `/reveal` theirs. The assertion
was pinning a contract this handoff deliberately changed. It is now a TABLE naming the expected
entry per route, which is **stricter** than what it replaced rather than looser: the old form
asserted one constant and could not have caught `/pools` lighting `/reveal`. No test was removed
and the count is unchanged.

**And one defect is still live in the approved study, reported rather than changed** (the brief
says nothing else about those files changes). `04a-turnstile-plane.html` renders a static tile
reading `PENDING 3 mempool` beside a legend that computes `unconfirmed 0` from the live board.
That is F-04a-7's own shape - two renderings of one quantity that do not share a source -
surviving in the file that documents the fix for it, and it is visible on the render at the
default rate. The splash study does not have it: its `tank-limit` reconciles the three
unconfirmed crossings in words, saying they are counted in the readings and not drawn.

### 7.8 ASSERTIONS

**Verification budget, first line, per LEDGER-05 Q5: every one of the thirteen was executed in
both polarities, and no finding was carried unread.** The fail side named for each is the one §5
registered; where it is a DATA mutation the member is named, and where a code mutation was used
instead that is said rather than glossed.

| # | pass side | fail side, and which member of the exclusion set |
|---|---|---|
| **A1** | `plane.test.ts` - the per-lane OUT sum equals the reading's `countedCrossings` at eight counts from 0 to 5,200, and `drawnMarks` equals `marks.length` at every one. `legibility.spec.ts` - the rendered header, both traffic lines, all five legend rows and the `.tmark` count parsed from the page and compared, nothing hardcoded. | DATA. A legend rebuilt from a STALE count (17) beside a board built from the document (1,284) - F-04a-7(b)'s own member - and the sum-against-reading comparison names the pair. On the page: one legend row's count bumped by one, and the same comparison reports `orchard: legend says ... and its label says ...`. |
| **A2** | `type-scale.test.ts` - twelve (ink, ground) pairs computed from the tokens, all >= 4.5:1; the five stated ratios reproduced to two decimals. | DATA. `#7c7366`, the mockup's own `--ink-mute`, computed at **4.04:1** and required to fail. Plus the reservation: `--ink-faint` must paint no text anywhere, asserted over the stylesheet. |
| **A3** | `type-scale.test.ts` - every `font-size` in `globals.css` resolved through the token layer, none under 12px but the two registered; the register iterated, each row driven against the real rule it names; the monotone property over the whole map. | DATA, three ways. `9.75px` spliced into the real stylesheet - a value the register does NOT name, so it cannot be waved through on the exempted one - and caught. A register row pointed at `.plot .no-such-thing`: caught. A third sub-floor declaration (`.eyebrow` at 9.5px) spliced into the real file: caught by the count check. All three restored and re-run green. |
| **A4** | `summary-findings.test.ts` over the source, and `legibility.spec.ts` over `/`, `/beware` and `/track`. | DATA. The rule's own counter-example, the bare word `Sources`, and a REAL summary from the tree with its count stripped - `{LIMITS.length} limits, stated` reduced to `limits, stated` in `app/page.tsx`, which the sweep names by file. Restored. |
| **A5** | `legibility.spec.ts` - eleven `.screendek` nodes, one per `NAV_ENTRIES` member, each carrying that member's exact text, and the first asserted VISIBLE rather than merely attached (the panel is a zero-height `overflow:hidden` box, so a text-only check would pass against a bar that never opens). | CODE, and stated as such. The dek nodes stripped from the DOM and the same query re-run, required to report every entry. |
| **A6** | `check-nav-routes.mjs` rc=0: 16 page files, 11 carried by `NAV_ENTRIES`, 5 excluded by name with a reason, 0 unaccounted for. | DATA, over the REAL tree. `apps/web/src/app/__probe/page.tsx` created, guard rc=1 naming `/__probe`, file deleted, rc=0 again. And each `EXCLUSIONS` row removed in turn, each time making its own route a finding. |
| **A7** | `legibility.spec.ts`, five sub-tests. Resting `0px` with the bar still reading `00 Splash`; pointer 585.969px; keyboard - a bounded eight-press walk showing focus reaching the toggle with the panel still at `0px` and then a panel link opening it, so `:focus-within` on the PANEL is doing the work; button open with `aria-expanded="true"`; Escape closed with the pointer deliberately left on the toggle, so it must beat `:hover` as well as `:focus-within`. Touch in a real touch context: `(hover: hover)` false, fresh load `0px`, tap 1073px, second tap `0px`. | DATA. The pre-fix rule planted back as a stylesheet after Escape: the same rows probe goes to `1fr` **while `aria-expanded` still reads `false` and `data-closed` is still present** - the measured defect, and the direct proof that an attribute-only assertion would have been green on it. Plus an emptied `here-label`, and the toggle buried under an interceptor so `tap()` throws, which is how the touch defect was found. |
| **A8** | `plane.test.ts`, seven tests. Four states rendered: crossings measured; a null `migrationHist` (no marks, no reading, a condition and no owner); a window whose count is zero (a MEASURED zero, `closed - 0 crossings in window`); and a lane outside the relation (`not measured`, asserted to contain no `0` at all). Plus a sweep over all states at once, and a lane the document omits drawn not at all rather than empty. | DATA, drawn from the SPECIFICATION rather than invented: `closed - 0 crossings in window` is what the approved study prints under `sprout` for a relation its own `EDGES` table does not contain. `trafficLine` must give that answer for `measured-zero` and must not give it for `not-measured`. |
| **A9** | `plane.test.ts`, five tests. Capped at 42 marks with `countedCrossings` still 1,284 and the two required to differ; the cap note naming both numbers; no cap claimed at count 9; the window inclusive of both ends, checked on a one-block window where an off-by-one would be invisible on 1,152. | DATA. Two chains, 1,284 and 42, drawing the SAME number of marks - so the reading is the only thing that tells them apart, and it is asserted to differ. **This is A9 on the derivable quantity rather than as §5 worded it; the substitution is argued in §7.3 and put to L2 as Q2.** |
| **A10** | `legibility.spec.ts` under `reducedMotion: reduce` - `document.getAnimations()` empty at rest and after all three opening paths, with the panel confirmed open at each; `window.__zr.rafCalls` 0 and `constructed` empty. | DATA and code, both. A planted `element.animate(...)` reported by the same probe. And, better, the preference flipped to `no-preference`, where the same immediate sample returns three `CSSTransition`s - so the zero is a fact about the stylesheet and not about the sampling moment. |
| **A11** | `plane.test.ts`, four tests. Every mark's key set is exactly the seven fields; opacity strictly decreasing in age with both ends pinned at 0 and 1; every mark between the two measured lanes; every non-position field constant across the board. | CODE, and the structural half is the stronger one: the mark type has nowhere to put an amount, so a per-mark amount is unreachable rather than merely absent. |
| **A12** | `plane.test.ts`, four tests. Byte-identical geometry from two builds of the same snapshot. | DATA. A snapshot differing only in `hash` must produce a DIFFERENT plane - the discriminating half, since a `buildPlane` ignoring its input entirely would satisfy the equality. Plus the clock moved to 2100 (the plane must not move) and the platform generator replaced with a thrower (the plane must not call it). |
| **A13** | Measured below. | A deleted test file would move the total and be visible as a fall rather than absorbed by an addition elsewhere. |

**A13 - THE SUITE, AND THE BASELINE WAS RE-MEASURED RATHER THAN TAKEN ON TRUST.** L2's figure was
taken on `e1a39f7` in another environment, so this session measured it again in a `git worktree`
at the fork point `452d586`, with the same real Postgres 16 and real local Redis. **It reproduces
exactly: 1276 total, 1273 passed, 3 skipped.**

| package | baseline (`452d586`) | this branch | delta |
|---|---|---|---|
| packages/content | 67 | 67 | - |
| packages/zebra-rpc | 50 | 50 | - |
| packages/zec-instruments | 98 | 98 | - |
| **apps/web** | **368** | **438** | **+70** |
| apps/gateway | 143 | 143 | - |
| apps/publisher | 99 + 2 skipped | 99 + 2 skipped | - |
| apps/indexer | 448 + 1 skipped | 448 + 1 skipped | - |
| **total** | **1276 (1273 passed, 3 skipped)** | **1346 (1343 passed, 3 skipped)** | **+70** |

**The +70, itemised**, all in `apps/web` and all additions - no test was deleted, renamed or
weakened, and the skip count is unchanged at 3:

| file | tests | what it is |
|---|---|---|
| `test/unit/plane.test.ts` | 28 | new. A1, A8, A9, A11, A12. |
| `test/unit/type-scale.test.ts` | 24 | new. A2, A3, and the SVG register. |
| `test/unit/summary-findings.test.ts` | 5 | new. A4 over the source. |
| `test/unit/nav.test.ts` | 18 -> 31 | +13. `VIEWS`, `NAV_ENTRIES`, `NAV_GROUPS`, and the two `isActive` cases F-04a-3 opened. |

`test/unit/css-dedup.test.ts` stays at 12: two literals moved to the rung tokens the scale now
names, and one CHROME entry followed the system bar's row from `.sysbar` to `.sysbar-in`. No
assertion was relaxed - the compact-cell register is still required to be exactly one rule, and
had the literal not been updated the check would have gone VACUOUS rather than failed, since no
rule declares 11px any more and `[]` never equals `[".cp"]`. That is how it announced itself.

**THE PLAYWRIGHT SUITE: 150 tests, of which 19 are this handoff's.** `test/e2e/legibility.spec.ts`
adds them - A5, A7, A10, and the rendered halves of A1 and A4 - each pass side paired with a fail
side that plants the defect and re-runs the SAME named function, so "no problems" cannot also be
what a probe matching nothing returns.

**Two runs of it are on the record and the difference between them is worth stating.** The first
reported four failures; **three were self-inflicted and one was real.** The three: `pnpm build`
was run while the suite was in flight, which rewrote `.next` under the server the suite was
using, so every test after that point was reading a half-written build. That is a measurement
error, it was recognised as one rather than investigated as a defect, and the suite was re-run
without touching the tree. **The real one was A6**, in §7.7 above. The clean re-run found one
further failure, `track.spec.ts`'s family assertion, which was pinning the contract F-04a-3
deliberately changed; it is now a stricter table.

**The other gates.** `pnpm check` rc=0, thirteen guards. `pnpm typecheck` 13 tasks, 13
successful. `pnpm lint` 0 problems. `pnpm --filter @zcashreveal/content validate` OK.
`pnpm build` rc=0, all routes prerendered.

### 7.9 POST-FAN-OUT SWEEPS

**Executed.** Three fan-outs: the eight-agent tree map, the two-agent guard-and-disclosure pair,
and the single-agent e2e spec. `git status --porcelain` was run after each and before the next
commit.

- After the map: clean, no writes (all eight agents were read-only and stayed read-only).
- After the guard/disclosure pair: **three stray files, and they were MINE, not the agents'** -
  `apps/web/crop.tmp.mjs`, `probe.tmp.mjs` and `shot2.tmp.mjs`, screenshot scripts written into
  `apps/web` because the shell's working directory had drifted there. The guard agent reported
  them against itself as files it had not written rather than deleting them, which is the rule
  working in the direction it was written for. Removed.
- After the e2e spec: clean. The agent removed its own throwaway config and `test-results/`.

## §8 LEDGER - appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

The block below is appended verbatim to `handoffs/LEDGER.md` under its own heading.

### Questions for L2

**Q1 - THE SIZE FLOOR IS SET AT 12px AND DIVERGES FURTHER FROM THE MOCKUP.** F-04a-5 asked for
this to be recorded rather than decided silently, on HANDOFF-01's own precedent. Recorded, with
one correction to the premise: the brief said `apps/web` "already floors at 10px, so the shipped
site is ALREADY a divergence and an improvement". **It floored at 8.5px** - the same floor as
the mockup - so the shipped site MATCHED the source of truth and both were wrong. 94 live
declarations sat below 12px, 24 of them at 9.5px, which makes the reader's "half the text is
basically 9px" a measurement rather than a figure of speech. The floor is 12px, `--ink-mute`
clears AA on every ground at that size with margin (5.20 / 4.88 / 4.52), and the divergence is
this question.

**Q2 - A9 COULD NOT BE IMPLEMENTED AS WORDED, AND THE SUBSTITUTE IS ARGUED RATHER THAN
ASSUMED.** §5 asks that a capped board "states the shortened window". `migrationHist` carries
`lowHeight`, `highHeight` and a count, and no per-crossing height or time at all - so a
shortened window is only reachable by assuming the crossings are spread evenly across the
window, which is an inference about arrival times from data containing none, and stating it in
minutes needs a block time for `lowHeight` no snapshot carries. The defect the rule exists to
prevent is that a capped board looks identical at 42 crossings and at 1,284; that is closed by
printing **the measured count beside the drawn one**, which is strictly more information than
the shortened window would have carried. **Does L2 accept the substitution, or is the intent
that the plane wait for HANDOFF-12's per-crossing source before drawing at all?**

**Q3 - SVG TEXT IS A DIFFERENT REGIME AND THE FLOOR DOES NOT REACH IT.** Measured on the loop
diagram: the viewBox is 1000 units wide and renders at 1384 CSS px on a 1440px viewport, 968 on
a 1024px one, and 720 on anything 760px or narrower. So a declared 12 paints at 16.6, 11.6 and
**8.64** CSS px, and **no declared value satisfies the floor at every width** - a floor the
viewport can walk under is not a floor. Two declarations are registered below it with that
measurement as the reason. The fix is HTML labels positioned over the SVG, which is what the
turnstile plane does and why; it is a real piece of work across four hand-positioned diagrams
and it is named here rather than started. **Which handoff owns it?**

### What this branch learned, and what it cost

**A PROPERTY OVER THE WHOLE MAP CATCHES WHAT A PER-ELEMENT CHECK CANNOT.** The type scale's
first map was not monotone: the 11px band went to 13px and landed above the nine sites already
at 12px, so a rule that had been smaller than another became larger. Every rung was at or above
the floor in both versions, so the obvious check - "is each rung >= the floor" - was green on
the defect. The property that caught it quantifies over PAIRS, and `tokens.css` claimed
monotonicity in the same commit that broke it. This is LEDGER-08 fold 3's shape arriving in CSS
rather than in an estimator: the assertion said sigma and the test checked each element.

**A COMMENT CANNOT FAIL, AND ONE HAD BEEN WRONG THROUGH TWO HANDOFFS AND A DESIGN REVIEW.**
`tokens.css` stated `--ink-faint` at 3.05:1. It is 3.11:1. The number was restated at four sites
and swept at all four in one commit. It was found because A2 COMPUTES the ratio from the token
and the ground rather than reading it off the palette - which is exactly what F-04a-4 asked for,
and the reason it asked is now demonstrated rather than argued. L2's own brief had 3.11; the
tree was wrong and the brief was right.

**AN ATTRIBUTE THAT REPORTS SUCCESS IS NOT THE PICTURE MOVING.** Escape set `aria-expanded` to
`false` and removed `data-open` while the computed `grid-template-rows` stayed at its open value,
because Escape must return focus to the toggle and `:focus-within` on the bar re-opened what
Escape had closed. Both state halves reported success and nothing happened on screen. **The
first fix moved the defect rather than closing it** - `data-closed` beat `:focus-within`, and
then `onPointerLeave` cleared `data-closed`, so the bar re-opened as soon as the pointer left.
What closed it was scoping `:focus-within` to the PANEL rather than the bar: the toggle is the
control, not the content. Three measurements, two of them of a fix.

**THE FIX COMMIT IS STILL THE MOST DANGEROUS COMMIT.** Raising `.plot .nw-sub` to the floor
overflowed a 200-unit box; widening the box to 244 fixed the node labels AND broke the edge
labels, by narrowing the between-column gap from 150 units to 106 while the label needed 173.
The round trip is recorded in the component and in the register rather than tidied into a
single clean-looking diff, because the reason the exception exists is the half a later reader
needs.

**AND THE READ-ONLY RULE HELD, IN THE DIRECTION IT WAS WRITTEN FOR.** The post-fan-out sweep
after the second fan-out found three stray files in the tree. They were the LEAD's - screenshot
scripts written into `apps/web` because the shell's working directory had drifted - and the
guard agent reported them against itself as files it had not written rather than deleting them.
Four occurrences of a worker writing outside its scope are on this project's record; this is the
first time the sweep caught the lead instead.

### The bound HANDOFF-12's per-crossing field inherits

Named here because the brief asked that the handoff which adds it inherit the reason rather than
rediscover it. **The per-crossing source is affordable only because it is capped.** The
publisher already spends `WIRE_COMMANDS_PER_TIP` = 5 per tip, about 172,500 a month against a
200,000 ceiling, on a managed store **shared with an unrelated production project**. A field
carrying the newest N crossings is a fixed-size array and costs nothing further per tip; an
unbounded one could not ship at any N. The plane is already written to consume exactly that
shape: `N_MAX` is a parameter, the marks are a list, and when the field arrives the picture gets
RICHER - thickness becomes amount, fade becomes age, pending arcs appear - and never DIFFERENT.
Same component, better input.

### What HANDOFF-11 receives as a design input

The surface list the brief asked for, so 11's three status affordances land somewhere rather
than on top of the problem this handoff was commissioned to fix.

| affordance | where it goes |
|---|---|
| staleness indicator | the system bar, beside the epoch clock: it is a property of the DOCUMENT, not of any panel, and the bar is the one surface every route carries. |
| `source:` chip | inside the disclosure that carries the derivation, next to the count in the `<summary>` - never floating beside a value, which is what made the PUBLISHED group unreadable. |
| `UNVERIFIED` chip | the chip row beside the claim, with `confidence` and `lastVerified`, and it NEVER collapses: epistemic status behind a toggle is the null-panel-renders-as-zero defect in a nicer coat. |

Two rules 11 inherits with them: **every `<summary>` carries a digit** (checked at the source by
`test/unit/summary-findings.test.ts` and on the page by `test/e2e/legibility.spec.ts`), and
**nothing rendered as HTML text goes below `--t-floor`** (checked by `test/unit/type-scale.test.ts`,
with the only two exceptions registered and reasoned).

### Carried forward, not done

- Reader complaint 4 is closed on the splash and open on the other seven Record pages (§7.1).
- SVG chart labels want HTML positioning; two declarations sit below the floor until they get it
  (Q3).
- `/pools` does not render the plane. Deliverable 5 says "on the splash" and that is where it
  is; the component takes `nMax` as a parameter so `/pools` can render it at the study's density
  without a second implementation.
- `/track` renders zero `<summary>` elements, so its leg of the rendered A4 sweep is vacuous and
  the spec says so with a pinned count rather than passing quietly. The source-level check is
  what actually covers `apps/web`.
