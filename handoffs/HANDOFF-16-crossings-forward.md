---
handoff: 16
title: Crossings forward - the confirmed-block driver on a third-party endpoint (rung 3 of three)
status: closed
branch: the session-designated branch (name it `feat/v2-16-crossings-forward` if you may choose)
track: Integration
depends_on: 12, 15
written_by: L2 (Cowork) · 2 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-16 — Crossings forward: the confirmed-block driver on a third-party endpoint (rung 3 of three)

**RUNG 3 OF THREE, AND THE ONE THAT FILLS THE PLANE.** 14 put live balances on the site; 15 put
live transactions on it. This puts **crossings** on it — the marks on the turnstile plane, which
today draws from a fixture.

**AND IT STILL NEEDS NO SYNC.** `runtime/startup.ts:23` — `INDEXER_START_HEIGHT` is *"the first
block to index on a COLD store"*, and `chainBaseFromBlock` opens the base by the block's own
figures. The runtime was built in HANDOFF-12 to start at a recent height and follow forward.
Nothing here backfills history.

---

## §1 SCOPE

Run the confirmed-block driver against a **third-party RPC endpoint**, opening at a recent height,
so `migrationHist` accumulates real ZIP 318 crossings from that height forward and the plane draws
measured marks.

L2's measurements — check them, and say in §7 where they were wrong:

| what | measured |
|---|---|
| confirmed-block cost | ~1 `getblock` per 75 s ≈ **0.8/min** — inside even the keyless 5/min ceiling |
| history required | **none.** Open the base at a recent height |
| the seven methods this stack calls | `getBlock`, `getBlockHeader`, `getBlockchainInfo`, `getBlockchainInfoFull`, `getRawMempool`, `getRawTransaction`, **`getTreestate`** |
| **`z_gettreestate` on the keyless endpoint** | **`Method not found`.** Six of seven served; this one is not. **UNVERIFIED AS OF 4 SEP - L2 measured this on 1 SEP and has NOT re-probed it.** Deliverable 1 settles it; do not carry it as fact |
| what that costs | the Ironwood anchor never forms. The driver writes the block, logs the notice and records **no anchor** — never a fabricated root, as §4 requires. Every later spend citing it is `UNKNOWN_ANCHOR` **permanently**, because there is no backfill (LEDGER-12 Q2) |
| the address index | three of the nine methods, one file — `apps/gateway/src/views/address.ts`. Not needed |

**So `z_gettreestate` availability is this rung's gating fact, and an operator must learn it before
the driver runs, not weeks later from a query.** That is what deliverable 1 is for.

**AND TWO THINGS ARRIVE FROM RUNG 2, BOTH SMALL, BOTH MEASURED BY L2 ON 4 SEP:**

1. **`MockRpcEndpoint` gains a fourth refusal body, and it is the one production sends.** Captured
   live: `{"statusCode": 429, "message": "You have exceeded your limit of 5 requests per
   minute..."}` - it PARSES and reaches NEITHER the error-object branch nor the parse-failure
   branch, a third escape route from the pre-fix ordering that round 3 did not find because no mock
   emitted it. **The shipped status-first fix already covers it**, so this is closing the exclusion
   set, not fixing a defect. Add it beside `envelope`/`bare`/`html`, drive it through the same loop,
   and **capture it rather than transcribing it from this prompt** - that is F-57-1's operational
   half.
2. **The rate-limit deferral in LEDGER-15 can be CLOSED, not carried.** L2 dumped the real headers
   on both a 200 and a 429: `retry-after: 60` is present, and there is **no `X-RateLimit-*` header
   of any kind** - only `x-ttm-plan: anonymous`. The session's judgement was right; record it as
   MEASURED and stop deferring it.

**AND BUILD BEFORE YOU TYPECHECK.** L2's own gate reported fifteen phantom type errors on this PR
because it ran `build` last and the indexer typechecked against a stale `zebra-rpc/dist`. A
cross-package export added in the same PR that consumes it is invisible until the producing package
is rebuilt.

**`legibility.spec.ts:718` IS OUT OF SCOPE AND THAT IS A RULING, NOT AN OVERSIGHT.** HANDOFF-15
recorded it failing once locally under full-suite parallelism with the plant confirmed landed,
against 3 of 3 isolated passes and a green CI run on the same head, and correctly refused to call it
a flake or widen the PR into HANDOFF-04a's spec. **L2 agrees and adds its own n** - a full-suite
pass in a different container on merged `main`. If it fails for you too, record the observation with
its n and leave it; if the count ever reaches the point where the fail side is shown to be
non-discriminating at random, that is LEDGER-05 fold 7 and it earns its OWN handoff, because a fail
side that passes at random means HANDOFF-04a's A1 never tested anything.

**Out of scope:** backfilling history; the address index; Mode A; self-hosting `zebrad`. **And the
confirmed-block follower on `MemoryChainStore` IS in scope here** - LEDGER-15's INFERRED reading
correctly kept it out of rung 2, and L2's resolution puts it here.

## §2 READING

