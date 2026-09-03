# PROMPT-15 — the messages that steered the HANDOFF-15 session

Archived verbatim under Revolution protocol step 5. One file per handoff, each message under a
heading naming what it is and when it arrived. This first message lands in the same commit as
RECONCILE (LEDGER-02 Q7); anything that arrives mid-session is appended in the next commit.

**THIS PROMPT CARRIES AN `L2 RESOLUTION` BLOCK, SO REVOLUTION PROTOCOL STEP 2 APPLIES.** The block
is fenced as `# L2 RESOLUTION - HANDOFF-14 (PR #56)` and is appended verbatim to `handoffs/LEDGER.md`
beneath the two HANDOFF-14 ledger blocks. It rules on all four of LEDGER-14's questions, adopts
F-56-1 as a new rule, amends stopping-rule clause (c) to name rollback prose as a standing
sub-class, and corrects one over-scoped sentence in LEDGER-14 Q4. Those folds are applied to
`CLAUDE.md` in the same commit as the append.

## Message 1 — the session kickoff, carrying the L2 RESOLUTION for HANDOFF-14 and §1-§6 of a handoff that did not exist yet (3 Sep 2026, session start)

Arrived as the opening user turn with one attached file, `PROMPT15.md`, whose contents are the whole
of the message. The turn carries the kickoff line, the fork-point proof obligation against `9553842`,
the L2 RESOLUTION for HANDOFF-14 (PR #56), DELIVERABLE 0 (write the handoff), and §1 through §6 of
HANDOFF-15. Reproduced below in full, from its first line to its last, byte for byte.

---

Aqua Stack v4.1 session. Read CLAUDE.md, then handoffs/LEDGER.md. Report spawn mode first. Stop at PR opened.

**Fork from the head of `main`, and prove it before you touch anything:** `git merge-base --is-ancestor 9553842 origin/main` must exit 0 - `9553842` is HANDOFF-14's CI fix and its presence is how you know PR #56 landed. If it exits 1, STOP. Record the SHA you forked from in section 7.

---

# L2 RESOLUTION - HANDOFF-14 (PR #56)

**VERDICT: MERGE.** No changes requested. Verified independently on a clean worktree at `9553842`.

## What L2 executed

Six gates, every exit code read from `$?` directly and never through a pipe (F-53-1):

```
INSTALL_RC=0  TEST_RC=0  TYPECHECK_RC=0  LINT_RC=0  CHECK_RC=0  BUILD_RC=0
```

First run gave **1419 passed / 111 skipped** - the degraded shape section 7 warns about by name. L2's container had no Postgres and no Redis. Started both, created the `zcashreveal` role and database, re-ran the three affected suites:

```
apps/publisher   109 passed |  4 skipped
apps/indexer     534 passed |  0 skipped
apps/gateway     163 passed |  0 skipped
                 ----
TOTAL           1525 passed |  5 skipped | 1530 total
```

**An exact match to section 7's figures.** `git status --porcelain` empty. The throwaway `proof-rung1.test.ts` is NOT in the tree, which is correct.

## RUNG 1 IS PROVEN LIVE. THE HANDOFF'S ONE UNVERIFIED IS NOW VERIFIED

Section 7 and LEDGER-14 Q4 report the live endpoint unreachable and label the lane figures UNVERIFIED. **L2 ran `scripts/prove-rpc-only.mjs` against real mainnet and it exits 0:**

```
Two calls to https://zcash-mainnet-zebrad.gateway.tatum.io/
height 3470960   hash 0000000000301fe326bd...   2026-09-03T22:44:05Z
  transparent  11987581.74 ZEC  71.13%      sprout      22591.46 ZEC  0.13%
  sapling        522771.56 ZEC   3.10%      orchard    458122.37 ZEC  2.71%
  ironwood      3861085.66 ZEC  22.91%     (lockbox     60855.19 ZEC, NOT a lane)
  residual   MEASURED: 480713.83 ZEC unprovable of 16913007.98 ZEC supply
  drain / migrationHist / neffSeries   null - NOT MEASURED
PROVE_RC=0
```

Three arithmetic checks L2 ran on that output, none of which the script itself makes:

| check | result |
|---|---|
| five lanes + lockbox vs the node's `chainSupply` | **16,913,007.98 = 16,913,007.98 EXACT** |
| `residual` vs `sprout + orchard` | **480,713.83 = 480,713.83 EXACT** |
| transparent share computed over five lanes, not six | 71.13%, as printed |

**The script's failure paths are real too.** Its 429 branch, its missing-lane branch and its usage branch all behave as section 7 claims.

## AND THE 5/MINUTE CEILING IS NOW MEASURED, NOT ASSUMED - THIS IS RUNG 2's GATING FACT

Sixteen `getblockchaininfo` calls in a 1.4-second burst against the keyless endpoint:

```
req  1-5   200
req  6-16  429      succeeded before first refusal: 5
```

**Exactly five, then refused, and it stays refused.** L2's section 1 table in PROMPT-14 offered this as a hypothesis to check. It is now a measurement. Carry it into HANDOFF-15 as fact.

## Three adversarial mutations, none of them the session's own

| mutation | result |
|---|---|
| `databaseUrl` treats `""` as PRESENT | **1 failed** |
| `NO_CHAIN_QUERIES.queryMigrations` returns a MEASURED ZERO instead of null | **1 failed** - *"queryMigrations must be null with no connection"* |
| the `sawTipFrame` guard removed from `snapshotAge` | **3 failed**, across two files - *"expected '0' to be 'unknown'"* |

The second is the contract this whole rung rests on and the third reproduces the original defect exactly. Both are load-bearing.

## Ruling on the four section 8 questions

**Q1 - is "read the module before writing the probe that judges it" worth stating as a rule? ADOPTED, as F-56-1.** It is NOT already what the fail-side rules mean: those govern the SHAPE of a fail side (a DATA mutation from the exclusion set) and say nothing about whether its author has read the module. Four probes in one handoff were wrong before the code was, all four looked like product defects, and none was. **F-56-1: a fail side that mutates a module the author has not read line-by-line is a hypothesis about that module, not a probe of it. Read it first, or label the probe UNVERIFIED.** The session's own move - check the probe before judging the code - is what caught all four and is the rule's operational half.

**Q2 - was `residual: null` in the committed web fixture deliberate? NO. It is a fourth absence nobody counted, and L2 confirms it independently:** `apps/web/src/lib/api/fixtures/snapshot.ts:93`, present on `main` at `04237c5`, untouched by this PR. So the site's headline figure - the unprovable-supply number this entire project is an argument about - renders as an absence today and nothing said so. **The disposition is that rung 1 fixes it rather than the fixture does:** L2's live run above shows `residual` is computable from the two RPC calls this rung already makes, 480,713.83 ZEC of 16,913,007.98. The moment the cutover runs, the figure turns on. The session was right to assert it rather than patch the fixture, because patching it would put a fabricated headline on the page.

**Q3 - is rollback prose a standing sub-class of clause (c)? ADOPTED.** Every rollback, recovery and "stop the process" step in an operator document makes a checkable claim about runtime behaviour by construction, so it never needs a round to happen to reach it. **Clause (c) now names them explicitly: every rollback and recovery step in an operator document is executed, not read, every gate.** The finding that produced this cost one grep and would have left an operator staring at a frozen page believing they had rolled back - this project's own recurring shape, written into the runbook meant to prevent it.

**Q4 - SETTLED BY EXECUTION, and the ledger sentence needs one correction.** The finding is sound and shipping the script was the right call regardless. But the sentence *"THE LIVE ENDPOINT IS UNREACHABLE AND THE WALL IS NOT HOST-SPECIFIC"* over-scopes: **both probed hosts answer from L2's container right now**, including `zcash-mainnet-zebrad.gateway.tatum.io`, the exact host recorded as `connect_rejected ... 403`. The wall is **container-scoped, not stack-scoped** - two hostnames measured is evidence about one egress policy, not about the project. `mainnet.lightwalletd.com` does fail from here too, so that host may be independently down. **This is the probe-scope family again: a conclusion whose reach exceeds what was measured.** L2 has committed the same error repeatedly this engagement and names it here rather than only when someone else does it. HANDOFF-15 should carry the corrected wording into the ledger: *this session's container* cannot reach it; another Aqua Stack session can.

## One defect in L2's own prompt, which the session caught and fixed correctly

PROMPT-14 section 4 deliverable 2 and section 5 A1 both said **"four panels null"** two paragraphs after L2's own executed transcript showing **three**. The session re-executed against `REAL_INSTRUMENTS` before writing section 5, corrected both, and added **A1b asserting `residual` is measured positively** rather than leaving it as the absence of an absence. That is the right handling and it is a better assertion than the one L2 wrote. The defect was L2's.

---

# HANDOFF-15 BRIEF

**YOUR HANDOFF DOES NOT EXIST YET. WRITING IT IS DELIVERABLE 0.** Create `handoffs/HANDOFF-15-live-transactions.md` from §1–§6 below, `status: in-progress`, track `Integration`, `depends_on: 14`, `written_by: L2 (Cowork) · 2 Sep 2026, re-verified 3 Sep 2026`.

**RUNG 2 OF THREE. HANDOFF-14 put live BALANCES on the site. This puts live TRANSACTIONS on it.** Rung 3 (HANDOFF-16) adds crossings. Ship this alone; do not reach up the ladder.

---

## §1 SCOPE

Run the mempool path against a **third-party RPC endpoint**, so `/v2/mempool` and the live panels carry real mainnet transactions as they arrive — **with no database and no node.**

The mempool path is already RPC-only by construction: `apps/indexer/src/index.ts` polls `getRawMempool`, fetches each new txid with `getRawTransaction`, analyses it and writes the report to `zcashreveal:mempool:live` and the `zcashreveal:mempool` channel. Nothing in that loop reads Postgres. What stands in the way is **rate**, and it is the whole of this handoff.

L2's measurements — hypotheses with citations, not a brief:

| what | measured |
|---|---|
| poll cost | `INDEXER_POLL_INTERVAL_MS` defaults to **2000 ms** → 30 `getRawMempool`/min, **plus one `getRawTransaction` per new txid** |
| keyless Tatum ceiling | **5 requests/minute, hard. MEASURED BY L2 ON 3 SEP 2026, NOT ASSUMED** - a 16-request burst over 1.4 s returned 200 five times and 429 for every request from the sixth on, and it stayed refused. See the L2 RESOLUTION above for the transcript. This is the one number this whole handoff is sized against, so it is the one that had to stop being a hypothesis |
| verdict | the default poll is **six times** the free ceiling before a single transaction is fetched |
| served keyless | `getrawmempool` SERVED · `getrawtransaction` SERVED (a fake txid answers "No such mempool or main chain transaction" — the method WORKS) |

**AND THE ENDPOINT IS REACHABLE - THE PREVIOUS SESSION'S 403 WAS ITS OWN CONTAINER, NOT THE STACK.** L2 reached `zcash-mainnet-zebrad.gateway.tatum.io` from a different container on the same day HANDOFF-14 recorded it as `connect_rejected`, and ran `scripts/prove-rpc-only.mjs` against it to exit 0. **Try it yourself before you assume you cannot**, and record which it was in section 7 - if your container refuses, that is a fact about your container and the local mock in deliverable 5 is your whole harness; if it answers, drive at least one polarity of A1 against the real thing and say so.

So this rung needs either a higher ceiling or a poll that adapts to the ceiling it has. **Build the second and let the first be an operator's choice** — a stack that only runs on a generous key is a stack that cannot be demonstrated.

**Out of scope:** confirmed blocks and crossings (rung 3); Mode A; the address index.

## §2 READING

`CLAUDE.md` · `apps/indexer/src/{index,config}.ts` · `apps/indexer/src/decoder/leak-analyzer.ts` · `packages/zebra-rpc/src/{client,errors}.ts` · `apps/gateway/src/routes/mempool.ts` and `ws-broker.ts` · **`docs/2.0/SNAPSHOT.md` before anything touches Redis** · LEDGER-11's WS-envelope and wire-form findings.

## §3 CONTRACT

- **A 429 IS A FIRST-CLASS STATE, NOT AN ERROR PATH.** It is not a node refusing and it is not a transaction that does not exist. It must back off, and the back-off must be visible in the log and in the staleness the reader sees — never a silently thinner mempool.
- **AN ADAPTIVE POLL REPORTS ITS OWN RATE.** If the loop slows to fit a ceiling, the site says how stale the mempool view is. A reader must never be shown five transactions and left to assume that is the mempool.
- **A PARTIAL MEMPOOL IS A NAMED PARTIAL.** When the budget runs out mid-drain, the view says "N of M transactions analysed" rather than presenting N as M. This is the absence-versus-zero rule (`chain-inputs.ts:42`) on a different surface.
- **The wire form is `serializeWire`/`reviveWire`, both directions.** HANDOFF-12 replaced key-guessing with a tagged `{"$bigint": "..."}` form; every report on this path uses it. A bare-string bigint on this seam is the defect family that has cost this project four instances.
- No emoji. The PR stops at **opened**.

## §4 DELIVERABLES

1. **A rate-aware mempool loop.** The poll interval and the per-tick transaction budget derive from a configured requests-per-minute ceiling rather than from a hardcoded 2000 ms. Given 5/min it must still run — slowly, honestly, and saying so.
2. **429 handling in `packages/zebra-rpc`**, distinguished from every other failure, with back-off and a typed outcome the caller can act on. Not a retry loop that hides it.
3. **A visible mempool staleness figure** on the surfaces that render mempool rows: how long ago the view was complete, and how much of it was analysed.
4. **`docs/2.0/RUNTIME.md` gains "third-party mempool mode"** — the ceiling, the poll it implies, what a reader sees at 5/min versus at a provider rate, and the arithmetic for both.
5. **A local mock endpoint** that serves the two methods and can be told to 429 on demand, so every polarity below is drivable without a provider.

## §5 ASSERTIONS — each needs both polarities

- **A1.** At a configured ceiling of 5/min the loop runs, never exceeds it, and publishes real reports. *Fail side by DATA: a mock that counts requests and fails the test when the minute's count exceeds the ceiling.*
- **A2.** A 429 mid-drain backs off and resumes without losing or duplicating a report. *Fail side: the mock 429s on request 3 of 8; the drain completes across two ticks with the same set.*
- **A3.** A partial drain renders as "N of M analysed" and never as M. *Fail side: force a partial and assert the copy; then a complete drain and assert it does not say "partial".*
- **A4.** Every report on this path round-trips through `serializeWire`/`reviveWire` with bigints intact. *Fail side by DATA: a report carrying a non-`Zat`-suffixed bigint — `ClaimAssessment.rawCount` — must survive, which the pre-HANDOFF-12 reviver would have failed.*
- **A5.** Nothing reaches the managed store. *`SNAPSHOT.md` rule 5.*
- **A6.** `pnpm -r test` green with a **real** exit code, captured directly and never through a pipe (**F-53-1**). **AND THE COUNTS ARE READ, NOT JUST THE CODE:** a run with Postgres or Redis down still exits 0 while silently skipping the integration halves - HANDOFF-14's section 7 caught exactly that at 93 passed / 20 skipped, and L2's own first verification run of PR #56 reproduced it at 1419 / 111. State the passed AND skipped counts, and name every skip.
- **A7. F-56-1, this handoff's new rule, applied to itself.** Every fail side here mutates `apps/indexer/src/index.ts`, `packages/zebra-rpc` or the mempool view. **Read each line-by-line before writing the probe that judges it**, and say in section 7 which modules were read that way. HANDOFF-14 had FOUR probes that were wrong before the code was, all four looking exactly like product defects; every one was written against a module its author had not read.

## §6 DISPATCH HINTS

Fan out on failure paths, not files — every one of HANDOFF-12's twelve defects lived on what happens when something upstream refuses, and none was visited by a green suite. Paths: a 429 mid-drain, a transaction that vanishes between `getrawmempool` and `getrawtransaction`, a malformed relayed frame, a budget exhausted mid-tick. The refuter's standing question on this code: **does the retry actually retry, or does it re-enter a mutated state?** That question found the worst of the twelve.

---

**One thing this handoff inherits and must not silently carry.** `62c4e77` — gate round 3's own fix commit on the confirmed-block runtime — has never been reviewed (**F-52-2**). It is rung 3's code, not rung 2's, so do not review it here. Carry it forward in §8 so HANDOFF-16 opens with it.
