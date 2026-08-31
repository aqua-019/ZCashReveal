---
handoff: 04a
title: The legibility pass, and the turnstile plane
status: in-progress
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

## §5 ASSERTIONS — binary and machine-checkable

Amended format (LEDGER-09a Q2): every assertion states its **EXCLUSION SET**, and §7's
fail-side transcript names **which member** it used. At least one fail side per assertion is a
DATA mutation — a value drawn from the set the predicate claims to exclude.

- **A1 — ONE SOURCE PER QUANTITY.** Every number rendered twice on one screen comes from one
  computation: the plane's crossing count, the legend's per-pool counts, the node traffic
  lines and the readings below are one derivation with four renderings.
  *Exclusion set: any pair of renderings of one quantity that can disagree for some input.*
  *Fail side (data): feed the legend from the fixture while the arcs read the live board, and
  watch the assertion name the pair.*
- **A2 — CONTRAST AT SIZE.** Every rendered text style meets WCAG AA at its own size,
  COMPUTED from the token and the background in a test rather than read off the palette.
  *Exclusion set: any (token, background, size, weight) tuple below its AA threshold.*
- **A3 — THE FLOOR HOLDS.** No rendered body text below the floor deliverable 2 sets, checked
  over the BUILT CSS rather than the source.
  *Exclusion set: any font-size declaration under the floor reachable by rendered text.*
- **A4 — EVERY `<summary>` CARRIES ITS FINDING.** Every `<summary>` in `apps/web` contains at
  least one digit or count. *Exclusion set: a `<summary>` whose text has no digit.*
- **A5 — EVERY SCREEN RENDERS ITS `dek`.** Every screen in `SCREENS` renders its `dek` in the
  nav. *Exclusion set: a `SCREENS` member whose `dek` reaches no rendered node.*
- **A6 — F-04a-3 CLOSED.** Closed in whichever direction was chosen, with the guard if the
  invariant stayed. *Exclusion set: a user-facing static route with no nav entry while the
  docblock claims none can exist.*
- **A7 — THREE WAYS IN, AND OUT.** The nav opens by pointer, by `:focus-within`, and by the
  button, and closes on Escape; the collapsed bar names the current screen. **Touch is
  asserted, not assumed.** *Exclusion set: any of the three entry paths that does not open it,
  or an Escape that does not close it.*
- **A8 — FOUR HONEST STATES.** The plane renders four states against fixture snapshots:
  crossings measured; a null `migrationHist`; a chain quiet for the whole ceiling; and a pool
  with zero crossings — and **no state renders an unmeasured quantity as a zero.**
  *Exclusion set: any state in which an absent measurement reaches the DOM as `0`.*
- **A9 — THE ADAPTIVE WINDOW.** At a rate where the count exceeds `N_MAX` the board shows
  exactly `N_MAX` marks AND the header states the shortened window.
  *Exclusion set: (marks capped, window not shortened) — the pair the rule exists to prevent.*
  *Fail side: cap the marks without shortening the stated window, and watch A9 fire.*
- **A10 — REDUCED MOTION BY ARCHITECTURE.** The nav disclosure and the plane's block-arrival
  step are NOT CONSTRUCTED rather than cancelled. *Exclusion set: an animation object,
  transition or timer created and then disabled under `prefers-reduced-motion: reduce`.*
- **A11 — UNIFORM WEIGHT.** Every mark the plane draws carries the same weight, and no
  per-crossing amount, ordering or confirmation state reaches the renderer.
  *Exclusion set: any per-mark visual property varying with a quantity the snapshot does not
  carry.*
- **A12 — DETERMINISM.** Two renders of the same snapshot produce byte-identical plane
  geometry, and the plane's only entropy source is the tip hash through FNV-1a → mulberry32.
  *Exclusion set: `Math.random`, `Date.now`, or any input outside the snapshot.*
- **A13 — THE SUITE IS UNCHANGED IN COUNT.** `pnpm -r test` unchanged in COUNT as well as
  colour against the baseline **1276 total, 1273 passed, 3 skipped** — measured by L2 on a
  clean worktree of `e1a39f7` with a real Postgres 16 and a real local Redis — plus this
  handoff's own additions, itemised. Guards, typecheck, lint, `content validate` and
  `pnpm build` green.

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

## §7 REPORT — written by L3 before the PR opens

*(filled at write-back)*

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*(filled at write-back)*
