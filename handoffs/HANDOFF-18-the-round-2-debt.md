---
handoff: 18
title: The round-2 debt - three HIGHs in executable lines, and four assertions that pass against code that is wrong
status: shipped
branch: the session-designated branch (name it `feat/v2-18-the-round-2-debt` if you may choose)
track: Web
depends_on: 17
written_by: L2 (Cowork) - 4 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-18 - The round-2 debt

**THIS HANDOFF EXISTS BECAUSE HANDOFF-17 SHIPPED WITH ITS DEBT WRITTEN DOWN RATHER THAN HIDDEN.**
Gate round 2 returned after the operator merged. Three HIGHs in executable lines, two of them
created by round 1's own fix commit, plus four tests written in that commit that DO NOT
DISCRIMINATE. They are recorded in full in `handoffs/HANDOFF-17-the-living-tank.md` section 7.
**Read that section before anything else - it is the specification for this handoff**, and it was
written by the session that found them, from execution.

**L2 HAS INDEPENDENTLY CONFIRMED R2-2 AT MERGED `main`.** `HOLD_MAX = 250` at
`apps/web/src/lib/live-plane.ts:360`; the eviction at `:383-385` sorts by `seq` and deletes the
oldest; and `add`'s `seq: existing?.seq ?? state.seq` reads `existing` from the map it was handed.
**The snapshot arm hands it a FRESH EMPTY MAP**, so every row is new to `add`, every row takes a
fresh `seq`, and the eviction runs mid-loop against sequence numbers that have not been restored
yet. Do not take that diagnosis on trust - reproduce it first, per this project's own rule.

## §1 SCOPE

Close HANDOFF-17's round-2 debt: three HIGH defects in executable lines, and four assertions that
pass against code that is wrong.

**THE THREE HIGHs, from HANDOFF-17 section 7, in the order they matter:**

| id | defect | the measured symptom |
|---|---|---|
| **R2-2** | the `snapshot` arm and `HOLD_MAX` together produce the exact failure `add`'s own comment says they prevent | 300-tx mempool, one reconnect: **0 of 42 drawn marks survived** |
| **R2-1** | the migration fix closed the PAIR and left the DIRECTION open. `lanes` is a SET, so a REVERSED ZIP 318 row - Ironwood back to Orchard, which `leaks.ts` calls "the rarer event", not an impossible one - draws orchard-to-ironwood, in the wrong lane's hue, beside a cell reading "I to O" | `flow="I to O"` -> `{kind:"crossing",from:"orchard",to:"ironwood"}` |
| **R2-3** | `buildLivePlane`'s docblock asserts "the affordance still prints the true held figure". `HOLD_MAX`, added in the same commit, made that false - and in the undecoded case `capped` is `0 > 42`, so the one branch that would hedge the figure is off | mempool 3,000 -> `held=250 drawn=0 capped=false`; the page prints "of 250 held" |

**R2-2 IS FIRST AND IT IS THE ONE THE OPERATOR WILL SEE.** It is user-visible, it needs only a
mempool over 250 and one reconnect, and **the committed fixture corpus is 14 rows, so no test in
the tree can currently reach it.** A reconnect is the normal case, not the exotic one: the
committed `FixtureStream` closes itself after each cycle BY DESIGN and a real gateway drops. The
symptom is a tank that empties itself, which is precisely the behaviour that would make a reader
distrust every other figure on the page.

**AND THE FOUR NON-DISCRIMINATING TESTS ARE THE MORE DIAGNOSTIC HALF.** From section 7:

- **A14 passes against a tip-bus that is permanently and completely deaf** - two mutants, 13/13
  both times - because `openInFixture:false` means `onTip` can never move the socket count it
  asserts on.
- **A15's "zero marks" half is vacuous** because the file stubs the transport. **So HANDOFF-17's
  headline defect - the eleven mockup rows drawn as live on the deployed page - IS ASSERTED
  NOWHERE IN THE REPOSITORY.** That is the single most important line in this brief.
- The snapshot survivor-seq test passes against the mutant because its entries are in arrival
  order, **which is the one order the gateway never sends**.
- `tip-bus`'s idempotent detach, which works, is asserted nowhere.

