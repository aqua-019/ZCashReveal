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
   until that key's 24-hour TTL expires - and because a Redis hit repopulates
   the in-process memo, the memo clear does not shorten that window either:
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
| `confirmed-block step failed; retrying after the poll interval` at ERROR | A transport error - node down, timeout, Postgres unreachable mid-step | No | Wait. The follower retries every poll interval and applies nothing until the step succeeds; the write is one transaction, so a Postgres failure mid-write leaves the previous block in place. |
| `block applied` with `notices: ["IRONWOOD_TREESTATE_ABSENT"]`, `IRONWOOD_TREESTATE_MISMATCH` or `IRONWOOD_ROOT_ABSENT` | The block appended Ironwood commitments and `z_gettreestate` returned nothing, a different block, or no Ironwood root | Yes, without that anchor | Every mempool spend citing that anchor gets an `UNKNOWN_ANCHOR` finding at INFO and no assessment - the honest outcome. **There is no backfill:** a restart replays from the store, where the anchor is absent. Recorded as a ledger question; the remedy today is a wipe to a base below that height once the node answers. |
| `block applied` with `VALUE_POOLS_ABSENT`, `TREES_ABSENT` or `IRONWOOD_TREE_SIZE_ABSENT` | The block reports no figure for that pool, so the corresponding A1 check did not run for it | Yes | Should not occur against a pinned Zebra 6.3.0; if it recurs, the node is not the one the pin names. |
| `UNKNOWN_ANCHOR` findings on every Orchard-shaped spend, each saying `its BYTE-REVERSED spelling IS recorded` | The node spells transaction anchors in the opposite byte order from the roots this build recorded - Zebra after ZcashFoundation/zebra #10461, which reversed the transaction-side anchor and not `getblock`'s or `z_gettreestate`'s roots | Yes | The compose pin is at 6.3.0, where both sides agree (Read: Zebra source at v6.2.1, v6.3.0, 1c9b245 and HEAD ef6325c during HANDOFF-12). Do not upgrade Zebra past the pin until this build follows; there is no version CEILING guard yet, which is a ledger question. |
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
