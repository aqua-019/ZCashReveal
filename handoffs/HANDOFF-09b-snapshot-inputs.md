---
handoff: 09b
title: The two missing snapshot input sources - a block-time source and an Ironwood spend source
status: in-progress
branch: the session-designated branch (name it `feat/v2-09b-snapshot-inputs` if you may choose)
track: Data
depends_on: 06, 07, 09, 09a
blocks: 11
written_by: L3, from the §1 SCOPE in the L2 RESOLUTION for HANDOFF-09a · 31 Aug 2026
stack: Aqua Stack v4.1
---

# HANDOFF-09b — The two missing snapshot input sources

## §1 SCOPE

The publisher composes real instruments and still publishes two of four analysis panels as
`null`, and HANDOFF-09a proved the reason is a missing SOURCE rather than a missing query. This
handoff supplies both sources.

It is a data pipeline, not a cutover step, and it is ordered before HANDOFF-11 because **the VPS
database is COLD**: migrations 003 and 004 have never been applied there, so a 005 landing now
costs one cold run and a 005 landing after the cutover costs a maintenance window on a live public
site holding real state. That is L2's ordering ruling and it rests on the cost argument alone —
the honesty rule was amended in the same resolution and no longer blocks the cutover on a null
panel, provided the panel renders as a named absence carrying its owner (fold 3).

### IN SCOPE

1. **A BLOCK-TIME SOURCE.** `pool_snapshots.ts` is the indexer's write clock and there is no
   `blocks` table anywhere in the five migrations, so no height → time mapping exists in Postgres
   at all. Migration 005 supplies one. The shape is DECIDED AND JUSTIFIED in §3 and the ledger,
   not left open; so is the nullability, argued against migration 004's own reasoning about what a
   default manufactures.
2. **THE INDEXER WRITE PATH** for that source, so rows written from now on carry block time, plus
   an explicit written statement of what happens to rows already written.
3. **THE PUBLISHER READ PATH**: `readSnapshotInputs` populates `orchardSeries` and `drainBaseline`
   from `pool_snapshots` joined to the block-time source, instead of returning `[]` and `null`.
   The `drain` panel becomes a measurement on the production path.
4. **AN IRONWOOD SPEND SOURCE**, so `neffSeries` becomes a measurement — plus the indexer write
   path and the publisher read.
5. **Folds 1–6** of the L2 RESOLUTION for HANDOFF-09a, in their own commit, before any of the work.

### OUT OF SCOPE

The cutover, the WS upgrade, Playwright, any `apps/web` change beyond fold 3's rendering contract,
any production promotion — and **HANDOFF-12's confirmed-block driver**, which is the reason §3
states the write-path boundary explicitly rather than leaving it to be discovered.

### TWO PREMISES IN THE SCOPE AS HANDED OVER ARE FACTUALLY WRONG, AND CORRECTING THEM IS THE FIRST DELIVERABLE

Both are recorded here rather than quietly worked around, because a handoff written on a dead
premise is one the next session obeys for the wrong reason (the LEDGER-09a Q1 precedent, where L2
corrected its own diagnosis before ruling on it).

- **"`pool_nullifiers` CHECKs `pool IN ('sapling','orchard')` — Ironwood is excluded by a CHECK
  constraint from the one table that could carry a spend."** It is not. Migration 002 created that
  CHECK; **migration 003 lines 47–49 drop it by name and re-add it as all four pools**, and
  `migrations.test.ts` has asserted `pool_nullifiers accepts sprout and ironwood` since HANDOFF-06.
  L2 enumerated `CREATE TABLE` statements and did not see the `ALTER`. Ironwood has been admitted
  to that table for three handoffs. **A2 pins the correction by execution.**
- **"the indexer write path for that column, so rows written from now on carry block time"**
  presumes a writer. **There is none.** `pool_snapshots` has no production writer at all — no
  `INSERT INTO pool_snapshots` outside one test probe, no `onConfirmedBlock`, and nothing in the
  tree constructs a `PoolState`. Migration 003 says so in its own closing comment and HANDOFF-12
  §4 commissions the driver. So this handoff builds the writer FUNCTIONS and their tests, and
  HANDOFF-12's driver calls them; §3 draws that line.

  This makes the backfill question in scope item 2 **trivial and permanently so**: there are no
  rows to backfill anywhere, not merely none on the VPS. That is stronger than the reason L2 gave
  and it belongs in the ledger.