**Out of scope:** the cutover; a provider API key; any new surface. This handoff closes a debt and
adds nothing.

## §2 READING - ALL OF IT BEFORE ANY PROBE (F-56-1)

`handoffs/HANDOFF-17-the-living-tank.md` section 7 **entire** - it is the specification. Then
`apps/web/src/lib/live-plane.ts` **entire** (`add`, `liveReduce`'s snapshot arm, `HOLD_MAX`,
`buildLivePlane`, `markFor`, `directionFor`), `apps/web/src/lib/api/frame-bus.ts`,
`apps/web/src/lib/api/tip-bus.ts`, `apps/web/test/unit/live-plane.test.ts` and
`live-plane-layer.test.tsx` **entire** - you are repairing assertions in them and must know what
each currently proves - and `apps/gateway/src/views/mempool.ts` for the producer's real `class`
and `flow` values. Say in section 7 which you read line by line.

## §3 CONTRACT

- **EVERY FIX IS REPRODUCED BEFORE IT IS WRITTEN.** Section 7 gives you the symptom and the site
  for all three. Reproduce each against the PRE-FIX tree, by execution, and put the transcript in
  section 7. A finding you did not reproduce is a finding you are taking on trust, and this
  project has been wrong about its own diagnoses often enough to make that a rule.
- **A REPAIRED ASSERTION MUST BE SHOWN TO DISCRIMINATE.** For each of the four, the deliverable is
  not "the test now covers it" - it is **the mutant that used to pass and now fails, with its
  transcript.** A test that cannot fail is not evidence, and four of them shipped in one commit.
- **THE FIXTURE CORPUS CANNOT REACH THESE SHAPES AND MUST NOT BE STRETCHED TO.** 14 rows, all
  `O to I`. R2-2 needs 300, R2-1 needs a reversed crossing, R2-3 needs 3,000. **Build them as test
  data from the PRODUCER's shape** (F-57-1: read `views/mempool.ts`), never by editing the
  committed corpus, which is evidence about the chain and not a fixture to bend.
- **A HEDGE THAT IS OFF IS WORSE THAN NO HEDGE.** R2-3's `capped` is false at 3,000 held, so the
  page prints a confident wrong number. The absence-versus-zero rule (`chain-inputs.ts:42`) says
  the figure must be true or named as bounded - never confidently wrong.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **R2-2 fixed, and the reconnect no longer empties the tank.** The snapshot arm must restore
   survivors' `seq` BEFORE any eviction runs, so a replayed view cannot promote rows the reader
   already evicted above ones it still holds. `add`'s own comment already states the intended rule
   - make the code obey it.
2. **R2-1 fixed: direction comes from `flow`, not from the pair.** A reversed ZIP 318 row draws
   Ironwood-to-Orchard, in the correct lane's hue, agreeing with the cell beside it. Where `flow`
   does not decide a direction, draw nothing and hold it with its reason - the rule HANDOFF-17
   already established in A8.
3. **R2-3 fixed: the printed figure is true, or it is named as bounded.** Fix `capped`'s undecoded
   case so the hedge is on when the hold is capped, and make the docblock's claim match what the
   code does.
4. **The four assertions repaired, each with its killing mutant.** A14 against a deaf tip-bus.
   **A15's zero-marks half against the REAL transport, so the mockup-fish defect is finally
   asserted somewhere.** The survivor-seq test against gateway ordering rather than arrival
   ordering. `tip-bus`'s idempotent detach asserted at all.
5. **`docs/2.0/CUTOVER-1.0.md` gains one line in section 7's checklist:** after a reconnect the
   mark count does not drop to zero. It is the symptom an operator would otherwise mistake for a
   quiet chain.

## §5 ASSERTIONS - each needs both polarities

- **A1.** A 300-transaction mempool followed by one reconnect keeps the marks it held.
  *Exclusion set:* any reconnect after which a mark the reader was drawing, and whose transaction
  the snapshot still names, is no longer drawn; and any reconnect that promotes a row the reader
  had already evicted above one it still holds.
  *Fail side by DATA: the pre-fix `add`, over the same 300 rows and the same reconnect - 0 of 42
  survive. That transcript is the evidence, and it must be in section 7.*
