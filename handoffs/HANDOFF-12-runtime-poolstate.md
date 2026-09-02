---
handoff: 12
title: 7B / 7C runtime wiring — PoolState replay, confirmed-block driver, assessments on the live path
status: shipped
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

### §7, second session - §4 deliverables 1, 2 and 3 (PR opened after PR #50 merged PARTIAL; F-50-4)

```
STATUS: DONE - §4 DELIVERABLES 1, 2 AND 3 DELIVERED; A1 TO A5 EACH CARRY BOTH POLARITIES;
        FOLDS 0-4 OF THE L2 RESOLUTION APPLIED.

  The first §7 block above is PR #50's and stands as the record of that session. This
  block is the second session's, the one the F-50-4 rule routed to `open` rather than
  `closed`. Everything the prompt named is landed: the runtime wiring with reorg
  handling and tests, docs/2.0/RUNTIME.md, the Ironwood anchor via z_gettreestate, and
  the answer to deliverable 3 (below). Deliverable 0 was not redone.


THE PR MERGED MID-SESSION, BEFORE THIS WRITE-BACK AND BEFORE THE GATE FIXES.
  PR #51 opened at 5a3893b, and the operator marked it ready and merged it at
  10:30 UTC as `65bdac5`. Its second parent is 5a3893b, so main carries the
  runtime and NOT c53f2ba: every one of round 1's six defects, the two HIGHs
  included, is live in main as merged. This branch therefore continues as the
  protocol's follow-up - restarted from the merged main, carrying c53f2ba
  rebased onto it plus this write-back - and the PR opened from it is a NEW
  pull request, never a reopening of #51. Recorded here because a reader of
  main's history would otherwise have no way to know the fixes are not in it.

BRANCH / PR: claude/handoff-12-reconcile-2becu3. PR #51 opened as a draft at
  `5a3893b` and the operator merged it at 10:30 UTC (`65bdac5`). The branch then
  restarted from the merged main - the protocol's rule for follow-up after a
  merge - carrying the gate fixes and this write-back, and the PR opened from it
  is a NEW draft PR. Both stop at opened; no merge, no deploy, no Vercel change
  by this session.

DIRECTORS SPAWNED (lead names each + spawn mode proven):
  Spawn mode: MULTI-AGENT, PROVEN BEFORE ANY WORK. An `Explore` subagent was
  dispatched as the first action and returned live `git log` output.
  The lead built the handoff directly - each piece needed one tree and one runner,
  and a director layer would have added handoffs between agents without reach.
  One fan-out was used, after the six gates were green, as the gate round: four
  read-only verifiers, each Sonnet, each told to return diffs rather than write:
    verify:runtime-failure-paths   (runtime/*, index.ts, persistence/replay, the three runtime suites)
    verify:live-path-seam          (leak-analyzer, round-trip, realtime.ts, gateway consumers, the seam tests)
    verify:runtime-doc-claims      (every checkable sentence in RUNTIME.md, the runbook paragraph, changed docblocks)
    verify:config-infra            (config.ts, .env.example, compose, Dockerfile, healthcheck, CI, the guards)
  POST-FAN-OUT SWEEP, run after the fan-out returned and BEFORE the next commit,
  per CLAUDE.md: `git status --porcelain` showed twelve paths, every one of them
  the lead's own edit for a named finding. NO stray write by either read-only
  reviewer that returned; the two that died wrote nothing either. Reported
  whether or not it found anything, which is what the rule requires.

DELIVERABLE 3, ANSWERED AS §4 ASKS: `ironwoodAnchorPendingTreestate` is now an INTERNAL
  SCHEDULING SIGNAL. `applyConfirmedBlock` reads it to decide when to call
  `z_gettreestate` - only for a block that appended Ironwood commitments - and nothing
  reports it as an absence any more. `ironwoodTreeSize` is kept: it is the only
  Ironwood measurement `getblock` carries and it is the `maxPosition` of every Ironwood
  anchor, which is what cross-checks the treestate's root against the block. Read:
  decoder/block-decoder.ts docblocks, runtime/confirmed-block.ts (commit 143fd8a).

FILES (created / modified / moved), 67 against origin/main 09b034d:
  created  apps/indexer/src/runtime/{errors,chain-state,chain-store,chain-replay,confirmed-block,reorg,chain-follower,startup,index}.ts
  created  apps/indexer/src/runtime/__tests__/{confirmed-block,reorg-follower,startup}.test.ts
  created  apps/indexer/src/analysis/__tests__/{live-assessment,wire-seam}.test.ts
  created  apps/indexer/src/persistence/conn.ts
  created  apps/indexer/src/__tests__/config.test.ts                      (gate round 1)
  created  apps/indexer/src/decoder/__tests__/anchor-registry-rollback.test.ts  (gate round 1)
  created  apps/gateway/src/live-reports.ts, apps/gateway/src/__tests__/live-reports.test.ts
  created  docs/2.0/RUNTIME.md
  created  handoffs/prompts/PROMPT-12b.md
  created  apps/indexer/test/fixtures/blocks/mainnet-3444836-1e5057.json, mainnet-3444837-274151.json (fold 2)
  moved    apps/indexer/test/fixtures/blocks/mainnet-3432130-000000.json -> mainnet-3432130-9eb351.json,
           mainnet-3441955-000000.json -> mainnet-3441955-54b709.json (fold 2 naming rule)
  deleted  docs/2.0/capture/ (fold 3)
  modified apps/indexer/src/index.ts, config.ts, .env.example, docker-compose.yml
  modified apps/indexer/src/decoder/anchor-depth.ts                       (gate rounds 1 and 2)
  modified apps/indexer/src/decoder/leak-analyzer.ts, block-decoder.ts, analysis/round-trip.ts, analysis/constants.ts
  modified apps/indexer/src/state/{commitment-index,value-pool,pool-state,errors}.ts and their tests
  modified apps/indexer/src/persistence/{replay,blocks,leak-reports,pool-anchors,pool-boundary-flows,pool-commitments,pool-nullifiers,pool-snapshots}.ts, integration/replay.test.ts
  modified apps/indexer/src/decoder/__tests__/{block-decoder,value-pools-conservation}.test.ts, test/fixtures/blocks/README.md
  modified apps/gateway/src/{routes/mempool,server,ws-broker}.ts, __tests__/{wire-form,ws-broker}.test.ts
  modified packages/zebra-rpc/src/{client,schemas}.ts, __tests__/client.test.ts
  modified packages/zec-types/src/{realtime,leaks}.ts
  modified docs/2.0/RUNBOOK-VPS.md (section 3, section 10), CLAUDE.md (step 1, F-50-4)
  modified handoffs/{README,LEDGER,LOG,HANDOFF-12}.md

EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):

  A1 - DELIVERED, LIVE ON EVERY BLOCK. Executed.
    The driver compares its own per-pool delta, running balance and commitment count
    with the node's `valueDeltaZat`, `chainValueZat` and `trees.<pool>.size` on every
    block it applies, and throws before writing on any disagreement. The suite asserts
    the same equalities explicitly rather than trusting "did not throw":
    runtime/__tests__/confirmed-block.test.ts, 14 passed - one test per committed
    capture through the REAL `ZebraRpc.getBlock` (four), the consecutive pair carried
    across (3,444,836's closing figures open 3,444,837, both rows in the store), and
    the fail sides.
    FAIL SIDE, BY DATA, from inside the stated exclusion set (a capture with ONE pool's
    valueDeltaZat altered by 1 zat - the member §5 names):
      sapling valueDeltaZat + 1 on 3,444,837 -> ValueAccountingMismatchError
        "sapling at 3444837: this build's delta is 875651408 zat and the node's
         valueDeltaZat is 875651409"
      ironwood chainValueZat + 1            -> ValueAccountingMismatchError
        "ironwood at 3444837: this build's balance is 262194764371577 zat and the
         node's chainValueZat is 262194764371578"
      sapling trees.size + 1                -> TreeSizeMismatchError, naming the pool
                                               and both counts
    In every fail case the store holds no block row and the state has not advanced
    (asserted by `expectUntouched`, added after the first draft of this report claimed
    it and the tests were found not to say it).
    THE BASE MODEL IS WHAT MADE A1 EXECUTABLE (commit 07954ff): a `PoolState` opens at a
    `PoolStateBase` - commitment positions from `trees.size` minus the block's own
    appends, opening balance `chainValueZat - valueDeltaZat` - so the running figures
    are the node's from the first block rather than zeros the node would never match.

  A2 - DELIVERED, AND NOT IN THE POSTGRES GATE. Executed.
    runtime/startup.ts `runStartup` is the order; index.ts calls it and constructs
    the mempool poll loop only after it resolves. runtime/__tests__/startup.test.ts,
    6 passed, over a MemoryChainStore and scripted fakes - no database:
      PASS  the shipped orchestration records ["replay", "follower", "zmq"], with a
            bootstrap that resolves on a later event-loop turn so the order is earned
      FAIL  an orchestration that awaits zmq.start() first records the inverted order
      FAIL, BY DATA (the member §5 names - a startup observing zmq.start() before the
            replay resolved): the bootstrap NOT awaited -> "zmq" recorded before
            "replay" resolved; the spy discriminates
      bootstrapChain: cold (one getblock + one getblockheader, base written, state
            opened at the start height), warm (no RPC call, replayed to the highest
            block), corrupt (a lowest block with no snapshot for a pool is refused)

  A3 - DELIVERED, BOTH HALVES. Executed.
    Population: `AnalyzeContext.chainState`; every spend whose anchor the state has
    recorded carries `assessRaw` over Cand_0; every link the `RoundTripIndex` makes
    over a state carries `assessFiltered` (time window; amount match only once the
    deposit's commitments are IN THE TREE, at the tree's height; the echo's audit
    appended when it matched the same pair). `UNKNOWN_ANCHOR` is a `FindingCode`
    member, INFO, once per distinct (pool, anchor), carrying the spend count and,
    when the anchor's byte-reversed spelling IS recorded, the Zebra #10461 clause.
    analysis/__tests__/live-assessment.test.ts, 15 passed:
      PASS  Sapling spend citing a recorded anchor -> assessment rawCount 12n (=
            maxPosition + 1), effectiveSetSize 12n, appliedFilters [], claim
            small_heuristic_set; Orchard actions against ROOT_O -> 2,000n, aggregate_only
      FAIL, BY DATA: an anchor drawn from OUTSIDE the recorded roots -> no
            `assessment` key, one UNKNOWN_ANCHOR finding with the exact message; two
            spends citing it -> ONE finding saying "2 spends cite"; an Orchard-recorded
            root cited by a Sapling spend -> unknown (pool separation)
      the byte-reversed diagnostic fires only when reverse(anchor) is recorded, and
            not on the plain unknown anchor (the diagnostic discriminates)
      COUNTER-CASE: no chainState -> nothing assessed, nothing found
      RoundTripIndex: a deposit IN THE TREE -> [time_window, amount_match, amount_echo]
            with matchedDepositHeight 1_000 taken from the TREE while the report's
            tipHeightAtSeen said 999_999; effectiveSetSize 3n, requires_disclosure
      FAIL, BY DATA: the mempool clock (tipHeightAtSeen) handed to the same filter
            over the same tree narrows Cand_0 to 0n - the false disclosure claim the
            index refuses to make
      a deposit NOT in the tree -> time_window alone, effectiveSetSize 7n over the
            half-open window (995, 1_005]; an unknown anchor -> no assessment key; no
            state -> no assessment key; a REPLACED state is the one assessed against
    THE SEAM, over the REAL producer: the report `analyze()` builds, plus a link the
    real index makes over the same state, through `serializeWire` -> bytes ->
    `reviveWire`: deep-equal, every bigint path a bigint on both sides, rawCount and
    the link's countOut typeof "bigint".
      FAIL, BY DATA (the member §5 names - the untagged form measured live in PR
            #50): the same produced report stringified by value -> rawCount and countOut
            come back "string", not equal to the original.
    analysis/__tests__/wire-seam.test.ts, 4 passed (the property, 500 runs; its fail
    side; the hand-built worked case both polarities). apps/gateway: wire-form 11,
    live-reports 4, ws-broker 10 passed - the consumer side revives the same form.
    ONE HALF OF A3'S FAIL SIDE IS A CODE STATE, SAID PLAINLY: the exclusion set's first
    member ("a report on the live path carrying a KNOWN anchor and assessment:
    undefined") is exhibited by the tree BEFORE this branch, and its fail side is
    running the same report through the pre-wiring path - the COUNTER-CASE above is
    that path by construction. The DATA-mutation requirement is met by the two members
    that can be drawn as data: an anchor from outside the recorded set, and the
    untagged wire form.

  A4 - DELIVERED. Executed.
    runtime/reorg.ts `resolveReorg`: walk headers back to the split, rollbackToHeight
    in one transaction, fresh replay, the follower swaps its `chain`.
    runtime/__tests__/reorg-follower.test.ts, 5 passed:
      PROPERTY (100 runs): random chains, reorgs 1 to 3 deep, competing branches with
            distinct id namespaces - after the follower resolves the reorg, every pool's
            commitment count, nullifier set and value balance equal a FRESH replay of
            the new branch from the same base; the aggregate is what is compared.
      WORKED CASE: a 3-block reorg from H to H-3 then a 4-block competing branch; the
            follower's steps are exactly ["reorg@1700003", "applied" x4, "idle"].
      FAIL, BY DATA (the member §5 names): a store whose rollback omits Orchard's
            boundary flows -> the value balance survives a rolled-back height and the
            equality fails, naming orchard.
      a transport failure is retried after the poll interval with the state untouched;
            a consensus disagreement stops the loop, hands the error to onFatal, writes
            nothing.
    The first version of this suite hung the runner: a microtask-resolving `sleep`
    starved the event loop so `stop()` never ran. Fixed with a setImmediate yield;
    recorded because a test that cannot stop looks like a test that passed.

  A5 - DELIVERED IN FOLD 1 (commits e010371, 6e3e3a9). Executed.
    The publish is gone; `grep -rn "zcashreveal:links" apps/indexer/src apps/gateway/src`
    returns only the comment that records the removal. The egress ordering was
    confirmed at the site: links are assigned onto `report.links`, `state.upsert`
    emits the diff, `publishDiff` carries the whole report to Postgres, to
    `zcashreveal:mempool` and to `zcashreveal:mempool:live`. The counter-case - whether
    link records have any path to the SITE - is a product question and is in §8.

  DELIVERABLE 2 - THE IRONWOOD ANCHOR, BOTH POLARITIES. Executed.
    packages/zebra-rpc: `getTreestate` typed and zod-validated (schemas.ts,
    client.ts; client.test.ts 31 passed, treestate cases included). The driver calls
    it for exactly the blocks that appended Ironwood commitments:
      PASS  3,444,837 with a served treestate -> Anchor<"ironwood"> root
            ae2935f1dfd8a24aed7c70df7de3a668eb7a49b1319880dde2bbd9031ae5d82f (the
            empty-tree root, which is what the capture's own migration transaction
            cites) at maxPosition 48_469n = trees.ironwood.size 48,470 - 1
      FAIL  treestate WITHHELD -> no anchor, IRONWOOD_TREESTATE_ABSENT logged, the
            block still written; a treestate naming ANOTHER block -> refused,
            MISMATCH; one with no Ironwood root -> nothing recorded, ROOT_ABSENT
      3,444,836 (no Ironwood append) never asks; a transport failure fetching the
            treestate propagates and the block is NOT applied, so the anchor is
            retried with it
    Byte order: Read at Zebra v6.2.1, v6.3.0, 1c9b245 and HEAD ef6325c - at the pinned
    6.3.0, `getblock`'s roots, `z_gettreestate`'s roots and transaction anchors share
    one unreversed conversion; #10461, after 6.3.0, reverses the transaction side only.
    The UNKNOWN_ANCHOR byte-reversed clause is the runtime detector for that drift.

  FOLDS 0-4 OF THE L2 RESOLUTION. Executed.
    0  status field + README + CLAUDE.md sentence (0776a08). 1  links publish removed,
    egress confirmed at the site, both apps grep clean, counter-case recorded
    (e010371, 6e3e3a9). 2  the consecutive pair landed from L2's staging commit
    09b034d, verified against the consensus values by recomputing both merkle roots
    from txids and comparing hashes and tree sizes; the naming rule corrected to the
    first six hex characters AFTER the leading zeros and all four captures renamed;
    the guard keys on the height inside the file, confirmed by a dry run over renamed
    copies (c25306f). The endpoint is unreachable from a session; the pair was USED,
    never reconstructed. 3  docs/2.0/capture/ deleted (ab33ace). 4  the six-onto-five
    note points at value-pools-conservation.test.ts (fd55450).
    check-capture-consistency.mjs now reports 3 NOT RUN lines, not L2's 2: the pair's
    predecessor 3,444,836 has no predecessor of its own in the directory.

  THE SIX GATES, Executed twice - on b96b622 (before the gate rounds) and again
  on c53f2ba (after round 1's fixes), both all-green. The second run:
    TEST_RC=0       1,501 passed / 3 skipped (content 67; zebra-rpc 59 + 1 skipped;
                    instruments 98; web 486; gateway 163; publisher 99 + 2 skipped;
                    indexer 529 with Postgres reachable; 531 after round 2)
    TYPECHECK_RC=0  12 of 12      LINT_RC=0      VALIDATE_RC=0
    CHECK_RC=0      sixteen guards, three capture-consistency rows NOT RUN as stated
    BUILD_RC=0      8 of 8; `git status --porcelain` empty after the build

  WHAT ONE BLOCK COSTS, Executed (RUNTIME.md section 3, n = 40 runs per capture):
    client parse + validate 0.4 to 3.5 ms median per block; decode + apply 0.0 to
    0.2 ms median; in-memory replay 0.89 us per commitment at n = 10,000 and 1.02 us
    at n = 20,000. The Postgres read a warm start pays is UNVERIFIED and labelled so.

ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED - reason):
  ACCEPTED   L2's consensus values for 3,444,836 and 3,444,837 - hashes, merkle
    roots, tree sizes, nTx, the expected deltas. Every one re-measured from the staged
    files before they were moved; every one exact.
  ACCEPTED   `UNKNOWN_ANCHOR` is a `FindingCode` member. Decided before the test was
    written, as the prompt required, because a log string is not observable in the
    report and A3's fail side turns on observability. Recorded in §8.
  CORRECTED  L2's fold-2 claim of "no test changes": two test files needed changing.
    block-decoder.test.ts asserted per-capture pool coverage the 2-transaction
    predecessor cannot satisfy, so its mainnet test now asserts structure per file and
    pool coverage over the SET; value-pools-conservation.test.ts lists all four.
  CORRECTED  L2's "2 NOT RUN" for the capture guard after the pair lands: 3.
  CORRECTED  my own fixture arithmetic in live-assessment.test.ts, 12 -> 7: the time
    window is the documented half-open range and the fixture had forgotten it.
  DEFERRED   fetching the pair from the endpoint: unreachable from a session (the
    egress proxy refuses the CONNECT); the staged pair was used and its provenance is
    L2's. Goes to §8.
  DEFERRED   attaching the posterior to `LinkRecord`: no field exists and widening a
    shared wire type for a value nothing renders is the shape CLAUDE.md warns about.
    Goes to §8.

NOTICED (outside scope, or found by driving something rather than reading it):
  THE MEMORY STORE IS QUADRATIC ON WRITE. `MemoryChainStore.writeBlock` dedupes with
    `some()` over every row, so a 100,000-commitment replay measurement ran for
    minutes at 100% CPU before it was killed. A test double, not the Postgres path;
    the measurement was taken at 10,000 and 20,000 instead and says so.
  A BLOCK WRITTEN WITHOUT ITS IRONWOOD ANCHOR HAS NO BACKFILL: a restart replays from
    the store, where the anchor is absent. Documented in RUNTIME.md section 5 and
    raised in §8.
  MEMPOOL REPORTS ANALYSED DURING A REORG'S REPLAY are assessed against the OLD state
    for at most one poll interval. Documented; raised in §8.
  NO ZEBRA VERSION CEILING: the compose pin guards the floor; #10461 drift is
    detected at runtime by the byte-reversed clause and by nothing static. §8.
  `ws-broker.ts`'s subscriber handler throws uncaught on a malformed relayed message;
    noticed while rewriting its test's premise in fold 1; not changed here.
  `migrations_zip318` has a reader and no writer in the tree.

UNVERIFIED (labelled):
  The Postgres read cost of a warm-start replay, the catch-up rate after downtime,
    and the state's memory footprint - no session can reach the VPS; RUNTIME.md
    carries the command that measures the first.
  The pair's provenance (L2's fetch, `/Zebra:6.2.1/`) - recorded on L2's report in
    the fixtures README and the runbook, as the previous session's UNVERIFIED line said.
  Zebra's source at four commits for the byte-order fact - read by L2 and by this
    session from the same vendored checkout under the scratchpad; not from the tree.
  Every deployed measurement.

GATE ROUNDS: 2 dispatched, 1 complete at the time the branch merged, and the
  counts are reported SEPARATELY because a truncated verify phase is two counts
  and not one (LEDGER-10 Q3).
  ROUND 1 - four read-only reviewers, two returned and two died on the account's
  session limit mid-run (the same limit that truncated PR #50's fan-out; it
  resets at 06:10 UTC). SETTLED BY EXECUTION, 6 findings, all fixed in c53f2ba:
    HIGH  the z_gettreestate fetch ran AFTER the state was mutated, so the one
          call whose own contract calls it retryable was not: the failing
          attempt had already appended this block's commitments to the state the
          follower reuses, and the retry threw CommitmentAlreadyExistsError,
          which isFatal reads as a consensus disagreement. REPRODUCED before it
          was believed, by making the suite's own "the anchor is retried with
          it" test actually retry - it failed with that error pre-fix and passes
          post-fix. The fetch is now above every mutation.
    HIGH  an onApplied failure was logged as "retrying after the poll interval"
          and never retried: the block is written and the chain advanced before
          the callback runs, so the next step fetched the NEXT block and the
          anchors were lost silently while the log said the opposite. Caught at
          the call site and named as a loss, with the height and the roots.
    HIGH  the compose file hardcoded a MAINNET height for a variable whose
          documented default is per-network, so a testnet deployment that left
          it alone opened its base 705,857 blocks early, with no error. Measured
          by the reviewer with the real `docker compose config` on three .env
          shapes. The number is gone from compose and commented out in
          .env.example; loadConfig treats "" as absent (measured against the
          installed zod, six input shapes: bare .optional() THROWS on "", which
          crash-looped the process at module scope under restart: unless-stopped).
    MED   the split walk was bounded by the CALLER's tip, so a rollback whose
          replay failed transiently made the next walk ask the store for heights
          it had correctly deleted - a fatal ChainRuntimeError on a consistent
          store. Bounded by the STORE's tip now; at or below it a missing block
          is still corruption and still throws.
    MED   the anchor registry is a SEVENTH table with a height in it and the
          rollback covers six, so an orphaned branch's roots kept answering
          getHeightForAnchor - a defect this branch created, since nothing wrote
          that registry before it. forgetAbove clears the rows and the memo on
          every reorg; it does NOT clear the Redis hot tier, and that limit is
          pinned by a test, stated in RUNTIME.md and raised as Q9 rather than
          silently absorbed. Widening check-redis-safety rule 4 - which permits
          DEL only on a string literal - is not a handoff's to do.
    MED   A4's only fail side was a CODE mutation. A DATA mutation from its own
          exclusion set was added: one rolled-back boundary-flow row written
          straight back into the store with every line of shipped code
          untouched, and the property fails on it. The equality is asserted
          first on the unmutated store, so the comparison is known capable of
          both answers.
  NOT SETTLED BY EXECUTION, carried forward as UNVERIFIED: the two clusters
    whose reviewers died - the LIVE-PATH SEAM (leak-analyzer, round-trip, the
    gateway consumers, and whether any live-assessment probe is vacuous) and
    the RUNTIME-DOCUMENT CLAIMS (every checkable sentence in RUNTIME.md against
    the code). Two of that second cluster's questions were settled by the lead
    by execution and are recorded above and in NOTICED; the rest were not asked.
    Per LEDGER-10 Q3 these are not dispositioned by the lead: they are re-run or
    carried, and they are carried.
  ROUND 2 - the fix commit reviewed as its own commit, which this project's
    stopping rule requires because c53f2ba changes control flow in four files.
    A fifth reviewer was dispatched over `c53f2ba` alone and had not
    returned when this write-back was written; the round was therefore run by
    the LEAD, and only over what EXECUTION settles (LEDGER-10 Q3), which is
    what it found:
      MED   `IRONWOOD_TREE_SIZE_ABSENT` is unreachable by the route its own
            comment describes. The test written to cover it EXECUTED AS A
            FATAL: an absent `trees.ironwood` beside a present `trees` is the
            empty tree by Zebra's `skip_serializing_if`, so the tree-size
            cross-check reads zero against this build's 48,470 and refuses the
            block before the anchor logic runs. The notice is reachable only
            when the whole `trees` object is absent. Both routes are pinned now
            - the fatal by its message, the notice with `TREES_ABSENT` beside
            it and the treestate never asked for. This is exactly the shape the
            stopping rule predicts: the defect is in the round-1 fix, not in
            what it fixed.
      LOW   `forgetAbove`'s comment overstated its own memo clear.
            `getHeightForAnchor` repopulates the memo from a Redis hit, so the
            next lookup of a forgotten root restores the orphaned height; what
            the two cleared tiers buy is that the answer stops being
            PERMANENT. Corrected in the code and in RUNTIME.md.
    Fixed in `2eb13e6`. ROUND 3, within the round that produced it: that commit
    changes a comment, two document sentences and two test cases, so it was
    reviewed under clause (ii)'s scope - guard predicates, test assertions, and
    sentences making a checkable claim about runtime behaviour, each checked by
    EXECUTING the behaviour. No finding. The dispatched reviewer's report, if
    it arrives, is the next session's or this PR's, whichever comes first.
  EXTRAPOLATION rather than a convergence claim: round 1 reached two HIGHs in
    the runtime's failure paths and one in configuration; a third round of the
    same instrument would probably find one or two more of that reach, most
    likely where round 1 could not look - the live-path seam, which no reviewer
    has yet read, and the assessment population, whose only reader so far is
    the session that wrote it.

PREVIEW URL: none. Unreachable from a session (Deployment Protection returns 302
  to SSO and the container's egress proxy refuses the CONNECT tunnel with 403
  before that).
```
## §8 LEDGER — appended to `handoffs/LEDGER.md` by docs-scribe; read by L2 before the next handoff

