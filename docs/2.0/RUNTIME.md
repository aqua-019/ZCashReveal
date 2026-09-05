# The confirmed-block runtime

What `apps/indexer` does between the node and the mempool analyser since
HANDOFF-12: how it starts, what one block costs, and what each failure looks
like from the outside. Written for the operator who reads a log line and needs
to know whether to wait, restart, or file a defect. The mempool side (ZMQ that
does not exist, the poll loop that stands in for it) is RUNBOOK-VPS.md section
3; the shared-Redis rules are SNAPSHOT.md and are untouched by any of this.

Every figure here carries its provenance: **Executed** (measured in this
repository, with its n), **Read** (a file and a commit), or **UNVERIFIED**.

## 1. What runs, in order

```
loadConfig ─▶ ZebraRpc · Postgres · VPS Redis
                │
                ▼
runStartup   1. bootstrap      readChainBase(store)
                │                ├─ a base row exists  ─▶ replayChainState (every pool, from disk)
                │                └─ no base row        ─▶ getblock(INDEXER_START_HEIGHT, verbosity 2)
                │                                          getblockheader(previousblockhash)
                │                                          writeBase(...) then an EMPTY state opened at that base
                ▼
             2. startFollower  ChainFollower.start()  - polls getblockchaininfo every INDEXER_POLL_INTERVAL_MS,
                │                                        applies chain.height + 1 while behind the tip
                ▼
             3. startZmq       ZebradZmqSubscriber.start()  - fails against Zebra, logged once at WARN
                │
                ▼
             mempool poll loop  - fetchAndAnalyze every txid the node's mempool holds
```

The order is the contract, not a convenience (HANDOFF-12 A2, `runtime/startup.ts`,
tested by `runtime/__tests__/startup.test.ts`). The analyser reads the chain
state for every shielded spend it assesses; a transaction analysed while the
state is still replaying would carry an assessment over a partial tree and
publish it as if over the whole one. So nothing that analyses a transaction is
constructed until step 1 resolves, and the follower - which is what makes the
state advance - is running before the first mempool fetch.

The chain state is read THROUGH the follower on every call and never held: the
follower REPLACES its state on a reorg rather than undoing it in place.
`index.ts` hands `analyze()` and the `RoundTripIndex` a getter, not a value.

### The base

A state does not begin at the birth of each pool. It opens at a **base** - one
`blocks` row and four `pool_snapshots` rows at the same height - and every
position and balance from then on is real:

| Pool figure | Where the base takes it from | Why |
|---|---|---|
| commitment position of the first appended note | `trees.<pool>.size` of the start block, minus what that block itself appended | an anchor's `maxPosition` must be a real tree position or the candidate set it bounds is fiction |
| opening balance | `valuePools[pool].chainValueZat - valueDeltaZat` of the start block | the running balance is compared to the node's on every block (A1); it has to start where the node's does |

Both come from the start block's OWN figures, so a cold start is one `getblock`
and one `getblockheader`. `INDEXER_START_HEIGHT` is read only on a cold store;
once a base row exists a restart replays from disk and ignores the variable.
Changing the start height on a warm store means wiping the six chain tables
(section 5, "Reorg below the base"). The default is NU6.3 activation on
`INDEXER_NETWORK` - 3,428,143 on mainnet - because that is where Ironwood
begins and the earliest height at which all four pools' accounting is checked
against the node on every block.

## 2. What one block does

`applyConfirmedBlock` (`runtime/confirmed-block.ts`), for `chain.height + 1`:

1. **Continuity.** The block's `previousblockhash` must equal the state's tip
   hash. A mismatch is a reorg (section 5), never an error.
2. **Decode.** `decodeBlock` yields per-pool commitments, nullifiers, anchors
   and value deltas in transaction order.
3. **Append.** Commitments take positions from the base onward; nullifiers are
   recorded; boundary flows are recorded with the transaction's sequence.
4. **Cross-check against the node - A1, live.** For every pool the block
   reports:
   - this build's delta equals `valueDeltaZat` (sign convention: the node's
     positive means the pool GREW);
   - this build's running balance equals `chainValueZat`;
   - this build's commitment count equals `trees.<pool>.size` (an absent
     `trees.ironwood` is the empty tree, 0).
   A disagreement throws `ValueAccountingMismatchError` or
   `TreeSizeMismatchError` and the block is NOT written (section 5).
5. **Anchors.** Sapling's and Orchard's roots come from the block
   (`finalsaplingroot`, `finalorchardroot`), each with `maxPosition` equal to
   the pool's size minus one. **Ironwood's root is not in `getblock` at Zebra
   6.3.0**, so when - and only when - the block appended Ironwood commitments
   (`ironwoodAnchorPendingTreestate`, an internal scheduling signal since
   HANDOFF-12), the driver calls `z_gettreestate` for that block's hash and
   takes `ironwood.commitments.finalRoot` from the response with `maxPosition`
   from the block's own `trees.ironwood.size - 1`. The two halves are
   cross-checked rather than both trusted. A withheld or mismatched treestate
   yields no anchor and a notice - never a fabricated root.
6. **Write, in one transaction.** `blocks`, `pool_commitments`, `pool_anchors`,
   `pool_nullifiers`, `pool_boundary_flows` and one `pool_snapshots` row per
   pool. A crash mid-write leaves the store at the previous block.
