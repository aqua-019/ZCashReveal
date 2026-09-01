---
handoff: 12
title: 7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path
status: in-progress
branch: the session-designated branch (name it `feat/v2-12-runtime-poolstate` if you may choose)
track: Integration
depends_on: 06, 07, 08
written_by: L2 (Cowork) · 22 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-12 — 7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path

> **L3 protocol.** The lead owns this handoff and the gate. Directors report spawn mode as their first output (proven by tool attempt). Workers return on the status ladder (`DONE` / `DONE-WITH-ASSUMPTIONS` / `BLOCKED` / `OUT-OF-DEPTH`) with FILES · EVIDENCE · ASSUMPTIONS · NOTICED · UNVERIFIED. Every §5 assertion needs a two-polarity transcript. The gate is capped at 3 rounds; `NOT CONVERGING` escalates to the operator. The PR stops at **opened**.

## §1 SCOPE

Make the live indexer maintain `PoolState` for all four pools from chain data (replay on startup, confirmed-block driver, persistence writes) and attach assessments to every spend and link on the live path.

**Out of scope:** No UI. No new estimators.

## §2 READING (state before you start)

- `CLAUDE.md` (2.0 conventions + the stack contracts)
- `docs/2.0/ZECREVEAL-2.0-PLAN.md` (§§1–6, 9, 10)
- `docs/2.0/TRACKING-MATH.md`
- `handoffs/LEDGER.md` (§8 entries from every shipped handoff — read before planning)
- `docs/2.0/HANDOFF-2026-08-22-v2.md` (7B/7C items), plan §5 Phase 3, `apps/indexer/src/index.ts`, `state/pool-state.ts`, `persistence/replay.ts`, `analysis/assessment.ts`, the gateway's channel subscriptions
- **THE IRONWOOD ANCHOR IS NOT ON `getblock`, AND THIS HANDOFF IS WHERE THAT COSTS SOMETHING** (LEDGER-07 Q5, fold 5). Read `apps/indexer/src/decoder/block-decoder.ts`'s `ironwoodTreeSize` and `ironwoodAnchorPendingTreestate`, and `packages/zebra-rpc/src/schemas.ts`'s note where a `finalironwoodroot` used to be declared. Zebra defines `finalsaplingroot` and `finalorchardroot` on the verbose block and **no Ironwood root under any spelling** (`zebra-rpc/src/methods.rs` on `main`). What `getblock` carries is a SIZE - `GetBlockTrees.ironwood: IronwoodTrees { size: u64 }`, ZcashFoundation/zebra PR #10888, merged 2 Jul 2026 - which is an anchor's `maxPosition` and not its root. The root is on **`z_gettreestate`**, and **`z_getsubtreesbyindex`** accepts `pool = "ironwood"`; Zebra 6.0.0 (10 Jul 2026) names those three RPCs as the Ironwood tree surface. So Sapling and Orchard anchors come out of the block and Ironwood's needs a second call, and A1's Ironwood arm cannot be satisfied without it.

## §3 CONTRACT

- TypeScript strict per `tsconfig.base.json`; ESM; `bigint` for zatoshi, `number` for heights/counts; lowercase hex without `0x`; branded `Hex` validated at the RPC boundary.
- SVG icons only. **No emoji anywhere** — code, copy, commit messages, PR bodies, transcripts.
- No identity claims from chain data. Never render a shielded balance without a viewing key (Mode A, client-side only). Every Record claim carries `sources[]`, `confidence`, `lastVerified`.
- Design: ZEC gold `#F4B728` is a budgeted accent; one hover verb (dim); one curve `cubic-bezier(.32,.72,0,1)`; reduced motion honoured by not constructing the animation system; `Math.random` banned (FNV-1a → mulberry32 from a chain seed).
- The PR stops at **opened**. No merge, no deploy, no production promotion by any agent at any tier.
- Provenance on every claim in §7: Executed (output shown) / Read (file + commit cited) / UNVERIFIED (labelled). Stale or fabricated claims are a gate failure.
- `replayInto` runs before `zmq.start()`; `onConfirmedBlock` decodes → appends state → writes persistence → writes a `pool_snapshots` row; `AnalyzeContext` carries `chainState`; per-spend `assessRaw`; per-link `assessFiltered` with `timeWindowFilter` + `amountMatchFilter` + the HANDOFF-08 echo/posterior modules.
- The orphan `zcashreveal:links` channel is either subscribed by the gateway (and rendered) or removed — decide and record the reason in §8.
- Reorg: rollback to `h_split` then replay; a property test covers it.