```
QUESTIONS (for the operator / L2):
  Q1  THE POSTERIOR IS NOT ATTACHED TO A LINK. `computePosterior` (HANDOFF-08) yields a
      distribution over deposit candidates; `LinkRecord.assessment` is a
      `ClaimAssessment`, whose `effectiveSetSize` is a bigint count of commitment
      positions - a different set. The echo's audit record IS appended to the link's
      `appliedFilters` when the echo matched the same pair, so the inference chain
      carries the grade; the distribution itself has no field. Widening the shared
      wire type for a value nothing renders is the shape CLAUDE.md warns about.
      Decide: a `posterior` field on `LinkRecord` (and a renderer for it), or leave it.
  Q2  A BLOCK WRITTEN WITHOUT ITS IRONWOOD ANCHOR HAS NO BACKFILL. When
      `z_gettreestate` is withheld or answers for another block, the driver writes the
      block, logs the notice and records no anchor - never a fabricated root, as §4
      requires. A restart replays from the store, where the anchor is absent, so every
      later spend citing it is UNKNOWN_ANCHOR forever. The remedy today is a wipe to a
      base below that height (RUNTIME.md section 5). Decide whether a backfill pass
      (re-ask the treestate for blocks whose `pool_anchors` lack an Ironwood row where
      `ironwood` commitments were appended) is HANDOFF-13's or a maintenance item.
  Q3  NO ZEBRA VERSION CEILING. `check-compose-zebra-tag.mjs` guards the FLOOR (6.3.0).
      ZcashFoundation/zebra #10461, after 6.3.0, reverses the transaction-side anchor
      byte order and not `getblock`'s or `z_gettreestate`'s roots, so a node past it
      makes every Orchard-shaped anchor unknown to this build. The runtime detector is
      the UNKNOWN_ANCHOR byte-reversed clause; nothing static stops the upgrade. Decide
      whether the tag guard grows a ceiling, and at which version.
  Q4  LINK RECORDS HAVE NO PATH TO THE SITE (A5's counter-case). The links channel was a
      third copy of data already on the report; removing it lost nothing a reader could
      see, because no reader existed. The product question stands: `LeakReport.links`
      reaches `zcashreveal:mempool:live` and Postgres, and no route or view renders it.
  Q5  MEMPOOL REPORTS ANALYSED DURING A REORG'S REPLAY are assessed against the OLD
      state until the follower swaps its `chain`, at most one poll interval. The
      getter design makes the window as short as it can be without pausing the
      mempool path. Decide whether that pause is wanted.
  Q6  NOT A QUESTION ANY MORE - THE TESTNET START-HEIGHT TRAP WAS REAL AND IS
      FIXED, and it is left here because the SHAPE is worth the operator's eye.
      `docker-compose.yml` fell back to a mainnet constant for a variable whose
      documented default is per-network, and `.env.example` - which section 1 of
      the runbook tells the operator to `cp` - set the same constant, so a
      testnet deployment that touched neither opened its base 705,857 blocks
      before testnet's own NU6.3 activation, silently: `chainBaseFromBlock`
      accepts a pre-activation block because an absent Ironwood tree size is
      legitimate there. Both are gone (compose passes an empty default,
      .env.example comments the line out, `loadConfig` treats "" as absent).
      THE SHAPE: a default written twice, once in code where it can read a
      sibling variable and once in compose where it cannot. Nothing guards
      against the next one - see Q11.
  Q7  `migrations_zip318` has a reader and no writer in the tree (noticed in the
      previous session's UNVERIFIED list and re-confirmed here by grep). The confirmed-
      block driver records boundary flows and does not write migration rows.
  Q8  `ws-broker.ts`'s subscriber handler throws uncaught on a malformed relayed
      message. Noticed while rewriting its test premise in fold 1; a producer that
      serialises through `serializeWire` cannot produce one, but the handler does not
      know that.

  Q9  THE ANCHOR REGISTRY'S REDIS HOT TIER IS NOT CLEARED ON A REORG, AND THE
      REASON IS A GUARD THIS SESSION WOULD NOT WIDEN. `forgetAbove` clears the
      `anchors` rows and the in-process memo; it cannot clear the Redis keys,
      because `check-redis-safety` rule 4 permits `DEL` only on a `zecreveal:`
      STRING LITERAL and these keys are computed per root - the guard cannot
      see that they are exact keys this project wrote in the VPS instance.
      Widening a rule that protects another project's database is not a
      handoff's to do (CLAUDE.md), and the guard's existing VPS-target
      exemption is file-scoped and covers SCAN only, so `anchor-depth.ts`
      cannot honestly claim it: the file receives a client, it does not
      construct one. Consequence, stated rather than hidden: `getHeightForAnchor`
      reads Redis before Postgres, so an orphaned root can still answer with
      its abandoned height until the 24-hour TTL expires or the process
      restarts. Two remedies, both the operator's or L2's to choose - extend
      the exemption to `DEL` with a real `assertNotManagedStore` proof AT the
      deletion site, or move the registry's Redis writes behind a file that
      already carries one. Pinned by a test so a later session that widens the
      guard has to come back here.
  Q10 SHUTDOWN DOES NOT DRAIN THE MEMPOOL SIDE, and this handoff did not widen
      itself to fix it. `shutdown()` awaits `follower.stop()` - the confirmed-
      block path this handoff added - but `clearInterval` does not cancel an
      in-flight poll iteration, `zmq.stop()` does not await an in-flight
      handler, and `publishDiff` is fire-and-forget by construction
      (`void publishDiff(...)` in the `diff` listener), so `redis.quit()`,
      `sql.end()` and `process.exit()` can cut a write mid-flight. All three
      predate this branch. The fix is an in-flight counter awaited by
      `shutdown()`, the same join point `ChainFollower.stop()` already has.
  Q11 NO GUARD ENUMERATES THE INDEXER'S ENVIRONMENT VARIABLES. `check-infra-docs`
      enumerates `apps/web`'s `NEXT_PUBLIC_`/`SNAPSHOT_` variables against
      DEPLOY-2.0.md and nothing does the equivalent for `apps/indexer`; the
      pre-existing `RECENT_ANCHOR_THRESHOLD` is undocumented in `.env.example`,
      which is the gap standing today. Nothing was missed by THIS handoff (both
      new variables are in `.env.example`, compose, RUNTIME.md and the runbook),
      and a guard is not yet warranted by recurrence - recorded so the next
      instance is the second, not the first.
  Q12 NEITHER LINKS NOR ASSESSMENTS HAVE A PATH TO THE SITE, and Q4 is the
      narrower half of that. Measured this round: `grep -n assessment` over
      `apps/gateway/src` and `packages/zec-types/src/views.ts` returns nothing,
      so `ClaimAssessment` stops at the gateway's DTO layer exactly as
      `LinkRecord` does. That is why the seam's bigint fix could not be caught
      by any consumer test: nothing downstream reads the fields. The product
      question is one question, not two.
  Q13 MAIN DOES NOT CARRY THE GATE FIXES, AND THAT IS A FACT ABOUT MAIN RATHER
      THAN ABOUT THIS BRANCH. PR #51 merged at `65bdac5` with second parent
      `5a3893b`, which is the commit before `c53f2ba`. So every defect round 1
      found - including the treestate ordering that turns one dropped RPC call
      into a process exit, and the compose default that opens a testnet base
      705,857 blocks early - is live in main as merged. The follow-up PR this
      session opens carries them onto the merged main. Nothing needs deciding
      here; it needs KNOWING, because a reader of main's history cannot see it.
INFERRED (non-empty inferences a worker made):
  I1  The Ironwood anchor's `maxPosition` is `trees.ironwood.size - 1` from the BLOCK
      and its root from the TREESTATE, cross-checked by requiring the treestate to name
      the block's hash - §4 says "cross-checked rather than both taken on trust", and
      the hash equality is the check this session inferred it meant.
  I2  A1's "over however many captured blocks exist" was read as: every committed
      capture individually, plus the consecutive pair carried across. Four blocks, one
      pair.
  I3  "per-link assessFiltered with timeWindowFilter + amountMatchFilter + the
      HANDOFF-08 echo/posterior modules" was read as: the two filters in the stack,
      the echo's audit appended when it matched the same pair, and the posterior NOT
      attached (Q1). The contract names the modules; it does not say where the
      posterior lands, and no field exists.
  I4  `INDEXER_START_HEIGHT` defaults to NU6.3 activation. §4 does not name a start
      height; the default was chosen because it is where all four pools' figures exist
      to be checked and where Ironwood begins.

NOT-MATCHED (patterns handed over that did not apply):
  N1  "h_split" - vocabulary, not an identifier; nothing was grepped for it.
  N2  L2's fold-2 fetch procedure (the Tatum endpoint, 13-second pacing, `["result"]`
      stripping) - unreachable from a session; the staged pair was used instead, and
      the runbook's section 10 procedure stands for an operator with a node.
  N3  "z_getsubtreesbyindex if the subtree path is needed" - not needed; the
      treestate's `finalRoot` is the root.

SPEC-WAS-AMBIGUOUS (from Loop 3 reviews):
  S1  `UNKNOWN_ANCHOR`: FindingCode member or log string. Decided: member, INFO, once
      per distinct (pool, anchor), because A3's fail side must be observable in the
      report. `check-audit-consumers.mjs` is unaffected (it guards FilterApplication
      variants, not FindingCode).
  S2  A3's exclusion set names a member the tree exhibited BEFORE the branch ("a
      KNOWN anchor and assessment: undefined") - the LEDGER-11 Q5(a) case, a defect
      being closed rather than a test being written. Its fail side is the pre-wiring
      path, which the no-chainState counter-case IS; the data-mutation requirement is
      met by the two members that can be drawn as data. Stated in §7 rather than
      dressed.

GATE ROUND COUNTS:
  Round 1: 4 reviewers dispatched, 2 returned, 2 died on the account's session
  limit. 6 findings, all settled by execution and all fixed in `c53f2ba`; 2
  clusters carried as UNVERIFIED because only argument, not execution, would
  settle them. Round 2: the fix commit reviewed as its own commit, as the
  stopping rule requires - the fifth reviewer had not returned, so the round was run by the
  lead over what execution settles: 2 findings, both IN the round-1 fix commit
  (an unreachable notice whose test executed as a fatal, and a comment
  overstating its own memo clear), both fixed in `2eb13e6`. Round 3 reviewed
  that commit within the round that produced it, per clause (ii)'s scope, and
  found nothing. The rule's clause (i) is NOT satisfied:
  round 1 returned findings a user could see, so this branch has not converged
  and the extrapolation in section 7 says what a third round would probably
  find.

DEFERRED ASSUMPTIONS:
  D1  Fetching the consecutive pair from the endpoint: deferred to an operator with a
      node; the staged pair's provenance is L2's and is labelled UNVERIFIED where it
      is cited.
  D2  The posterior on `LinkRecord` (Q1).
  D3  Committing the two predecessor blocks (3,432,129 and 3,441,954) so the capture
      guard's delta arm runs for the first two captures - carried from the previous
      session; still no session can fetch them.
  D4  Raising SNAPSHOT_TTL_MS to 120,000 - carried from the previous session; the
      operator's trade.
```
