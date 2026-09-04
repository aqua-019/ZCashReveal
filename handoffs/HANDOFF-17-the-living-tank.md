---
handoff: 17
title: The living tank - the turnstile plane subscribes to the live transaction stream
status: shipped
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

## §5 ASSERTIONS - the amended format: every assertion states its EXCLUSION SET

Every assertion below names the values its predicate is written to reject, and every fail side
names WHICH MEMBER of that set it used, so a reader sees at a glance whether the fail side came
from inside the set or from outside it (LEDGER-09a Q2). `check-ledger-structure.mjs` checks the
clause is PRESENT; it cannot check that it is correct, and that limit is in the guard's own header.

- **A1.** A `tx_added` frame adds exactly one live mark, and it is still present on the next render.
  *Exclusion set:* any txid already held - a re-delivered frame, a duplicate on reconnect, or the
  same transaction arriving in a `snapshot` and again as `tx_added`.
  *Fail side names:* the re-delivered frame. The same `tx_added` is applied twice and the live count
  is asserted not to move; a double-draw on a re-delivery is the defect a keyed set exists to
  prevent, and it is a DATA mutation because the frame is the datum.

- **A2.** A `tx_removed` frame removes the mark with that txid and no other.
  *Exclusion set:* any txid not held - one never added, one already removed, and a well-formed txid
  that belongs to a different transaction in the same tank.
  *Fail side names:* the txid never added. The removal is applied against a populated tank and the
  set is asserted unchanged and no throw; the third member (a well-formed txid of a DIFFERENT held
  transaction) is driven too, because "removes no other" is the half a single-mark tank cannot see.

- **A3.** The live mark count equals the number of held unconfirmed transactions up to
  `SPLASH_N_MAX`, and beyond it the reading says `capped` with the true count beside the drawn one.
  *Exclusion set:* any held count above 42 that renders more than 42 marks, and any held count above
  42 that renders exactly 42 while reporting `capped: false` - a silent cap is the same defect as an
  uncapped board, because the reader cannot tell a full tank from a busy one.
  *Fail side names:* 50 additions. The member is the held count 50, drawn from inside the set;
  asserted 42 marks AND `capped: true` AND the true 50 reaching the reading.

- **A4.** **NOTHING DRAWS A LIVE MARK EXCEPT AN ARRIVED FRAME.**
  *Exclusion set:* every source of a mark that is not a frame - a timer firing, the tip-hash seed,
  an ambience value, a `migrationHist` constant counted as live, and a re-render.
  *Fail side names:* the timer. The plane is mounted, ZERO frames are delivered, fake timers are
  advanced past every interval the subtree could hold, the component is re-rendered, and the live
  mark count is asserted to be exactly 0. **Written first and attacked hardest** - it is the
  assertion the whole contract rests on.

- **A5.** At `prefers-reduced-motion: reduce` the marks are present with no travel animation.
  *Exclusion set:* any rendering that animates travel while the query matches, and any rendering
  that drops a mark because the query matches - reduced motion removes the swimming, never the
  information.
  *Fail side names:* the query set to `true` with the same frames that animate at `false`. Both
  polarities in one test, and the second member is checked by asserting the mark COUNT is identical
  across the two - the same information, no motion.

- **A6.** A socket that never connects renders a NAMED disconnected state, not an empty tank that
  looks calm.
  *Exclusion set:* an empty tank that carries no fault text while the socket is closed, and its
  converse - a CONNECTED tank with zero transactions that carries fault text.
  *Fail side names:* the connected-and-quiet tank. It is the second member, and it is the one that
  discriminates: a test that only drives the closed socket passes against a component that shows the
  fault text unconditionally. The two empties must read differently and both are asserted.

- **A7.** Live mempool marks are separable in the DOM from `migrationHist` crossing marks, **and the
  tank is correct with ZERO of the latter** - the RPC-only shape HANDOFF-16 measured, and the one
  the first cutover ships.
  *Exclusion set:* any DOM in which a live mark and a confirmed crossing carry the same identifying
  attribute, and any rendering that requires a non-empty `migrationHist` to draw live marks at all.
  *Fail side names:* a snapshot carrying counted crossings delivered together with a live frame. The
  member is that combined state; the two are asserted separable by attribute, and the zero-crossing
  case is driven as its own polarity because it is the shipping configuration.