`CLAUDE.md` · `apps/indexer/src/runtime/` **entire** · `docs/2.0/RUNTIME.md` ·
`packages/zebra-rpc/src/{client,version-floor}.ts` · **LEDGER-12 Q2 (the backfill gap) and Q3 (the
version ceiling)** · the HANDOFF-12 blocks and both L2 resolutions for PR #50 and #52.

## §3 CONTRACT

- **A missing method is a NAMED ABSENCE at startup, never a silent degradation at the first Ironwood
  block.** See §1's `z_gettreestate` row: the failure is permanent and invisible, which is the worst
  combination this project recognises.
- **A 429 mid-block must not corrupt chain state.** `applyConfirmedBlock`'s external call happens
  ABOVE every mutation precisely so a transient failure is retryable — that was the worst of
  HANDOFF-12's twelve defects (`c53f2ba`). A third-party endpoint makes transient failure the normal
  case rather than the rare one.
- **The plane draws measured marks or it draws none.** One mark per counted crossing, uniform
  weight, capped at `SPLASH_N_MAX = 42`. **The adaptive retention window stays deferred whole**
  (LEDGER-04a Q2) — without per-crossing ordering there is no "newest N", and a board of arbitrary
  marks labelled a recent window is the defect that deferral exists to prevent. If this rung makes
  ordering available, say so in §8 and let L2 rule; do not build it here.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **`scripts/preflight-rpc.mjs`.** Takes an RPC URL and answers, by execution: which of the seven
   methods it serves; its `subversion` against both the floor and the ceiling; and the request rate
   it sustains before refusing. A table an operator reads in ten seconds, and a non-zero exit when
   the endpoint cannot carry the stack.
   **Three outcomes per method and the third is the point:** SERVED, ABSENT, and *could not be
   determined*. A method erroring for a reason unrelated to availability — `getRawTransaction` on a
   fake txid answers "No such mempool or main chain transaction", which means it WORKS — is not an
   absence, and a preflight counting it as one would reject good endpoints.
   **Measure the rate; do not read it from a marketing page.** L2 found the documented 5/min was
   exact and shared across three hostnames, and finding that took one burst of sixteen requests.
1b. **THE GATE LIST GAINS `test:e2e`, AND IT IS DONE FIRST — IT IS FOUR LINES.**
   `CLAUDE.md`'s Workflow section names SIX gates. `pnpm --filter @zcashreveal/web test:e2e` is not
   one of them, so HANDOFF-15 opened its PR without having run it - **and so did L2, whose own
   verification gate mirrors that same list of six and therefore missed it on BOTH #56 and #57.**
   **THAT LINE DOCUMENTS ITS OWN HOLE:** it already says *"Each of the last two was added after a
   session satisfied this list exactly and shipped something the list did not cover."* `pnpm build`
   was added that way after HANDOFF-07; `assert-no-skipped-integration` was recorded and NOT added
   (LEDGER-14 Q5); the e2e suite is the third. **A shape at three instances is one the stopping rule
   says gets mechanised, not recorded again.** Add `test:e2e` to the list, and add
   `assert-no-skipped-integration` while the line is open - it has been waiting one handoff. Say in
   §7 how long the e2e run took and what it returned.
2. **Third-party mode for the confirmed-block driver**: the endpoint config, the start height, 429
   back-off, and a startup check that names every missing method before the first block.
3. **`docs/2.0/CUTOVER-1.0.md` completed** — the full operator path across all three rungs, ending
   at a site whose plane draws measured crossings. Say plainly what the plane shows with
   `z_gettreestate` and what it shows without.
4. **ROUND 4 ON `62c4e77`** (**F-52-2**). Round 3's own fix commit has never been reviewed and the
   stopping rule says a fix commit earns a round. The pattern is why: round 1 found six, round 2
   found two *inside round 1's fix*, round 3 found four with *three* in that same fix — twelve, with
   the yield following the repairs. This rung is where that runtime first meets real chain data.
   **Two people estimated this surface and both were low: L2 said a first round would find "one or
   two" and it found six; the session said a third would find "one or two" and it found four. Do not
   estimate. Run the round.**
5. **`docs/2.0/CUTOVER.md` section 1 corrected.** It still lists the mainnet block fixture under "not
   a prerequisite" because *"the cutover ships with that test still skipped"* and calls the capture a
   standing operator task needing a synced node. **Four captures landed in PR #51 from a public
   endpoint and the decoder suite runs 11/11 with zero skips.** The row describes an obstacle that no
   longer exists, in the document an operator reads AT cutover.
6. **`MockRpcEndpoint` gains the fourth refusal body**, captured from the real endpoint rather than
   transcribed, and driven through the same three-body loop (§1 item 1, F-57-1).
7. **LEDGER-15's rate-limit deferral closed as MEASURED** rather than carried (§1 item 2).

## §5 ASSERTIONS — each needs both polarities, and each names its EXCLUSION SET

- **A1.** The preflight reports `z_gettreestate` ABSENT against the keyless Tatum endpoint and
  SERVED against one that serves it. If no second endpoint is reachable, drive the second polarity
  against a local mock and say so — a guard driven in one direction is half a guard.
  *Exclusion set:* any verdict that does not discriminate — ABSENT returned for an endpoint whose
  answer to `z_gettreestate` is a treestate, or SERVED returned for one whose answer is
  `Method not found`.
  *Fail side names:* an endpoint answering `-32601 Method not found` for `z_gettreestate` and a
  treestate for every other method. The member is that endpoint's `z_gettreestate` response; a
  preflight reporting SERVED for it has taken a value from inside the set.