## §4 DELIVERABLES

1. Runtime wiring, reorg handling, tests; `docs/2.0/RUNTIME.md` describing startup, replay cost, and failure modes.
2. **The Ironwood anchor path, via `z_gettreestate`** (LEDGER-07 fold 5). `packages/zebra-rpc` gains a typed, zod-validated `z_gettreestate` call (and `z_getsubtreesbyindex` if the subtree path is needed), and the confirmed-block driver calls it at exactly the heights `decodeBlock` marks `ironwoodAnchorPendingTreestate` - not on every block, which would double the RPC load for a pool that most blocks do not move. The `Anchor<"ironwood">` it records takes its `root` from that response and its `maxPosition` from the block's own `ironwoodTreeSize - 1n`, so the two halves are cross-checked rather than both taken on trust. §5 wants an assertion in both polarities: a block that appended Ironwood commitments produces an Ironwood anchor whose `maxPosition` equals the block's reported tree size minus one *(fail side: withhold the treestate response and observe no anchor and a logged finding, never a fabricated root)*.
3. **`decodeBlock`'s own record of the gap stops being needed, or says why it still is.** If deliverable 2 lands, `ironwoodAnchorPendingTreestate` becomes an internal scheduling signal rather than a reported absence; say in §7 which it is. Do not delete `ironwoodTreeSize`: it is the only Ironwood measurement `getblock` carries and it is what makes the cross-check above possible.

## §5 ASSERTIONS — binary, machine-checkable, each needs a pass-state and a fail-state transcript

> **RECONCILED AGAINST THE TREE AT `4515825` BEFORE ANY WIRING, WHICH IS DELIVERABLE 0.** This
> handoff was written on 22 August and HANDOFF-11 has shipped 125 files since. Each assertion below
> carries its original wording and, where the tree moved under it, the restatement and the
> measurement that forced it. L2 reconnoitred four of the five and its results are in `LEDGER.md`
> under the HANDOFF-11 resolution; every one was re-measured here, and A1's restatement is still not
> executable for a reason L2's reconnaissance did not reach.
>
> **Every assertion below states its EXCLUSION SET and names which member its fail side uses**, per
> LEDGER-09a Q2 and the amended format `check-ledger-structure.mjs` R4 enforces. R4 checks the
> clause is PRESENT and cannot check that it is CORRECT; A5's member is the tree's CURRENT state,
> which is the LEDGER-11 Q5(a) case of an exclusion-set member the shipped object already
> exhibits - so A5 is a defect being closed, not a test being written, and it is labelled as one.

