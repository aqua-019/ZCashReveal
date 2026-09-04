---
handoff: 18
title: The round-2 debt - three HIGHs in executable lines, and four assertions that pass against code that is wrong
status: in-progress
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

Filled by the executing session before the PR opens.

## §8 LEDGER

Appended to `handoffs/LEDGER.md`.