## §2 READING (state before you start)

- `CLAUDE.md`, `docs/2.0/ZECREVEAL-2.0-PLAN.md` §3.3 and §3.5, `docs/2.0/TRACKING-MATH.md` §3.1.
- **`docs/2.0/SNAPSHOT.md`** — mandatory: this handoff touches the publisher.
- `handoffs/LEDGER.md`, the HANDOFF-09a block and the L2 RESOLUTION beneath it.
- `apps/indexer/migrations/003_four_pools.sql` — `pool_snapshots`, and the re-runnability contract
  every later migration inherits. `004_ironwood_reports.sql` — the nullability argument 005 reuses.
- `apps/publisher/src/sources/chain-inputs.ts` — the three panels it names as unread and why.
- `packages/zec-instruments/src/turnstile-accounting.ts` (`PoolBalanceSample`, `orchardDrain`) and
  `ironwood-birth.ts` (`IronwoodSpend`, `ironwoodBirth`) — the two input contracts being fed.
- `apps/indexer/src/analysis/candidate-set.ts` — `rawCandidateRange`, which already defines
  `candidateCount` as `maxPosition + 1n` and has never been called.

## §3 CONTRACT

**THE BLOCK-TIME SOURCE IS A `blocks` TABLE, NOT A COLUMN ON `pool_snapshots`.** Both were
defensible; this is the argument.

A block has one time. A `block_time` column on `pool_snapshots` stores that one consensus number
**four times per height**, once per pool, in four independently written rows with nothing holding
them equal — which is *two sources of truth for a number the chain decides*, the defect this
project rates highest and the exact reasoning HANDOFF-09a used to reject duplicating
`activation-heights.ts` rather than moving it. The table stores it once.

Three consequences settled it beyond the principle:

- `PoolStateSnapshot` (in `packages/zec-types`) carries no time field. The column shape forces
  either **widening that shared type** — the union-widening shape CLAUDE.md warns about, where
  every consumer's coalesce has been dead code — or a third parameter on `writePoolSnapshot`,
  breaking the uniform `writeX(record, conn)` signature the other four writers share. The table
  shape needs neither.
- The mapping is reusable: `leak_reports`, `migrations_zip318` and `pool_nullifiers` all carry a
  height and none can name a time.
- `hash` on the same row lets a reader tell which block a height meant across a reorg.

**NO FOREIGN KEY, and a LEFT JOIN on read.** A FK would make a missing `blocks` row *reject* a
pool snapshot — a constraint refusing to record something observed, which is the inversion
migration 003 already refuses for `amount_zat`: "it destroys the evidence instead of raising it."
A snapshot whose height has no block row is **dropped from the series**, never timestamped from a
fallback, and `orchardDrain`'s `sampleCount` is what reports the shortfall.

**`time_s BIGINT NOT NULL`, no default, storing the chain's own integer seconds.**
- *No default* is the whole point of the migration: `pool_snapshots.ts` is
  `TIMESTAMPTZ NOT NULL DEFAULT NOW()` and that default is precisely what made it useless. A
  default here would manufacture a block time from the wall clock — 004's stated reason for
  refusing one, sharpened, because the value a default would manufacture is the very value being
  replaced.
- *NOT NULL* because, unlike 004's Ironwood columns, the "never examined" state does not exist: a
  `blocks` row exists only because a header was decoded, and every header carries a timestamp.
  The absence is expressed by **the row's absence**, which the LEFT JOIN already returns as null.
  A nullable column here would create exactly the set of untested branches CLAUDE.md warns a
  dropped `NOT NULL` releases.
- *Seconds, not milliseconds*, because that is the header's own field; the millisecond form is a
  consumer convention (`PoolBalanceSample.timeMs`) derived once at the read boundary through the
  existing named `MS_PER_SECOND`. The column name carries the unit so a reader who assigns it to a
  `timeMs` field sees the mismatch.
- *BIGINT, not INTEGER*, because unix seconds pass `INT_MAX` in January 2038. Measured, not
  assumed: postgres.js returns `BIGINT` as a string and `INTEGER` as a number, so the read parses
  with `Number(...)` exactly as `crossingsFromRows` already parses `NUMERIC`.

