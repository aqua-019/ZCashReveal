# PROMPT-17 - every message that steered this session

One file per handoff, each message verbatim under a heading naming what it is and when it arrived
(Revolution protocol step 5). The first message lands in the same commit as RECONCILE; a message
that arrives mid-session is appended in the next commit (LEDGER-02 Q7).

---

## Message 1 - the kickoff, the L2 RESOLUTION for HANDOFF-16 (PR #58) and the HANDOFF-17 brief

Arrived at session start, 4 September 2026. Verbatim.

````text
Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Stop at PR opened.
**Fork from the head of `main`, and prove it before you touch anything:** `git merge-base --is-ancestor 2b63e1a origin/main` must exit 0 - `2b63e1a` is HANDOFF-16's final write-back and its presence is how you know PR #58 landed whole. If it exits 1, STOP. Record the SHA you forked from in section 7.
---
# L2 RESOLUTION - HANDOFF-16 (PR #58)
**VERDICT: MERGE.** No changes requested. Verified independently on a clean worktree at `2b63e1a`.
## What L2 executed
```
INSTALL_RC=0  BUILD_RC=0  TYPECHECK_RC=0  TEST_RC=0  LINT_RC=0  CHECK_RC=0
1676 passed | 5 skipped        git status --porcelain empty
```
Postgres and Redis up. **BUILD RAN BEFORE TYPECHECK** - L2's own PR-57 lesson applied, and typecheck was clean as a result rather than reporting fifteen phantom errors against a stale `dist`.
## The finding is real and L2 reproduced its whole chain independently
Section 7 reports that a missing `z_gettreestate` does not degrade the confirmed-block driver - **it stalls it forever**. Verified against merged `main` at `f976477`, link by link:
| link | site | verified |
|---|---|---|
| the treestate call sits ABOVE every mutation | `confirmed-block.ts:158` vs appends at `:170-178`, `writeBlock` at `:307` | yes |
| `isFatal` does not catch it | `chain-follower.ts:184` - `ChainRuntimeError \|\| ZCashRevealStateError` only | yes |
| `RpcError` is neither | `packages/zebra-rpc/src/errors.ts:51` extends `ZebraRpcError` | yes |
So the block is never written, the error is never fatal, and the loop re-fetches the same block for ever, **on the first block that appends Ironwood commitments.** L2's own section 1 said the driver "writes the block, logs the notice and records no anchor". It does none of those three. **That was L2's error and it was the row the whole rung was sized on.**
## Three adversarial mutations
| mutation | result |
|---|---|
| `absentTreestateSource` reverted to throwing (the pre-fix driver) | **1 failed** - `Error: [RPC z_gettreestate] Method not found` |
| `planConfirmedFollow` forced to treat every endpoint as unmetered | **8 failed** - `expected 2000 to be 75000` |
| *(first attempt at the above, malformed)* | **reported as a finding, not repaired quietly - see below** |
The second reproduces the six-times-over-budget defect exactly: the raw 2s poll instead of the ceiling-derived 75s.
**AND L2's FIRST ATTEMPT AT THAT MUTATION WAS MALFORMED, WHICH IS REPORTED RATHER THAN SILENTLY REDONE (CLAUDE.md's converse rule).** L2 guessed the function was named `planFollowerPoll`. It is `planConfirmedFollow` at `follower-plan.ts:162`. The edit therefore landed on nothing, vitest ran the stale build, and the probe read **592 passed - a clean green that was evidence of nothing.** Caught by checking the probe before judging the code, which is the exact move F-56-1's operational half prescribes; a session that had read that green as "the ceiling split is not load-bearing" would have filed a false all-clear on the second-most-important fix in this PR.
## The smoke workflow: PROVEN, and L2 confirmed it against GitHub rather than the report
L2 filed this as the fourth face of the gate-list origin and it had **0 successes in 44 runs**. Section 7 claims the fix is proven. Verified by loading the workflow's own run history with `is:success`:
```
1 workflow run result
post-deploy smoke #46: Manually run by aqua-019 - green, 25s
```
**One success, and it is the first in the workflow's life.** `pnpm/action-setup@v5` is at line 74, `setup-node` at line 78 - correctly ordered. The session ran it by `workflow_dispatch` rather than asserting the fix, which is what the addendum asked for. `CLAUDE.md` now names `test:e2e` and `assert-no-skipped-integration`, so all four faces are closed in one edit.
## THE THING THE OPERATOR NEEDS TO KNOW, AND IT RESIZES WHAT COMES NEXT
**Crossings cannot reach the plane without a database.** Verified independently at `chain-inputs.ts:465`: when `queryMigrations === null`, `readSnapshotInputs` returns `{ crossings: [], window: null }`. The indexer accumulating crossings is necessary and **not sufficient** - the publisher is a separate process and builds `migrationHist` from its own Postgres query.
So `INDEXER_CHAIN_STORE=memory` gives a working follower and live pool state and puts **nothing on the plane.** That was not in L2's section 1 and it should have been. `CUTOVER-1.0.md` section 10.1 now states both shapes of the rung in a table rather than implying the one that does not work.
## Ruling on the section 8 questions
**Q1 - is "a documented case with no producer" a guard or a rule? A RULE, and the session's own wording is the right one. ADOPTED as F-58-1: when a docblock names a case, find the caller that produces it before believing the case exists.** `TreestateSource`'s `| null` was inhabited in the type and uninhabited in the wiring for four handoffs, and the compiler cannot see that. L2 agrees a guard is not available: enumerating a type's inhabitants against each caller's ability to construct them is a reachability question, not a grep. **This is LEDGER-15's "a nullable dependency whose null no configuration can produce is not a branch, it is a comment" - the same shape, now with its detection rule.** Recorded as weaker than a guard under clause (b), correctly.
**Q2 - should memory mode exist at all? KEEP IT, and the session's reasoning is right.** Deleting a working mode because its brief expected more of it would be a worse error than shipping it with an honest table. Memory mode runs the follower and the gateway's live views; it does not draw crossings. **Both facts are now in the runbook, which is the whole disposition.** The brief was wrong, not the mode.
**Q5 - the verify phase over a moving tree. THIS IS THE MOST VALUABLE THING IN THIS LEDGER AND L2 CHOOSES THE SECOND RULE.** Twenty-two refuter verdicts all returned `refuted` for one reason - "already fixed at HEAD" - because the lead was committing fixes while the phase ran. **Every verdict was honest and every verdict was evidence about nothing.** That is LEDGER-09b's shape arriving inside a gate's own scheduling: an exhaustive claim over the wrong object, where the object is the tree at a commit.
**ADOPTED as F-58-2: find-and-fix and verify are SEPARATE RUNS, and the fix commit is the second run's subject.** Not the pin-the-commit-and-freeze-the-lead option, for two reasons. First, freezing the lead while a phase runs wastes the lead, and this project's gates already take hours. Second, and decisively, **the stopping rule already says the fix commit earns its own round** - so the separate-runs form is not a new rule at all, it is the rule this project has had since LEDGER-09b, applied to the refuter panel instead of to the lead. Adopting the freeze option would have created a second mechanism for something already mechanised. **A refuter panel that reviews the fix commit is the round; a refuter panel racing the lead is a panel reading a tree that no longer exists.**
## L2's own record on this handoff, stated plainly
Three of section 1's measurements were wrong: the seven-methods claim (it enumerated CLIENT methods, not WIRE methods, and missed `getRawMempoolVerbose`), the 0.8/min confirmed-block cost (it omitted the tip poll that precedes every `getblock`, so the real figure was 30/min against a ceiling of 5), and what a missing `z_gettreestate` costs (it degrades nothing - it stalls the driver). **The first is LEDGER-09b's exhaustive-claim shape, which L2 itself wrote into CLAUDE.md.** The second and third are F-56-1: claims about modules L2 had not read line by line, in a brief, one handoff after L2 ruled that F-56-1 binds briefs as well as probes.
**The pattern across three handoffs is now unambiguous: L2's section 1 tables are the least reliable artefact this project produces, and every session has caught them by execution.** The instruction in section 1 to check them is doing the work the tables should have done themselves. That belongs in the ledger, and section 1 below marks every unverified claim rather than asserting it.
---
# HANDOFF-17 BRIEF
**YOUR HANDOFF DOES NOT EXIST YET. WRITING IT IS DELIVERABLE 0.** Create `handoffs/HANDOFF-17-the-living-tank.md` from sections 1-6 below, `status: in-progress`, track `Web`, `depends_on: 15, 16`, `written_by: L2 (Cowork) - 4 Sep 2026`, `depends_on: 15, 16`. Reconcile the index and set 16 to `closed` if its section 7 STATUS is DONE.
---
**THE OPERATOR HAS ASKED FOR THIS TWICE AND L2 DID NOT SCOPE IT EITHER TIME. THAT IS THE REASON THIS HANDOFF EXISTS AND IT IS RECORDED RATHER THAN GLOSSED.** The instruction was that the turnstile plane - the "fish tank" - must ALWAYS be broadcasting live transactions visually. L2 heard "the data must be real", built three rungs of pipeline for it, and never scoped the surface that pipeline feeds. Rungs 1-3 make the NUMBERS live. **Not one of them makes the TANK move.** The operator checked the deployed site and found a static plane, which is exactly what the code does.
**WHAT IS ACTUALLY ON THE PAGE TODAY, verified by L2 at `f976477`:** `TurnstilePlane.tsx:58` calls `buildPlane(snapshot, ...)` and nothing else. `buildPlane` reads `snapshot.migrationHist`. On the deployed site that value is `MIGRATION_HIST`, a literal at `apps/web/src/lib/api/fixtures/snapshot.ts:51`. **The marks are a hard-coded constant in the bundle.** They cannot move because nothing writes them. The plane has no subscription of any kind.
---
## §1 SCOPE
Make the turnstile plane subscribe to the live transaction stream, so a mark **enters the tank when a transaction arrives and stays until it confirms**.
**THE ENTIRE SEAM ALREADY EXISTS AND THIS IS WIRING, NOT ARCHITECTURE.** L2 read each of these before writing this brief (F-56-1):
| what | where | state |
|---|---|---|
| the live socket client | `apps/web/src/lib/api/stream.ts:123` `subscribeFrames(onFrame, options)` | **built, shipping, returns an unsubscribe** |
| the frames it carries | `packages/zec-types/src/realtime.ts:36-44` - `tx_added` / `tx_removed` / `tip` | **exactly the two events this handoff needs, plus the tip** |
| a working precedent | `apps/web/src/components/track/MempoolPanel.tsx:110-141` - `useEffect` + `subscribeFrames`, switching on `tx_added` and `tx_removed` into `useState` | **a live-subscribing component that already ships** |
| the mark geometry | `apps/web/src/lib/plane.ts` - `PlaneMark`, `project`, `SPLASH_CAMERA`, `PLACEMENT` | **built; marks already carry `age`, `opacity`, `depth`, `arrow`** |
| the renderer | `apps/web/src/components/record/TurnstilePlane.tsx:51` | **built; takes a snapshot and draws** |
**So the work is: give `TurnstilePlane` the same `useEffect` `MempoolPanel` already has, and let arriving transactions add marks instead of a snapshot field deciding them.** `MempoolPanel` is the pattern to copy - read it line by line first, it is 150 lines and it has already solved the socket lifecycle, the fixture fallback and the frame-shape guard.
**THE MOTION THE OPERATOR ASKED FOR, PRECISELY:** a transaction arrives -> a line **enters the tank and stays**, joining the shoal. It confirms (`tx_removed`) -> that line leaves. **The tank's fullness is the real mempool's depth.** Density grows with traffic and thins when the chain is quiet, because that is the truth about the network rather than a decoration.
**AND THE RATE IS THREE TRANSACTIONS A MINUTE ON THE KEYLESS ENDPOINT, MEASURED.** L2 measured the ceiling live on 4 Sep: five requests, then 429, confirmed by the provider's own message. After the two calls each tick spends on the tip and the txid list, that affords roughly **3 tx/min**. **THE OPERATOR HAS CHOSEN TO SHIP ON THAT AND DESIGN FOR MORE.** So: build it honest at 3/min, and **the page states its own rate** rather than letting a sparse tank read as a broken one. The same code must fill the tank the moment a faster endpoint is configured, with no edit.
**AND THIS HANDOFF IS NOW THE ONLY THING THAT PUTS MOTION ON THE PLANE WITHOUT A DATABASE - WHICH RAISES ITS STAKES RATHER THAN LOWERING THEM.** HANDOFF-16 proved by execution that **crossings cannot reach the plane without Postgres**: `chain-inputs.ts:465` returns `{ crossings: [], window: null }` when `queryMigrations` is null, because the publisher is a separate process that builds `migrationHist` from its own query. So on the RPC-only cutover the operator is about to run, rung 3's confirmed crossings draw **nothing**. **The live mempool marks this handoff adds are the only marks that will appear.** Build accordingly: the tank must be legible and honest with zero `migrationHist` marks and only live ones, because that is the configuration the site ships in first.
**Out of scope:** the cutover itself; a new provider account; changing the mempool loop's rate (rung 2 owns it); the confirmed-block plane marks from `migrationHist` (rung 3 owns them, and section 3 says how the two coexist).
## §2 READING - ALL OF IT BEFORE ANY PROBE (F-56-1, and L2 violated this rule twice in three handoffs)
`apps/web/src/components/track/MempoolPanel.tsx` **entire** - it is the precedent and the socket lifecycle is already right in it - then `apps/web/src/lib/api/stream.ts` (`subscribeFrames`, `asFrame`, the fixture path), `packages/zec-types/src/realtime.ts` (the frame union and `LeakReport`), `apps/web/src/lib/plane.ts` **entire, 492 lines** (`buildPlane`, `PlaneMark`, `project`, `trafficByLane`, `SPLASH_N_MAX`), `apps/web/src/components/record/TurnstilePlane.tsx` **entire**, and `apps/web/src/lib/api/tip-bus.ts`. Say in section 7 which you read line by line.
## §3 CONTRACT
- **A SPARSE TANK IS THE TRUTH AND MUST NEVER BE PADDED.** At 3 tx/min the tank is nearly empty and that is a correct rendering of a metered endpoint. **No synthetic marks, no decorative motion, no ambient drift that a reader could mistake for a transaction.** This project's entire subject is a site that says what it knows; a fabricated fish is the one defect that would make the whole page a lie. The existing ambience seeded by the tip hash stays as it is and stays visually distinct from a mark.
- **THE PAGE STATES ITS OWN RATE.** A reader seeing four fish must be able to learn, on the page, that the endpoint affords three a minute - so a quiet tank reads as a metered feed and never as a broken one. This is the absence-versus-zero rule (`chain-inputs.ts:42`) applied to motion: **an empty tank means "few transactions reached us", never "no transactions exist", and the difference must be legible.**
- **A DISCONNECTED SOCKET IS A NAMED STATE.** `MempoolPanel` already tracks `SocketState`; the plane does the same. A frozen tank with no indicator is this project's recurring shape - a stale surface that renders and reports no fault - in its most visible possible form.
- **THE TWO MARK SOURCES DO NOT FIGHT.** `migrationHist` marks (rung 3, confirmed ZIP 318 crossings) and live mempool marks (this handoff, unconfirmed) are DIFFERENT CLAIMS and must be visually distinguishable. A reader must never think an unconfirmed transaction is a settled crossing. Say in section 8 how you distinguished them.
- **`SPLASH_N_MAX = 42` IS A CEILING, NOT A TARGET.** `plane.ts:130`. If the mempool exceeds it the tank caps and the reading says `capped` - which `PlaneReading` already carries. Never draw 42 fish because 42 looks good.
- **REDUCED MOTION IS HONOURED.** CLAUDE.md: do not construct animation systems against it. At `prefers-reduced-motion` the marks appear and persist without travel animation - the same information, no swimming.
- No emoji. The PR stops at **opened**.
## §4 DELIVERABLES
1. **`TurnstilePlane` subscribes.** A `useEffect` calling `subscribeFrames`, on `MempoolPanel`'s pattern, with the unsubscribe returned and the component safe to mount twice (React strict mode double-invokes; `MempoolPanel` already handles it - copy what it does).
2. **`tx_added` puts a mark in the tank and it STAYS.** The mark is derived from the report's own lanes, so a transparent-to-orchard transaction draws that crossing and not a generic one. It persists until removed.
3. **`tx_removed` takes that mark out** - the transaction confirmed, so it leaves the shoal. Keyed by txid, so a removal cannot evict the wrong mark and a duplicate `tx_added` cannot double-draw one.
4. **Entry animation, and reduced-motion honoured.** A mark arrives by swimming in along its crossing path - the geometry `project` already gives you - then holds. Under `prefers-reduced-motion` it simply appears.
5. **The rate and socket state are on the page.** The affordance says what the feed is doing: connected or not, how many transactions the endpoint affords per minute, and how many marks are unconfirmed versus confirmed. Reuse rung 2's drain state - `ceilingPerMinute` and `txPerMinute` are already published in `MempoolDrainState` and already read by the gateway.
6. **`docs/2.0/RUNTIME.md` gains "the living plane"** - what feeds it, what a reader sees at 3/min versus at a provider rate, and the sentence that a sparse tank is a metered feed rather than a fault.
## §5 ASSERTIONS - each needs both polarities
- **A1.** A `tx_added` frame adds exactly one mark and it is still present on the next render. *Fail side by DATA: the same frame with a txid already in the set adds NOTHING - assert the count does not move, because a double-draw on a re-delivered frame is the defect a keyed set exists to prevent.*
- **A2.** A `tx_removed` frame removes the mark with that txid and no other. *Fail side by DATA: a `tx_removed` for a txid never added leaves the set unchanged and does not throw.*
- **A3.** The tank's mark count equals the number of unconfirmed transactions held, up to `SPLASH_N_MAX`, and the reading says `capped` beyond it. *Fail side: drive 50 additions and assert 42 marks AND `capped: true` - never 50 marks and never a silent 42.*
- **A4.** **NOTHING DRAWS A MARK EXCEPT A FRAME.** *Fail side by DATA, and this is the assertion the whole contract rests on: mount the plane, deliver ZERO frames, advance timers, and assert the mark count is exactly 0 - no ambient fish, no seeded shoal, no decorative motion counted as a transaction.*
- **A5.** At `prefers-reduced-motion: reduce` the marks are present with no travel animation. *Both polarities in one test: the same frames with the query false animate, with it true do not.*
- **A6.** A socket that never connects renders a NAMED disconnected state, not an empty tank that looks calm. *Fail side: a connected socket with zero transactions renders the empty tank WITHOUT the fault text - the two empties must read differently.*
- **A7.** Live mempool marks are visually distinguishable from `migrationHist` crossing marks in the same tank, **and the tank is correct with ZERO of the latter** - the RPC-only shape HANDOFF-16 measured, and the one the first cutover ships. *Fail side by DATA: a snapshot carrying counted crossings AND a live frame - assert the two are separable in the DOM, because a reader who cannot tell them apart is being told an unconfirmed transaction settled.*
- **A8.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe (**F-53-1**), **with `build` run BEFORE `typecheck`** (L2's harness reported fifteen phantom errors on PR #57 by running build last), and the passed AND skipped counts both stated with every skip named.
- **A9.** `pnpm --filter @zcashreveal/web test:e2e` RUN AND REPORTED. It is on the gate list as of HANDOFF-16 deliverable 1b. This handoff changes what a page draws over time, which is exactly what that suite is for.
## §6 DISPATCH HINTS
Small and mostly wiring. One worker on the subscription and the keyed mark set, one on the entry animation and reduced motion, one on the rate and socket affordance. **The adversarial question throughout, and it is the only one that matters here: *can anything put a fish in this tank that is not a real transaction?*** Every decorative flourish is a candidate defect. A4 is the assertion to write first and the one to try hardest to break.
---
**L2's note, and it belongs in section 8.** This handoff exists because a brief can be complete about a pipeline and silent about the thing the pipeline was for. Three rungs shipped, every gate green, every figure verified live - and the surface the operator actually looks at never moved, because no section 1 in three handoffs said it should. **The rule that would have caught it is not a testing rule; it is that a deliverable is written from what a reader will SEE, and the data path is how it gets there.** Consider whether that belongs in CLAUDE.md and say so in section 8.
````