- **A2.** A reversed ZIP 318 row (`flow="I to O"`) draws Ironwood-to-Orchard.
  *Exclusion set:* any `migration` row whose drawn crossing disagrees with its own `flow` cell -
  in either the pair it names or the direction it names.
  *Fail side by DATA: the same row through the pre-fix `directionFor` draws orchard-to-ironwood,
  contradicting its own cell.*
- **A3.** At 3,000 held the printed figure is true or `capped` is on.
  *Exclusion set:* any held figure printed as an exact count while the hold has evicted, and any
  hold at its ceiling reporting `capped: false`.
  *Fail side: the pre-fix branch prints "of 250 held" with `capped:false` - a confident wrong
  number.*
- **A4.** **The deployed configuration draws ZERO marks, asserted against the REAL transport
  rather than a stub.**
  *Exclusion set:* any mark on the board in the deployed configuration that no gateway frame put
  there - the committed corpus replayed through the fixture stream being the member that shipped.
  *Fail side by DATA: the pre-`e3a1622` layer, in the Production configuration, draws ELEVEN. This
  is HANDOFF-17's headline defect and it is currently asserted nowhere - this assertion is the
  deliverable.*
- **A5.** Each of the four repaired tests fails against the mutant it was blind to.
  *Exclusion set:* any repaired assertion that still passes against the mutant it was written to
  exclude.
  *State the mutant and the transcript for each; a repaired test that cannot fail has not been
  repaired.*
- **A6.** `pnpm -r test` green with a **real** exit code, captured directly and never through a
  pipe **and never from a wrapper whose last statement is an `echo`** (**F-53-1**, which
  HANDOFF-17 hit twice in one session - once through `| tail` and once through a background job's
  own exit code). **BUILD BEFORE TYPECHECK.** State passed AND skipped counts, and name every
  skip.
  *Exclusion set:* any exit code read through a pipe, a `tee`, a `| tail` or a wrapper whose last
  statement is an `echo`; and any report stating a passed count without its skipped count.
- **A7.** `pnpm --filter @zcashreveal/web test:e2e` RUN AND REPORTED, on a tree with **no other
  build or server touching `.next`** - HANDOFF-17's 37-failure reading was contention, not a
  regression. Report Playwright's own exit code, not a wrapper's.
  *Exclusion set:* a gate row left silent, a row reported from a previous session's run, and a
  reading taken while another process was writing `.next`.

## §6 DISPATCH HINTS

Small and entirely corrective. One worker per HIGH, one on the four assertions. **The adversarial
question for this handoff is not about the product - it is about the tests: *which assertion in
this branch would still pass if the code it names were deleted?*** Four of them would have, one
commit ago. A15 is the one to write first and the one to try hardest to break, because it is the
assertion that would have caught the eleven fish and it does not exist yet.

## §7 REPORT

```
STATUS: DONE

Every deliverable is in the tree and every assertion carries both polarities.
Nothing here is a partial build. The three HIGHs are fixed and the four
non-discriminating assertions are repaired, each with the mutant it was blind
to AND the measurement that its predecessor passed against that same mutant.

TWO DEFECTS WERE FOUND THAT WERE NOT ON THE LIST, both by writing the assertion
the brief said was missing rather than by reading, and both are fixed here.

FORKED FROM c32c46e0f5019fa05f39a06ec878609b91c5f875, the head of `main`.
`git merge-base --is-ancestor 2326c84 origin/main` exits 0 - EXECUTED BEFORE ANY
FILE WAS TOUCHED - so PR #59 landed whole and not merely its earlier commits.
HEAD was already `origin/main` exactly and `git status --porcelain` was empty.

SPAWN MODE: subagent fan-out available, PROVEN BY A TOOL ATTEMPT before any
work - a `general-purpose` agent returned `SPAWN-OK` and the correct HEAD SHA in
one tool use, writing nothing. Directors name every worker; subagents do not
nest.
```

### §2 READING - what was read LINE BY LINE, before any probe (F-56-1)