- **A8.** A row whose crossing direction is not derivable draws NO mark, and is reported as undrawn
  rather than vanishing (C3).
  *Exclusion set:* `class: "undecoded"`, a row with an empty `lanes` array, and a row whose lanes
  name a single lane - value moving inside one pool crosses nothing, which the plane's own caption
  already says.
  *Fail side names:* the `undecoded` row. It is delivered as a well-formed `tx_added` frame that
  `asFrame` accepts, and zero marks are asserted added while the held count still accounts for it -
  a dropped row does not look like a bug, it looks like a quiet mempool.

- **A9.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe
  (**F-53-1**), with `pnpm build` run BEFORE `pnpm typecheck` (LEDGER-15), and the passed AND
  skipped counts both stated with every skip named.
  *Exclusion set:* any exit code read through a pipe, a `tee` or a `| tail`, where the value belongs
  to the last process in the pipeline rather than to the suite; and any report stating a passed count
  without its skipped count.
  *Fail side names:* the piped read. This session already hit that member once in this handoff - a
  guard run through `| tail` reported `RC=0` for a run whose real exit code was 1 - and the
  transcript in section 7 shows both readings of the same command.

- **A10.** `pnpm --filter @zcashreveal/web test:e2e` RUN AND REPORTED. On the gate list as of
  HANDOFF-16 deliverable 1b; this handoff changes what a page draws over time, which is what that
  suite is for.
  *Exclusion set:* a gate row left silent, and a row reported as passing on the strength of a
  previous session's run rather than this tree's.
  *Fail side names:* the silent row. If the suite cannot be run here, section 7 states the reason
  rather than omitting the row - CLAUDE.md's own instruction for a gate a session cannot run.

## §6 DISPATCH HINTS

Small and mostly wiring, but C1 and C5 mean the wiring has an architecture: a bus, a client island,
and a server board that keeps its no-animation property. One worker on the bus and the keyed mark
set, one on the entry animation and reduced motion, one on the rate and socket affordance.

**The adversarial question throughout, and it is the only one that matters here: *can anything put
a fish in this tank that is not a real transaction?*** Every decorative flourish is a candidate
defect. A4 is the assertion to write first and the one to try hardest to break.

## §7 REPORT

```
STATUS: DONE

Every deliverable is in the tree and every assertion carries both polarities.
Nothing here is a partial build. The corrections are three - five rows of this
handoff's own section 1, six defects gate round 1 found, and one instrument
failure of mine that produced a false 37-failure e2e reading - and all three are
reported below rather than glossed.

FORKED FROM e10cbae08decfe1b9fdd44a692cae3f1f8a6f8b3, the head of `main`.
`git merge-base --is-ancestor 2b63e1a origin/main` exits 0 - EXECUTED BEFORE ANY
FILE WAS TOUCHED - so PR #58 landed whole and not merely its earlier commits.
HEAD was already `origin/main` exactly, and `git status --porcelain` was empty.

SPAWN MODE: subagent fan-out available, PROVEN BY A TOOL ATTEMPT before any
work - a `general-purpose` agent returned `SPAWN-OK` and the correct HEAD SHA in
one tool use, writing nothing. Directors name every worker; subagents do not
nest.
```

### §2 READING - what was read LINE BY LINE, before any probe (F-56-1)

All six, in full, before the first line of code was written:
`MempoolPanel.tsx` (the precedent), `stream.ts` (`subscribeFrames`, `asFrame`,
`asRow`, `asDrain`, the fixture path), `realtime.ts` (entire),
`plane.ts` (entire, in three reads), `TurnstilePlane.tsx` (entire) and
`tip-bus.ts` (entire). Two more the brief did not list but its own claims
required: `views.ts`'s `zecFrameSchema` and `mempoolRowSchema`, and
`fixtures/snapshot.ts`.

### FIVE CORRECTIONS TO THIS HANDOFF'S OWN §1, ALL BY EXECUTION OR BY READING THE MODULE

Section 1 asked to be checked. It was, and five of its rows were wrong. Every
one changed a deliverable rather than a footnote. This is the THIRD CONSECUTIVE
HANDOFF whose section 1 needed correcting this way.

