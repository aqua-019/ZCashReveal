---
handoff: 17
title: The living tank - the turnstile plane subscribes to the live transaction stream
status: in-progress
branch: the session-designated branch (name it `feat/v2-17-the-living-tank` if you may choose)
track: Web
depends_on: 15, 16
written_by: L2 (Cowork) - 4 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-17 - The living tank: the turnstile plane subscribes to the live transaction stream

**THE OPERATOR HAS ASKED FOR THIS TWICE AND IT WAS NOT SCOPED EITHER TIME.** The instruction was
that the turnstile plane - the "fish tank" - must ALWAYS be broadcasting live transactions
visually. Rungs 1 through 3 (HANDOFF-14, 15, 16) made the NUMBERS live. **Not one of them makes
the TANK move.** The operator checked the deployed site and found a static plane, which is
exactly what the code does.

**WHAT IS ON THE PAGE TODAY.** `TurnstilePlane.tsx` calls `buildPlane(snapshot, { nMax })` and
nothing else. `buildPlane` reads `snapshot.migrationHist`. On the deployed site that value is
`MIGRATION_HIST`, a literal at `apps/web/src/lib/api/fixtures/snapshot.ts:51`. **The marks are a
hard-coded constant in the bundle.** They cannot move because nothing writes them. The plane has
no subscription of any kind.

**AND THIS HANDOFF IS NOW THE ONLY THING THAT PUTS MOTION ON THE PLANE WITHOUT A DATABASE.**
HANDOFF-16 proved by execution that crossings cannot reach the plane without Postgres:
`chain-inputs.ts:465` returns `{ crossings: [], window: null }` when `queryMigrations` is null,
because the publisher is a separate process that builds `migrationHist` from its own query. So on
the RPC-only cutover the operator is about to run, rung 3's confirmed crossings draw **nothing**.
The live mempool marks this handoff adds are the only marks that will appear.

---

## §1 SCOPE

Make the turnstile plane subscribe to the live transaction stream, so a mark **enters the tank
when a transaction arrives and stays until it leaves the mempool**.

### The seam that already exists

| what | where | state |
|---|---|---|
| the live socket client | `apps/web/src/lib/api/stream.ts` - `subscribeFrames(onFrame, options)` | built, shipping, returns an unsubscribe |
| the browser frame union | **`packages/zec-types/src/views.ts:1048` - `zecFrameSchema`** | `hello` / `snapshot` / `tx_added` / `tx_removed` / `tip` |
| a working precedent | `apps/web/src/components/track/MempoolPanel.tsx` - `useEffect` + `subscribeFrames`, switching on `tx_added` and `tx_removed` into `useState` | a live-subscribing component that already ships |
| the shared-subscription precedent | `apps/web/src/lib/api/tip-bus.ts` - ref-counted, one socket, DOM event | built, and it exists for the reason §3 states |
| the mark geometry | `apps/web/src/lib/plane.ts` - `PlaneMark`, `project`, `SPLASH_CAMERA`, `PLACEMENT` | built; marks carry `age`, `opacity`, `depth`, `arrow` |
| the renderer | `apps/web/src/components/record/TurnstilePlane.tsx` | built; **a SERVER component** - see the corrections below |

### FIVE CORRECTIONS TO THE BRIEF THIS SECTION WAS WRITTEN FROM, ALL BY READING THE MODULE (F-56-1)

The prompt's §1 table was written by L2. Five of its rows are wrong, and every one of them changes
a deliverable rather than a footnote. This is the third consecutive handoff in which §1's own
measurements needed correcting, and the brief said to check them.

**C1. `TurnstilePlane` IS A SERVER COMPONENT, AND ITS DOCBLOCK FORBIDS WHAT DELIVERABLE 1 ASKS
FOR.** The file has no `"use client"` directive; `apps/web/src/app/page.tsx:212` renders it from a
server page. Its own header says *"NOTHING ANIMATES ... There is no rAF loop, no interval and no
Web Animations object anywhere in this subtree, which is what makes the reduced-motion contract
architectural rather than a cancellation."* So "give `TurnstilePlane` the same `useEffect`
`MempoolPanel` already has" cannot be done as written: it would convert the whole figure - header,
legend, caption, alt text, five nodes - into client JavaScript and delete the property that
docblock is claiming. **The live marks go in a client ISLAND layered over the server-rendered
board**, which is also what makes A7 satisfiable by construction rather than by care.