All of it, in full, before the first line of code was written:
`HANDOFF-17-the-living-tank.md` section 7 entire (the specification),
`apps/web/src/lib/live-plane.ts` entire, `apps/web/src/lib/api/frame-bus.ts`
entire, `apps/web/src/lib/api/tip-bus.ts` entire,
`apps/web/test/unit/live-plane.test.ts` entire,
`apps/web/test/unit/live-plane-layer.test.tsx` entire and
`apps/gateway/src/views/mempool.ts` entire. Four more the brief did not list but
its own claims required: `apps/web/test/unit/frame-bus.test.ts` (A14 lives
there, not in either file the brief names), `apps/web/src/lib/api/stream.ts`
(`IS_LIVE_TRANSPORT` and `FixtureStream`),
`apps/web/src/components/record/LivePlaneLayer.tsx` (the affordance that prints
the held figure) and `apps/gateway/src/live-reports.ts` (which settles what
order the gateway actually sends a view in).

### THE THREE HIGHs, REPRODUCED AGAINST THE PRE-FIX TREE BEFORE ANY FIX

Executed, in one probe run, on the tree as merged. The brief said not to take
L2's diagnosis on trust and this is the discharge of that.

```
R2-2  drawn before: 42  after: 42  SURVIVED: 0
R2-2  before drew txids 259..300
R2-2  after  draws txids 9..50
R2-2  held after: 250; holds txid(1) (a row this reader had EVICTED)? true
R2-2  holds txid(300) (the newest row it was drawing)? true
R2-1  flow="I to O" -> {"kind":"crossing","from":"orchard","to":"ironwood"}
R2-3  held=250 drawn=0 capped=false  -> the page prints "of 250 held"
```

All three match HANDOFF-17 section 7 exactly. R2-2's second line is the half the
symptom sentence does not carry: the board did not merely lose its marks, it
PROMOTED txid(1) - a row this reader had already evicted - over the rows it was
drawing. That is the sentence in `add`'s own comment, measured.

### THE SAME PROBES, AFTER THE FIX

```
R2-2 [arrival]   survived 42/42; after draws txids 259..300; holds txid(1)? false
R2-2 [reversed]  survived 42/42; after draws txids 259..300; holds txid(1)? false
R2-2 [shuffled]  survived 42/42; after draws txids 259..300; holds txid(1)? false
R2-1 flow="I to O"  lanes=["orchard","ironwood"]  -> {"kind":"crossing","from":"ironwood","to":"orchard"}
R2-1 flow="O to I"  lanes=["orchard","ironwood"]  -> {"kind":"crossing","from":"orchard","to":"ironwood"}
R2-1 flow="S to O"  lanes=["sapling","orchard"]   -> {"kind":"crossing","from":"sapling","to":"orchard"}
R2-1 flow="3 pools" lanes=["sprout",...]          -> {"undrawn":"no single crossing describes it"}
R2-3 held=250 drawn=0 capped=true holdCapped=true -> the page prints "of at least 250 held"
```

### THE CAPTURE THAT SETTLES R2-1, AND IT IS WHY NO CARE APPLIED TO `lanes` COULD HAVE WORKED

F-57-1 says an exclusion set is closed by CAPTURE from the real producer, never
by enumeration from memory. `mempoolRow` in `apps/gateway/src/views/mempool.ts`
was driven over both directions of the ZIP 318 crossing, through the gateway's
own `LeakReport` fixture:

```
CAPTURE REVERSED (I to O): class=migration flow="I to O" lanes=["orchard","ironwood"]
CAPTURE FORWARD  (O to I): class=migration flow="O to I" lanes=["orchard","ironwood"]
```

**The lane arrays are IDENTICAL, in the same canonical order.** That is the whole
finding and it is stronger than the brief's statement of it: HANDOFF-17's fix was
not merely incomplete, it was reading the one field of the row that CANNOT carry
the answer. The direction now comes from `flow`, which is the field the producer
put it in and the field the cell beside the arc prints.

### A FOURTH DEFECT, FOUND BY WRITING THE ASSERTION THE BRIEF ASKED FOR

The brief said A15 was "the one to write first and the one to try hardest to
break". Written against the real transport, it broke something that was not on
the list.