- **A2.** The preflight's rate figure is MEASURED, its transcript showing the last success and the
  first refusal.
  *Exclusion set:* any rate figure not derived from an OBSERVED refusal — a constant, a value read
  from documentation, or a figure emitted by a burst in which nothing was refused.
  *Fail side names:* a mock that never refuses, driven by the same burst. The member is the rate the
  preflight prints when no request was refused; a figure appearing there is a figure not measured.

- **A3.** A missing `z_gettreestate` is named at startup, not at the first Ironwood block.
  *Exclusion set:* any startup that proceeds to its first block against an endpoint missing a method
  the runtime calls, without naming the method.
  *Fail side names:* a mock that answers every method and 404s `z_gettreestate` alone, handed to the
  runtime at startup. The member is that endpoint; a silent start against it is the value the
  assertion excludes.

- **A4.** A 429 mid-`applyConfirmedBlock` retries cleanly — no `CommitmentAlreadyExistsError`, no
  advanced tip.
  *Exclusion set:* any state reachable after a refused external call in which chain state has
  already moved — a duplicated commitment, a tip past a block that did not apply, or an anchor
  recorded for a block whose treestate never arrived.
  *Fail side names:* a mock that 429s once on the treestate call inside `applyConfirmedBlock` and
  succeeds on retry. The member is the store state observed between the refusal and the retry.

- **A5.** Opening at a recent height produces a base whose `maxPosition` equals the block's own
  reported tree size minus one, and marks appear on the plane once crossings accrue.
  *Exclusion set:* any anchor root the node never sent — a zero root, a placeholder, or a root
  computed locally — recorded as though it had been measured.
  *Fail side names:* a treestate withheld for one block. The member is the anchor record written for
  that block: the assertion holds only if there is none and a finding is logged.

- **A6.** Round 4's findings each carry a failing-then-passing transcript, and if round 4's fix
  commit exists, round 5 ran over it.
  *Exclusion set:* any §7 that reports a round-4 fix with no round over the commit that carried it —
  exactly the gap F-52-2 files.
  *Fail side names:* HANDOFF-15's own §7, which is the member: it reports round 3's fix commit
  `62c4e77` and carries no round over it, which is why this deliverable exists.

- **A7.** F-57-1 applied to this rung's own mock: the preflight's ABSENT verdict and the driver's
  429 handling are both driven by shapes CAPTURED from a real endpoint rather than enumerated from
  memory — the four 429 bodies now on record, and whatever `z_gettreestate` actually answers rather
  than what the brief says it answers.
  *Exclusion set:* any refusal or absence shape no real producer emits — a body invented by a
  previous session, or one transcribed from this brief without a capture behind it.
  *Fail side names:* `{"error": "rate limited"}`, HANDOFF-15's own 429 body. It is a member: it is a
  data mutation from inside "a 429 response" and it is the one shape the measured endpoint does not
  send, which is the counter-example F-57-1 was adopted on.

- **A8.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe
  (**F-53-1**), with `build` run BEFORE `typecheck`, and the passed AND skipped counts both stated
  with every skip named.
  *Exclusion set:* any green claim whose evidence cannot distinguish a healthy run from a degraded
  one — an exit code read through a pipe, or a pass count quoted without its skip count.
  *Fail side names:* a run with Postgres and Redis down. The member is its exit code, which is 0 and
  identical to the healthy run's; HANDOFF-15 §7 measured the pair at 1597/5 against 1465/111.

## §6 DISPATCH HINTS

Two independent bodies of work: the preflight and third-party mode (one fan-out, one worker per
method plus one on rate), and round 4 (a separate fan-out, one worker per failure path, each with an
adversarial refuter). Do not merge them — round 4 is a review and reviews do not share a worker with
the thing being built.

---

**One operator action no session can take.** The keyless endpoint is short on both counts — six of
seven methods, and 5 requests/minute. A **free-tier API key** from a provider serving the full set at
a workable rate clears both; creating that account is the operator's, because L2 cannot create
accounts or handle credentials. The preflight exists so that a candidate URL is answered in ten
seconds rather than by an `UNKNOWN_ANCHOR` weeks later.

## §7 REPORT