**C2. THE FRAME UNION IS IN `views.ts`, NOT `realtime.ts`, AND THE TWO ARE DIFFERENT SEAMS.** The
brief cited `packages/zec-types/src/realtime.ts:36-44`. Those lines are `MempoolChannelPayload` and
`TipChannelPayload` - the **indexer-to-gateway** seam, whose `tx_added` carries
`report: LeakReport`. The **browser** never sees a `LeakReport`. It sees `ZecFrame`
(`views.ts:1048`), whose `tx_added` carries `entry: MempoolRow`. Deliverable 2's "derived from the
report's own lanes" therefore reads `entry.lanes`. This is LEDGER-09b's exhaustive-claim shape
again: a citation aimed at a source that CONSTRUCTS the object rather than at the object.

**C3. `lanes` IS AN UNORDERED SET AND CARRIES NO DIRECTION, AND EMPTY IS LEGAL.**
`mempoolRowSchema.lanes` is `z.array(ledgerSchema)` and its own docblock says *"EMPTY IS LEGAL
SINCE HANDOFF-07 AND MEANS 'NO LANE CAN BE CLAIMED'"*. So a transaction touching
`{transparent, orchard}` may be a shield or a deshield and the array cannot tell you which - the
direction is in `class` (`shield` | `deshield` | `shielded` | `mixed` | `migration` | `transparent`
| `undecoded`). A mark drawn from `lanes` alone would pick a direction at random and render it as a
measurement. **Direction comes from `class`; a row whose direction is not derivable draws NO
mark**, which is the absence-versus-zero rule applied to geometry.

**C4. `tx_removed` HAS THREE REASONS AND ONLY ONE IS `confirmed`.**
`zecFrameSchema`'s `tx_removed` carries `reason: "confirmed" | "evicted" | "replaced"`. The brief
says "It confirms (`tx_removed`) -> that line leaves." Evicted and replaced are not confirmations,
and a tank that treats all three alike tells a reader a dropped transaction settled. That is
HANDOFF-06's `UNKNOWN_NONSTANDARD` conflation - an unmeasured thing given a measured thing's
verdict - in a new surface. **The mark leaves on all three; what the page SAYS about why differs.**

**C5. `subscribeFrames` OPENS A SOCKET PER CALL, AND `tip-bus.ts` EXISTS BECAUSE OF IT.** That
module's own header: *"`subscribeFrames` opens a socket per call. Three sockets to one gateway is
three times the connection cap `apps/gateway` enforces per reader, for one event that every
consumer wants identically."* `tip-bus` is already mounted in the shell on every route, `/`
included. A fourth bare `subscribeFrames` on the splash page is the exact cost that module was
written to avoid. **The plane reads a bus, not its own socket.**

### The motion, precisely

A transaction arrives -> a line **enters the tank and stays**, joining the shoal. It leaves the
mempool (`tx_removed`) -> that line leaves. **The tank's fullness is the real mempool's depth.**
Density grows with traffic and thins when the chain is quiet, because that is the truth about the
network rather than a decoration.

**THE RATE IS ABOUT THREE TRANSACTIONS A MINUTE ON THE KEYLESS ENDPOINT.** L2 measured the ceiling
live on 4 Sep: five requests, then 429, confirmed by the provider's own message; after the two
calls each tick spends on the tip and the txid list, that affords roughly 3 tx/min. **UNVERIFIED
IN THIS SESSION - not re-probed here, and the container cannot reach the endpoint (HANDOFF-14 and
15 both recorded 403 at CONNECT).** The figure is not hard-coded against it either way: the page
reads `ceilingPerMinute` and `txPerMinute` off `MempoolDrainState`, which rung 2 already publishes,
so the same code fills the tank the moment a faster endpoint is configured, with no edit.