- **A1.** RESTATED, AND THE RESTATEMENT NEEDS A CODE CHANGE L2 DID NOT SEE.
  *Original:* "replaying a 1,000-block fixture range reproduces per-pool balances equal to the
  fixture's reference values (source cited) within 0 zat for Sapling/Orchard/Ironwood."
  *Why it is not executable:* no 1,000-block fixture exists and none can - a verbosity-2 block runs
  90 KB to 2.4 MB, so a thousand are tens to hundreds of megabytes. **But the reference value is in
  every block, from the node.** A verbosity-2 `getblock` carries `valuePools[]` with `chainValueZat`
  (cumulative) and `valueDeltaZat` (this block's signed delta) per pool.
  *Restated:* a replay's computed per-pool deltas equal the block's own `valueDeltaZat`, and its
  cumulative balances equal `chainValueZat`, over however many captured blocks exist. Node-sourced
  rather than an explorer's figures; fail side is a data mutation (alter one delta by one zat).
  *Measured here, Executed:* the six deltas sum to **156,250,000 zat** - 1.5625 ZEC, the block
  subsidy - on BOTH committed captures, exactly. **And the sum balances only because the LOCKBOX
  entry is included:** dropping to `LedgerLane`'s five site lanes breaks it by exactly 18,750,000 on
  both blocks, so a conservation check written over the five lanes rather than the six wire entries
  will not balance. `valuePools` carries six entries and `schemas.ts` says so correctly - do not
  "fix" that.
  **THE BLOCKER, WHICH IS THIS HANDOFF'S FIRST CODE CHANGE:** `rpcBlockSchema` parses `valuePools`
  and `chainSupply` (`schemas.ts:587-588`), but the `RpcBlock` INTERFACE the decoder consumes
  (`types.ts:48-79`) declares neither, and `asRpcBlock` (`client.ts:370-404`) builds an explicit
  object literal that forwards `trees` and not `valuePools`. Measured: `rpc.getBlock()` strips both.
  So the reference value exists in the capture files and **not in what the indexer receives**, and
  A1 is unreachable until `asRpcBlock` forwards it. Nothing in the tree reads `valueDeltaZat` today.
  *Precondition on the narrower fee claim, because L2 got this wrong first:* in 3,432,130 the
  orchard and ironwood deltas differ by 15,000 and that IS the crossing's fee, but only because
  exactly ONE transaction touches those pools. In 3,441,955 two do and the same subtraction gives
  -264,225,000, a net of unrelated movements. Both measured. Assert the precondition or drop the claim.
  *Exclusion set:* replays whose computed per-pool delta differs from the block's own `valueDeltaZat` by any non-zero amount, and cumulative balances unequal to `chainValueZat`.
  *Fail side names:* a committed capture with ONE pool's `valueDeltaZat` altered by 1 zat - drawn from inside the set, since a 1-zat divergence is exactly what the predicate rejects.
- **A2.** SOUND AS WRITTEN. A test asserts `replayInto` resolves before `zmq.start()` is called
  (spy order). *Verified:* `zmq.start()` is at `apps/indexer/src/index.ts:95` with a poll-loop
  fallback at `:99`, both line numbers exact; `replayInto` is at `persistence/replay.ts:36` and
  `index.ts` imports neither it nor any `state/` module, so this is an assertion about code this
  handoff writes rather than a stale regression check. The only pre-ZMQ await is
  `getBlockchainInfo()` at `:58`, which is the single insertion point.
  *Note for the executor:* `replayInto`'s only existing callers are two integration test files, both
  behind `describe.skipIf(!reachable)` on Postgres. A2's spy-order test must NOT be written into
  that gate or it passes vacuously on a runner without a database.
  *Exclusion set:* startup orderings in which `zmq.start()` is observed before `replayInto` has resolved.
  *Fail side names:* a startup that awaits `zmq.start()` first, with the spy recording the inverted order.
- **A3.** SOUND, WITH ONE NAME THAT DOES NOT EXIST AND ONE SEAM THAT WOULD BREAK IT.
  `assessRaw` (`analysis/assessment.ts:63`) and `assessFiltered` (`:87`) are both present at exactly
  those lines. `SpendAnnotation.assessment?: ClaimAssessment` ALREADY EXISTS and is already optional
  (`leaks.ts:76`), as does `LinkRecord.assessment` (`:293`), so A3 needs population and no type
  change. `AnalyzeContext` (`decoder/leak-analyzer.ts:46-103`) has no `chainState` member yet.
  **`UNKNOWN_ANCHOR` EXISTS NOWHERE IN THE TREE** - its only occurrence is A3's own sentence - and
  the handoff does not say whether it is a `FindingCode` union member (surfaced on `report.findings[]`,
  and then `check-audit-consumers.mjs` applies) or a bare log string. That choice decides whether
  A3's fail side is observable in the report or only on stdout, which is what "both polarities
  tested" turns on. `SpendAnnotation.anchorHeight: number | null` already carries a null-anchor
  signal the new constant should agree with rather than duplicate.
  **AND THE ANSWER TO L2'S QUESTION ABOUT `reviveWireZatoshi` IS YES, MATERIALLY.** The indexer's
  `serializeReport` (`index.ts:192-196`) stringifies EVERY bigint regardless of key;
  `reviveWireZatoshi` (`realtime.ts:79-99`) revives only keys matching `/Zat$/`. `ClaimAssessment`
  carries `rawCount`, `effectiveSetSize` and, per `FilterApplication`, `countIn` and `countOut` -
  four bigints, none `Zat`-suffixed. Executed through the real serialiser and the real reviver:
  **four of five fields came back `string` where the declared type says `bigint`**, and the `as T`
  cast means the compiler never objects. This is the FOURTH instance of the seam shape fold 6 names,
  and unlike the first three it is not in the tree yet - A3's wiring is what would ship it. A3 is
  therefore not complete without making that round trip symmetric, and the test for it must take the
  producer's actual output rather than build its own.
  *Exclusion set:* `LeakReport`s on the live path carrying a KNOWN anchor and `assessment: undefined`, and assessments whose bigint fields arrive at the gateway as strings.
  *Fail side names:* a report put through the real `serializeReport` and the real `reviveWireZatoshi` whose `assessment.rawCount` comes back `string` - the member measured live in this reconcile, four fields of five.
- **A4.** SOUND, WITH ONE NAME CORRECTED. A simulated 3-block reorg leaves `PoolState` equal to a
  fresh replay of the new branch (property test, at least 100 runs). *Verified:* `fast-check ^4.8.0`
  is a dependency of `apps/indexer`; `pool-state.test.ts:116` is the style model in the same
  subsystem. Rollback exists ONLY at the persistence layer - `rollbackAllToHeight`
  (`persistence/replay.ts:88`) plus six per-table deleters - and is called from **nothing in
  production**: `index.ts` mentions no rollback, no replay and no `PoolState`. **`h_split` appears
  nowhere in source**; it exists only in this handoff's own §3, so it is this document's vocabulary
  and not an identifier to grep for.
  *And per CLAUDE.md's property-test rule, the named worked case this assertion carries:* a 3-block
  reorg from height H to H-3 followed by re-applying a competing branch must leave every pool's
  commitment count, nullifier set and value balance equal to a fresh `replayInto` of that branch -
  `numRuns` is a budget, not evidence, and the aggregate is what the property quantifies over.
  *Exclusion set:* post-reorg `PoolState`s unequal to a fresh replay of the new branch in any pool's commitment count, nullifier set or value balance.
  *Fail side names:* a 3-block reorg in which rollback omits one pool's boundary flows, so the value balance survives a height that was rolled back.
- **A5.** LIVE, AND CONFIRMED IN EVERY PARTICULAR. `zcashreveal:links` is either present in the
  gateway's subscription list and covered by a WS test, or absent from both indexer and gateway
  (`grep` in both apps agrees). *Verified:* `apps/indexer/src/index.ts:146` publishes to that
  literal, guarded by `if (newLinks.length > 0)` at `:140`; `apps/gateway/src/server.ts:140`
  subscribes to `REDIS_CHANNELS.mempool` and `REDIS_CHANNELS.tip` only, and `REDIS_CHANNELS` declares
  no `links` key at all. A producer publishing to a string no constant names and no process reads -
  the WS-envelope defect with the consumer removed entirely, and the fourth instance of fold 6's
  shape by a different route. Decide it and record the reason in §8.
  *Exclusion set:* trees in which one app names the channel and the other does not.
  *Fail side names:* the tree as it stands at `4515825`, where `index.ts:146` publishes to `zcashreveal:links` and `REDIS_CHANNELS` declares no `links` key - the exclusion set's member is the CURRENT STATE, which is why this assertion is a defect being closed rather than a test being written.

## §6 DISPATCH HINTS (director-build decides; these are L2's routing suggestions)

- `chain-integrator` (Sonnet) implements; `test-engineer` (Haiku) after PREFLIGHT (re-dispatch after any gate FAIL is a PREFLIGHT trigger too).
- director-quality: `security-auditor` reviews the ZMQ/RPC failure paths; `devops-deployer` measures replay time and records it in §7.

## §7 REPORT — written by L3 before the PR opens (docs-scribe keeps it)

```
STATUS: PARTIAL - DELIVERABLE 0 AND FOLDS 1-10 DONE; §4 DELIVERABLES 1-3 NOT DELIVERED.

  Stated as a split rather than as one word because one word would be false either
  way. Everything the L2 RESOLUTION asked for is landed and driven. The handoff's
  own §4 - the runtime wiring, the reorg path and the Ironwood anchor via
  z_gettreestate - is NOT built, beyond removing the blocker that made A1
  unreachable. L2's scope note anticipated exactly this and prescribed the
  ordering used here: "land folds 1-10 and the §4 runtime work in separate
  commits in that order, so a partial branch still carries the closed findings."
  The reason is budget, not a technical block: a verifier died mid-run on the
  account's weekly usage limit (recorded under GATE ROUNDS), and the remaining
  headroom was spent on the reconcile and the folds rather than started on a
  runtime rewrite that could not have been finished or gated.

BRANCH / PR: claude/handoff-12-poolstate-reconcile-oyhra0 - PR opened as draft, stops there.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  Spawn mode: MULTI-AGENT, PROVEN BEFORE ANY WORK. An `Explore` subagent was
  dispatched as the first action and returned live `git log` output plus SPAWN-OK.
  The lead ran the handoff directly rather than through directors: this session's
  work is a reconcile plus ten mechanical folds, each needing measurement against
  one tree, and a director layer over that adds handoffs between agents without
  adding reach. One fan-out was used where breadth paid - eight read-only
  verifiers over the eight claim clusters of L2's reconnaissance:
    verify:f49-2-tsconfig · verify:f49-1-skipguard · verify:q3-compose-tag
    verify:q4-revalidate · verify:a1-a2-poolstate · verify:a3-a4-a5-live-path
    verify:fold8-fixtures · verify:fold9-guard-style (DIED - weekly usage limit)
  POST-FAN-OUT SWEEP: `git status --porcelain` run after the fan-out returned and
  before the next commit, per CLAUDE.md. It showed five paths, all intended
  (RUNBOOK-VPS.md, package.json, the two captures, the capture guard). NO stray
  write by any of the eight read-only workers. Reported because the rule requires
  the sweep to be reported whether or not it found anything.

FILES (created / modified / moved):
  created  scripts/check-capture-consistency.mjs          (fifteenth guard)
  created  scripts/check-compose-zebra-tag.mjs            (sixteenth guard)
  created  apps/indexer/test/fixtures/blocks/mainnet-3432130-000000.json  (cp, cmp-verified)
  created  apps/indexer/test/fixtures/blocks/mainnet-3441955-000000.json  (cp, cmp-verified)
  created  apps/indexer/src/decoder/__tests__/value-pools-conservation.test.ts
  created  handoffs/prompts/PROMPT-12.md
  modified packages/zebra-rpc/src/types.ts, client.ts     (valuePools forwarded)
  modified .github/workflows/ci.yml                       (zebra-rpc JSON report; step order; two guards)
  modified scripts/assert-no-skipped-integration.mjs      (A11 added, mainnet-fixture entry removed)
  modified .gitignore, package.json
  modified apps/web/src/app/page.tsx, pools/page.tsx, components/ambience/BlockArrival.tsx
  modified docs/2.0/SNAPSHOT.md, docs/2.0/RUNBOOK-VPS.md
  modified CLAUDE.md
  modified handoffs/{README,LEDGER,LOG,HANDOFF-11,HANDOFF-12,HANDOFF-13}.md

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):

  A1 - RESTATED, AND PARTLY DELIVERED. Executed.
    The restatement is recorded in §5 above with the reason, per L2's instruction
    not to quietly satisfy the old wording. What is delivered is the BLOCKER's
    removal plus the conservation law over both captures; what is NOT delivered
    is a replay comparing computed deltas against them, because the replay driver
    is §4 work.
    PASS  8 passed - valuePools survives `rpc.getBlock()` on both captures, all
          six entries in order, chainValueZat and valueDeltaZat both bigint; the
          six deltas sum to 156,250,000 zat on both, exactly the subsidy.
    FAIL  forwarding reverted to the state at 4515825 -> 8 failed, first message
          "valuePools was dropped at the client boundary: expected undefined to
          be defined". This is the pre-fix tree, so the fail side is the defect
          itself rather than a synthetic break.
    FAIL SIDE, BY DATA, from inside the stated exclusion set: one pool's
          `valueDeltaZat` altered by ONE zatoshi - the smallest member - and the
          sum moves by exactly one. Asserted in the suite, not just run once.
    AND THE LOCKBOX PRECISION, pinned as its own test: the sum balances only over
          the SIX wire entries; over `LedgerLane`'s five it is short by exactly
          the lockbox delta, 18,750,000, on both captures.
    L2's narrower fee claim, checked: in 3,432,130 orchard -5,015,000 and
          ironwood +5,000,000 differ by 15,000 and that IS the crossing's fee,
          because exactly ONE transaction touches those pools. In 3,441,955 TWO
          do and the same subtraction gives -264,225,000, which is not a fee.
          Both Executed. The precondition is real and is recorded in §5.

  A2 - NOT DELIVERED. The assertion is sound and was verified as being about code
    this handoff writes: `zmq.start()` at index.ts:95, poll fallback at :99,
    `replayInto` at replay.ts:36, and index.ts imports neither it nor any state/
    module. Read. No spy-order test exists because no replay call exists to order.
    Recorded for the next session: replayInto's only callers are two
    Postgres-gated integration files, so A2's test must NOT live in that gate or
    it passes vacuously on a runner without a database.

  A3 - NOT DELIVERED, AND ONE DEFECT IT WOULD HAVE SHIPPED IS ALREADY CLOSED IN
    THE RECORD. Executed.
    `assessRaw`/`assessFiltered` present at :63/:87; `SpendAnnotation.assessment`
    and `LinkRecord.assessment` already exist and are already optional, so A3
    needs population and no type change; `AnalyzeContext` has no chainState.
    `UNKNOWN_ANCHOR` EXISTS NOWHERE - its only occurrence in the tree is A3's own
    sentence - and the handoff does not say whether it is a FindingCode or a log
    string, which decides whether A3's fail side is observable at all.
    THE SEAM, MEASURED BEFORE THE CODE WAS WRITTEN: the indexer's
    `serializeReport` stringifies EVERY bigint by value; `reviveWireZatoshi`
    revives only keys matching /Zat$/; `ClaimAssessment` carries rawCount,
    effectiveSetSize, countIn and countOut - four bigints, none Zat-suffixed. Run
    through the real serialiser and the real reviver:
        spend.valueZat                     string(5000000) -> bigint(5000000)
        spend.assessment.rawCount          string(1234)    -> string(1234)
        spend.assessment.effectiveSetSize  string(57)      -> string(57)
        appliedFilters[0].countIn          string(1234)    -> string(1234)
        appliedFilters[0].countOut         string(57)      -> string(57)
        ROUND TRIP BROKEN on 4 of 5 fields; the declared type says bigint on
        every one, and the `as T` cast means the compiler never objects.
    A3 is therefore not complete without making that round trip symmetric. The
    instrument that found it is fold 6's own, pointed at code that does not exist
    yet, which is the first time on this project that shape has been caught
    BEFORE it shipped rather than one commit after.

  A4 - NOT DELIVERED. fast-check ^4.8.0 is available to apps/indexer;
    pool-state.test.ts:116 is the style model. Rollback exists only at the
    persistence layer - rollbackAllToHeight at replay.ts:88 plus six per-table
    deleters - and is called from NOTHING in production. `h_split` appears
    nowhere in source; it is this handoff's own vocabulary. Read. §5 now carries
    the named worked case the property-test rule requires.

  A5 - DECIDED, NOT YET EXECUTED. Read, every particular confirmed:
    index.ts:146 publishes to the literal "zcashreveal:links" under
    `if (newLinks.length > 0)` at :140; server.ts:140 subscribes to
    REDIS_CHANNELS.mempool and .tip only; REDIS_CHANNELS declares no links key.
    A producer with no consumer. The decision and its reason are in §8.

  THE TWO GUARDS, BOTH DRIVEN RATHER THAN TRUSTED. Executed.
    check-capture-consistency.mjs, adopted from L2's Appendix A and then
    strengthened - see NOTICED for what driving it found. Ten mutations, every
    one caught by name.
    check-compose-zebra-tag.mjs, written to Q3's specification. Ten mutations,
    every one caught by name, and two of them only after the guard was changed:
    see NOTICED.

  FOLD 2, both polarities, Executed against reports generated by CI's own commands:
    report wired in, A11 not yet allowed -> rc=1 naming the A11 fullName verbatim
    A11 allowed                          -> rc=0, 605 tests, 3 allowed skips
    mainnet entry removed, captures present -> rc=0
    mainnet entry removed, captures ABSENT  -> rc=1 naming the decodeBlock test,
      which is what makes the captures load-bearing rather than optional.

  FOLD 8, the fixture polarities, Executed and matching L2's figures exactly:
    no captures  -> 10 passed | 1 skipped     (the state of main)
    one capture  -> 11 passed
    two captures -> 11 passed
    Confirming L2's point that the suite count CANNOT tell one capture from two.
    The capture guard is the only thing that reports the count.
    Full indexer suite with a reachable Postgres: 457 passed / 0 skipped.

  THE SIX GATES, Executed:
    TEST_RC=0  TYPECHECK_RC=0  LINT_RC=0  VALIDATE_RC=0  CHECK_RC=0  BUILD_RC=0
    `pnpm check` is sixteen guards. `pnpm build` left `git status --porcelain`
    carrying only this branch's own files - which is F-49-2's premise measured
    from the other direction.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):
  CORRECTED  "the captures are deliberately NOT already on main". They ARE on
    main, at docs/2.0/capture/, placed by three web-UI commits on top of the PR
    #49 merge - so main is 4515825, not fa696a6. The PREMISE BEHIND the sentence
    holds and that is what mattered: they landed in the STAGING directory, not in
    the fixture glob, so block-decoder.test.ts's one test is still skipped on
    main and moving them is this PR's work.
  CORRECTED  L2's capture sizes, "87.6 KB and 169.0 KB". On disk they are 94,593
    and 181,354 bytes (92.4 and 177.1 KiB). L2's figures are exactly the MINIFIED
    sizes in KiB; the committed files are pretty-printed. Immaterial to the
    arithmetic, but the "90 KB-2.4 MB per block" cost estimate that drives the
    "a thousand blocks is tens to hundreds of megabytes" argument is built on the
    compact figure, so the real cost of a fixture range is higher than stated.
  CORRECTED  L2's fold-8 line "10 tx sap 4 orch 2 iron 6" for 3,441,955. Measured:
    2 vShieldedOutput and 2 vShieldedSpend, not 4 outputs. "sap N" is L2's total
    of sapling shielded ELEMENTS. This matters because the capture guard's
    sapling delta arm compares the tree size against OUTPUTS only - correctly,
    since the note-commitment tree grows by outputs - so a reader taking "sap 4"
    as the expected delta would think the guard was broken.
  CORRECTED  Two of L2's five capture-guard polarity transcripts do not reproduce
    from the repository. See NOTICED.
  ACCEPTED   L2's line numbers ci.yml:300 and ci.yml:327, the A11 fullName
    character for character, the F-49-2 measurement, and every particular of A5.
    All re-measured here; all exact.
  ACCEPTED   "correct LEDGER-11 Q2 in place" read as "at the ledger, against Q2
    by name" rather than as a rewrite, on the project's own two precedents
    (75fd8b0's message, LEDGER-04 Q6). Recorded in the ledger block itself.
  DEFERRED   Committing the two predecessor blocks to make the guard's trees
    delta arm reproducible. No session can fetch them; goes to §8.
  DEFERRED   Raising SNAPSHOT_TTL_MS to 120,000 to restore the equality fold 4
    broke. A staleness trade, so the operator's; goes to §8.

NOTICED (outside scope, or found by driving something rather than reading it):
  THE THREE DEFECTS IN L2'S APPENDIX A, all found by executing it.
    (1) Its self-test drove TWO of the guard's SEVEN finding arms. nTx, per-tx
        blockhash, per-tx height, the best-chain flag and previousblockhash had
        no fail side at all - the LEDGER-09a Q3 shape, a self-test that
        under-covers its own rule.
    (2) `merkleRoot([])` throws out of Buffer.from, so ONE malformed capture took
        the whole run down with a stack trace instead of naming the file, and the
        captures after it were never examined. A crash is a fourth outcome the
        guard's own header says it does not have.
    (3) Its docblock said the self-test "drives a known block" and the self-test
        built its blocks with `merkleroot: merkleRoot(txids)` - the function
        checking itself. Measured: reversing the byte order AND replacing the
        odd-row duplication BOTH left the self-test green; only the committed
        captures caught them, so a tree with no captures would have shipped
        either. A sentence making a checkable claim about runtime behaviour,
        checked by executing it, and false - stopping-rule clause (c).
    All three fixed: arms are data and the self-test iterates them, coverage is
    checked in BOTH directions over checkOne's own source, and a known-answer
    vector (block 3,432,130's five txids and its node-reported root) pins the
    conventions with no fixture present.
  TWO OF L2'S FIVE POLARITY TRANSCRIPTS DO NOT REPRODUCE, and its own note four
    paragraphs later refutes them - the F-49-2 shape again.
      claimed: both blocks present -> "2 capture(s) ... 3 delta(s) checked", 1 NOT RUN
      measured: "2 capture(s) ... 0 delta(s) checked", 2 NOT RUN
    The two committed captures are 9,825 blocks apart, so NEITHER has its
    predecessor and the delta arm cannot run for either. Rows 1 and 4 were both
    taken in a directory containing height 3,432,129. Row 4's MESSAGE reproduces
    byte for byte against a derived predecessor, but that derivation computes
    13,639 as 13,640 minus the block's own one action - the same arithmetic L2
    used - so it corroborates the guard, not L2's reading of a block this
    repository does not hold. Rows 2, 3 and 5 reproduce exactly.
  A THIRD CI EDIT WAS NECESSARY AND F-49-1 NAMED ONLY TWO. The guard step was at
    ci.yml:300 and the zebra-rpc suite at :327, so wiring the report in without
    moving anything would have had the guard read a file written 27 lines later -
    a hard failure by design. The suite now sits immediately above the guard.
  AND A FOURTH CONSEQUENCE: zebra-rpc-results.json was not gitignored. The
    .gitignore comment already records this exact shape happening once before,
    when the publisher's report was added without its sibling ignore. Second
    instance of one origin - a new suite joining a convention every existing
    member already had - so the three reports are now listed as a set.
  THE COMPOSE GUARD HAS TWO CLAUSES THAT CANNOT CHANGE A VERDICT. Q3's step 1
    (reject `@`) and step 2 (the colon must follow the last slash) are both
    subsumed by step 3's anchored regex: delete either and every ref still
    reaches the same outcome by a different route. Measured. They are kept
    because each produces the correct DIAGNOSTIC, they are tested BY MESSAGE, and
    the guard's header says a green run is not evidence for them - because a
    fail-side probe that does not fail is itself a finding.
  AND ITS COMPARATOR'S PATCH TERM IS UNREACHABLE against a floor whose patch is
    0: deleting `a.patch - b.patch` left every image-ref row green. It is driven
    against a synthetic 6.3.1 floor, which is the only way that term gets a fail
    side at all while the declared floor ends in zero.
  MY OWN COVERAGE CHECK HAD THE HOLE IT WAS WRITTEN AGAINST. The first version
    counted finding sites, so DELETING A PROBE ROW left the count unchanged and
    the self-test green - the disease reproduced inside its own cure. Now checked
    in both directions: every site must carry some row's marker, and every row's
    marker must be found at some site.
  AND ONE VACUOUS PASS OF MY OWN, caught the same way. Rewriting §5 dropped the
    uppercase "EXCLUSION SET" marker that opts a handoff into R4, so
    check-ledger-structure.mjs SKIPPED the file and reported OK. Restored, and
    proven non-vacuous by the count moving from 49 assertions across 4 handoffs
    to 54 across 5. A guard that skips silently and a guard that passes look
    identical in a transcript; only the count distinguishes them.
  DELIVERABLE 2b IS HALF CLOSED, AND L2'S SURVEY DID NOT NOTICE IT. All 15
    transactions across both captures return OBSERVED from
    `joinSplitObservability`, including FOUR v4 transactions in 3,441,955 - the
    version class where a missing key is ABSENT_INDETERMINATE, confirmed against
    a control. So Zebra emits `vjoinsplit` on the verbosity-2 getblock path, and
    this repository now holds a node's answer for a version that could have
    carried JoinSplits. What stays open is a NON-EMPTY JoinSplit; recent heights
    will not produce one.
  THE CAPTURES CONFIRM §2's IRONWOOD PREMISE INDEPENDENTLY. Both carry
    `finalsaplingroot` and `finalorchardroot` and NO Ironwood root under any
    spelling, which is what §2 says and what deliverable 2 is for.
  docs/2.0/CLAUDE-CODE-PROMPTS.md:302 states "ISR (revalidate 60s)". Checked and
    LEFT: it is a dated prompt pack ("Prepared: 22 Aug 2026"), a record of what
    was specified rather than a claim about current behaviour. Recorded so a
    later sweep does not re-find it as an error.

UNVERIFIED (labelled):
  The `subversion` /Zebra:6.2.1/ and the endpoint. Recorded in RUNBOOK-VPS on
    L2's report; a getblock result carries no node identity, so no reader can
    re-measure it from the tree. Labelled as such there.
  L2's reading of Zebra's source across four tags for issue #10550. Not
    re-derived here - no session can reach that repository - but the FIELDS
    #10550 could corrupt are now checked by a guard on every run, which is the
    half that matters and the half that is reproducible.
  The trees-delta arm over the real tree. It reports NOT RUN for both captures
    and that is honest rather than a pass; it cannot be driven in-tree without
    the predecessor blocks, which no session can fetch.
  L2's 130-block survey and its failure rates. Not reproducible without node
    access; recorded with its n, per the rule fold 10 contributes.
  Every deployed measurement. No session can reach a preview host.

GATE ROUNDS: 0 formal rounds. Stated plainly rather than dressed: this branch has
  not been through a gate. The verify fan-out that WOULD have opened round 1 lost
  one of its eight workers to the account's weekly usage limit, and the remaining
  budget went to the reconcile and the folds. Per LEDGER-10 Q3 the surviving
  findings are partitioned by whether EXECUTION settles them: all seven returning
  clusters were re-measured by the lead against the tree by running commands, so
  they are dispositioned here; the eighth cluster's questions (guard house style,
  runbook section 10, the pnpm check count, the ledger guard's structure) were
  all answered by the lead executing them directly, so nothing is carried forward
  as UNVERIFIED on its account.
  EXTRAPOLATION, stated rather than a convergence claim: a first real gate round
  over this branch would probably find one or two more defects of the reach the
  NOTICED list shows - a guard predicate or a docblock sentence making a
  checkable claim - and the §4 work, being unwritten, is where a round would
  actually pay.

PREVIEW URL: none. Unreachable from a session (Deployment Protection returns 302
  to SSO and the container's egress proxy refuses the CONNECT tunnel with 403
  before that).
```

## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):
INFERRED (non-empty inferences a worker made):
NOT-MATCHED (patterns handed over that did not apply):
SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
GATE ROUND COUNTS:
DEFERRED ASSUMPTIONS:
```
