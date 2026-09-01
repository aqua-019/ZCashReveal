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

- **A1.** Integration: replaying a 1,000-block fixture range reproduces per-pool balances equal to the fixture's reference values (source cited) within 0 zat for Sapling/Orchard/Ironwood.
- **A2.** Startup order: a test asserts `replayInto` resolves before `zmq.start()` is called (spy order).
- **A3.** Every `LeakReport` emitted on the live path after wiring has `spends[].assessment` defined for spends whose anchor is known; unknown anchors yield `assessment: undefined` with a logged `UNKNOWN_ANCHOR` (both polarities tested).
- **A4.** A simulated 3-block reorg leaves `PoolState` equal to a fresh replay of the new branch (property test, ≥ 100 runs).
- **A5.** `zcashreveal:links` is either present in the gateway's subscription list and covered by a WS test, or absent from both indexer and gateway (`grep` in both apps agrees).

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