**THE IRONWOOD SPEND SOURCE IS THE MISSING (nullifier → anchor) EDGE, NOT A `candidate_count`
COLUMN.** `candidateCount` is `Cand_0`, and `rawCandidateRange` already defines it as
`maxPosition + 1n` where `maxPosition` lives in `pool_anchors`. Storing a `candidate_count` beside
the spend would be a second source of truth for a number `pool_anchors` already determines, and a
re-analysis would have to UPDATE an observation row to correct it. What `pool_nullifiers` genuinely
cannot say is **which anchor the spend cited** — there is no such column, and that is the real
structural gap the CHECK constraint was mistaken for.

So 005 adds `pool_nullifiers.anchor_root TEXT`, nullable with no default, and the publisher derives
`candidateCount` by joining `pool_anchors`. Nullable is 004's argument holding: rows written before
this column existed genuinely never recorded an anchor, and a spend whose anchor is unknown to
`pool_anchors` yields no count — which is `rawCandidateRange` returning `null`, "a candidate count
cannot be claimed", falling out of the join rather than being re-stated. **No `DEFAULT`, and here
the reason is sharper than 004's:** `candidateCount` is read as a *predicate* — `> 0n` is
`ironwoodBirth`'s admission rule — so a manufactured zero would silently *exclude* a spend from the
series while looking like a measurement.

**THE WRITE-PATH BOUNDARY.** This handoff ships `writeBlock`, `writePoolSnapshot`, their rollbacks
and their readers, tested against a real Postgres. It does **not** ship the confirmed-block driver
that calls them; that is HANDOFF-12 §4 and building it here would make this gate unable to tell a
pipeline defect from a driver defect — the same argument, third time, that took the package move
out of 11.

## §4 DELIVERABLES

1. `apps/indexer/migrations/005_block_time.sql` — the `blocks` table and
   `pool_nullifiers.anchor_root`, re-runnable, matching 003 and 004's contract.
2. `apps/indexer/src/persistence/blocks.ts` — `writeBlock`, `readBlockTimes`,
   `rollbackBlocksToHeight`, in the house style of `pool-nullifiers.ts`.
3. `apps/indexer/src/persistence/pool-snapshots.ts` — `writePoolSnapshot`, `readPoolBalanceSeries`,
   `rollbackPoolSnapshotsToHeight`.
4. `writePoolNullifier` widened to carry `anchorRoot` when the caller has one.
5. `truncateAll` extended to cover `blocks` and `pool_snapshots`.
6. `apps/publisher/src/sources/chain-inputs.ts` — `queryOrchardSeries`, `queryDrainBaseline` and
   `queryIronwoodSpends` injected exactly as `queryMigrations` is; `orchardSeries`,
   `drainBaseline`, `ironwoodSpends` and `ironwoodWindow` populated from them.
7. The publisher composition root wires the three queries; config gains the window/baseline knobs.
8. Integration tests against a real Postgres for every path above.
9. Folds 1–6, in their own commit, before any of it.
10. `handoffs/README.md`'s operator click list gains migration 005 beside 003 and 004, as ONE cold
    run, with the sentence that doing it before the cutover is what keeps it free.

## §5 ASSERTIONS — binary and machine-checkable

**Amended format (fold 6).** Every assertion states its **EXCLUSION SET** — the values the
predicate is written to reject — and §7's fail-side transcript **names which member it used**. At
least one fail side per assertion is a **DATA mutation** drawn from that set, not a code mutation:
a code mutation proves the assertion is WIRED, never that it DISCRIMINATES.

- **A1.** **All four panels are non-null on a snapshot built through the real `readSnapshotInputs`
  against a real Postgres holding real rows** — not a literal, not a fixture standing in for the
  query. HANDOFF-09a's A1 was ambiguous between the instrument side and the production path and
  said so; this one is the production path only.
  *Exclusion set:* an inputs object whose `orchardSeries` is empty, whose `drainBaseline` is null,
  whose `ironwoodSpends` is null, or whose rows exist but carry no joinable block time.
  *Fail side names:* rows present in `pool_snapshots` with the matching `blocks` rows deleted —
  the join finds nothing, the series is empty, and `drain` publishes as an absence again.