| # | the brief said | the module says | what it changed |
|---|---|---|---|
| C1 | "give `TurnstilePlane` the same `useEffect` `MempoolPanel` has" | it is a SERVER component - no `"use client"`, rendered from `page.tsx:212` - whose own docblock claims "no rAF loop, no interval and no Web Animations object anywhere in this subtree, which is what makes the reduced-motion contract architectural" | the live marks became a client ISLAND over the server board. Deliverable 1 is a different shape, and A7 became true by construction rather than by care |
| C2 | the frames are `realtime.ts:36-44` | those lines are `MempoolChannelPayload`/`TipChannelPayload`, the INDEXER-TO-GATEWAY seam whose `tx_added` carries `report: LeakReport`. The browser's union is `zecFrameSchema` at `views.ts:1048`, whose `tx_added` carries `entry: MempoolRow` | deliverable 2's "the report's own lanes" is `entry.lanes`. LEDGER-09b's shape: a citation aimed at a source that CONSTRUCTS the object |
| C3 | "a transparent-to-orchard transaction draws that crossing" | `mempoolRowSchema.lanes` is `z.array(ledgerSchema)` - an unordered SET, empty legal, NO DIRECTION. `{transparent, orchard}` may be a shield or a deshield | direction is derived from `class`; a row whose direction is not derivable draws no mark. That became assertion A8, which did not exist in the brief |
| C4 | "It confirms (`tx_removed`) -> that line leaves" | `tx_removed` carries `reason: "confirmed" \| "evicted" \| "replaced"`. Two of three are not confirmations | all three remove the mark, and the reason is kept and printed. Reporting an eviction as a confirmation is HANDOFF-06's `UNKNOWN_NONSTANDARD` conflation on a new surface |
| C5 | "the seam already exists, this is wiring" | `subscribeFrames` opens a socket PER CALL, and `tip-bus.ts` exists because of it: "three sockets to one gateway is three times the connection cap `apps/gateway` enforces per reader" | a fourth bare subscription on the splash was the exact cost that module was written against, so the ref-count moved into `frame-bus.ts` and `onTip` became a filter over it |

### MEASUREMENTS THIS SESSION TOOK RATHER THAN ASSERTED

| what | measured |
|---|---|
| the splash bundle, before and after | `/` route JS **1.9 kB -> 4.88 kB**; first load **107 kB -> 117 kB**. Built at `cf88cf9^` in a throwaway worktree and at HEAD, both from a clean install. The splash now costs what `/track` costs (117 kB), which is the honest price of a live socket on it |
| the longest live arc the board can draw | **823.0 user units**, min 242.7, over 800 marks across all twenty lane pairs at forty seeds each. This settled a claim a CSS comment was making and is why the dash is now `pathLength={1}` instead of a literal 1000 |
| the rate sentence over its schema's domain | `txPerMinute = 1` printed "1 transactions a minute" and `ceilingPerMinute = 1` printed "1 requests". Both values legal (`nonnegative()` and `positive()`); invisible at the measured rate of 3 |
| the healthy/degraded test split | **1728 passed / 5 skipped** with Postgres 16 and Redis up, against **1622 / 111** with neither. 1676 + 52 new = 1728 exactly |

**THE RATE FIGURE ITSELF IS UNVERIFIED IN THIS SESSION.** L2's 3 tx/min on the
keyless endpoint was measured on 4 Sep and NOT re-probed here; this container
cannot reach the endpoint (HANDOFF-14 and 15 both recorded 403 at CONNECT). It
is not hard-coded anywhere: the page reads `ceilingPerMinute` and `txPerMinute`
off `MempoolDrainState`, so a faster endpoint fills the tank with no edit.

### FOUR PROBES OF MINE WERE WRONG BEFORE THE CODE WAS

Reported rather than quietly repaired, each recorded in the test it belongs to.

1. **The re-delivery test held exactly `SPLASH_N_MAX`.** At the boundary nothing
   is evicted, so a mutation forcing `seq: existing?.seq ?? state.seq` to
   `seq: state.seq` still drew the same 42 txids and the sorted comparison could
   not see it. A fail side that does not fail. LEDGER-08's A9 shape exactly: an
   assertion over an AGGREGATE, driven at the one size where the aggregate
   cannot move. Now 50 held / 42 drawn, and the mutation goes red.
2. **"Three subscribers, one transport" was blind to transports.** It compared
   the frames three sinks received and read agreement as one socket. Under fake
   timers three independent `FixtureStream`s advance in lockstep and replay the
   same corpus, so the socket-per-subscriber mutation - the very cost the bus
   exists to prevent - stayed green. The transport is now COUNTED by a wrapper
   around the real `subscribeFrames`, and the mutation kills two tests.