7. **Advance**, then `onApplied`: every anchor recorded goes into the
   `AnchorRegistry` (`anchors` table plus the VPS Redis hot tier), which is
   what gives every mempool spend its anchor depth. Nothing wrote that
   registry before HANDOFF-12, so every depth was null.

Log line per block, at INFO: `block applied` with `height`, `anchors` and the
`notices` codes.

## 3. What it costs

**Executed**, on the four committed captures, each pushed through the real
`ZebraRpc.getBlock` (zod validation at the RPC boundary) and then applied to a
fresh state over the in-memory store; n = 40 runs per capture, medians and
p95s (`scratchpad/measure-apply.mts`, not in the tree):

| Capture | Bytes on disk | Tx | Commitments appended | Client parse + validate, median / p95 | Decode + apply, median / p95 |
|---|---|---|---|---|---|
| 3,432,130 | 94,593 | 5 | 5 | 2.5 ms / 6.0 ms | 0.1 ms / 2.4 ms |
| 3,441,955 | 181,354 | 10 | 10 | 3.5 ms / 8.5 ms | 0.2 ms / 0.3 ms |
| 3,444,836 | 10,158 | 2 | 0 | 0.4 ms / 0.5 ms | 0.0 ms / 0.1 ms |
| 3,444,837 | 136,081 | 6 | 7 | 2.5 ms / 7.1 ms | 0.1 ms / 0.2 ms |

So this build's own work per block is single-digit milliseconds against a
75-second block target; the follower's catch-up rate is bounded by the node's
RPC latency and Postgres write latency, neither measured here. **Those two
columns are the decode and the accounting only** - they do not include
`store.writeBlock`, the `z_gettreestate` call, or the per-anchor registry
writes in `onApplied` (two round trips each, unbatched), all of which are I/O
this measurement replaced with an in-memory store. The figure is a floor on
per-block latency, not an estimate of it.

**Replay** (`replayChainState`, the same `replayPool` the persistence layer
has always had, with a position check on every row): **Executed** over a
memory store, 0.89 us per commitment at n = 10,000 and 1.02 us at n = 20,000.
The Postgres read that a real warm start pays on top of that is **UNVERIFIED**
here - no session can reach the VPS - and is the number the operator should
take once, with:

```bash
docker compose logs indexer | grep -E "replaying the chain state|chain state replayed"
```

The two lines bracket the replay and carry the base height, the tip height and
the per-pool commitment counts. Expect the read to dominate: it is one
`SELECT` per pool per table, streamed in position order.