`frame-bus.ts`'s `open()` delivers every frame to EVERY subscriber regardless of
`openInFixture`, and that is deliberate - the option's own docblock says a
consumer "does not have to refuse frames that some other consumer's socket
happened to deliver". True of a clock. False of this board, because in fixture
mode those frames ARE the committed mockup corpus. So `openInFixture: false`
protected the plane only while nothing else on the page opened a socket, which
is a property of the PAGE rather than of the component.

Executed: the layer mounted in the deployed configuration with one ordinary
`onFrames` consumer beside it drew **ELEVEN MOCKUP ROWS** - the identical figure
a gate reviewer measured on the deployed page in HANDOFF-17, reached by a
different route. Not live today (the only two `onFrames` callers in `apps/web`
are this layer and `tip-bus`, and both refuse), and one import away from being
live. The dispatch is now guarded on the transport as well, so the two guards are
independent: one refuses to open a connection there is nothing true on, and one
refuses to draw what such a connection carries.

### THE BUNDLE, MEASURED BOTH WAYS ON ONE VARIABLE

The first draft of the R2-1 fix put the pool letters in `@zcashreveal/types` and
imported them from the browser, so the two ends of the wire encoding could not
drift. **That cost 15 kB of the splash bundle**, which is verbatim the figure
`api/stream.ts`'s own header records paying to keep zod out of it - the package
has no `sideEffects: false`, so pulling one function through its barrel drags
`views.ts` and zod behind it. Measured by building `/` both ways with nothing
else changed:

| | `/` route JS | first load |
|---|---|---|
| barrel import of `POOL_INITIAL` | 21.4 kB | 133 kB |
| local inverse map | 5.5 kB | 118 kB |
| the shipped tree | 5.51 kB | 118 kB |

HANDOFF-17 recorded 4.88 kB / 117 kB; the +0.63 kB is this handoff's own code.
The letters are DECLARED once in `@zcashreveal/types` (the gateway imports them),
the browser holds a local inverse for the measured reason, and a test holds the
two to each other **by iterating the declaration's own keys** - so a fifth pool
fails the test rather than arriving on the wire as a letter the parser silently
declines. A copy is a drift risk and a comment is not a guard.

### THE FOUR ASSERTIONS, AND THE MUTANTS THAT SETTLE THEM

The deliverable was not "the test now covers it" but the mutant that used to pass
and now fails. Both halves were executed. Every mutated file was restored and
`git status --porcelain` confirmed clean afterwards.

**The repaired assertions, against the mutants they name:**

| mutant | result |
|---|---|
| M1 snapshot arm: strangers dated ABOVE survivors | 1 failed / 52 passed |
| M2 snapshot arm: survivors lose their original seq | 2 failed / 51 passed |
| M3 migration direction back to the PAIR (R2-1 pre-fix) | 4 failed / 49 passed |
| M4 `capped` back to the draw cap alone (R2-3 pre-fix) | 1 failed / 52 passed |
| M5 `tip-bus` `onReset` deleted | 3 failed / 13 passed |
| M6 `tip-bus` idempotent detach deleted | 1 failed / 15 passed |
| restored | 53 passed (53) and 16 passed (16) |

**And the half that makes those numbers evidence - the OLD assertions against the
SAME mutants:**

| the assertion as it shipped | its mutant | result |
|---|---|---|
| OLD A14 | M5 (`onReset` deleted) | **PASSES** |
| OLD survivor-seq test | M2 (survivors lose their seq) | **PASSES** |
| OLD `live-plane-layer.test.tsx`, all 19 tests | the pre-`e3a1622` wiring | **19/19 PASS** |
| NEW `live-plane-transport.test.tsx` | the same pre-`e3a1622` wiring | **3 failed**, at 11 marks |
| NEW `live-plane-transport.test.tsx` | dispatch guard alone removed | **1 failed**, at 11 marks |

The old A15 file passing 19/19 against the exact code that put eleven mockup rows
on the deployed page is the measurement this handoff exists for. It is not a weak
test; it is a test of something else, and a green run of it was evidence about a
stub.

**Why each was blind, read off the file rather than assumed:**

