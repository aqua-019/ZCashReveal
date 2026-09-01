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
STATUS: DONE | DONE-WITH-ASSUMPTIONS | BLOCKED | OUT-OF-DEPTH | NOT CONVERGING
BRANCH / PR:
DIRECTORS SPAWNED (lead names each + spawn mode proven):
FILES (created / modified / moved):
EVIDENCE (per §5 assertion: pass transcript + fail transcript, provenance Executed/Read/UNVERIFIED):
ASSUMPTIONS (each: ACCEPTED / CORRECTED / DEFERRED — reason):
NOTICED (outside scope, not acted on):
UNVERIFIED (labelled):
GATE ROUNDS: n · fingerprints (file · rule · severity) per round
PREVIEW URL (if any):
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