**Catch-up** after downtime of K blocks is K `getblock` calls at verbosity 2
(90 KB to 2.4 MB each on mainnet, per the fixture README's survey) plus one
`z_gettreestate` per block that appended Ironwood commitments, applied
sequentially. UNVERIFIED as a rate; the per-block work above says the node is
the bound.

**Memory.** The four `PoolState`s hold every commitment, anchor and nullifier
since the base in maps keyed by 64-character hex ids. UNVERIFIED as a figure;
the state grows with the chain and there is no eviction, which is the
LEDGER-12 question about a base that moves.

## 4. Reorgs

A block whose `previousblockhash` is not the state's tip hash is a reorg.
`resolveReorg` (`runtime/reorg.ts`):

0. brings the walk's floor to the store's OWN highest block first: heights
   above it are walked through the node's headers without asking the store,
   because a height this build does not hold cannot be the split. That is what
   makes a rollback whose replay failed resumable rather than fatal - the
   rollback commits, the replay may not, and the next attempt would otherwise
   ask the store for heights it has just correctly deleted;
1. walks `getblockheader` back from the fetched block's parent, comparing each
   height's hash with the store's, until the two agree - that height is the
   split;
2. `rollbackToHeight(split)` deletes every row above it in all six tables, in
   one transaction;
3. replays a FRESH state from the base to the split and hands it to the
   follower, which replaces its `chain`;
4. forgets the anchors the registry recorded above the split - the `anchors`
   table and the in-process memo - because that table is a seventh place a
   height is written and the rollback covers six. Without it an orphaned
   branch's roots keep answering `getHeightForAnchor`, and a mempool spend
   citing one is given a depth measured from an abandoned block. **The Redis
   hot tier is not cleared** and can still answer with the orphaned height
   until that key's 24-hour TTL expires. A Redis hit repopulates the in-process
   memo, so the memo carries the key's own REMAINING deadline, read with `pttl`
   at the moment of the hit - without that, one read after a reorg pinned the
   orphaned height for the life of the process and the TTL bounded nothing.
   **This sentence said "the SAME deadline" for one gate round while the code
   gave a FRESH 24 hours from the read**, which is the same number only when the
   key was written in that instant; on the hit path it doubled the window to
   about 48 hours, and a fourth round measured the registry still answering 23
   hours after the key had died. The two now expire together because the
   deadline is read rather than recomputed. The reason the tier is not cleared:
   `check-redis-safety` rule 4 permits
   `DEL` only on a string literal, these keys are computed per root, and a rule
   protecting another project's database is not one this handoff widens. The
   window is bounded by the TTL and by a restart; the remedy is a ledger
   question;
5. the next step applies `split + 1` from the new branch.

The property this is held to (A4, `runtime/__tests__/reorg-follower.test.ts`,
100 runs plus the named 3-block worked case): the state after a reorg equals a
fresh replay of the new branch in every pool's commitment count, nullifier set
and value balance. The fail side that proves the test discriminates is a store
whose rollback forgets one pool's boundary flows, so a balance survives a
height that was rolled back.

Log line: `reorg resolved: rolled back to the split and replayed`, at WARN,
with `splitHeight` and the per-table `rolledBack` counts. Mempool reports
analysed between the reorg and the replay's completion are analysed against
the OLD state (the getter still returns it until the follower swaps), which is
at most the poll interval and is recorded as a ledger question rather than
solved.

## 5. Failure modes

| You see | What happened | Block written? | What to do |
|---|---|---|---|
| `the confirmed-block driver disagrees with consensus; stopping` at FATAL, then exit code 1, naming `ValueAccountingMismatchError` or `TreeSizeMismatchError` with the pool, height, this build's figure and the node's | This build's accounting for one block does not match the node's own `valuePools` or `trees` | No | **Do not skip it and do not lower the check.** A restart replays to the same block and fails the same way, which is by design: the disagreement is either a decoder defect here or a node whose figures changed shape (a Zebra upgrade - `check-compose-zebra-tag.mjs` pins the version for this reason). File it with the log line; the two figures in the message are the whole reproduction. |
| `ReorgBelowBaseError` at FATAL | The split height is below the base row, so the branch this store opened on has been abandoned by the network | No | Wipe the six chain tables and restart at a lower `INDEXER_START_HEIGHT`: `TRUNCATE blocks, pool_commitments, pool_anchors, pool_nullifiers, pool_boundary_flows, pool_snapshots;` in the indexer database. The `anchors` registry table is not one of the six and is left alone here; an ordinary reorg does prune it above the split (section 4, step 4), but a wipe of the six leaves stale rows in it that are harmless - a root with no matching commitment is never asked about. A base more than a few hundred blocks below the tip makes this unreachable in practice. |
| `ChainBaseUnavailableError` at startup | The start block carries no `valuePools`, no `valueDeltaZat`, or no `trees.<pool>.size` for a pool it appended to - a node that does not serve verbosity-2 figures, or a height before they existed | Nothing started | Point `ZEBRAD_RPC_URL` at a Zebra 6.3.0 or later, or raise the start height. |
| `ReplayPositionMismatchError` at startup | The store's `pool_commitments` rows are not contiguous from the base: a row's stored position is not the one replay assigns it | Nothing started | The store is corrupt. Restore the last `pg_dump` (RUNBOOK section 5) or wipe as above. |
| `confirmed-block step failed; retrying after the poll interval` at ERROR | A NODE-side transport error - node down, timeout, a -8 for a height the node reorged away between two calls. **A Postgres failure at the block WRITE is no longer one of these**: it is `ChainPersistenceError` at FATAL, one row down | No | Wait. The follower retries every poll interval and applies nothing until the step succeeds; nothing was mutated. |
| `the store refused a block after the state was mutated; stopping so a RESTART can replay from the last written block` at FATAL, carrying `kind: "persistence"` and the underlying `cause` | The store refused the block AFTER the pools were mutated - a dropped Postgres connection, a full disk, a cancelled transaction. **Not a decoder defect.** Added in HANDOFF-16: before it, this error was neither a `ChainRuntimeError` nor a state error, so the loop RETRIED it into a state that already held the block and raised `CommitmentAlreadyExistsError` - reporting a database hiccup as a consensus disagreement | No | **Restart it.** The in-memory state is dirty and cannot be reconciled in place, so the process stops on the first failure; a restart replays from the last block that WAS written. If it recurs, look at the database - nothing here is in question. |
| `block applied` with `notices: ["IRONWOOD_TREESTATE_ABSENT"]`, `IRONWOOD_TREESTATE_MISMATCH` or `IRONWOOD_ROOT_ABSENT` | The block appended Ironwood commitments and `z_gettreestate` returned nothing, a different block, or no Ironwood root | Yes, without that anchor | Every mempool spend citing that anchor gets an `UNKNOWN_ANCHOR` finding at INFO and no assessment - the honest outcome. **There is no backfill:** a restart replays from the store, where the anchor is absent. Recorded as a ledger question; the remedy today is a wipe to a base below that height once the node answers. |
| `block applied` with `VALUE_POOLS_ABSENT`, `TREES_ABSENT` or `IRONWOOD_TREE_SIZE_ABSENT` | The block reports no figure for that pool, so the corresponding A1 check did not run for it | Yes | Should not occur against a pinned Zebra 6.3.0; if it recurs, the node is not the one the pin names. |
| `UNKNOWN_ANCHOR` findings on every Orchard-shaped spend, each saying `its BYTE-REVERSED spelling IS recorded` | The node spells transaction anchors in the opposite byte order from the roots this build recorded - Zebra after ZcashFoundation/zebra #10461, which reversed the transaction-side anchor and not `getblock`'s or `z_gettreestate`'s roots | Yes | The compose pin is at 6.3.0, where both sides agree (Read: Zebra source at v6.2.1, v6.3.0, 1c9b245 and HEAD ef6325c during HANDOFF-12). Do not upgrade Zebra past the pin until this build follows. `scripts/check-compose-zebra-tag.mjs` now enforces a CEILING as well as the floor (HANDOFF-13 deliverable 0a): the tag compose pins must be `<= 6.3.0`, and an unreadable pin such as `:latest` FAILS, because an unknown version is not a satisfied bound. Whether that ceiling should also be read at runtime against a live node's `subversion`, as HANDOFF-11's A11 reads the floor, is open as 9 Q4 of `docs/2.0/MODE-A-PLAN.md`. |
| `onApplied failed AFTER the block was committed; its anchors are unregistered and will NOT be retried` at ERROR, with the height and the roots | The block was written and the chain advanced, and then the registry write (Postgres `anchors` plus the Redis hot tier) failed | Yes | The block is NOT re-applied - the next step fetches the next block, by design, because re-applying a committed block is not possible against an append-only state. Those roots have no anchor depth until the height is re-indexed, so every mempool spend citing one reports a null depth. Same remedy and same ledger question as the withheld treestate above. The line names the height and the roots precisely so the loss is attributable; it deliberately does not say "retrying", which is what the generic handler used to say before it was separated out. |
| `this store holds no block at N although its tip is M; the split cannot be found` (a `ChainRuntimeError`) at FATAL | A height at or below the store's own tip is missing: the six chain tables disagree with each other | No | Real corruption, unlike the case the split walk now tolerates above the store's tip. Restore the last `pg_dump` or wipe as above. If this appears immediately after a reorg, capture the `blocks` table's height range before wiping - it is the evidence. |
| `startFollower ran before bootstrap` | `runStartup`'s steps were rewired out of order | Nothing started | A code defect, caught by `startup.test.ts`; not reachable from configuration. |

Nothing in this table is retried into a different answer, and nothing skips a
block. A block that fails its cross-check is a block this build cannot account
for, and the state stops there rather than carrying an assessment it cannot
stand behind into every mempool report after it.

## 6. Checking it from the outside

```bash
# The follower is advancing: one line per block, with anchors and notices.
docker compose logs indexer | grep "block applied" | tail -5

# Where the store is, and where it began.
docker compose exec postgres psql -U zcashreveal zcashreveal -c \
  "SELECT MIN(height) AS base, MAX(height) AS tip, COUNT(*) AS blocks FROM blocks;"

# The four pools at the tip, as this build accounts for them - compare with
# the node's getblockchaininfo valuePools[].chainValueZat at the same height.
docker compose exec postgres psql -U zcashreveal zcashreveal -c \
  "SELECT pool, height, balance_zat, commitment_count FROM pool_snapshots
   WHERE height = (SELECT MAX(height) FROM blocks) ORDER BY pool;"
```

## 7. RPC-only mode: the publisher with no database

**The publisher runs without `DATABASE_URL`, and that is a configuration rather
than a degraded mode.** Everything above this section is `apps/indexer`, which
needs Postgres and a node it can follow. This section is `apps/publisher`, which
needs neither: it can publish a live document from a node's `getblockchaininfo`
alone, with the panels that read a table published as stated absences.

Added by HANDOFF-14, which is rung 1 of three. Rung 2 adds the mempool; rung 3
adds crossings. Each ships alone.

### 7.1 The env set

```bash
# Required. The node. Any Zcash RPC endpoint that serves getblockchaininfo
# and getblockheader - your own zebrad, or a public gateway.
ZEBRAD_RPC_URL=https://<host>/
ZEBRAD_RPC_USER=...          # omitted by a keyless public endpoint
ZEBRAD_RPC_PASSWORD=...

# Required. The VPS Redis, which carries the tip channel this publisher
# subscribes to. NEVER the managed store (SNAPSHOT.md section 2).
REDIS_URL=redis://localhost:6379

# Required. Where the file sink writes; SNAPSHOT.md section 8.5 marks it
# `required: yes`.
SNAPSHOT_FILE=./snapshot.json

# OMITTED. This is the whole of RPC-only mode.
# DATABASE_URL=

# Optional. Either TCP spelling of the managed store. Absent both, the
# publisher runs file-only, which is what a laptop does.
SNAPSHOT_REDIS_KV_URL=
```

`DATABASE_URL=` (set, empty) means the same thing as omitting it: `databaseUrl`
in `apps/publisher/src/config.ts` reads empty as absent, on the same rule
`managedStoreUrl` uses, because an empty value in a `.env` is how an operator
turns something off.

### 7.2 What it costs

**Two RPC calls per tip**, and no other network traffic besides the sinks:

| Call | Where | What for |
|---|---|---|
| `getblockchaininfo` | `readChainInfo`, once per publish | the five lane balances (`valuePools`) and the supply (`chainSupply`) |
| `getblockheader` | the tip source's `onTip`, once per publish | the BLOCK's own timestamp, which is not on the tip channel |

At the 75-second mainnet block target that is **about 1.6 requests a minute**,
which fits inside a 5-requests-per-minute keyless public endpoint with room to
spare. **Read** (`apps/publisher/src/index.ts`, the two call sites); the rate is
arithmetic over the block target rather than a measurement of any endpoint.

The managed store is unaffected: still three writes per tip inside one `MULTI`,
five commands on the wire, charged against `SNAPSHOT_REDIS_MONTHLY_BUDGET`
(SNAPSHOT.md section 5). RPC-only mode changes what the document CONTAINS, never
how often or how much it is written.

### 7.3 What the reader sees, and what they do not

| Panel | Full mode | RPC-only | Why |
|---|---|---|---|
| `pools` - the five lanes and their shares | measured | **measured** | `valuePools` on `getblockchaininfo` |
| `residual` - unprovable supply | measured | **measured** | `turnstileResidual` needs the pool balances and a supply figure, and both are on the same call |
| `drain` - the Orchard drain and its two velocities | measured | **absent** | reads `pool_snapshots` joined to `blocks` for the block times |
| `migrationHist` - the Orchard-to-Ironwood lens | measured | **absent** | reads `migrations_zip318` |
| `neffSeries` - the anonymity-set series | measured | **absent** | reads `pool_nullifiers` joined to `pool_anchors` |
| `lastReports` | absent in both | absent | the mempool view is the gateway's; rung 2 |

**Three absences, not four, and `residual` being present is the surprise worth
naming.** The obvious reading of "the analysis panels need the database" puts
all four on the far side of Postgres. It is wrong about `residual`, because
`U = Bal^sprout + Bal^orchard` and `Supply` all arrive on one RPC call. A site
in RPC-only mode therefore still publishes the unprovable-supply figure - the
one this project's headline is about - live.

### 7.4 Why this is honest and not degraded

**A null panel is a stated absence and never a zero** (SNAPSHOT.md section 8.1).
The document says which panels nothing measured; `apps/web` renders each as a
named absence; `lib/plane.ts` draws no marks and says "not measured" rather than
drawing zero crossings. Nothing on the page claims a measurement nobody took.

That is the whole argument, and it is why RPC-only mode needs no banner: a
degraded mode is one where the reader is shown something worse than the truth,
and here the reader is shown the truth about a smaller set of facts.

The publisher does log which mode it is in, once, at `info`, at startup:

```
no DATABASE_URL: publishing on RPC alone, with the three database-derived panels as stated absences
```

One line rather than none, because a process that silently published three fewer
panels because a variable was unset would be the "stale and reports no fault"
shape one layer below the page. One line rather than a per-tip warning, because
the mode is a choice the operator made and a log that warns about it trains its
reader to stop reading.

### 7.5 Checking it from the outside

```bash
# Which mode the publisher started in.
docker compose logs publisher | grep -E "publishing on RPC alone|publishing every panel"

# The document it wrote: the tip, the five lanes, and which panels are null.
node -e 'const s=require("./snapshot.json");
  console.log(s.height, s.pools.length, "lanes");
  for (const k of ["residual","drain","migrationHist","neffSeries"])
    console.log(" ", k, s[k]===null?"null - NOT MEASURED":"measured");'
```

An RPC-only document is correct when `pools` has five entries, `residual` is
measured, and the other three are `null`. A `0` in place of any of those three
is a defect and not a quiet Sunday.

## 8. Third-party mempool mode: live transactions on a rate-limited endpoint

**The mempool path runs against a public RPC gateway, with no node and no
database, and the whole of the difficulty is RATE.** Section 7 is the publisher,
which needs about 1.6 requests a minute. This section is `apps/indexer`, whose
default poll asks for thirty a minute before it fetches a single transaction.

Added by HANDOFF-15, which is rung 2 of three. Rung 1 put live balances on the
site; rung 3 adds crossings. Each ships alone.

### 8.1 The gating measurement

**Five requests per minute, hard, on the keyless endpoint.** Sixteen
`getblockchaininfo` calls in a 1.4-second burst against
`zcash-mainnet-zebrad.gateway.tatum.io` on 3 September 2026:

```
req  1-5   200
req  6-16  429      succeeded before first refusal: 5
```

and it stayed refused. **Measured, not assumed.** Both methods this path needs
are served on the keyless tier: `getrawmempool` answers, and `getrawtransaction`
answers "No such mempool or main chain transaction" for a fake txid - which is
the method working, not the method being blocked.

`INDEXER_POLL_INTERVAL_MS` defaults to **2000 ms**. That is 30 ticks a minute at
two requests each - **six times the ceiling before one transaction is fetched.**

### 8.2 The env set

```bash
# Required. The node. Any Zcash RPC endpoint serving getrawmempool and
# getrawtransaction - your own zebrad, or a public gateway.
ZEBRAD_RPC_URL=https://<host>/

# THE CEILING, in requests per minute. Unset means unmetered, which is the
# right answer for a zebrad you run yourself and the wrong one for a public
# gateway. Set it to what your provider allows.
INDEXER_RPC_MAX_RPM=5

# Required. The VPS Redis. NEVER the managed store (SNAPSHOT.md section 2).
REDIS_URL=redis://localhost:6379

# OMITTED for mempool-only mode. With it, the confirmed-block follower also
# runs; without it, only the mempool path does.
# DATABASE_URL=

# Read only when INDEXER_RPC_MAX_RPM is unset, or when it asks for a SLOWER
# tick than the ceiling requires.
INDEXER_POLL_INTERVAL_MS=2000
```

`INDEXER_RPC_MAX_RPM=` (set, empty) means the same thing as omitting it, on the
same rule `INDEXER_START_HEIGHT` uses and for the same reason: `docker compose`
writes `KEY: ""` for a `${VAR:-}` whose variable is unset and never omits the
key.

### 8.3 The arithmetic, both ways

A tick costs `overhead` requests before it fetches anything - one
`getblockchaininfo` for the tip, one `getrawmempool` for the txid list, so
**two** - plus one `getrawtransaction` per transaction it has not seen. Over a
tick of duration `D` against a ceiling of `R` requests per window `W`:

```
requests available to the tick = floor(R * D / W)
transaction budget             = that, minus overhead, floored at 0
```

The tick interval is the largest of three floors: what the operator asked for,
one tick per window, and `ceil(W * overhead / R)` - the last so that a ceiling
too small to afford even the overhead still produces a plan that fits inside it.

| Ceiling | Interval | Budget per tick | Transactions per minute |
|---|---|---|---|
| unset (your own zebrad) | `INDEXER_POLL_INTERVAL_MS`, 2000 ms | unbounded | as many as arrive |
| **5/min (keyless)** | **60 s** | **3** | **3** |
| 5/min, operator asks 120 s | 120 s | 8 | 4 |
| 60/min (a modest key) | 60 s | 58 | 58 |
| 2/min | 60 s | 0 | 0 - the tip and the txid list only |
| 1/min | 120 s | 0 | 0 |

**A slower tick analyses MORE, which is not obvious.** The overhead is per tick,
so it amortises: at `R=5` a one-minute tick affords `5 - 2 = 3` transactions a
minute and a two-minute tick affords `10 - 2 = 8`, which is 4 a minute. The cost
is a txid list up to twice as stale. That trade is the operator's, which is why
a SLOWER `INDEXER_POLL_INTERVAL_MS` is honoured and a faster one is not.

Two mechanisms, deliberately not one. `planMempoolPoll` decides what to
ATTEMPT - arithmetic, which can be read and can be wrong. `RateGate` in
`packages/zebra-rpc` enforces the invariant: it will not let a sixth request out
in a five-request minute, whatever anything plans. The window ROLLS rather than
resets, because a bucket that empties on the minute admits five requests at
59.9 s and five more at 60.1 s - ten inside one real minute, and the endpoint
refuses on the sixth.

### 8.4 What a 429 does

A refusal is a first-class state, not an error path.

- It arrives as `RpcRateLimitError`, carrying `retryAfterMs` where the endpoint
  sent a `Retry-After` and `null` where it did not - which is the common case,
  since RFC 9110 does not require the header and the measured endpoint omits it.
- It is **not retried** by the transport policy. Two silent retries at the
  measured ceiling cost 40 per cent of the minute's budget and buy nothing.
- The gate's window is marked FULL, not merely delayed: the endpoint's own count
  disagrees with ours, and its answer is the one that decides.
- Mid-drain it **stops the tick** rather than being swallowed per transaction.
  Continuing would spend the rest of the budget on requests that will all be
  refused, each refusal pushing the penalty further out.

The tick is also non-reentrant: a tick still running when the interval fires is
skipped rather than overlapped, because two ticks in flight against a ceiling
both spend the budget and both get refused.

### 8.5 What the reader sees at 5/min versus at a provider rate

The indexer writes `zcashreveal:mempool:drain` once per tick on the VPS Redis;
the gateway reads it into `MempoolView.drain`; `/track` prints it directly above
the transaction table.

The rows below are the copy `mempoolDrainNotice` ACTUALLY EMITS, captured by
calling it rather than transcribed - and transcribing it is what the first draft
of this table did, which is how it came to quote a deferred count of 6 where the
function says 409 and to drop the rate clause the complete case appends. Both
were wrong in this document before they were wrong anywhere else.

**AND THEY DRIFTED AGAIN ONE ROUND LATER, WHICH IS WHY A TEST NOW READS THIS
FILE.** A gate fix changed the rate clause from "at its configured ceiling" to
"at its ceiling of 5 requests a minute", and two of these three rows silently
stopped being true - a document quoting UI copy has no tripwire, which is the
same shape as the line-number cross-reference this repo already records.
`apps/web/test/unit/mempool-drain.test.ts` now asserts that every string quoted
here is one the function returns, so the next change to the copy fails a test
rather than leaving a false table.

| | Keyless, 5/min | A provider key, 600/min | Indexer stopped an hour ago | No indexer |
|---|---|---|---|---|
| headline | `3 of 412 analysed` | `412 of 412 analysed` | `3 of 412 analysed` | mempool completeness: not measured |
| detail | `409 deferred by the indexer's per-tick request budget - it analyses 3 a minute at its ceiling of 5 requests a minute; last tick 12 s ago, last complete 14 min ago.` | `every transaction the node reported has been analysed, just now - the indexer is metered at 600 requests a minute, which affords 598 transactions a minute` | `409 deferred by the indexer's per-tick request budget - it analyses 3 a minute at its ceiling of 5 requests a minute; last tick 60 min ago, last complete 74 min ago.` | `no indexer reported how much of the mempool it analysed, so the rows below may be part of it rather than all of it` |
| `data-complete` | `false` | `true` | `false` | (the element is a named absence instead) |

**Column three is why `last tick` is printed at all.** A stopped indexer and a
metered one produce the same counts forever; only the tick age moves. Without
it the page would have gone on saying "409 deferred by the per-tick budget" an
hour after the process died, which is this project's own recurring shape - a
stale surface that renders and reports no fault - and `drain-state.ts` already
gave "the gateway renders those differently" as the reason its key carries no
TTL. It did not, until executing that sentence found it.

**Three of four hundred is an honest number and a small one.** A keyless
endpoint cannot feed a live mempool table for mainnet, and this mode says so on
the page rather than showing three rows and letting the reader assume that is
the mempool. Raising the ceiling is the operator's move; the software's job is
to be truthful at whichever one it is given.

`completeSecondsAgo` is `null` - rendered as "this view has not been complete
since the indexer started" - when there has never been a complete drain. That is
not "zero seconds ago", and the distinction is the same one HANDOFF-14 took off
the system bar when `snapshot age: 0 blocks` sat beside twelve-day-old data.

### 8.6 What mempool-only mode costs

Without `DATABASE_URL` the confirmed-block follower does not start, and two
things on the mempool path degrade to **stated absences, never to zeros**:

| | With a database | Mempool-only |
|---|---|---|
| anchor depth per shielded spend | measured from `anchors` | `null` - "unknown", graded LOW |
| leak reports | persisted to `leak_reports` | published to Redis, not filed |
| confirmed blocks, pool state, reorgs, crossings | measured | absent - rung 3's subject |

A depth of `0` is the strongest claim this analyser can make about a spend - that
its anchor is the tip - so manufacturing one out of a table nobody read would be
the worst case of the absence-versus-zero rule, not the mildest.

**AND ONE THING DOES NOT DEGRADE TO A STATED ABSENCE, WHICH IS WHY THE TABLE
ABOVE SAYS "two things" RATHER THAN "everything".** `apps/gateway/src/views/tx.ts`
answers an unindexed transaction with `leakClass: "NOT_CLASSIFIED"` - honest -
and `severity: "INFO"`, which is the BOTTOM of a four-point scale rather than an
absence. So in mempool-only mode every `/tx` page renders a severity chip that
is indistinguishable from a classification that ran and found nothing. The
fallback predates this handoff; what this handoff did was make it reachable by
configuration, because `DATABASE_URL` used to carry a localhost default. Fixing
it means a nullable `TxView.severity` and a sweep of its consumers, which is a
DTO change beyond rung 2 - so it is recorded here and carried in the ledger
rather than quietly left out of the sentence. A gate reviewer found the
sentence, not the fallback: an earlier draft of this section claimed mempool-only
mode degrades "to stated absences, never to zeros" without qualification, and
that was false. The startup log
says which mode it is in, once, at `info`:

```
no DATABASE_URL: running the mempool path alone. Anchor depth reads as unknown rather than zero, and reports are published but not persisted
```

### 8.7 Checking it from the outside

```bash
# Which mode, and what the plan works out to. Two lines at startup.
docker compose logs indexer | grep -E "running the mempool path alone|metered poll|unmetered poll"

# Every incomplete tick says so, with its counts.
docker compose logs indexer | grep -E "drain incomplete|drain cut short|rate limited"

# The drain state the page reads. VPS Redis - never the managed store.
redis-cli GET zcashreveal:mempool:drain

# And the same figure as the gateway serves it.
curl -s http://localhost:8080/v2/mempool | node -e '
  let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{
    const v=JSON.parse(b);
    console.log(v.drain===null?"drain: not reported":
      `${v.drain.analysed} of ${v.drain.observed} analysed, complete=${v.drain.complete}`);
  });'
```

**Run the local mock rather than a provider while you are checking any of this.**
It serves the three methods and can be told to refuse:

```bash
# A 5/minute ceiling, exactly the measured shape.
MOCK_RPC_PER_MINUTE=5 pnpm --filter @zcashreveal/indexer mock:rpc

# Or refuse specific requests by ordinal, to place a 429 mid-drain.
MOCK_RPC_REFUSE_AT=5,9 MOCK_RPC_RETRY_AFTER=30 pnpm --filter @zcashreveal/indexer mock:rpc
```

A mempool view is correct in this mode when `drain.analysed` and
`drain.observed` are both present and the page prints both. `drain.observed`
alone, or an `analysed` count presented as the mempool, is the defect this
section exists to prevent.

## 9. The living plane: what makes the tank move

The turnstile plane on `/` draws two mark sets that are **different claims about
different objects**, and the whole of this section is about not confusing them.

| set | source | what it means | how it is drawn |
|---|---|---|---|
| settled crossings | `snapshot.migrationHist`, written by the publisher | ZIP 318 crossings **counted over a window of confirmed blocks** | solid arc, **gold arrowhead** where it lands |
| live marks | `tx_added` / `tx_removed` frames off the mempool socket | **unconfirmed** transactions currently in the pool | thinner arc, **hollow ring** in the lane's own hue, no gold |

The reader's rule is one sentence and needs no legend: **a gold head means it
landed; a hollow head means it has not.**

They are kept apart three ways and the first cannot drift - the two sets are
built by different functions from different inputs into different SVG elements,
so no code path exists by which a live mark reaches `Plane.marks`. The second is
the DOM: every live mark carries `data-live-mark` and its own `data-txid`. The
third is the paint above.

### What feeds it

`TurnstilePlane` stays a **server component**; the live half is a client island,
`LivePlaneLayer`, mounted over the board. So a reader with JavaScript off still
gets the whole settled board, its reading and its alt text, and the settled
marks cannot be perturbed by a frame.

The island reads `frame-bus.ts`, which holds **one** `subscribeFrames`
subscription for the whole document and fans it out. That is `tip-bus.ts`'s own
rule, widened: `subscribeFrames` opens a socket per call, and `apps/gateway`
caps connections per reader.

### What a reader sees, and why a sparse board is not a fault

**At the measured keyless ceiling the mempool loop affords about three
transactions a minute** (section 8), so the board is nearly empty most of the
time. That is a correct rendering of a metered feed. It is never padded: there
are no synthetic marks, no ambient drift and no seeded shoal, and the assertion
that says so - A4 - is driven by mounting the layer, delivering **zero** frames,
advancing every timer and asserting the mark count is exactly `0`.

So the page states its own rate. `ceilingPerMinute` and `txPerMinute` come off
`MempoolDrainState`, which the indexer already publishes, and each renders as an
**absence** when the producer said nothing rather than as a zero - the same rule
`chain-inputs.ts` states. The affordance reads:

```
the endpoint affords 3 transactions a minute against a ceiling of 5 requests
  - a sparse board is a metered feed, not a fault
```

Configure a faster endpoint and the same code fills the tank with no edit,
because nothing here is written against the figure 3.

### The two empties, which must never look alike

A board with no marks because the socket never connected and a board with no
marks because the chain is quiet are **different facts**, and only one is a
fault. The affordance names the socket state (`live` / `connecting` / `stopped`)
and prints "no transactions are reaching this page" only when the socket is not
open. A frozen surface that reports no fault is this project's most-recorded
defect shape; this is that rule applied to motion.

### What draws nothing, on purpose

Direction is read from the transaction's `class` and its `flow` cell, **never
guessed from `lanes`** - `lanes` is an unordered set with no direction in it,
and a transaction touching `{transparent, orchard}` may be a shield or a
deshield.

**FOR A `migration` THE CLASS NAMES THE KIND AND ONLY `flow` NAMES THE
DIRECTION**, and reading it off `lanes` is not merely imprecise but impossible.
The gateway assigns `migration` to any pool-to-pool crossing with no public
side, in either direction; captured from `mempoolRow` itself, both directions of
the ZIP 318 crossing emit `lanes: ["orchard","ironwood"]` - the same array, in
the same canonical order - and differ only in `flow` (`"O to I"` against
`"I to O"`). A reader of `lanes` alone therefore drew the reverse crossing
backwards, in the wrong lane's hue, beside a cell that said otherwise.
Five cases, and two of them draw nothing:

| the row | drawn |
|---|---|
| `shield` / `deshield` with exactly one shielded lane, or a `migration` whose `flow` names one ordered pool pair | an oriented **crossing** that travels |
| exactly one lane | a **resident** ring - value moving inside a pool crosses nothing |
| exactly two lanes, no derivable direction | an undirected **chord** that does not travel, because travel is what renders direction |
| `undecoded`, or no lanes at all | **nothing** - no lane can be claimed |
| three or more lanes, no direction | **nothing** - no single arc describes it, and picking two would drop the rest in silence |
| a `migration` whose `flow` names no single ordered pair (`"N pools"`, or a pool the row's own lanes do not list) | **nothing** - the row asserts a crossing and declines to say which, so a chord would claim a relationship it described differently and an arc would guess |

A row that draws nothing is still **held and counted**, and the affordance
prints the figure with its reason. A dropped row does not look like a bug; it
looks like a quiet mempool, which is the one misreading this surface exists to
prevent.

### Removals, and the three reasons that are not interchangeable

`tx_removed` carries `reason: "confirmed" | "evicted" | "replaced"`. **Only
`confirmed` means the transaction settled.** The mark leaves in all three cases,
because the board's fullness is the mempool's depth and a transaction that has
left the mempool has left the board - but the reason is kept and printed, since
reporting an eviction as a confirmation would tell a reader a dropped
transaction landed.

### Reduced motion, and the cap

Under `prefers-reduced-motion: reduce` the marks **appear and persist with no
travel animation** - the same information, no swimming. The refusal is
architectural, on `Tide`'s and `FogCanvas`'s pattern: the class is never applied
rather than an animation being damped to zero, and `globals.css`'s global block
is the brace behind it.

`SPLASH_N_MAX` (42) is a **ceiling, not a target**. Past it the board caps, says
`capped` and keeps the newest arrivals.

**THERE ARE TWO CEILINGS AND THEY HEDGE DIFFERENT FIGURES.** `SPLASH_N_MAX` caps
what is DRAWN, and beside it `HOLD_MAX` (250) caps what is HELD. This paragraph
used to end "and prints the true held figure beside the drawn one - the same
rule the settled board states: the count is the measurement, the marks are not."
That is true of the settled board, where the count comes from `migrationHist`
and only the marks are capped. It became **false here the moment `HOLD_MAX`
arrived**: once the hold evicts, the tank cannot count what it threw away, so
the held figure is a FLOOR.

So `capped` says the MARKS are a sample and `holdCapped` says the NUMBER beside
them is a lower bound, and the affordance prints "of **at least** N held" when
the second is on. The case that needed both: a mempool of 3,000 undecodable rows
gave `held=250 drawn=0 capped=false`, because `capped` asked whether more was
DRAWABLE than drawn and with nothing drawable that is `0 > 42` - the one branch
that would have hedged the figure was off exactly when the figure was furthest
wrong, and the page printed "of 250 held" with full confidence.

### With no database at all

HANDOFF-16 measured this by execution: `readSnapshotInputs` returns
`{ crossings: [], window: null }` when `queryMigrations` is null, because the
publisher is a separate process that builds `migrationHist` from its own
Postgres query. **So on the RPC-only cutover the settled board draws nothing**,
the header states its absence with a condition rather than a zero, and the live
marks are the only marks on the plane. That configuration is asserted directly
(A7's third case) rather than left to be discovered.