- **A14** asserted that the SOCKET COUNT moved after re-attaching, and `onTip`
  passes `openInFixture: false`, so `onTip` can never move that count in that
  suite - the count was moved by the ordinary `onFrames` consumer attached
  beside it, which would have done so with `tip-bus.ts` deleted from the
  repository. It also detached the first consumer BEFORE the reset, which sets
  `stop = null` on the way out, so the desynchronisation it exists to catch
  could not occur. Two independent reasons, either alone sufficient.
- **A15's zero-marks half** ran in a file whose first statement stubs
  `subscribeFrames` to `() => () => undefined`. Nothing in that file can deliver
  a frame, so "zero marks" is true of any component whatsoever.
- **The survivor-seq test** drove arrival order. Read off the producer rather
  than guessed: `readLiveReports` builds the view from
  `Object.values(await redis.hgetall(...))` - a Redis HASH keyed by txid, whose
  iteration order is arbitrary with respect to arrival. In arrival order the
  reshuffle is invisible, because fresh sequence numbers assigned in arrival
  order preserve the arrival ordering and the sorted comparison cannot move.
- **`tip-bus`'s idempotent detach** had a four-line docblock and no assertion
  anywhere in the repository, which is the same standing as a property that does
  not work.

### THE EIGHT GATES

Each read directly from its own process - never through a pipe, a `tail` or a
wrapper whose last statement is an `echo` (**F-53-1**) - and `build` FIRST
(LEDGER-15).

```
BUILD_RC=0  (first)      TEST_RC=0        TYPECHECK_RC=0   LINT_RC=0
CHECK_RC=0  (17 guards)  VALIDATE_RC=0    E2E_RC=0         SKIPGUARD_RC=0
```

- **1,769 passed / 5 skipped**, healthy, with Postgres 16 and Redis started as
  plain local daemons - **not** `docker compose up`, which CLAUDE.md reserves for
  the operator.
