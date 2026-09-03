---
handoff: 15
title: Live transactions - the mempool path on a rate-limited third-party endpoint (rung 2 of three)
status: in-progress
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

- **A1.** At a configured ceiling of 5/min the loop runs, never exceeds it, and publishes real
  reports. *Exclusion set: any minute in which the loop issues a sixth request.* **Fail side by
  DATA:** a mock that counts requests per rolling minute and fails the test when the count exceeds
  the ceiling — the member drawn from the set is a run whose sixth request is issued.
- **A2.** A 429 mid-drain backs off and resumes without losing or duplicating a report. *Exclusion
  set: a completed drain whose report set differs from the mempool's txid set — any omission, any
  duplicate.* **Fail side:** the mock 429s on request 3 of 8; the drain completes across two ticks
  with the same set.
- **A3.** A partial drain renders as "N of M analysed" and never as M. *Exclusion set: a rendered
  mempool summary whose stated total equals its analysed count while the drain was partial.* **Fail
  side:** force a partial and assert the copy; then a complete drain and assert it does not say
  "partial".
- **A4.** Every report on this path round-trips through `serializeWire`/`reviveWire` with bigints
  intact. *Exclusion set: any field whose revived `typeof` is `string` where the declared type is
  `bigint`.* **Fail side by DATA:** a report carrying a non-`Zat`-suffixed bigint —
  `ClaimAssessment.rawCount` — must survive, which the pre-HANDOFF-12 reviver would have failed.
- **A5.** Nothing on this path reaches the managed store. *`SNAPSHOT.md` rule 5. Exclusion set:
  any Redis client in `apps/indexer` or `apps/gateway` constructed from a managed-store URL.*
- **A6.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe
  (**F-53-1**). **AND THE COUNTS ARE READ, NOT JUST THE CODE:** a run with Postgres or Redis down
  still exits 0 while silently skipping the integration halves — HANDOFF-14's §7 caught exactly that
  at 93 passed / 20 skipped, and L2's own first verification run of PR #56 reproduced it at
  1419 / 111. State the passed AND skipped counts, and name every skip.
- **A7. F-56-1, this handoff's new rule, applied to itself.** Every fail side here mutates
  `apps/indexer/src/index.ts`, `packages/zebra-rpc` or the mempool view. **Read each line-by-line
  before writing the probe that judges it**, and say in §7 which modules were read that way.
  HANDOFF-14 had FOUR probes that were wrong before the code was, all four looking exactly like
  product defects; every one was written against a module its author had not read.
- **A8.** With `DATABASE_URL` unset the mempool path runs, publishes, and reports every
  database-derived quantity as an absence. *Exclusion set: any anchor depth, any persisted row, any
  numeric zero standing where a database read did not happen.* **Fail side by DATA:** a spend whose
  anchor is in neither the memo nor Redis must produce `null`, and the probe asserts the analyser's
  rendered depth is the "unknown" branch — not `0`.

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

_To be filled by the executing session before the PR opens._

## §8 LEDGER

_Appended to `handoffs/LEDGER.md` before the PR opens._