```
STATUS: DONE-WITH-ASSUMPTIONS

Every deliverable is in the tree. The assumptions are three, all dispositioned
below, and the largest is a CORRECTION to this handoff's own section 1 rather
than a gap in the work: crossings cannot reach the plane without a database,
because the publisher is a separate process that queries Postgres for
migrationHist. Measured by execution, not read.

FORKED FROM f976477fef9761a6397466113399341e820939b3, the head of `main`.
`git merge-base --is-ancestor 640865a origin/main` exits 0 - executed before any
file was touched - so PR #57 landed whole and not merely its write-back.

SPAWN MODE: workflow fan-out and subagents available, proven by a tool attempt
before any work - a five-worker scouting workflow (run wf_f7e7faa0-350) returned
five structured reports on the runtime, `packages/zebra-rpc`, the gate list, the
cutover documents and the ledger before the reconcile commit. TWO FAN-OUTS: the
scout, and gate round 4. The post-fan-out sweep was run after each and
`git status --porcelain` was EMPTY both times - no worker wrote to the tree.

--------------------------------------------------------------------------
L2's SECTION 1 MEASUREMENTS, CHECKED AS SECTION 1 ASKS. THREE ARE WRONG.
--------------------------------------------------------------------------

| L2's row | verdict |
|---|---|
| the address index is three of nine methods, one file | CORRECT. `getAddressBalance`, `getAddressUtxos`, `getAddressTxIds`, all three at `apps/gateway/src/views/address.ts:72-74`, and nowhere else in `apps/` |
| history required: none | CORRECT. `bootstrapChain` fetches one block and one header on a cold store and opens the base from that block's own figures |
| `z_gettreestate` on the keyless endpoint | NOT RE-PROBED HERE, and L2 labelled it UNVERIFIED itself. This container cannot reach the endpoint - see the wall below - so it stays UNVERIFIED. The preflight settles it in ten seconds for whoever can reach one |
| **the seven methods this stack calls** | **WRONG, and wrong about the wrong OBJECT.** It lists seven CLIENT methods and omits `getRawMempoolVerbose`, which `apps/` calls. The object an endpoint serves or does not is the WIRE method, and there are SIX of those outside the address index: `getblockchaininfo`, `getblock`, `getblockheader`, `getrawmempool`, `getrawtransaction`, `z_gettreestate`. `getBlockchainInfo` and `getBlockchainInfoFull` are one wire method; so are the two mempool ones. That is LEDGER-09b's shape - an exhaustive claim over a source rather than over the object the rule is about - and it matters, because availability is per SHAPE: `getblock` at verbosity 1 and at verbosity 2 are one name and two capabilities, and this stack only ever sends 2 |
| **confirmed-block cost ~0.8/min** | **WRONG, and it was the number that decided whether this rung works.** It counts `getblock` and not the tip poll that precedes every one of them. `ChainFollower.step` calls `getBlockchainInfo()` on EVERY step, and the loop slept for `cfg.INDEXER_POLL_INTERVAL_MS` - default 2000 - so the real figure was THIRTY requests a minute against the keyless five |
| **what a missing `z_gettreestate` costs** | **WRONG, and this is the finding of the handoff.** L2 wrote "the driver writes the block, logs the notice and records no anchor". It does not. It writes nothing and follows nothing. See below |

--------------------------------------------------------------------------
THE FINDING: A MISSING METHOD DID NOT DEGRADE THE DRIVER. IT STOPPED IT.
--------------------------------------------------------------------------

Executed against the shipped classes on merged `main`, with a node answering
`-32601 Method not found` for `z_gettreestate` and serving everything else:

```
STEP THREW: RpcError - [RPC z_gettreestate] Method not found
isFatal(err) = false
blocks written: 1700000            <- the base only. The block was NOT written
chain height after the failed step: 1700000
ironwood commitments already appended: 0
RETRY THREW: RpcError - [RPC z_gettreestate] Method not found
isFatal(retry) = false
getTreestate call count: 2
```

The chain is: `ZebraRpc.getTreestate` returns `Promise<GetTreestate>` and
`call()` throws `RpcError` for a JSON-RPC error object. `applyConfirmedBlock`
awaits the treestate ABOVE every mutation, so the throw leaves it; `step()`
rethrows anything that is not a `ChainContinuityError`; and `isFatal` is false
for an `RpcError`, which is neither a `ChainRuntimeError` nor a
`ZCashRevealStateError`. The loop therefore logs "confirmed-block step failed;
retrying after the poll interval" and fetches the SAME block again. For ever.
On the first block that appends Ironwood commitments.

The one thing that IS right is that the state is not left dirty - zero
commitments appended - which is `c53f2ba`'s ordering holding exactly as its
comment says. The defect is one layer up, in what the follower does with the
error.

`TreestateSource`'s own contract had named this case since HANDOFF-12: `null`
means "a node that does not serve it". Nothing could produce it, because the
production wiring built the source as `(hash) => rpc.getTreestate({hash})` and
that function cannot return null. The fix is the startup probe plus
`absentTreestateSource`, and the two polarities are in
`runtime/__tests__/third-party-mode.test.ts`.

--------------------------------------------------------------------------
THE SECOND FINDING: THE FOLLOWER WAS SPENDING SIX TIMES THE CEILING
--------------------------------------------------------------------------

`planMempoolPoll` was handed the WHOLE ceiling; the follower was handed the raw
`INDEXER_POLL_INTERVAL_MS`. Both use the same client and therefore the same
`RateGate`. At the measured five a minute the follower asked thirty times a
minute for the tip alone.

WHY NO TEST COULD SEE IT: the gate holds the ceiling by SLEEPING, so nothing
exceeds it on the wire and a request count is clean. What it costs is the
mempool tick, queued behind the follower for a whole window, while the log line
prints the three transactions a minute it is not getting. The aggregate property
in `follower-plan.test.ts` is written over requests-per-minute for exactly that
reason, and the pre-fix configuration is reconstructed in its fail side so the
test would have failed before the fix.

--------------------------------------------------------------------------
THE THIRD FINDING, AND IT RESIZES THE RUNG: CROSSINGS NEED A DATABASE
--------------------------------------------------------------------------

Section 1 says to run the driver so "`migrationHist` accumulates real ZIP 318
crossings from that height forward and the plane draws measured marks". The
indexer accumulating them is necessary and NOT sufficient. The publisher is a
SEPARATE PROCESS and it builds `migrationHist` from its own Postgres query.

Executed, against the real `readSnapshotInputs` with `NO_CHAIN_QUERIES`:

```
INPUT KEYS: height, hash, timeMs, publishedAtMs, lanes, supplyZat, supplySource,
            poolBalances, orchardSeries, drainBaseline, crossings,
            migrationWindow, ironwoodSpends, ironwoodWindow, lastReports,
            labelsVersion
   crossings       = []
   migrationWindow = null
