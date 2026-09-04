---
handoff: 15
title: Live transactions - the mempool path on a rate-limited third-party endpoint (rung 2 of three)
status: shipped
branch: the session-designated branch (name it `feat/v2-15-live-transactions` if you may choose)
track: Integration
depends_on: 14
written_by: L2 (Cowork) · 2 Sep 2026, re-verified 3 Sep 2026
stack: Aqua Stack v4.1
---

# HANDOFF-15 — Live transactions: the mempool path on a rate-limited third-party endpoint (rung 2 of three)

**RUNG 2 OF THREE. HANDOFF-14 PUT LIVE BALANCES ON THE SITE. THIS PUTS LIVE TRANSACTIONS ON IT.**
Rung 3 (HANDOFF-16) adds crossings. Ship this alone; do not reach up the ladder.

**THE GATING FACT IS A MEASUREMENT AND NOT A HYPOTHESIS.** L2 ran sixteen `getblockchaininfo`
calls in a 1.4-second burst against the keyless Tatum endpoint on 3 September 2026: requests 1
through 5 answered `200`, requests 6 through 16 answered `429`, and it stayed refused. **Five
requests per minute, hard.** The indexer's default poll is `INDEXER_POLL_INTERVAL_MS = 2000`
(`apps/indexer/src/config.ts:15`), which is 30 `getRawMempool` calls a minute *plus one
`getRawTransaction` per new txid* — **six times the free ceiling before a single transaction is
fetched.** Everything in this handoff is sized against that number.

## §1 SCOPE

Run the mempool path against a **third-party RPC endpoint**, so `/v2/mempool` and the live panels
carry real mainnet transactions as they arrive — **with no node of this project's own.**

**AND THE BRIEF'S PREMISE ABOUT POSTGRES IS FALSE AGAINST THE SHIPPED OBJECT; IT IS CORRECTED HERE
RATHER THAN FOOTNOTED (LEDGER-11 Q5(a)).** L2's §1 said "The mempool path is already RPC-only by
construction … Nothing in that loop reads Postgres." Read against the tree at `c12826a`, the loop
reads Postgres and writes it, at two named sites:

| site | what it does | when |
|---|---|---|
| `apps/indexer/src/decoder/anchor-depth.ts:57` | `SELECT height FROM anchors WHERE anchor = …` | every shielded spend whose root misses the memo **and** misses Redis — `AnchorRegistry.getHeightForAnchor`, reached from `analyze()` via `index.ts:212` |
| `apps/indexer/src/index.ts:254` | `persistLeakReport(sql, d.report)` | every ADDED report, before the publish and the `hset` |

and `apps/indexer/src/index.ts:61` opens `postgres(cfg.DATABASE_URL)` unconditionally against a
`DATABASE_URL` that carries a localhost default (`config.ts:12`) — **the exact composition-root
shape LEDGER-14 named for the publisher one rung ago.** So "no database" is not a description of
the tree; it is work, and this handoff does it, because a rung that only runs beside a Postgres is
not the rung §1 describes.

What stands in the way of the endpoint is **rate**, and it is the larger half of this handoff.

L2's measurements, carried as fact where they were measured and as citation where they were read:

| what | measured |
|---|---|
| poll cost | `INDEXER_POLL_INTERVAL_MS` defaults to **2000 ms** → 30 `getRawMempool`/min, **plus one `getRawTransaction` per new txid**. Read at `apps/indexer/src/config.ts:15` and `index.ts:188-204` |
| keyless Tatum ceiling | **5 requests/minute, hard. MEASURED BY L2 ON 3 SEP 2026, NOT ASSUMED** — a 16-request burst over 1.4 s returned 200 five times and 429 for every request from the sixth on, and it stayed refused |
| verdict | the default poll is **six times** the free ceiling before a single transaction is fetched |
| served keyless | `getrawmempool` SERVED · `getrawtransaction` SERVED (a fake txid answers "No such mempool or main chain transaction" — the method WORKS) |

**AND A 429 IS TODAY INDISTINGUISHABLE FROM A DEAD SOCKET, WHICH MAKES THE CEILING WORSE RATHER
THAN VISIBLE.** `packages/zebra-rpc/src/client.ts:209` throws a bare `Error("HTTP 429 from zebra")`,
`call()` at `:145-151` catches everything that is not an `RpcError` as a retryable transport
failure, and `:140` then sleeps 200 ms and 400 ms and tries again. So one logical call at the
ceiling **spends three of the five requests in the minute** and finally reports
`RpcTransportError: no response after 3 attempts` — a message that names a timeout for a node that
answered, promptly, with a number. That is §3's first clause, live in the tree.