3. **The layer suite reached for `getByTestId`** against a codebase that names
   rendered surfaces with `data-ui`. Five assertions went red against correct
   markup - a probe failing for its own reasons looks exactly like a component
   that is wrong.
4. **A mutation was INERT.** `void dispatch;` matched its pattern and changed
   nothing, so A4 "survived" it. Replaced with one that seeds the reducer's
   initial state with a fabricated crossing nobody sent; A4 then goes red on
   BOTH its fail sides.

**And one probe result that looked like a defect and was not.** A4's first run
found ELEVEN marks after zero frames were published. Those were real frames -
the committed `FixtureStream` replaying on the advanced timers - so A4 was
working rather than failing. But a test that cannot tell "no frame arrived" from
"a frame arrived" cannot state A4 at all, so the layer suite stubs the transport
at its own module boundary and `frame-bus.test.ts` drives the real one. Checking
the probe before judging the code, which is F-56-1's operational half.

### THE EIGHT GATES

Each read from its own process, never through a pipe (**F-53-1**), and `build`
FIRST (LEDGER-15). One `RC=0` earlier in this session was `tail`'s rather than
the guard's - caught and re-read, and it is A9's own named fail-side member.

```
BUILD_RC=0  (first)      TEST_RC=0        TYPECHECK_RC=0   LINT_RC=0
CHECK_RC=0  (17 guards)  VALIDATE_RC=0    E2E_RC=0         SKIPGUARD_RC=0
```

- **A9 both polarities, identical exit code**: 1728 passed / 5 skipped healthy;
  1622 / 111 degraded with the services stopped.
- **The five skips, named**: `zebra-rpc` A11 (the live node's subversion clears
  the floor - no node); publisher A7 and deliverable 2 (the Redis round trip);
  publisher A1 FAIL SIDE and A1/A4/A5 (a real Postgres with migration 005). All
  five are on `assert-no-skipped-integration`'s allowlist and the guard names
  each one; total 835, passed 830, 16 integration files with executed tests.
- **`test:e2e` RUN** - 192 passed. It is on the gate list as of HANDOFF-16
  deliverable 1b, and it is the gate HANDOFF-15 and both of L2's verification
  gates missed. `legibility.spec.ts`'s A1 (one source per quantity on the plane)
  and A10 (reduced motion by architecture) both pass with the live layer
  mounted, which is the check that the island did not perturb the settled board.
- **`assert-no-skipped-integration` cleared LOCALLY** before the push, from three
  vitest JSON reports emitted by hand.