- **The five skips, named from the reports themselves**: publisher A7 (the local
  Redis sink), publisher deliverable 2 (the RPC-only Redis round trip), publisher
  A1 FAIL SIDE (a real database), publisher A1/A4/A5 (`readSnapshotInputs`
  against a real Postgres with migration 005), and `zebra-rpc` A11 (the live
  node's subversion clears the floor - no node). All five are on
  `assert-no-skipped-integration`'s allowlist and the guard names each one.
- **`test:e2e` RUN: 192 passed in 6.1 minutes**, on a quiet tree with no other
  build or server touching `.next` - which is what A7 asks for, and the condition
  HANDOFF-17's 37-failure reading lacked.
- **`assert-no-skipped-integration` cleared LOCALLY** before the push, from three
  vitest JSON reports emitted by hand: `total=835 passed=830 failed=0 skipped=5`,
  16 integration files with executed tests.
- **LEDGER-15's gate ORDER earned its place again in this session.** The first
  run of the R2-1 probe died on `Failed to resolve entry for package
  "@zcashreveal/types"` - a cross-package export added in the same change that
  consumes it, invisible until the producing package is rebuilt. That is the
  exact failure the build-first rule exists for, arriving in a probe rather than
  in a typecheck.

### INSTRUMENT FAILURES, REPORTED RATHER THAN QUIETLY REPAIRED

- **A mutation harness whose `run` helper `cd`-ed out of its own working
  directory**, so the first pass of all six mutants printed NOTHING and every row
  was blank. A harness failure and a mutant that kills nothing produce the same
  empty output, and the reading is available only from re-examining the
  instrument. Re-run with the directory pinned per invocation; the baseline was
  driven first and returned 53/53 and 16/16, which is what made the six results
  below it readable.
- **`node scripts/check-emoji.mjs 2>&1 | tail -3` reported `EMOJI_RC=0` for a
  script that had thrown.** The value belonged to `tail`. That is **F-53-1**
  inside the first ten minutes of the session, caught by reading the line rather
  than the number, and every gate figure in this report is read directly from its
  own process because of it. The script name was also wrong - the guard is
  `./scripts/check-no-emoji.sh`, invoked by `pnpm check`.

### POST-FAN-OUT SWEEP

`git status --porcelain` was run before every commit and after the gate fan-out.
The probe harness was built OUTSIDE the repository - under the session
scratchpad, with its own vitest config pointing back at `apps/web` - so no
throwaway test file ever entered the tree, which is the standing risk this rule
exists for. Every file mutated during the mutant runs was restored from a copy
taken beforehand and the sweep confirmed clean.

### GATE ROUNDS

**ROUND 1 - TWO REVIEWERS ON SEPARATE DIMENSIONS, SIXTEEN FINDINGS, FIFTEEN
SETTLED BY EXECUTION.** One on the honesty of the surface, one on whether the
assertions discriminate. Dispatched as a SEPARATE run over the pinned fix
commit rather than a panel racing the lead, which is F-58-2. Reviewer 1 pinned
`a4dd0c5` by extracting both files at that commit and aliasing to them, because
the working tree carried reviewer 2's mutants while it worked - a verify phase
over a moving tree is a verify phase over the wrong object, and it protected
itself against exactly that without being told to.

**TWO FINDINGS WERE FOUND INDEPENDENTLY BY BOTH REVIEWERS** - the CUTOVER
checklist item and the unproducible `"migration"` caption - which is
corroboration rather than duplication, and both were among the four this
branch's own round-1 fix commit had created.

| # | severity | what | how it was settled |
|---|---|---|---|
| 1 | HIGH | the new CUTOVER checklist item cannot fail on the deployment that runbook produces | `grep -c NEXT_PUBLIC docs/2.0/CUTOVER-1.0.md` is **0**; DEPLOY-2.0 sets Production to `snapshot` with no WS URL, so the count is permanently zero and the reading says "no feed". Found by BOTH reviewers |
| 2 | HIGH | the RENDERED "at least" figure was asserted nowhere - only `buildLivePlane`'s object was | reverting the hedge on the page restores R2-3 verbatim **with the whole web suite green at 604/604** |
| 3 | HIGH | `capped` folded in the sticky `holdCapped`, so the sample claim outlived its evidence | measured: 300 adds then 297 removals print "0 unconfirmed transactions drawn of at least 0 held - more transactions are in the pool" over an EMPTY tank |
| 4 | MED | the dispatch guard landed on `onFrame` and not on `onState` | with one ordinary consumer beside it the layer printed "no feed replaying the committed corpus", contradicting itself in one line |
| 5 | MED | "the producer emits two such captions" - the literal `"migration"` has no producer | the two predicates are exact negations; 480 shapes through the real `mempoolRow` emit fourteen migration flows, not that one. Found by BOTH reviewers |
| 6 | MED | "the last mark to leave" printed for rows never on the board | `drewMark` says the row had a SHAPE and the reducer has no `nMax`; `HOLD_MAX` made it 208 of every 250 held rows |
| 7 | MED | the 300-row replay drove ARRIVAL order only, and A11's three orders ran at n=50 where the hold never caps | measured per axis: the verbatim pre-fix fold is invisible at 50 in all three orders, and the seq-loss mutant is invisible at 300 in arrival order |
| 8 | MED | `holdCapped` on the SNAPSHOT path - the path every reconnect takes - was unasserted | hardwiring `holdCapped: false` in `replace()` left 53/53 green |
| 9 | MED | the transport file's NAMED killing mutant does not kill the assertion it sits on | either guard alone satisfies "zero marks"; only both together give the 3 reds section 7 claims |
| 10 | MED | A14's "with no reset" control is not reset-free - `afterEach` resets the bus | with `onReset` deleted the control fails for the same reason as the fail side, so 2 of 3 reds are collateral |
| 11 | LOW | the on-page legend and RUNTIME.md still said direction comes from the class | LEDGER-03 Q3 sweep: three sites, corrected in one commit. Found by the lead's own sweep and confirmed by reviewer 1 |
| 12 | LOW | the undrawn line restated the hedged figure exactly, three lines below it | "at least 250 held" beside "250 held transactions draw no mark" |
| 13 | LOW | the self-crossing guard was deletable with the suite green | now 1 red |
| 14 | LOW | the "captured from the producer" evidence was comment-only | `producer-seam.test.ts` runs the real `mempoolRow` into the real `markFor` |
| 15 | LOW | the band docblock claimed contiguity, which nothing checks | narrowed to the guarantee that is actually tested |
| 16 | - | `replace()`'s duplicate-txid branch | **ANSWERED, NOT FIXED - see below** |

**THE ROUND-2 MUTANTS, ALL RESTORED AFTERWARDS:**

| mutant | result |
|---|---|
| N1 the rendered hedge removed (R2-3 back on the page) | 1 failed / 21 passed |
| N2 the sample sentence back on `capped` | 1 failed / 21 passed |
| N3 the `onState` guard removed | 1 failed / 5 passed |
| N4 `holdCapped` hardwired false in `replace()` | 1 failed / 56 passed |
| N6 the self-crossing guard deleted | 1 failed / 56 passed |
| N7 the verbatim pre-fix fold, at 300 over three orders | 3 failed / 54 passed |
| restored | 63 passed |

N3's failure message reproduces reviewer 1's measured string exactly:
`expected 'no feed replaying the committed corpus' to contain 'no live mempool
feed is configured'`.

**AND N5 IS AN EQUIVALENT MUTANT, REPORTED RATHER THAN DRESSED.** Deleting
`replace()`'s duplicate-txid branch leaves 57/57 green, and TWO probes written
for it both failed to discriminate - which is a finding about the site rather
than about the probes. Worked by hand: the stranger band's occupied minimum is
`floor - (distinct strangers)` whether or not the duplicate is counted, because
a duplicate's earlier slot is overwritten by its later one. Only the order
WITHIN the band changes, and that is Redis hash order, which this branch's own
docblock says carries no meaning - so pinning it would assert a property the
producer does not define (LEDGER-11 Q5(c)). The branch is kept and recorded as
covered by a written rule rather than by a guard, and recorded AS weaker, which
is clause (b).

**THE FIRST DRAFT OF THAT ANSWER WAS WRONG AND IS RECORDED AS WRONG.** The lead
predicted the equivalence before the reviewers returned, then wrote a test
asserting the two seqs differ by one - which passes either way - and then a
second asserting the band minimum, which also passes either way. Both were
driven and both stayed green. The prediction was right and the first two
instruments for it were not, which is why the answer is the hand derivation and
not either probe.

### INSTRUMENT FAILURES IN THIS ROUND

- **The mutation harness lost its working directory, TWICE.** A `run` helper
  that `cd`-ed to the repo root printed nothing for all seven mutants, and an
  empty result is indistinguishable from a mutant that kills nothing. Caught by
  driving the unmutated baseline first; the second occurrence was caught the
  same way, in the same session, which is what makes it worth writing down
  rather than a slip.
- **`pnpm build` refused the seam test where vitest had accepted it.**
  `apps/gateway` sets `rootDir: "./src"` and `composite: true`, so a file under
  it may not import `apps/web`; `tsc -b` said so and vitest never would have.
  The test moved to `apps/web/test/`, which sets no `rootDir` and `noEmit`. That
  is LEDGER-15's build-before-typecheck rule earning its place a second time in
  one session - and the failed build had already emitted four stray artifacts
  into `apps/web/src/lib/`, which the sweep caught and removed.
- **The seam probe died in the fixture rather than in the code under test**,
  because its txid was built from pool initials and `"oi"` is not a hex string.
  A probe failing for its own reasons looks exactly like a producer that is
  wrong.

### THE STOPPING RULE

**NOT SATISFIED, AND NOT CLAIMED TO BE.** Clause (i)(a) fails: round 1 returned
findings a user could see - the CUTOVER item an operator would tick having
verified nothing, a page printing "of at least 0 held" over an empty tank, and a
reading contradicting itself in one line. Clause (i)(b) is closer than it has
been: the recurring FACE this branch keeps producing is "an assertion that reads
the object where the deliverable is the rendered string", and it now has a test
that fails on it rather than a rule.

**The extrapolation, per clause (iii): a third round finds one or two more, and
they will be in the ROUND-2 FIX COMMIT rather than in the product.** Four of
this round's sixteen were defects the round-1 fix created; the base rate on this
branch is high enough that the same is the honest prediction for this commit.
The instrument for it is not another read - it is driving the rendered surface
against the object it is derived from, which is the one axis both reviewers
found holes on.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`.