**THE ENDPOINT IS REACHABLE FROM SOME CONTAINERS AND NOT FROM THIS ONE.** L2 reached
`zcash-mainnet-zebrad.gateway.tatum.io` and ran `scripts/prove-rpc-only.mjs` against it to exit 0 on
the same day HANDOFF-14 recorded it as `connect_rejected`. The wall is **container-scoped, not
stack-scoped**. Whichever it is for the executing session is a fact to record in §7, not to assume.

**Out of scope:** confirmed blocks and crossings (rung 3); Mode A; the address index. The
confirmed-block follower needs `PostgresChainStore` and stays exactly as it is — it simply does not
start in the mode this handoff adds.

## §2 READING

`CLAUDE.md` · `apps/indexer/src/{index,config}.ts` · `apps/indexer/src/decoder/leak-analyzer.ts` ·
`apps/indexer/src/decoder/anchor-depth.ts` · `packages/zebra-rpc/src/{client,errors}.ts` ·
`apps/gateway/src/routes/mempool.ts`, `views/mempool.ts`, `live-reports.ts` and `ws-broker.ts` ·
`apps/publisher/src/chain-inputs.ts` for HANDOFF-14's `chainAccessFor` seam, which this handoff
reuses rather than reinvents · **`docs/2.0/SNAPSHOT.md` before anything touches Redis** ·
LEDGER-11's WS-envelope and wire-form findings · LEDGER-14 in full, because its
composition-root finding is this handoff's §1.

## §3 CONTRACT

- **A 429 IS A FIRST-CLASS STATE, NOT AN ERROR PATH.** It is not a node refusing and it is not a
  transaction that does not exist. It must back off, and the back-off must be visible in the log
  and in the staleness the reader sees — never a silently thinner mempool.
- **AN ADAPTIVE POLL REPORTS ITS OWN RATE.** If the loop slows to fit a ceiling, the site says how
  stale the mempool view is. A reader must never be shown five transactions and left to assume that
  is the mempool.
- **A PARTIAL MEMPOOL IS A NAMED PARTIAL.** When the budget runs out mid-drain, the view says
  "N of M transactions analysed" rather than presenting N as M. This is the absence-versus-zero rule
  (`chain-inputs.ts:42`) on a different surface.
- **The wire form is `serializeWire`/`reviveWire`, both directions.** HANDOFF-12 replaced
  key-guessing with a tagged `{"$bigint": "..."}` form; every report on this path uses it. A bare-
  string bigint on this seam is the defect family that has cost this project four instances.
- **A DEGRADED ANCHOR DEPTH IS AN ABSENCE, NEVER A ZERO.** With no cold tier, an anchor that misses
  the memo and Redis is `null` — which `getHeightForAnchor` already returns and the analyser already
  renders as "unknown". Nothing on this path may turn that into a depth.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

0. **This file.** Written by the session that executes it, the sixth in this directory to be so.
1. **A rate-aware mempool loop.** The poll interval and the per-tick transaction budget derive from
   a configured requests-per-minute ceiling rather than from a hardcoded 2000 ms. Given 5/min it
   must still run — slowly, honestly, and saying so.
2. **429 handling in `packages/zebra-rpc`**, distinguished from every other failure, with back-off
   and a typed outcome the caller can act on. Not a retry loop that hides it.
3. **A visible mempool staleness figure** on the surfaces that render mempool rows: how long ago the
   view was complete, and how much of it was analysed.
4. **`docs/2.0/RUNTIME.md` gains "third-party mempool mode"** — the ceiling, the poll it implies,
   what a reader sees at 5/min versus at a provider rate, and the arithmetic for both.
5. **A local mock endpoint** that serves the two methods and can be told to 429 on demand, so every
   polarity below is drivable without a provider.
6. **The indexer's composition root gains the seam the publisher already has** — `DATABASE_URL`
   optional, the mempool path running without it, the confirmed-block follower not starting in that
   mode. This is deliverable 0's correction to §1 made executable, and it is what makes "no
   database" true rather than aspirational.

## §5 ASSERTIONS — each needs both polarities, and each names its EXCLUSION SET