- Postgres 16 and Redis were started as plain local daemons - **not**
  `docker compose up**, which CLAUDE.md reserves for the operator.

### POST-FAN-OUT SWEEP

`git status --porcelain` was run after each fan-out and after each throwaway
probe. It came back EMPTY every time. Two scratch test files this session wrote
into `apps/web/test/unit/` to take a measurement were removed and the sweep
confirmed clean; the base worktree used for the bundle comparison was removed
with `git worktree remove --force` and `git worktree list` shows only the repo.

### GATE ROUNDS

**ROUND 1 - two reviewers, separate dimensions, eighteen findings, SIX ACTED ON.**
One on the honesty of the surface, one on failure paths and lifecycle. Every
finding acted on was reproduced by the lead BY EXECUTION before its fix; two
were refuted by execution and no change was made. **Three were live on the page
as deployed.**

| # | severity | what | how it was settled |
|---|---|---|---|
| 1 | HIGH | the deployed page drew ELEVEN MOCKUP ROWS and called them live | measured on a real `next start` build with no network; fixed with `openInFixture: false`; re-measured in chromium at 0 marks and "no feed" |
| 2 | HIGH | a `migration` row drew an orchard-to-ironwood arc for a Sapling-to-Orchard transfer | read off `apps/gateway/src/views/mempool.ts`'s `crossesWithNoPublicSide`; **F-57-1** |
| 3 | HIGH | the pool labels were pushed 117.7 px below the plane onto the caption | measured in chromium before and after: labels box 760.3 -> 560.9, every label back inside the drawing |
| 4 | HIGH | `subscribeFrames` never passed `onState`, so a dead feed read "live" for ever | 51 frames across three open/die/reconnect cycles, one state ever seen; **F-58-1** |
| 5 | HIGH | `snapshot` folded additively, so a reconnect kept confirmed transactions on the board | reproduced: 2 held where the authoritative view named 1; held set also unbounded at 3,000 |
| 6 | HIGH | the plural fix landed in one file while `mempool-summary.ts` still stated the error | HIGH by this project's sweep rule, not LOW |

Plus three MED and two LOW: a removal that took nothing off the board claiming
"the last mark to leave"; a connect-time drain rendered in the present tense;
`tip-bus`'s non-idempotent detach and its silent deafening by a bus reset, which
had made every later tip assertion in a file pass vacuously.

**ROUND 2 - THE FIX COMMIT AS ITS OWN SUBJECT, AND IT IS REPORTED AS UNRUN
RATHER THAN CLEAN.** Clause (ii) and F-58-2 both require it, and this session
dispatched it as a SEPARATE run rather than a panel racing the lead - which is
the whole of what F-58-2 corrected. It had not returned at write-back, 21
minutes in. **A round that did not return is not a round that found nothing**
(LEDGER-10 Q3), so its scope - `e3a1622`'s guard predicates, test assertions and
runtime-behaviour claims - is the least-reviewed surface in this branch and is
recorded as such. Per the operator's instruction, any finding it returns in an
executable line goes to a FOLLOW-UP PR rather than holding this one.

**THE STOPPING RULE, STATED HONESTLY RATHER THAN CLAIMED.** Clause (i)(a) is NOT
satisfied: round 1 returned six findings a user could see, so this branch has not
converged in the sense the rule means. What round 2 exists to test is whether the
fixes for those six introduced a seventh, which three consecutive sessions have
measured to be where the next defect is. **The extrapolation, per clause (iii): a
third round probably finds one or two more, of round 2's reach - defects in the
fix commit's own predicates and sentences rather than in the estimator.** That is
a weaker claim than convergence and it is the one the evidence supports.

### THE INSTRUMENT FAILURES, INCLUDING THE ONE THAT PRODUCED A FALSE RED

Six of this session's probes were wrong before the code was, one mutation was
inert, and one measurement was taken against a tree that no longer existed. The
four in section 5's list are joined by these:

- **A `vi.mock` that dropped the real module's other exports**, so five
  assertions failed against correct markup once `IS_LIVE_TRANSPORT` was added.
- **An assertion that the feed stays down**, when the committed stream is
  designed to reconnect - a probe wrong about the module it was pointed at.
- **`not.toContain("mempool feed")` against the honest sentence "no live mempool
  feed is configured"**, which contains it. That is F-43-1's shape - a pattern
  matching inside a longer string - and it failed against correct copy.
- **A 37-FAILURE E2E RUN THAT WAS ENTIRELY MY OWN CONTENTION.** `pnpm build` ran
  twice and several `next start` servers were bound while the suite's own
  `webServer` served the same `.next`, so it read a build being rewritten
  underneath it. Checked before it was believed: `.plabel` is 12 on both `/` and
  `/timeline` on a clean build, where the failing test reported zero. Re-run with
  the tree quiet: **192 passed, `E2E_RC=0`**. Reported here rather than silently
  re-run, because a red that is the instrument's and a red that is the code's are
  indistinguishable from the output alone.
- **And the exit code of that run was reported to me as 0** by a wrapper whose
  last statement was an `echo`. That is **F-53-1 arriving through a background
  job** rather than through a pipe - the same rule this session had already
  logged breaking once with `| tail`, twice in one session, which is why A9's
  exclusion set names the shape rather than the punctuation.

### THE EIGHT GATES, FINAL TREE

Each read from its own process, never through a pipe or a wrapper (**F-53-1**),
and `build` FIRST (LEDGER-15).

```
BUILD_RC=0  (first)      TEST_RC=0        TYPECHECK_RC=0   LINT_RC=0
CHECK_RC=0  (17 guards)  VALIDATE_RC=0    E2E_RC=0         SKIPGUARD_RC=0
```

- **1,746 passed / 5 skipped**, every skip named above. Independently confirmed
  by L2 on `7c9f17b` at the same figures, on a clean worktree.
- **`test:e2e` 192 passed** on a clean rebuild with no other process touching the
  tree.
- **`assert-no-skipped-integration` cleared LOCALLY**: total 835, passed 830,
  skipped 5, 16 integration files with executed tests.
- L2's two mutations against this branch confirm the two most important fixes are
  load-bearing: reverting the `onState` forwarding fails 3, and reverting the
  transport check fails 18.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`.