```

So `INDEXER_CHAIN_STORE=memory` gives the indexer a follower and gives the
gateway pool state, and puts NOTHING on the plane. `CUTOVER-1.0.md` section 10.1
states both shapes of the rung in a table rather than implying the one that does
not work, because a runbook that implied it would be this project's own recurring
shape written into the document meant to prevent it.

--------------------------------------------------------------------------
THE WALL, MEASURED AT n=6 RATHER THAN ASSUMED
--------------------------------------------------------------------------

Section 1 asks for captures rather than transcriptions (F-57-1). Six public
endpoints were tried before anything was written:

```
zcash-mainnet-zebrad.gateway.tatum.io   CONNECT tunnel failed, response 403
zcash.blockdaemon.com                   CONNECT tunnel failed, response 403
mainnet.lightwalletd.com:9067           Recv failure: Connection reset by peer
zec.getblock.io                         CONNECT tunnel failed, response 403
api.zcha.in                             CONNECT tunnel failed, response 403
zcashd.zecwallet.co                     CONNECT tunnel failed, response 403
```

and the proxy's own `recentRelayFailures` names five of them
`connect_rejected ... policy denial` and the sixth `ws_closed_mid_exchange`. So
the wall is this container's, it is not host-specific across six hosts, and
LEDGER-14 Q4's corrected wording holds: another Aqua Stack session reached the
same host the same week.

WHAT THAT MEANS FOR A7, SAID PLAINLY RATHER THAN GLOSSED. The fourth 429 body's
TEXT is L2's capture, RELAYED through the prompt. Its BEHAVIOUR - the property
that makes it a member of the exclusion set at all - is measured here, by driving
that exact body through the real client at both statuses: at 200 it returns
`RpcError: empty result`, which is neither a schema error nor a transport error,
so it parsed and took NEITHER refusal branch; at 429 it returns
`RpcRateLimitError` with `retryAfterMs` 60000. F-57-1 asks for a capture; where
the wire is unreachable the honest form is a relayed capture whose discriminating
property is re-measured, and naming which half is which is the whole of it.
```
--------------------------------------------------------------------------
SECTION 5, EACH WITH BOTH POLARITIES AND THE EXCLUSION-SET MEMBER NAMED
--------------------------------------------------------------------------