The format is the amended one (LEDGER-09a Q2, enforced for PRESENCE by
`scripts/check-ledger-structure.mjs` R4 and for CORRECTNESS by nobody): each assertion states the
set of values its predicate exists to reject, and §7's fail-side transcript names WHICH MEMBER of
that set it used, so a reader sees at a glance whether the fail side came from inside the set or
from outside it. **At least one fail side per assertion is a DATA mutation**; the type-level exit
(LEDGER-11 Q5(c)) is taken only where no field can hold the excluded value, and is marked as such.

- **A1.** At a configured ceiling of 5 requests/minute the loop runs, never exceeds it, and
  publishes real reports.
  *Exclusion set:* any rolling minute in which the loop issues a sixth request to the endpoint —
  `getrawmempool`, `getrawtransaction` and `getblockchaininfo` counted together, because the ceiling
  counts requests and not methods.
  *Fail side names:* a run whose sixth request is issued inside one rolling minute. The mock counts
  every request it receives and the test fails on the sixth, so the member is drawn from inside the
  set rather than from a deleted callback.

- **A2.** A 429 mid-drain backs off and resumes without losing or duplicating a report.
  *Exclusion set:* a completed drain whose published report set differs from the mempool's txid set
  — any omission, any duplicate, any report published twice under one txid.
  *Fail side names:* a drain in which the mock 429s on request 3 of 8. The member is the eight-txid
  mempool whose drain is interrupted; the assertion is that the set after two ticks equals the set
  the mock served, and the pre-fix client turns that 429 into `RpcTransportError` after burning two
  more requests.

- **A3.** A partial drain renders as "N of M analysed" and never as M.
  *Exclusion set:* any rendered mempool summary whose stated total equals its analysed count while
  the drain was in fact partial — the absence-versus-zero rule on a counting surface.
  *Fail side names:* a view built from a drain of 3 of 9. The member is that view; the assertion is
  that the copy names both numbers, and the complete-drain polarity asserts the same surface does
  NOT say "partial" when nothing was left.

- **A4.** Every report on this path round-trips through `serializeWire`/`reviveWire` with bigints
  intact.
  *Exclusion set:* any field whose revived `typeof` is `string` where the declared type is
  `bigint` — the four non-`Zat`-suffixed bigints on `ClaimAssessment` are the members this
  project has already been bitten by.
  *Fail side names:* `ClaimAssessment.rawCount`, a bigint whose key does not end in `Zat`. It is
  carried through the REAL producer and the REAL reviver, and the pre-HANDOFF-12 key-guessing
  reviver returns it as `string`.

- **A5.** Nothing on this path reaches the managed store.
  *Exclusion set:* any Redis client constructed in `apps/indexer` or `apps/gateway` from a
  managed-store URL, and any key written outside `zecreveal:` — `SNAPSHOT.md` rule 5.
  *Fail side names:* a `REDIS_URL` naming an Upstash host handed to `loadConfig`. The member is that
  URL; `assertNotManagedStore` must throw, and the positive polarity is the VPS URL starting
  normally.

- **A6.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe
  (**F-53-1**). **AND THE COUNTS ARE READ, NOT JUST THE CODE:** a run with Postgres or Redis down
  still exits 0 while silently skipping the integration halves — HANDOFF-14's §7 caught exactly that
  at 93 passed / 20 skipped, and L2's own first verification run of PR #56 reproduced it at
  1419 / 111. State the passed AND skipped counts, and name every skip.
  *Exclusion set:* any reported figure taken from a run whose exit code reached the report through a
  pipe, and any run reported as green whose skipped count is not enumerated by name.
  *Fail side names:* the degraded run itself — the services stopped, the counts read, the skip list
  printed. That transcript is the member, and it is shown beside the healthy one rather than
  described.

- **A7. F-56-1, this handoff's new rule, applied to itself.** Every fail side here mutates
  `apps/indexer/src/index.ts`, `packages/zebra-rpc` or the mempool view. **Read each line-by-line
  before writing the probe that judges it**, and say in §7 which modules were read that way.
  HANDOFF-14 had FOUR probes that were wrong before the code was, all four looking exactly like
  product defects; every one was written against a module its author had not read.
  *Exclusion set:* any probe in this branch whose target module is not on §7's read list — the rule
  is about the probe's provenance, so the excluded value is a probe rather than a datum.
  *Fail side names:* §7 lists the modules read line-by-line and the probes written against each. A
  probe naming a module absent from that list is the member, and the check is that the list and the
  probe set agree in both directions.