**Out of scope:** the cutover itself; a new provider account; changing the mempool loop's rate
(rung 2 owns it); the confirmed-block plane marks from `migrationHist` (rung 3 owns them, and §3
says how the two coexist).

## §2 READING - ALL OF IT BEFORE ANY PROBE (F-56-1)

`apps/web/src/components/track/MempoolPanel.tsx` **entire** - it is the precedent and the socket
lifecycle is already right in it - then `apps/web/src/lib/api/stream.ts` (`subscribeFrames`,
`asFrame`, the fixture path), `packages/zec-types/src/views.ts`'s `zecFrameSchema` and
`mempoolRowSchema` **and** `packages/zec-types/src/realtime.ts` (they are different seams, per C2),
`apps/web/src/lib/plane.ts` **entire**, `apps/web/src/components/record/TurnstilePlane.tsx`
**entire**, and `apps/web/src/lib/api/tip-bus.ts`. Say in §7 which were read line by line.

## §3 CONTRACT

- **A SPARSE TANK IS THE TRUTH AND MUST NEVER BE PADDED.** At 3 tx/min the tank is nearly empty and
  that is a correct rendering of a metered endpoint. **No synthetic marks, no decorative motion, no
  ambient drift a reader could mistake for a transaction.** This project's entire subject is a site
  that says what it knows; a fabricated fish is the one defect that would make the whole page a
  lie. The existing ambience seeded by the tip hash stays as it is and stays visually distinct.
- **THE PAGE STATES ITS OWN RATE.** A reader seeing four fish must be able to learn, on the page,
  what the endpoint affords. This is the absence-versus-zero rule (`chain-inputs.ts:42`) applied to
  motion: **an empty tank means "few transactions reached us", never "no transactions exist"**.
- **A DISCONNECTED SOCKET IS A NAMED STATE.** `MempoolPanel` tracks `SocketState`; the plane does
  the same. A frozen tank with no indicator is this project's recurring shape - a stale surface
  that renders and reports no fault - in its most visible possible form.
- **THE TWO MARK SOURCES DO NOT FIGHT.** `migrationHist` marks (rung 3, confirmed ZIP 318
  crossings) and live mempool marks (this handoff, unconfirmed) are DIFFERENT CLAIMS and must be
  visually distinguishable and separable in the DOM. A reader must never think an unconfirmed
  transaction is a settled crossing.
- **DIRECTION IS DERIVED FROM `class`, NEVER GUESSED FROM `lanes` (C3).** A row whose direction is
  not derivable draws no mark and is counted as undrawn, not silently dropped.
- **`SPLASH_N_MAX = 42` IS A CEILING, NOT A TARGET** (`plane.ts`). If the live set exceeds it the
  tank caps and the reading says `capped`. Never draw 42 fish because 42 looks good.
- **REDUCED MOTION IS HONOURED.** At `prefers-reduced-motion: reduce` the marks appear and persist
  without travel animation - the same information, no swimming. The server-rendered board keeps its
  architectural no-animation property (C1); only the island moves.
- **THE PLANE READS A BUS, NOT ITS OWN SOCKET (C5).**
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **A frame bus, on `tip-bus.ts`'s own pattern**, so one ref-counted `subscribeFrames` serves the
   tip consumers and the plane. Safe to mount twice (React strict mode double-invokes).
2. **`tx_added` puts a mark in the tank and it STAYS.** Direction from `class`, lanes from
   `entry.lanes` (C2, C3). Keyed by txid, so a duplicate `tx_added` cannot double-draw.
3. **`tx_removed` takes that mark out**, keyed by txid so a removal cannot evict the wrong mark,
   and the three reasons are distinguished rather than conflated (C4).
4. **Entry animation, and reduced-motion honoured.** A mark arrives by swimming in along its
   crossing path - the geometry `project` already gives you - then holds. Under
   `prefers-reduced-motion` it simply appears.