A1 - the preflight discriminates a served method from an absent one.
  PASS  an endpoint serving every shape: `z_gettreestate SERVED`, exit 0.
  FAIL  the SAME endpoint with `absentMethods: ["z_gettreestate"]` - a DATA
        mutation, nothing about the mock's code changes - `z_gettreestate
        ABSENT`, exit 1, and the message names the permanent cost. Executed end
        to end over a real socket, script spawned as an operator runs it.
        The member: an endpoint answering `-32601` for that one method.
  AND EVERY REQUIRED PROBE, not just this one: the suite iterates `PROBES` and
  makes each absent in turn, asserting ABSENT and a blocking exit each time. A
  probe added to the list cannot arrive untested.

A2 - the rate is MEASURED, with its n.
  PASS  a 5/minute endpoint: `last success 5, first refusal 6, n=8`.
  FAIL  the same burst against an endpoint with no ceiling - a DATA mutation -
        prints `no refusal in n=6` and NEVER the word MEASURED. The member: a
        rate figure emitted when nothing was refused, which CLAUDE.md says is
        not a measurement at all.

A3 - a missing `z_gettreestate` is named at startup, not at the first block.
  FAIL  the default source against an endpoint answering `-32601`: `RpcError`,
        `isFatal` false, zero blocks written, height unmoved, retry identical.
        The member: that endpoint. This is the reproduction of the live defect
        and it is kept as a test.
  PASS  with the absence named at startup: both blocks applied, tip advanced,
        `IRONWOOD_TREESTATE_ABSENT` on the notice list, ZERO anchors, and NOT
        ONE request spent asking a method already refused.

A4 - a 429 mid-`applyConfirmedBlock` retries cleanly.
  PASS  a refusal on the treestate call inside the apply: nothing mutated - no
        commitment, no anchor, no tip, nothing written - and the retry applies
        the block with its anchor. No `CommitmentAlreadyExistsError`.
  FAIL  a refusal on EVERY treestate call, five attempts: the state stays
        byte-identical to the base. The member: a state in which a refused
        external call has already mutated chain state.

A5 - `maxPosition` is the block's own reported tree size minus one.
  PASS  two blocks with reported sizes 1 and 2 give `maxPosition` 0n and 1n,
        asserted against `block.trees.ironwood.size - 1n` rather than against a
        literal.
  FAIL  the treestate withheld: NO anchor, `IRONWOOD_TREESTATE_ABSENT`, and the
        commitments still land. The member: an anchor root the node never sent.
        A third leg drives a treestate naming a DIFFERENT block, which is
        refused as `IRONWOOD_TREESTATE_MISMATCH`.

A6 - round 4's findings carry failing-then-passing transcripts, and round 5 ran
     over round 4's fix commit. See the gate section below.

A7 - F-57-1 applied to this rung's own mock. See THE WALL above: the capture is
     relayed and its discriminating behaviour is measured. The fourth body is
     driven through the same four-body loop the three others use, and through
     the real client at both statuses.
  FAIL  `{error: "rate limited"}`, HANDOFF-15's own body, is kept in the loop
        precisely because it is the member that PASSED by accident: it fails
        `envelopeSchema`, so it dodged the collision the fix removed.

A8 - `pnpm -r test` green with a real exit code, build BEFORE typecheck, both
     counts stated. See the gate table.

--------------------------------------------------------------------------
THE GATES, EIGHT OF THEM, AND `build` RAN FIRST
--------------------------------------------------------------------------

Every exit code read from `$?` of its own process, never through a pipe
(F-53-1). `build` first, because L2's own gate reported fifteen phantom type
errors on PR #57 by running it last against a stale `zebra-rpc/dist`.

```
BUILD_RC=0   TEST_RC=0   TYPECHECK_RC=0   LINT_RC=0   CHECK_RC=0
VALIDATE_RC=0   E2E_RC=0   SKIPGUARD_RC=0
```

HEALTHY:   1638 passed | 5 skipped | 1643 total
DEGRADED:  see the two-polarity run below - the counts are the only thing that
           discriminates, because the exit code is 0 either way.

The five skips, every one named:
  packages/zebra-rpc  version-floor-smoke  A11's live leg - no node answers here
  apps/publisher      redis-sink           the integration half - no local Redis
                                           on the publisher's own expectations
  apps/publisher      snapshot-inputs      A1 - no Postgres with 005 on its terms
  apps/publisher      rpc-only x2          the round trip and A1's fail side

`pnpm --filter @zcashreveal/web test:e2e`, which is deliverable 1b's required
report: **192 passed, twice.** Once mid-session at `E2E_SECONDS=406` (6.7
minutes) and again on the FINAL tree at `E2E_SECONDS=397` (6.5 minutes), both
`E2E_RC=0`. The second is the one that counts, because the first was taken
before rounds 4 and 5 changed the runtime; a figure quoted from a tree that no
longer exists is the shape LEDGER-11 fold 10 is about. **AND
`legibility.spec.ts:718` PASSED** under full-suite parallelism on BOTH runs,
which adds one more n to HANDOFF-15's carried-forward observation: it now stands
at ONE failure against three isolated passes, one CI pass, one L2 full-suite
pass in a different container, and this one. Recorded, not fixed, and not called
a flake - section 1 rules it out of scope and the count is still not a
diagnosis.

`node scripts/assert-no-skipped-integration.mjs` over three real vitest JSON
reports: exit 0.

--------------------------------------------------------------------------
THE GATE: FIVE ROUNDS, AND THE YIELD STILL FOLLOWS THE REPAIRS
--------------------------------------------------------------------------

VERIFICATION BUDGET, FIRST LINE AS LEDGER-05 Q5 REQUIRES: every finding acted
on below was REPRODUCED BY THE LEAD BY EXECUTION before the fix was written, and
every fix carries a mutation that turns its assertion red. Nothing was accepted
on a reviewer's report alone. Two findings were REFUTED by execution and no
change was made for either.

ROUND 4, on `62c4e77` plus this branch's own new code, five reviewers
dimensioned on failure paths as section 6 directs. Twenty-three findings.

  IN 62c4e77 ITSELF - four, which is what F-52-2 filed the round for:
    the memo took a FRESH 24 hours on a Redis hit rather than the key's
    remaining deadline, so an orphaned height answered to about T+47h while two
    docblocks and RUNTIME.md said the tiers expired together;
    nothing swept the memo, so it grew for the life of the process;
    `Number()` accepted `NaN`, `Infinity`, `0` from a blank and `16` from
    `"0x10"` as heights;
    and the test whose TITLE claimed the memo clear did not check it - deleting
    the line left every test in the file green.

  IN CODE THIS BRANCH WROTE ONE COMMIT EARLIER - eight, and one of them undid
  the rung below:
    the follower's reservation was taken in MEMPOOL-ONLY mode, where no follower
    starts, taking rung 2 from three transactions a minute to ZERO;
    the catch-up model costed two requests a block and the loop spends three;
    the preflight reported a dimensionless burst count as a per-minute ceiling -
    sixty-fold low against a per-second limiter;
    it read `version-floor.ts` from a CWD-RELATIVE path, so the same script
    against the same node exited 1 from the repo root and 0 from anywhere else;
    an UNPARSED subversion and an unreadable window each exited 0 printing "this
    endpoint serves every method this stack sends";
    `--skip-rate --rate-only` exited 0 having made zero requests;
    any flag value that was not all-digits became the URL;
    and the startup probe skipped ALL EIGHT probes in mempool-only mode on a
    true sentence about three of them.

  PRE-EXISTING, FOUND BECAUSE THE ROUND LOOKED - eleven, of which the largest is
  the one this rung most needed:
    a `store.writeBlock` failure left `chain.pools.*` mutated, `isFatal` read
    false, the loop retried, and the retry raised
    `CommitmentAlreadyExistsError` - so a dropped Postgres connection stopped the
    process under a message saying this build disagrees with consensus. That is
    `c53f2ba`'s shape one layer down, and the write cannot be hoisted the way the
    treestate fetch was, because the writes are derived from the positions the
    mutations produce. It is now `ChainPersistenceError`, fatal on the first
    failure, cause carried, remedy in the message.
    `62c4e77` swept half its own blank-value shape: `databaseUrl` still read
    `url.length > 0`, so a single space selected FULL mode and `createDb(" ")`
    opened a client on a string that is not a connection string; and four
    coerced numbers had no blank preprocess, three of which crash-loop at module
    scope with no log line while `ZEBRAD_RPC_RETRIES` silently became 0.
    `readCeiling` accepted all three declarations out of a BLOCK COMMENT whose
    lines start at column 0 - F-43-1's shape a third time.
    `classifyProbe` reported SERVED for "empty result", so a proxy answering
    `{}` to everything was certified as serving all eight methods.
    `describeVersionWindowVerdict` described verdicts against the MODULE's
    bounds rather than the ones compared.
    An `onFatal` that throws became an unhandled rejection.
    The aggregate property restated a constant the module exports, and the
    catch-up sweep over 197 ceilings evaluated ONE identical plan 197 times
    while its census read as coverage.
    CUTOVER-1.0's rollback step said "unset `DATABASE_URL` OR
    `INDEXER_CHAIN_STORE`" - executed both ways, the first leaves the follower
    RUNNING, which is a rollback step that rolls nothing back.

  TWO REFUTED, BOTH BY EXECUTION, AND THE SECOND IS THE ONE WORTH RECORDING.
  Two reviewers independently reported `ZEBRA_MAX_VERSION` as `6.9.0` against
  the static readers' `6.3.0`. Source line 106 declares `{major: 6, minor: 3,
  patch: 0}` and a freshly built runtime rejects `6.8.0` as above-ceiling. TWO
  AGREEING REVIEWERS ARE NOT A MEASUREMENT, and the rule that caught it is the
  one CLAUDE.md states about probes: check the instrument before judging the
  code.

THE VERIFY PHASE WAS INVALIDATED BY THE LEAD, AND SAYING SO IS THE POINT.
Round 4 was designed as find-then-refute, three adversarial refuters per
finding. Twenty-two verdicts returned before the phase was stopped and ALL
TWENTY-TWO were `refuted` - not because the findings were wrong, but because the
lead had already committed the fixes while the phase was still running, so every
refuter read a tree in which the defect was gone and correctly reported "already
fixed at HEAD". The verdicts are honest and they are not evidence about whether
the findings were real. What settles that is the lead's own reproduction of each
one against the PRE-FIX tree, which LEDGER-10 Q3 licenses for exactly this
class: a finding reproducible by running something does not need a refuter,
because the reproduction is stronger evidence than any verifier's opinion. The
design error was mine and it is a ledger question in section 8.

ROUND 5, on round 4's own three fix commits, which is what the stopping rule
requires and what this project's history predicts. Two of three lanes returned;
THE THIRD DIED ON A SESSION LIMIT AND IS REPORTED AS UNRUN RATHER THAN AS CLEAN.
Its lane was the prose and the test assertions - clause (c) and clause (ii)
surface - so the sentences this session added are the LEAST reviewed thing in
the branch, and section 8 carries that as an extrapolation rather than a
convergence claim. Sixteen findings from the two lanes that did return, every
one verified by execution against HEAD by its reviewer and re-reproduced by the
lead before the fix.

  aed2515's headline was "a Postgres hiccup was stopping the process and blaming
  the decoder". Its `ChainPersistenceError` then went out under the ONE fatal
  message the loop has - "the confirmed-block driver disagrees with consensus" -
  which `RUNTIME.md` section 5 routes to "do not skip it and do not lower the
  check ... file it with the log line". THE MISDIAGNOSIS MOVED FROM THE ERROR
  CLASS INTO THE LOG LINE AND THE RUNBOOK, in the commit whose subject was
  removing it. The line now names which kind of fatal it is, RUNTIME.md gains
  the row, and three further restatements are swept (LEDGER-03 Q3).

  `b71fdf9`'s probe-path split cut FULL mode from eight probes to five, dropping
  `getrawmempool` in both verbosities and `getrawtransaction`. THE FIX FOR
  "MEMPOOL-ONLY PROBES NOTHING" CREATED "FULL MODE PROBES FIVE OF EIGHT".

  The catch-up pace made `stop()` - and SIGTERM - block for up to sixty seconds.

  Three numeric flags were read with bare `Number`: `--timeout-ms 3s` made a
  live healthy endpoint report UNREACHABLE, which is the round-4 fix's own
  defect one flag over, and `--burst 0` made `--rate-only` exit 0 having made
  zero requests. `Math.max(1, ...)` invented a ceiling out of ZERO successes.
  `--window-max-ms` did not bound a `Retry-After` wait, so the preflight slept an
  hour. A proxy answering `{"result": null}` to everything was certified as
  serving all eight.

  Each version bound was TWO declarations, split down the reader boundary.

--------------------------------------------------------------------------
DELIVERABLE 1b's FOURTH FACE: A CHECK THAT HAS NEVER ONCE PASSED
--------------------------------------------------------------------------

**NO PRODUCTION DEPLOY OF THIS SITE HAS EVER BEEN SMOKE-VERIFIED.** L2 found it
on the merge commit after this prompt was drafted; this session confirmed the
cause before touching the file, because F-56-1 binds a claim about a module as
much as a probe of one:

```
package.json:7                       "packageManager": "pnpm@9.12.0"
post-deploy-smoke.yml                grep -c pnpm/action-setup  ->  0
ci.yml:86, e2e.yml:61                pnpm/action-setup@v5, BEFORE setup-node
```

so `actions/setup-node@v5` resolves a binary that is not on PATH, the job dies
at `Error: Unable to locate executable file: pnpm`, and the smoke step never
runs. L2's history filter returns 0 successes across 44 runs.

**AND IT WAS INVISIBLE FROM EVERY PULL REQUEST, WHICH IS WHY FIVE CONSECUTIVE
GATES READ PAST IT, L2's INCLUDED.** Its `if:` needs a Production
`deployment_status`; a pull request only ever produces a Preview, so on every PR
it reported `1 skipped`. **A check that cannot run on the surface where it is
read is not a skipped check, it is an ABSENT one** - and no list of commands a
session runs locally closes that face, which is why the origin's count moves to
FOUR while deliverable 1b closes two.

The fix is the three lines L2 specified, placed after `checkout` and before
`setup-node`, with the no-install intent kept - there is still no `pnpm install`
in that job. Step order verified by parsing the workflow: checkout,
pnpm/action-setup@v5, setup-node@v5, smoke.

**PROVEN, NOT ASSUMED - THE ADDENDUM ASKED FOR THIS AND IT IS THE HALF THAT
MATTERS, BECAUSE THIS WORKFLOW HAS A 44-RUN HISTORY OF LOOKING CONFIGURED AND
BEING INERT.** The live site is unreachable from this container - `zcuck.xyz`
and the Vercel host both answer `CONNECT tunnel failed, response 403` - so the
script could not be driven from here. The workflow's own `workflow_dispatch`
runs on GitHub's runners, where that wall does not apply, and it was dispatched
against this branch:

```
run 44  main @ f976477            deployment_status   FAILURE   <- the last production run
run 45  this branch @ f63f51a     deployment_status   SKIPPED   <- a PREVIEW, which is the
                                                                  "1 skipped" five gates read past