- **A8.** With `DATABASE_URL` unset the mempool path runs, publishes, and reports every
  database-derived quantity as an absence.
  *Exclusion set:* any anchor depth, persisted row or numeric ZERO standing where a database read
  did not happen. A `0` here is the excluded value and `null` is the required one — CLAUDE.md's
  absence-versus-zero rule, and LEDGER-06's `NOT NULL` reading applied to a dependency rather than
  a column.
  *Fail side names:* a shielded spend whose anchor root is in neither the memo nor Redis, driven
  with no cold tier. The member is that root; `getHeightForAnchor` must return `null` and the
  rendered depth must be the "unknown" branch, never `0`.

## §6 DISPATCH HINTS

Fan out on failure paths, not files — every one of HANDOFF-12's twelve defects lived on what happens
when something upstream refuses, and none was visited by a green suite. Paths: a 429 mid-drain, a
transaction that vanishes between `getrawmempool` and `getrawtransaction`, a malformed relayed
frame, a budget exhausted mid-tick, an anchor lookup with no cold tier. The refuter's standing
question on this code: **does the retry actually retry, or does it re-enter a mutated state?** That
question found the worst of the twelve.

---

**One thing this handoff inherits and must not silently carry.** `62c4e77` — gate round 3's own fix
commit on the confirmed-block runtime — has never been reviewed (**F-52-2**). It is rung 3's code,
not rung 2's, so it is not reviewed here. It is carried forward in §8 so HANDOFF-16 opens with it.

## §7 REPORT