- **A2.** **`pool_nullifiers` admits an `'ironwood'` row today**, against a real database with all
  migrations applied — the correction to §1's first dead premise, established by execution rather
  than by reading the migration.
  *Exclusion set:* any `pool` value outside `{sprout, sapling, orchard, ironwood}`.
  *Fail side names:* `'tachyon'`, which must be rejected by `pool_nullifiers_pool_check` — so the
  constraint is shown to be live rather than absent, which is the reading a bare INSERT success
  cannot distinguish.
- **A3.** **Migration 005 is RE-RUNNABLE**, proven by running it twice against a real Postgres and
  diffing the full schema between runs, matching 003 and 004's contract and what `migrate.ts`'s
  per-migration transaction assumes.
  *Exclusion set:* any statement that is not a no-op on second application.
  *Fail side names:* a deliberately non-idempotent variant (`ADD COLUMN` without `IF NOT EXISTS`)
  applied twice, which must fail — a second run that silently succeeds would prove nothing.
- **A4.** **The drain's velocities are computed from BLOCK time, and a fail side that feeds WRITE
  time shows a different, wrong answer.** The whole point of the migration is that those two clocks
  differ, so an assertion that cannot tell them apart has not tested it.
  *Exclusion set:* any series whose `timeMs` comes from `pool_snapshots.ts` rather than
  `blocks.time_s`.
  *Fail side names:* the same rows read with `ts` substituted for the join — a catch-up sync where
  ten blocks two hours apart were written within one second, so the write-time velocity is larger
  by three orders of magnitude and provably not the block-time answer.
- **A5.** **`candidateCount` is `pool_anchors.max_position + 1`, and a spend whose anchor is
  unknown is EXCLUDED from the series rather than counted as zero.**
  *Exclusion set:* a spend with a null `anchor_root`; a spend whose `anchor_root` is absent from
  `pool_anchors`; a spend whose derived count is `0n`.
  *Fail side names:* an ironwood spend row whose `anchor_root` names a root not in `pool_anchors` —
  it must not appear in `neffSeries`, and the audit record's `countIn - countOut` must count it.
- **A6.** **`pnpm -r test` unchanged in COUNT as well as colour.** Baseline **1220 total, 1218
  passed, 2 skipped**, measured by L2 on a clean worktree of `14b5e98` with a real Postgres 16 and
  a real local Redis. §7 states the per-package split before and after.
  *Exclusion set:* a total below the baseline; a suite that vanishes rather than moves.
  *Fail side names:* deleting one new integration test file and watching the total drop.
- **A7.** **The retrofitted `check-instrument-deps.mjs` goes RED when a third member is appended to
  `BANNED_DEPENDENCIES`** — fold 1, verified by the probe that found F-45-1.
  *Exclusion set:* any banned name whose manifest-side detector is never driven.
  *Fail side names:* appending `better-sqlite3` as a third member; the self-test must fail, where
  today it goes green and the summary line vouches for the untested name anyway.
- **A8.** **The twelve guards, `typecheck`, `lint`, `content validate` and `pnpm build` are green**
  — `pnpm build` in particular, the only one that runs `next build` and so the only one that
  resolves an `apps/web` import the way webpack does.
  *Exclusion set:* any of the six exiting non-zero; a guard that passes because it scanned nothing.
  *Fail side names:* the vacuous pass rather than a broken build, because it is the member of the
  set a green run cannot distinguish — `check-ledger-structure.mjs`'s new R4 driven over a handoff
  that opted into the amended format and carries no assertion bullet, which must be reported as a
  finding rather than counted as a clean scan.

## §6 DISPATCH HINTS

- Loop 1 PREFLIGHT before any Haiku touches the migration, the publisher or the shared-store rules.
- The gate reviews the fix commit as its own commit — three sessions running have shown a fix here
  is the most dangerous commit in the branch.
- Post-fan-out sweep (`git status --porcelain`) after every fan-out, before the next commit.
- A2, A3, A4 and A5 all need the real Postgres. Bring it up first; a skipped integration test is
  not evidence and `skipIf` will hide it.

## §7 REPORT — written by L3 before the PR opens

*(filled in below once the work is done)*

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*(appended at write-back)*