5. **The rate and socket state are on the page.** Connected or not, what the endpoint affords per
   minute, and how many marks are unconfirmed versus confirmed. Reuse rung 2's `ceilingPerMinute`
   and `txPerMinute` from `MempoolDrainState`.
6. **`docs/2.0/RUNTIME.md` gains "the living plane"** - what feeds it, what a reader sees at 3/min
   versus at a provider rate, and the sentence that a sparse tank is a metered feed, not a fault.

## §5 ASSERTIONS - each needs both polarities, and each names its EXCLUSION SET

- **A1.** A `tx_added` frame adds exactly one mark and it is still present on the next render.
  *Exclusion set: a txid already in the live set.* **Fail side by DATA:** re-deliver the same frame
  and assert the count does not move.
- **A2.** A `tx_removed` frame removes the mark with that txid and no other. *Exclusion set: a txid
  never added.* **Fail side by DATA:** `tx_removed` for an unknown txid leaves the set unchanged
  and does not throw.
- **A3.** The live mark count equals the number of held unconfirmed transactions, up to
  `SPLASH_N_MAX`, and the reading says `capped` beyond it. *Exclusion set: a held count above 42
  rendering more than 42 marks, or capping silently.* **Fail side by DATA:** drive 50 additions,
  assert 42 marks AND `capped: true`.
- **A4.** **NOTHING DRAWS A LIVE MARK EXCEPT A FRAME.** *Exclusion set: every source that is not an
  arrived frame - a timer, a seed, an ambience value, a fixture constant.* **Fail side by DATA:**
  mount, deliver ZERO frames, advance timers, assert the live mark count is exactly 0. **Write this
  one first and try hardest to break it.**
- **A5.** At `prefers-reduced-motion: reduce` the marks are present with no travel animation. *Both
  polarities in one test: the same frames with the query false animate, with it true do not.*
- **A6.** A socket that never connects renders a NAMED disconnected state, not an empty tank that
  looks calm. *Exclusion set: a connected-but-quiet tank carrying fault text.* **Fail side:** a
  connected socket with zero transactions renders the empty tank WITHOUT the fault text - the two
  empties must read differently.
- **A7.** Live mempool marks are separable in the DOM from `migrationHist` crossing marks, **and
  the tank is correct with ZERO of the latter** - the RPC-only shape HANDOFF-16 measured, and the
  one the first cutover ships. *Exclusion set: a DOM in which a live mark and a confirmed crossing
  carry the same identifying attribute.* **Fail side by DATA:** a snapshot carrying counted
  crossings AND a live frame; assert the two are separable.
- **A8.** A row whose direction is not derivable from `class` draws NO mark (C3). *Exclusion set:
  `class: "undecoded"`, and a row with an empty `lanes` array.* **Fail side by DATA:** deliver an
  undecoded row, assert zero marks added and the held count reports it as undrawn rather than
  vanishing.
- **A9.** `pnpm -r test` green with a **real** exit code, captured directly and never through a
  pipe (**F-53-1**), **with `build` run BEFORE `typecheck`** (LEDGER-15), and the passed AND
  skipped counts both stated with every skip named.
- **A10.** `pnpm --filter @zcashreveal/web test:e2e` RUN AND REPORTED. On the gate list as of
  HANDOFF-16 deliverable 1b. This handoff changes what a page draws over time, which is what that
  suite is for.

## §6 DISPATCH HINTS

Small and mostly wiring, but C1 and C5 mean the wiring has an architecture: a bus, a client island,
and a server board that keeps its no-animation property. One worker on the bus and the keyed mark
set, one on the entry animation and reduced motion, one on the rate and socket affordance.

**The adversarial question throughout, and it is the only one that matters here: *can anything put
a fish in this tank that is not a real transaction?*** Every decorative flourish is a candidate
defect. A4 is the assertion to write first and the one to try hardest to break.

## §7 REPORT

To be filled by the executing session before the PR opens.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`.