```
STATUS: DONE

All seven deliverables are in the tree, including deliverable 6, which this
handoff's own section 1 did not contain until deliverable 0 corrected it.
Every assertion carries a two-polarity transcript and every fail side names
which member of its exclusion set it drew.

FORKED FROM c12826a60b7c68675422e08fea0388863e7396e0, the head of `main`.
`git merge-base --is-ancestor 9553842 origin/main` exits 0, so PR #56 landed
and not merely its write-back. Executed, output shown, before any file was
touched.

SPAWN MODE: subagents available, proven by a tool attempt before any work -
an `Explore` worker returned a full structured report on `apps/indexer` and
`packages/zebra-rpc` before the reconcile commit. FOUR FAN-OUTS: two
read-only mapping workers at the start, two read-only gate reviewers at the
end. The post-fan-out sweep was run after each and `git status --porcelain`
was empty every time - no worker wrote to the tree.

THE LIVE ENDPOINT IS UNREACHABLE FROM THIS CONTAINER, AND THAT IS A FACT
ABOUT THIS CONTAINER (LEDGER-14 Q4, as L2 corrected it). Section 1 said to
try before assuming, so it was tried:

  POST https://zcash-mainnet-zebrad.gateway.tatum.io/
    curl: (56) CONNECT tunnel failed, response 403

and the proxy's own `recentRelayFailures` names the host with
`connect_rejected`. `mainnet.lightwalletd.com:9067` reset the connection,
which L2 already noted may be that host being independently down. So n=1
policy denial measured here; L2 reached the same host from a different
container the same day and ran `scripts/prove-rpc-only.mjs` against it to
exit 0. The wall is container-scoped. The local mock in deliverable 5 was
therefore the whole harness, and it is a real HTTP server rather than a
`FetchLike` double precisely because that is the difference between
evidence about a wire and evidence about a fixture.

--------------------------------------------------------------------------
WHAT DELIVERABLE 0 CORRECTED, BECAUSE IT SIZED EVERYTHING ELSE
--------------------------------------------------------------------------
L2's section 1 said "The mempool path is already RPC-only by construction:
nothing in that loop reads Postgres." Read against c12826a it reads Postgres
and writes it, at two named sites, and the composition root opens a
connection unconditionally:

  apps/indexer/src/decoder/anchor-depth.ts:57   SELECT height FROM anchors,
    per shielded spend whose root misses the memo AND misses Redis
  apps/indexer/src/index.ts:254                 persistLeakReport, per added
    report
  apps/indexer/src/index.ts:61                  postgres(cfg.DATABASE_URL),
    against a URL with a localhost default at config.ts:12

That is LEDGER-14's own composition-root finding standing in a second app,
one rung later. "No database" was therefore work rather than a description,
and it became deliverable 6 rather than a footnote (LEDGER-11 Q5(a)).

--------------------------------------------------------------------------
THE ASSERTIONS
--------------------------------------------------------------------------
A1  PASS: four ticks at a ceiling of 5/min against `MockRpcEndpoint`,
    `peakInWindow(60_000) === 5` measured at the ENDPOINT with its own
    implementation of the rolling window - not by asking the gate whether it
    kept to its own budget. 12 transactions analysed of 20 observed, every
    request 200.
    FAIL SIDE BY DATA: the same run with the gate removed. `peakInWindow`
    exceeds 5 and the mock starts answering 429 - two independent witnesses
    to the member "a rolling minute in which a sixth request goes out".

A2  PASS: the mock refuses ordinal 5 (the third transaction fetch, so the
    refusal lands mid-drain with budget still available - a different
    condition from an exhausted budget, which is why `refuseAt` exists
    beside `perMinute`). Tick 1 holds 2 reports and evicts NOTHING; tick 2
    completes the set; 8 distinct txids fetched for 8 transactions, no
    duplicate.
    FAIL SIDE: reverting `deferred` to the pre-fix form turns this red.

A3  PASS: a budget of 3 over a mempool of 9 publishes
    `observed 9 / analysed 3 / deferred 6 / complete false / completeAtMs
    null`, and `mempoolDrainNotice` renders "3 of 9 analysed".
    OTHER POLARITY: the same state re-drained unmetered publishes
    `analysed 9 / deferred 0 / complete true` and the copy does not say
    partial. Without it the assertion is satisfied by a constant.

A4  PASS: `serializeWire`/`reviveWire` round-trip, already pinned by
    HANDOFF-12's `wire-form.test.ts` including the exact data mutation this
    assertion names (`ClaimAssessment.rawCount`, a bigint whose key does not
    end in `Zat`, both polarities at that file's lines 190-204). RE-DRIVEN
    HERE ON THE NEW SEAM: the REAL ticker produces a `MempoolDrainState`,
    the REAL `JSON.stringify` a Redis SET does carries it, and the REAL
    `mempoolDrainStateSchema` the gateway parses with reads it back - the
    instrument LEDGER-11 names, applied before the code shipped rather than
    a commit after.

A5  PASS: `REDIS_KEYS.mempoolDrain` is `zcashreveal:mempool:drain` - the VPS
    namespace, one letter from the managed store's `zecreveal:`.
    FAIL SIDE BY DATA: the same document stored under `zecreveal:` is not
    found, because the reader asks for one key and only one.
    `check-redis-safety` green; no `KEYS`, no `SCAN`, no pattern delete -
    the one new deletion is `HDEL` on named fields of one `zcashreveal:`
    key.

A6  BOTH POLARITIES, AND THE COUNTS ARE THE EVIDENCE RATHER THAN THE CODE:

      healthy   1597 passed |   5 skipped | 1602 total   TEST_RC=0
      degraded  1465 passed | 111 skipped | 1576 total   TEST_RC=0

    The degraded figures are a real run with Postgres and Redis stopped.
    The exit code is IDENTICAL; only the counts discriminate, which is the
    whole of what this assertion says. The five healthy skips, named:
      1. A11 LIVE LEG SKIPPED, WITH ITS REASON: no node answered
      2. A7 SKIPPED, WITH ITS REASON: no local Redis
      3. deliverable 2 SKIPPED, WITH ITS REASON: no local Redis
      4. A1 FAIL SIDE SKIPPED, WITH ITS REASON: no reachable Postgres
      5. A1 SKIPPED, WITH ITS REASON: no reachable Postgres with 005
    All five are on `assert-no-skipped-integration.mjs`'s ALLOWED_SKIPS and
    this branch adds no sixth. THAT GUARD WAS RUN LOCALLY, against real
    vitest JSON reports: 738 total, 733 passed, 0 failed, 5 skipped, exit 0.
    It is the gate that rejected HANDOFF-14's first push and that LEDGER-14
    Q5 records as existing only in CI; clearing it before the push is the
    cheap half of that question answered in practice rather than in
    structure.

A7  MODULES READ LINE-BY-LINE BEFORE ANY PROBE WAS WRITTEN AGAINST THEM
    (F-56-1, adopted from LEDGER-14 Q1 in this session's second commit):
      apps/indexer/src/index.ts               all 286 lines, at c12826a
      apps/indexer/src/config.ts              whole
      apps/indexer/src/mempool-state.ts       whole
      apps/indexer/src/decoder/anchor-depth.ts whole
      apps/indexer/src/decoder/leak-analyzer.ts  the three
                                              getHeightForAnchor call sites
                                              and the context type
      packages/zebra-rpc/src/client.ts        the retry loop and #once
      packages/zebra-rpc/src/errors.ts        whole
      apps/gateway/src/routes/mempool.ts, views/mempool.ts, live-reports.ts
      packages/zec-types/src/realtime.ts, the mempool half of views.ts
      apps/web/src/lib/api/stream.ts (asView/asRow/CLASSES),
                                              app/track/page.tsx Block A
    Every probe in this branch mutates one of those. THE RULE EARNED ITS
    KEEP ON ITS FIRST OUTING: five of this session's probes were wrong
    before the code was, and each is recorded in the test rather than
    quietly repaired (see below).

A8  PASS: `NO_CHAIN_WRITES.anchors.getHeightForAnchor` resolves `null` and
    the test asserts `not.toBe(0)` explicitly, because the member of the
    exclusion set is a ZERO - a depth of zero is the strongest claim this
    analyser can make about a spend, and `leak-analyzer.ts:161` already
    renders the null as an unknown depth graded LOW. `persist` resolves
    without doing anything and does not throw; the two follower-only hooks
    are null rather than no-ops.
    NOT FULLY CLOSED, AND SAYING SO IS THE POINT: a gate reviewer found that
    `apps/gateway/src/views/tx.ts:162` answers an unindexed transaction with
    `severity: "INFO"` - the BOTTOM of a four-point scale, not an absence -
    so in mempool-only mode every /tx page renders a severity chip
    indistinguishable from a classification that ran. The fallback predates
    this handoff; what this handoff did was make it reachable by
    configuration. The fix is a nullable `TxView.severity` plus a consumer
    sweep, which is a DTO change beyond rung 2. RUNTIME.md section 8.6 now
    states the exception rather than claiming "never to zeros" without
    qualification, and it is carried in section 8 for HANDOFF-16.

--------------------------------------------------------------------------
THE GATE: FOUR ROUNDS
--------------------------------------------------------------------------
VERIFICATION BUDGET, STATED FIRST (LEDGER-05 Q5): every finding below was
reproduced by the lead by execution before acceptance. Nothing was accepted
on a reviewer's say-so and nothing is carried UNVERIFIED. Rounds 1, 2 and 4
were the lead's own; round 3 was two dispatched reviewers, dimensioned on
FAILURE PATHS rather than files as section 6 directs.

ROUND 1 (the lead, over the whole diff). One finding, in an executable line:
`readDrainState` did `JSON.parse(raw) as MempoolDrainState` - the exact cast
`live-reports.ts`'s own header records costing a live 500 on every non-empty
mempool in HANDOFF-11, in the same file, one field over, reintroduced by the
commit that added the field. Executed against `{"observed": 5}`: the cast
produced `updatedSecondsAgo: NaN`, `mempoolViewSchema` rejected the whole
view, `respond` threw `DtoViolation`, `/v2/mempool` answered 500. One
malformed key would have taken the entire mempool table off the page to
protect a single staleness figure.

ROUND 2 (the lead, over round 1's fix commit). `drain-state.ts` gives, as
the reason its key carries no TTL, that "a key whose `updatedAtMs` is an
hour old means the indexer stopped - the gateway renders those differently".
It did not: the partial branch named only the last COMPLETE drain, so a
process dead for an hour printed the same sentence forever with nothing on
the line moving. The sentence was in the tree before the behaviour was.

ROUND 3 (two dispatched reviewers). ELEVEN findings, two CRITICAL, and both
CRITICALs are the defect this branch claims to have removed reached through
lines this branch added:

  S1  `#once` classified a 429 by its BODY before its STATUS. Measured
      through the repo's own `envelopeSchema`: a Cloudflare HTML page fails
      `JSON.parse` and became a bare `Error` retried on the transport
      policy - three requests of a five-request minute, reported as "no
      response after 3 attempts"; a JSON-RPC-wrapped limiter parses, so the
      error-object branch fired first and produced an `RpcError` that never
      penalised the gate and published `refused: false`.
      AND THE REASON NO TEST CAUGHT IT IS WORTH AS MUCH AS THE FIX: the mock
      answered `{error: "rate limited"}` with `error` as a STRING, which
      fails `z.object(...)`, so the ONE 429 shape the whole suite drove was
      the one shape that dodged the collision. A fail side chosen,
      unknowingly, to pass - which is the fail-side rule turned on its
      author. The mock now emits all three real bodies; restoring the
      pre-fix ORDER (typecheck clean, so it is a behavioural revert and not
      a broken file) turns 8 tests red, and the `bare` body still passes
      there, which reproduces the diagnosis rather than restating it.
  S2  A 429 on the tick's own overhead published NOTHING, because `publish`
      sits inside the try above the throw. A quiet mempool followed by an
      endpoint refusing every call had /track rendering
      `data-complete="true"` and "4 of 4 analysed - every transaction the
      node reported has been analysed, 47 min ago" while the real mempool
      was unreachable. The log line already asserted the view was aging.
  S3  A month-long `Retry-After` did not park the gate, it SPUN it.
      Measured on Node 22: a 2,678,400,000 ms timer warns
      `TimeoutOverflowWarning ... Timeout duration was set to 1` and fires
      in about a millisecond, so `take()`'s re-check loop ran at roughly a
      kilohertz forever with the non-reentrancy flag held.
  S4  `deferred` came from the budget slice BEFORE the loop, so a
      refusal-first tick of 100 published `deferred: 97` with three rows in
      no bucket, and an unmetered tick that analysed two of eight published
      `deferred: 0`. A2 asserted `refused` and `complete` and never
      `deferred`, which is why it read as green.
  S5  The plan sizes a tick in CALLS and the gate counts REQUESTS.
  S6  `penalise` materialised `perMinute` array slots from unbounded config.
  S7  The header clock and the gate clock were different.
  F1  `ceilingPerMinute ?? 0` printed "metered at 0 requests a minute, which
      affords 3 transactions a minute" - a zero standing for an absence, in
      the function whose subject is refusing that, in a self-contradicting
      sentence.
  F2  The WebSocket connect frame always said `drain: null` while
      `/v2/mempool` said "3 of 412" - one gateway, one Redis, one request,
      two answers. `live-reports.ts`'s own recorded seam, one handoff later,
      through a new FIELD instead of a new cast.
  F3  `/track` was `next build`-STATIC with no revalidate, so every
      server-rendered figure on it was frozen at build time. Found by
      reading the build output rather than the page; the fix is visible in
      the same place, where `Revalidate` read blank and now reads `1m`.
  F4  Nothing pruned `zcashreveal:mempool:live` at startup and
      `MempoolState.reconcile` walks an empty map on a fresh process, so
      after a restart /track would print "412 unconfirmed", "3 of 400
      analysed" and 412 rows - three adjacent statements about one set. The
      leak predates this handoff; the contradiction is new.
  F5  `analyzeOne` returning "failed" was driven by no probe in this branch,
      and a decode failure was folded into "not reached" - so a permanently
      undecodable transaction kept `complete` false forever while the only
      words available were "the indexer has not finished this drain", a
      claim of pending-ness about work that will never finish.
  F6  RUNTIME 8.6's "stated absences, never to zeros" is false for
      `severity` (see A8).
  F7  `completeSecondsAgo` floored a future timestamp to 0 and rendered
      "last complete just now".
  Two categories came back CLEAN and are recorded as such rather than
  omitted: `RateGate`'s tail cannot deadlock or leak (both handlers map to
  undefined, so a rejected run still advances it), and `penalise` + `#trim`
  are arithmetically correct at 59,999 / 60,000 / 60,001 ms.

