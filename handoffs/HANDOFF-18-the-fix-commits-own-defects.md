---
handoff: 18
title: The fix commit's own defects - gate round 2's three HIGHs and four tests that do not discriminate
status: shipped
branch: the session-designated branch (name it `feat/v2-18-round-2-findings` if you may choose)
track: Web
depends_on: 17
written_by: L3 (the session that executes it) - 5 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-18 - the fix commit's own defects

**THIS HANDOFF EXISTS BECAUSE CLAUSE (ii) WAS RIGHT AGAIN.** HANDOFF-17's gate
round 2 reviewed round 1's fix commit as its own subject and returned twelve
findings - **three HIGH in executable lines, and two of the three were created by
the fix commit itself.** The operator ruled that they go to a follow-up PR rather
than holding PR #59, which merged at `c32c46e`. This is that follow-up.

**NOTHING HERE IS NEW SCOPE.** Every item is a defect in code HANDOFF-17 shipped,
already reproduced by execution and recorded in that handoff's §7. The point of
writing it down again is that a deferred finding with no handoff is a finding
that gets lost, which F-50-4 exists to prevent one level up.

---

## §1 SCOPE

Fix the three HIGH defects gate round 2 found in `e3a1622` and `7c9f17b`, and
make the four tests that do not discriminate discriminate.

**THE THREE PRODUCT DEFECTS, EACH REPRODUCED BY THE LEAD BEFORE IT WAS FILED.**

| # | site | what it does | reproduction |
|---|---|---|---|
| R2-1 | `apps/web/src/lib/live-plane.ts` `directionFor` | the migration fix closed the PAIR and left the DIRECTION open. `lanes` is a SET, so a **reversed** ZIP 318 row still draws orchard-to-ironwood - wrong arrowhead node, wrong lane hue - beside a table cell reading "I to O" | `flow="I to O"` -> `{kind:"crossing",from:"orchard",to:"ironwood"}` |
| R2-2 | `apps/web/src/lib/live-plane.ts` the `snapshot` arm + `HOLD_MAX` | **the two mechanisms meet and produce the exact failure `add`'s own comment says they prevent.** The snapshot arm starts from an empty map, so every entry is new to `add` and the eviction runs mid-loop, before survivors' `seq` is restored - promoting rows this reader had already evicted above the ones it held | 300-tx mempool, one reconnect: **0 of 42 drawn marks survived** |
| R2-3 | `apps/web/src/lib/live-plane.ts` `buildLivePlane` | its docblock asserts "the affordance still prints the true held figure". `HOLD_MAX`, added in the same commit, made that false; and in the undecoded case `capped` is `0 > 42`, so the one branch that would hedge the figure is off | mempool 3,000 -> `held=250 drawn=0 capped=false`; the page prints "of 250 held" |

**R2-2 IS THE ONE TO FIX FIRST.** It is user-visible, it needs only a mempool
over 250 and one reconnect, and the committed corpus is 14 rows - so no test in
the tree can currently see it, and none of HANDOFF-17's gates could have.

**AND FOUR TESTS DO NOT DISCRIMINATE, WHICH IS THE MORE DIAGNOSTIC HALF.** Each
was written in the fix commit, each is NAMED for the property it fails to check,
and three of the four pass against the reverted fix:

| test | why it cannot bite |
|---|---|
| A14, `frame-bus.test.ts` "resetFrameBusForTest does not deafen tip-bus" | it asserts on the socket COUNT, and `onTip` passes `openInFixture:false` so it can never move that count. Passes against a tip-bus that is permanently and completely deaf - two mutants, 13/13 both times. Its own comment names the shape it is an instance of |
| A15, `live-plane-layer.test.tsx` "zero marks" half | the file stubs `subscribeFrames`, so no transport can deliver a mark whether the plane opens one or not. **HANDOFF-17's own headline defect - the eleven mockup rows - is therefore asserted NOWHERE in the repository** |
| the snapshot survivor-`seq` test, `live-plane.test.ts` | its `entries` are in arrival order, which is the one order the gateway never sends (`view.entries` is `reports.map(...)` in the indexer's order). Passes against the mutant |
| `tip-bus`'s idempotent detach | works, and is asserted nowhere; `"mounting twice"` covers `onFrames`, not `onTip` |

**Out of scope:** anything not on this list. This is a follow-up to a merged PR,
not a second pass at the feature.

## §2 READING - BEFORE ANY PROBE (F-56-1)

`apps/web/src/lib/live-plane.ts` **entire** - `markFor`, `directionFor`, the
`snapshot` arm, `add`, `HOLD_MAX`, `buildLivePlane` - then
`apps/gateway/src/views/mempool.ts`'s `migrationFlowText` and the
`crossesWithNoPublicSide` block **which is the PRODUCER and is what R2-1 must be
closed against (F-57-1)**, `packages/zec-types/src/leaks.ts`'s `perPoolZat` sign
convention, and the three test files named above. Say in §7 which were read line
by line.

## §3 CONTRACT

- **R2-1 IS CLOSED BY CAPTURE FROM THE PRODUCER, NOT BY ENUMERATION.** That is
  what went wrong the first time: HANDOFF-17 closed the class and left the pair,
  then closed the pair and left the direction, both times by reasoning from the
  fixture instead of reading `apps/gateway/src/views/mempool.ts`. The direction
  is the SIGN of `perPoolZat`, and `migrationFlowText` is where the producer
  states it.
- **A DIRECTION THAT CANNOT BE DERIVED IS NOT GUESSED.** If the producer's own
  statement is unavailable or unrecognised, the row falls to the undirected
  chord, which claims no direction. That is already the rule for every other
  class and it is the rule here.
- **THE HELD FIGURE THE PAGE PRINTS MUST BE THE TANK'S, NOT THE POOL'S**, or it
  must say which. A saturated hold reporting a bare count is a measurement the
  page cannot make.
- **A CAP THE READER CANNOT SEE IS THE SAME DEFECT AS NO CAP** - HANDOFF-17's own
  A3 says so, and R2-3 is that rule failing at the hold layer instead of the
  draw layer.
- **EVERY FIX HERE GETS A TEST THAT IS SHOWN TO FAIL AGAINST THE UNFIXED CODE.**
  Not a test that passes: a test driven against the reverted fix and observed
  red. Round 2's most useful finding was that three named tests did not meet that
  bar, so this handoff meets it by demonstration rather than by claim.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **R2-1** - direction read from the producer's own statement; a reversed row
   draws a reversed arc, and an unrecognised one draws a chord.
2. **R2-2** - the hold eviction runs ONCE, after the whole view is placed and
   after survivors' `seq` is restored; a re-entering transaction is not minted as
   the newest.
3. **R2-3** - the plane carries whether the HOLD is saturated, and the affordance
   says so rather than printing a bare count that is wrong by an order of
   magnitude.
4. **The four tests discriminate**, each proven by a mutation transcript in §7.
5. **The three docblock sentences round 2 falsified are corrected** - `markFor`'s
   "DIRECTION IS DERIVED FROM `class`, NEVER GUESSED FROM `lanes`", its
   "`migration` (the ZIP 318 crossing, orchard to ironwood)", and
   `buildLivePlane`'s "the affordance still prints the true held figure".

## §5 ASSERTIONS - the amended format: every assertion states its EXCLUSION SET

- **A1.** A migration row draws the arc its own producer says it is.
  *Exclusion set:* any row whose drawn direction disagrees with the direction the
  producer stated - specifically a reversed ZIP 318 row drawn as orchard-to-
  ironwood, and any migration pair drawn with a direction the producer did not
  state.
  *Fail side names:* the reversed row, `flow: "I to O"` with
  `lanes: ["orchard","ironwood"]`, taken from driving the real `mempoolRow`. It
  is a DATA mutation from inside the set, and it is the shape the committed
  corpus cannot produce - which is why the first two attempts at this predicate
  both shipped wrong.

- **A2.** A reconnect delivering the SAME mempool leaves the drawn board
  unchanged, at any mempool size.
  *Exclusion set:* any reconnect that changes the drawn set when nothing about
  the mempool changed - and specifically a mempool larger than `HOLD_MAX`, where
  the eviction and the `seq` restoration meet.
  *Fail side names:* 300 held, one reconnect naming the same 300. The member is
  the mempool size 300, from inside the set; the pre-fix code survives 0 of 42
  marks and the fixed code survives 42 of 42.

- **A3.** The held figure the page prints is either the true count or is marked
  as the tank's ceiling.
  *Exclusion set:* a bare "of N held" where N is `HOLD_MAX` and the pool is
  larger - and the undecoded case, where `capped` is false because no drawable
  row was capped, so nothing hedges the figure.
  *Fail side names:* 3,000 undecoded rows. The member is that mempool; the
  pre-fix page prints "of 250 held" with no note, and the fixed page says the
  hold is full.

- **A4.** Each of the four repaired tests FAILS against the code it is written
  to protect, reverted.
  *Exclusion set:* any assertion that passes against its own reverted fix -
  A14 against a deaf tip-bus, A15 against a plane that opens a fixture socket,
  the survivor-`seq` test against the deleted fixup, the detach test against a
  non-idempotent detach.
  *Fail side names:* all four mutants, run and transcribed in §7. This assertion
  is about the TESTS, so its fail side is the only kind available and the
  transcript is the whole of the evidence.

- **A5.** `pnpm -r test` green with a **real** exit code, captured directly and
  never through a pipe or a wrapper (**F-53-1**), with `pnpm build` run BEFORE
  `pnpm typecheck` (LEDGER-15), and the passed AND skipped counts both stated
  with every skip named.
  *Exclusion set:* any exit code read through a pipe, a `tee`, a `| tail` or a
  background wrapper whose last statement is an `echo`.
  *Fail side names:* the wrapper read. HANDOFF-17 hit that member TWICE in one
  session - once through `| tail` and once through a background job that
  reported an `echo`'s 0 for a run with 37 failures - which is why the set names
  the shape rather than the punctuation.

- **A6.** `pnpm --filter @zcashreveal/web test:e2e` RUN AND REPORTED, on a tree
  with no other process touching `.next`.
  *Exclusion set:* a run whose `webServer` shares `.next` with a concurrent
  build or a stray `next start` - the contention that produced HANDOFF-17's false
  37-failure reading.
  *Fail side names:* that contended run, which is transcribed in HANDOFF-17 §7
  and is why this assertion names the condition rather than only the command.

## §6 DISPATCH HINTS

Small, and the diff is mostly in one file. The adversarial question is narrower
than HANDOFF-17's and sharper: **does each fix's test go red when the fix is
reverted?** Round 2 measured that three named tests did not, so a fix here that
ships without that transcript has not been shown to do anything.

## §7 REPORT

```
STATUS: DONE

All three HIGH defects are fixed, all four non-discriminating tests now
discriminate, and every fix is shown to FAIL against its own reverted code -
which is the bar §3 set and the bar round 2 measured HANDOFF-17 missing.

FORKED FROM c32c46e0f5019fa05f39a06ec878609b91c5f875, the head of `main` and the
merge commit of PR #59. `git merge-base --is-ancestor 2326c84 origin/main` exits
0, executed before any file was touched, so #59 landed whole. THE BRANCH WAS
RESTARTED FROM MAIN rather than reused: a merged pull request cannot track new
work, and the branch head equalled the merged commit exactly, so nothing was
lost.

SPAWN MODE: subagents available, proven by a tool attempt in the HANDOFF-17
phase of this session. NO FAN-OUT WAS RUN HERE - this handoff executes findings
another round already produced, so the work was the lead's own and the
post-fan-out sweep has nothing to report beyond `git status --porcelain` being
empty at each commit, which it was.

READ LINE BY LINE: `apps/web/src/lib/live-plane.ts` entire;
`apps/gateway/src/views/mempool.ts`'s `flowTextFor`, `migrationFlowText`,
`poolInitial` and the `crossesWithNoPublicSide` block; `leaks.ts`'s `perPoolZat`
sign convention; and the three test files.
```

### THE THREE HIGHS

**R2-1 - the direction, on the third attempt.** HANDOFF-17 first read the pair
off `class` (wrong: the gateway gives that class to any pool crossing with no
public side), then off `lanes` (wrong: `lanes` is a SET built from bundle
presence, so both lanes light either way). **The direction is the SIGN of
`valueFlow.perPoolZat`, and `perPoolZat` never reaches the browser.**
`MempoolRow` carries thirteen fields and `flow` is the only one that survives
the orientation, because `flowTextFor` sends a migration to `migrationFlowText`
which filters positives into `from`, negatives into `to`, and prints
`poolInitial` letters.

So `directionFor` now parses that grammar exactly, requires `flow` and `lanes` to
agree, and falls to the undirected chord for anything else. **This is a coupling
to a display string and the docblock says so** rather than pretending otherwise:
the alternative is guessing, which keeps drawing arcs the row contradicts, or
dropping the directed arc, which would mean the plane never draws the one
crossing relation the document measures. A producer that changes the wording
makes the plane claim LESS, never something false.

**R2-2 - the reconnect that flipped the board.** Reproduced: 300-tx mempool, one
reconnect naming the same 300, **0 of 42 drawn marks survived**. The old arm
minted every entry with a fresh counter value and restored each survivor's true
`seq` one line LATER, so the hold cap ran on numbers that were about to change.
Fixed by placing each entry with its final `seq`, and by placing rows this reader
never watched arrive BELOW the survivors - "we did not see it arrive" cannot
become "it is the newest", which is what let already-evicted transactions
re-enter at the top of the queue. `seq` is no longer advanced by a snapshot at
all; it counts arrivals, and a reconnect is a reconciliation.

**R2-3 - the tank's ceiling printed as the pool's size.** `capped` is about the
DRAWN board; for 3,000 undecodable rows it is `0 > 42`, false, so nothing hedged
"of 250 held". `holdFull` is a second saturation for a second question and the
affordance says which figure it is showing.

### THE FOUR TESTS, AND THE MUTATION TRANSCRIPT (A4)

Each repaired test is driven against the code it protects, reverted:

| mutant | result |
|---|---|
| A14 vs a DEAF tip-bus (`onReset` deleted) | **2 failed** \| 12 passed |
| A15 vs a plane that OPENS a fixture socket (`openInFixture: false` removed) | **1 failed** \| 18 passed |
| survivor-`seq` vs the deleted restoration | **2 failed** \| 43 passed |
| the detach test vs a NON-idempotent detach | **1 failed** \| 13 passed |

And the three product fixes, likewise:

| mutant | result |
|---|---|
| R2-1 direction read from the PAIR again | **1 failed** \| 43 passed |
| R2-2 re-entrants minted as newest | **1 failed** \| 43 passed |
| R2-3 `holdFull` always false | **1 failed** \| 43 passed |

### WRITING A TEST FOUND A FURTHER REAL DEFECT

The double-detach assertion failed on its first run, and **the probe was right
and the code was wrong** - the converse of the case this project usually
records. Round 2 had filed it as a hazard: `onReset` sets `refs = 0` while detach
closures handed out earlier are still live and still un-detached, so one of them
decrements a counter that no longer describes it and drives `refs` NEGATIVE -
after which the next consumer's ordinary detach reaches zero early and tears down
a feed another consumer is using. Reproduced by two consumers attaching, one
detaching, and the other going deaf. A generation counter invalidates the stale
cohort, which is the same idempotence `detached` gives one closure applied to
the whole set.

### ONE OF MY OWN FIXES DOES NOTHING, AND IT IS REPORTED AS SUCH

I made two changes for R2-2 and only one is load-bearing. The other - moving the
eviction out of the placement loop to run once at the end - is **provably
equivalent**, and my comment claimed it was the fix. A mutation restoring the
mid-loop eviction leaves the whole suite green, **including a reconnect driven in
reverse view order**, because evicting the running minimum past a fixed ceiling
is a valid streaming top-K and reaches the same set. **The mutant is not caught
because the mutant is correct.**

That is a fail side that does not fail, which CLAUDE.md makes a finding in its
own right, and the finding here is about the FIX rather than the test: a
restructure that reads like a repair and is not one. It is kept as the clearer
form and the comment now says it is tidiness. **The load-bearing half is the seq
assignment**, and M-R2-2b is what proves it.

Recorded also: the reversed-order test I wrote to try to catch the mid-loop
eviction **also failed to catch it**, for the same reason - there is nothing to
catch. That test is kept, because it independently pins the survivor set against
an adversarial view order, which is a property worth having.

### THE EIGHT GATES

Each read from its own process, never through a pipe or a wrapper (**F-53-1**,
which HANDOFF-17 broke twice in one session), and `build` FIRST (LEDGER-15).

```
BUILD_RC=0  (first)      TEST_RC=0        TYPECHECK_RC=0   LINT_RC=0
CHECK_RC=0  (17 guards)  VALIDATE_RC=0    E2E_RC=0         SKIPGUARD_RC=0
```

- **1,754 passed / 5 skipped**, the same five HANDOFF-17 named. The degraded
  polarity, run first because the container restart had taken the services down,
  was **1,648 / 126** at the same exit code - which is A5's two-polarity
  transcript taken by accident and reported rather than discarded.
- `test:e2e` run with **no other process touching `.next`**, which A6 names as
  its condition after HANDOFF-17's false 37-failure reading came from exactly
  that contention.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`.