run 46  this branch @ f63f51a     workflow_dispatch   SUCCESS   <- with the three lines

  Run actions/checkout@v5          success
  Run pnpm/action-setup@v5         success   <- the step that did not exist
  Run actions/setup-node@v5        success   <- where every previous run died
  Smoke the deployed bundle        success   <- HAS NEVER EXECUTED BEFORE

  smoking https://zcuck.xyz
  post-deploy-smoke: OK - 10 script(s) fetched from https://zcuck.xyz; the
  fallback marker is present and no managed-store name is.
```

Runs 44 and 45 are this session's own independent confirmation of both halves of
L2's finding: the last production run FAILED, and the same commit under a
Preview `deployment_status` reported SKIPPED. **Run 46 is the first success in
the workflow's history and the first time its smoke step has executed at all.**

AND THE OUTPUT SAYS SOMETHING ELSE WORTH READING. "the fallback marker is
present and no managed-store name is" is the check passing, and it also means
the live site is serving the BUNDLED DOCUMENT rather than the managed store -
which is what `CUTOVER-1.0.md` section 7 says `source: fixture` looks like. That
is the expected state before the cutover and it is now a measurement rather than
an assumption.

--------------------------------------------------------------------------
THE POST-FAN-OUT SWEEP, AFTER EACH OF THE THREE FAN-OUTS
--------------------------------------------------------------------------

`git status --porcelain` was run after the scout, after round 4 and after round
5. It returned EMPTY every time: no worker wrote to the tree. Round 5's lane-1
reviewer states in its own budget that it mirrored the repository out of tree -
a tar copy with `node_modules` symlinked - to run nine product mutations against
the full suite without touching this checkout, which is the read-only rule
honoured rather than merely obeyed.

```


## §8 LEDGER BLOCK

Appended to `handoffs/LEDGER.md` under
`## §8 HANDOFF-16 - crossings forward, and three of section 1's own measurements`.