ROUND 4 (the lead, over round 3's fix commit). RUNTIME.md section 8.5 quotes
what `mempoolDrainNotice` prints, and round 3's F1 fix changed the rate
clause under it - silently falsifying two of its three rows. Second drift of
the same table. A test now reads the document and asserts every quoted
string is one the function returns, with a fail side proving the check is
not vacuous over a 500-line file.

EXTRAPOLATION (clause (iii) - stated rather than claiming convergence).
Clause (i)(a) is NOT satisfied: round 3 returned findings a user could see,
and round 4 found a false table. A fifth round would probably find one or
two more of round 4's kind - a sentence in RUNTIME.md section 8 or a
docblock in `mempool-tick.ts` asserting a behaviour nobody executed - rather
than another S1. The reach curve says so: round 1 found one live 500, round
3 found two CRITICALs in the refusal path, round 4 found a stale table. The
product surface is about 700 executable lines; the prose surface around it
is about 400 lines of operator instruction and docblock, and three of the
last four findings have been in what surrounds the code rather than in it.

CLAUSE (i)(b): the recurring FACE this branch closed is "a document quoting
a computed value drifts silently", and it is now covered by a guard shown to
fail on it (the RUNTIME.md test, with a non-vacuous fail side). The ORIGIN
behind it - LEDGER-09b Q3's "a new member arrives without inheriting a
convention" - stays open and its count does not reset.

--------------------------------------------------------------------------
FIVE PROBES OF MINE WERE WRONG BEFORE THE CODE WAS
--------------------------------------------------------------------------
Recorded rather than repaired (LEDGER-05 fold 7), because each looked
exactly like a product defect:
  1. A `RateGate` window assertion counted four 100 ms advances where the
     loop runs five, and asserted 59,600 against a correct 59,500.
  2. A1's transaction fixtures were `{txid}`, which `rpcTransactionSchema`
     rejects - so `getRawTransaction` threw a schema error that the probes'
     own BARE catch blocks read as a refusal. Four red assertions, none
     about the code they named.
  3. A1 measured the endpoint on `Date.now()` while the gate ran on a fake
     clock, so twelve requests correctly spread over three minutes landed
     inside one real millisecond and the peak read 12 (LEDGER-04a's shape:
     an instrument whose scope does not match its question).
  4. A `not.toContain("just now")` written to prove a never-complete drain
     reports no age - an over-broad forbidding of a STRING where the
     property is about a clause.
  5. My first run of RUNTIME 8.7's mock command failed, and the invocation
     was wrong rather than the command: run from the repo root, where `tsx`
     does not resolve, instead of through the documented pnpm filter.
AND ONE INSTRUMENT UNDERSTATED WHAT IT FOUND: the probe that found round
1's cast defect captured its result with `JSON.stringify`, which renders NaN
as `null` - so the first reading looked benign. `JSON.stringify(NaN)` is
`"null"`, measured. LEDGER-04a's rule about instruments, arriving through a
serialiser rather than a sort order.

AND ONE DEFECT IN CODE I HAD WRITTEN THE SAME HOUR, found by executing a
line rather than reading the function: `parseRetryAfterMs("1.5")` returned
0, not null, because `Date.parse("1.5")` is 5 January 2001 and the clamp
turned the negative into zero - so every caller read "retry immediately" for
a header the parser had failed to understand. Absence rendered as a zero, in
a parser whose subject is a wait.

--------------------------------------------------------------------------
GATES, EACH EXIT CODE READ DIRECTLY FROM ITS OWN PROCESS (F-53-1)
--------------------------------------------------------------------------
TEST_RC=0  TYPECHECK_RC=0  LINT_RC=0  VALIDATE_RC=0  CHECK_RC=0  BUILD_RC=0
1597 passed | 5 skipped | 1602 total, all five skips named above.
Seventeen static guards green. `pnpm build` 8/8, `/track` at `Revalidate 1m`.
`assert-no-skipped-integration.mjs` run locally: exit 0.
Post-fan-out sweep after all four fan-outs: `git status --porcelain` empty
every time.

INFERRED: that "the mempool path with no database" means the mempool path
specifically, and that the confirmed-block follower not starting is a
configuration rather than a regression - section 1 puts confirmed blocks and
crossings out of scope, and the follower needs `PostgresChainStore`. Stated
rather than assumed, because the alternative reading is that deliverable 6
should have kept the follower alive on a memory store, which would be rung
3's work done quietly inside rung 2.

NOT-MATCHED: none.

SPEC-WAS-AMBIGUOUS: section 1's Postgres premise, resolved under LEDGER-11
Q5(a) - checked against the shipped object, corrected in this handoff, and
made executable as deliverable 6 rather than footnoted.

DEFERRED ASSUMPTIONS:
  Whether `TxView.severity` becomes nullable so an unindexed transaction
  renders an absence rather than "INFO" (A8, F6). Rung 3's, and section 8
  carries it.
  Whether the completeness notice moves into the client island so it ages
  continuously rather than being bounded at 60 s by `revalidate`. Now
  possible, because F2 put the drain on the WebSocket frame.
  Whether `INDEXER_RPC_MAX_RPM` should read rate-limit HEADERS rather than
  infer from a 429 - LEDGER-14 deferred it to this rung, and this rung
  reads `Retry-After` but not `X-RateLimit-*`, which no measured endpoint
  here sends.
```

## §8 LEDGER

_Appended to `handoffs/LEDGER.md` before the PR opens._
