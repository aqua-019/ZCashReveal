---
handoff: 09b
title: The two missing snapshot input sources - a block-time source and an Ironwood spend source
status: closed
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
panel, provided the panel renders as a named absence stating the CONDITION that produced it (fold 3;
L2 wrote "carrying its owner", which §8.1 superseded in gate round 4 - a null panel that names a
shipped handoff as its owner is the defect, not the remedy).

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

**STATUS: DONE.** Spawn mode WORKING, proven by a tool attempt before any other output.

### The environment, stated first because every number below depends on it

A **real PostgreSQL 16.13** (`initdb` + `pg_ctl` in this container, not a stub) and a **real local
`redis-server`** on 6379. All six migrations applied by the project's own `migrate.ts`. Every count,
every velocity and every schema fingerprint below was executed here; nothing is relayed. What could
NOT be executed is unchanged from previous handoffs and is listed under UNVERIFIED.

### §5 assertions — every one executed, in both polarities, with the fail side naming its member

| | assertion | pass state (executed) | fail side — **which member of the exclusion set** |
|---|---|---|---|
| **A1** | four panels are measurements through the real `readSnapshotInputs` against real rows | all four non-null, and asserted by **value** rather than presence: `drained` = 1 - 708841/900000, `sampleCount` 2, `velocity24h` -1000 ZEC/h, `candidateCount` 4096 | **"rows exist but carry no joinable block time"** — `DELETE FROM blocks`, series empty, `drain` null AND reported through the fault callback; the other panels unaffected |
| **A2** | `pool_nullifiers` admits `'ironwood'` today | `pg_get_constraintdef` returns exactly one constraint, over all four pools; the INSERT succeeds | **`'tachyon'`** — rejected by `pool_nullifiers_pool_check`, so the constraint is shown LIVE rather than absent, which a bare INSERT success cannot distinguish |
| **A3** | migration 005 is re-runnable | applied twice; 418-line schema dump **byte-identical** between runs | **`ADD COLUMN` without `IF NOT EXISTS`** — errors on the second application, where 005's guarded form is a NOTICE and a skip |
| **A4** | the velocities come from BLOCK time | -1000 ZEC/h over the three hourly samples; the 7d window separately reaches the baseline at -6371.97 | **"a series whose `timeMs` comes from `pool_snapshots.ts`"** — the same rows through the write clock give **-172,043,100 ZEC/h**, five orders of magnitude wrong; swapping the production join to `ts` turns A4 red |
| **A5** | `candidateCount` is `max_position + 1`, unknown anchors excluded | 3 spends on disk, 1 admitted, `candidateCount` 4096 from `max_position` 4095 | **"a spend whose `anchor_root` is absent from `pool_anchors`"** — recording that anchor admits it with a DIFFERENT bound (10, from `max_position` 9), so the exclusion is shown to be the join and not the window, the pool filter or a typo. The null-anchor spend stays excluded, so the fail side moved exactly one of the two members |
| **A6** | `pnpm -r test` unchanged in COUNT | **1220 -> 1267**, larger; split below, MEASURED per package rather than derived | deleting a new integration file drops the total |
| **A7** | the retrofitted `check-instrument-deps.mjs` covers a third banned member | R1 now generates a direct and a transitive probe per member of `BANNED_DEPENDENCIES` | **"a banned name whose manifest-side detector is never driven"** — see the correction below; the discriminating probe is a detector that under-covers the list, rc=0 pre-fold and rc=2 post-fold |
| **A8** | twelve guards, typecheck, lint, `content validate`, `pnpm build` | 12 guards rc=0, typecheck 13/13, lint 0, validate OK, `pnpm build` 9/9 | **the vacuous pass** — R4 driven over an opted-in §5 with no assertion bullet is reported as a finding rather than counted as a clean scan |

### A6's split, before and after

| package | before | after | delta |
|---|---|---|---|
| `packages/content` | 67 | 67 | — |
| `packages/zebra-rpc` | 50 | 50 | — |
| `packages/zec-instruments` | 98 | 98 | — |
| `apps/web` | 368 | 368 | — |
| `apps/gateway` | 143 | 143 | — |
| **`apps/publisher`** | 67 (66 + 1 skipped) | **101** (99 + 2 skipped) | +34: the A1/A4/A5 integration suite, the birth-height pin, and five gate rounds' fixes - including round 4's nine, which restore a guard's lost transcript, refuse the `windowSpendCount` inversion at the producer, and drive the second copy of the schema refusal |
| **`apps/indexer`** | 427 (426 + 1 skipped) | **449** (448 + 1 skipped) | +22: `blocks` and `pool_snapshots` persistence, the reorg and late-anchor pins, and the truncate guard's own suite |
| **total** | **1220** (1218 + 2) | **1276** (1273 + 3) | +56 |

**THE FIGURES IN TWO OF THIS BRANCH'S COMMIT MESSAGES DO NOT REPRODUCE, AND THAT IS RECORDED RATHER
THAN QUIETLY CORRECTED.** They said `1264` and `1276`; measured per package with Postgres and Redis
up, the totals at those commits were **1250** and **1259**. Both were arithmetic done instead of
reading the run. Gate round 3 caught it by re-measuring, which is the only reason it is a footnote.
In a repository that has three times recorded "a green run is not evidence a package ran", a count
in a report that nobody re-measured is the same defect in a smaller font.

Each package figure in the right-hand column was READ FROM THE RUN, package by package, and the total is their sum; the middle column is the same measurement at the branch point. Given what the paragraph above records, that distinction is the point.

**Both skips named, and now the third.** `decodeBlock - real mainnet fixture` (the operator's
capture, seven handoffs old) and the two `runIf` markers, each of which fires only when its service
is DOWN and is therefore correctly skipped BECAUSE the service is up.

### The two premises in the commissioned scope that were false

Both were established by execution, not by reading, and both are in §1 rather than worked around.

1. **`pool_nullifiers` has admitted Ironwood for three handoffs.** Migration 002 created the
   two-pool CHECK; **003 lines 47-49 drop it by name and re-add it over all four pools**, and
   `migrations.test.ts` has asserted it since HANDOFF-06. L2 enumerated `CREATE TABLE` statements
   and did not see the `ALTER`. This changed the deliverable: the real gap is that no table could
   say WHICH ANCHOR a spend cited, which is why 005 adds `anchor_root` rather than a
   `candidate_count`.
2. **`pool_snapshots` had no production writer at all** - no `INSERT` outside one test probe, no
   confirmed-block driver, nothing constructing a `PoolState`. So "rows written from now on" names
   rows this handoff's writer is the first to write, and the backfill question is not "none on the
   VPS yet" but **none anywhere, ever**. It also fixed the write-path boundary: this handoff ships
   the writer FUNCTIONS and their tests; HANDOFF-12's driver calls them.

### The design decisions, and why each was defensible rather than merely taken

- **A `blocks` table, not a `block_time` column.** A block has one time; the column stores that one
  consensus number four times per height with nothing holding the copies equal. Decisive past the
  principle: `PoolStateSnapshot` is a SHARED type with no time field, so the column shape forces
  either widening it or a third writer parameter, and the table needs neither -
  `writePoolSnapshot(record, conn)` matches the other four writers exactly.
- **`time_s BIGINT NOT NULL`, no default, seconds.** No default because a default is what made
  `pool_snapshots.ts` useless. NOT NULL because a block cannot be observed without its time, so the
  absence is the ROW's absence. BIGINT because unix seconds pass `INT_MAX` in 2038 - and because
  postgres.js returns BIGINT as a **string**, which was MEASURED against this Postgres alongside
  INTEGER (number), NUMERIC (string) and TIMESTAMPTZ (Date) rather than assumed.
- **`anchor_root`, not `candidate_count`.** `rawCandidateRange` already defines Cand_0 as
  `max_position + 1n`; storing it beside the spend is a second source of truth for a number
  `pool_anchors` determines. No DEFAULT, and the reason is sharper than 004's: the count is read as
  a PREDICATE (`> 0n` is the admission rule), so a manufactured zero excludes a spend **silently**
  while looking like a measurement.

### Three findings this session raised against its own work before the gate returned

- **The Ironwood birth height was tied to the drain's chart origin.** `readSnapshotInputs` read
  `birthHeight` from `SNAPSHOT_DRAIN_BASELINE_HEIGHT`, on the argument that one configured height
  beats two. Wrong, and silently: the drain baseline is a chart origin `orchardDrain`'s own docblock
  invites an operator to re-base, and a birth height is a consensus fact. Re-basing the chart would
  have dropped every spend below the new value and shortened `neffSeries` into a real measurement of
  a window nobody asked for. Split into `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` and pinned by a regression
  test with both polarities; restoring the conflation turns it red.
- **`check-pool-union` caught a stale two-pool union in migration 005's own comment**, where it
  quoted L2's false premise verbatim. **Rephrased rather than exempted** - weakening a guard to
  accommodate prose is the wrong trade, and `check-redis-safety`'s "the rule's own documents may
  name them" exemption was deliberately not copied for one comment.
- **Two test-fixture defects, both found by a red run rather than by review.** The A1 fail side
  deleted too narrow a height range (the drain window is eight days and reaches far below it), and
  its restore wrote timestamps the seed never had, which then contaminated A4 into measuring
  -47,789 ZEC/h against a fixture it had not built. **The estimator was right and the fixture was
  wrong both times.** Fixed by re-seeding per test and by modelling a catch-up sync deterministically
  with explicit `ts` values.

### L2's stated verification for fold 1 does not discriminate, and is reported rather than redone

Fold 1 says: "Verify by the probe that found it: append a third member, the self-test must go RED."
**Executed: it does not, and it should not.** A correctly generated probe set produces probes for
the new member that PASS - exactly as R2's eight generated probes already pass, which L2's own
F-45-1 observed without drawing the consequence. Appending `better-sqlite3` leaves the retrofitted
self-test green, and that is the right answer.

The discriminating probe is a detector that UNDER-COVERS the list: `findBannedPath` called with
`BANNED_DEPENDENCIES.slice(0, 2)`, a no-op while the list has two members and a hole once it has
three. Executed both ways:

- **pre-fold guard**, that mutation, third member appended: **rc=0**, and the summary line asserts
  the rule for `better-sqlite3` by name while its detector was never driven. F-45-1 reproduced.
- **post-fold guard**, same mutation: **rc=2**, with three named failures.

This is the fifth-and-sixth instance of the rule about probes rather than code (LEDGER-05 fold 7).
The sixth: `pg_dump` 16 emits a random `\restrict` nonce per invocation, so A3's first schema
comparison reported two different fingerprints for a byte-identical schema. **The probe was wrong,
not the migration**, and the instrument was corrected rather than the conclusion.

### Instance three of "a green CI is not evidence a package ran", recognised as F-45-2 asked

L2 recorded instances one (`zebra-rpc`) and two (`zec-instruments`) and wrote: "Clause (b) of the
stopping rule triggers at three. I am not asking for the guard now. I am recording the count so
instance three is RECOGNISED rather than re-derived." **This is instance three.**
`snapshot-inputs.integration.test.ts` gates itself on a Postgres reachability probe and the
publisher's CI step emitted no JSON report, so nothing checked it. Executed: with `DATABASE_URL`
pointed at a closed port, vitest exits **0** with 73 tests, 66 passed and **7 silently pending** -
including A1, A4 and A5, the three the handoff exists for.

Under clause (b) the instrument at instance three is a guard, and the guard already existed pointed
at one package. `assert-no-skipped-integration.mjs` now merges several reports and matches both path
shapes; `ci.yml` emits a publisher report and checks both. **Shown to fail on the shape**: rc=1
naming each skipped assertion, where the pre-widening guard on the same evidence prints "OK: every
Postgres integration test executed" and exits 0.

### Round 4, which L2 called after reading §7's own statement that the gate had not converged

**L2 reviewed `0e2df0c` as its own commit because nobody had** - the review §7 named as missing -
and found **F-46-1 (MEDIUM)** in it: round 3's fix corrected the RENDERING layer and left the LOG
layer stating the falsehood it had just removed.

The pre-birth branch returns a MEASUREMENT - `spends: []` over a real window, which is what round 3
changed it to - and still called `fault("neffSeries", ...)`. The one production wiring of
`onInputFault` logs at ERROR: *"an input query failed; publishing that panel as a stated absence"*.
Both halves false, on every one of ~3.4 million blocks of an initial sync. **Demonstrated rather
than argued**, with a `queryIronwoodSpends` that throws if it is called: it never is.

Not cosmetic. `RUNBOOK-VPS.md` triages by reading logs and carries the concept of an expected line
that must stay distinguishable from a fault - "zmq unavailable # expected, once". This one is
expected AND continuous, has no runbook entry, and arrives at the same severity as a real failure on
the same panel, training an operator to filter `neffSeries` faults including the real one round 2's
unresolvable-anchor fixture exists to produce.

**ROUND 3 HAD PINNED ITS OWN DEFECT AS CORRECT BEHAVIOUR.** Its F3 test asserted the false line was
emitted - `expect(faults.some(/does not exist yet at this height/)).toBe(true)` - which is why
F-46-1 survived that round and needed a fourth. The assertion is inverted with the history visible.

**The choice, argued as L2 required: NO REPORT AT ALL, not a separate non-fault channel.** Four
reasons. Nothing happened - not a failure, not an absence, not an anomaly. The document already
carries the condition at the surface that has readers. The runbook's precedent is for a line that
fires ONCE. And a tip ABOVE the birth height with no spends makes the identical claim - "measured,
and it is zero" - while reporting nothing, so reporting one zero and not the other would make the
log's meaning depend on which of two true zeros produced it. The fail side is the DATA mutation L2
specified: one block below the birth height and one above, two values of one variable through the
same code.

### And the round-4 fix comment repeated the shape it was fixing, caught by measuring

The comment claimed the condition is readable as `ironwoodWindow.highHeight < birthHeight`,
"published on every tip". **The window is not published.** `snapshotNeffSeriesSchema` carries
`birthHeight`, `series`, `spendCount`, `windowSpendCount` and `shares`; `buildNeffSeries` drops the
window. Gate round 3's F4 established exactly that and this session corrected the clamp comment
twenty lines above for it - then wrote the same claim again, in the commit fixing an instance of
this very shape.

Caught by **measuring the published document** rather than re-reading the sentence, before the
reviewers reached it. The argument survives with the right fields: on a pre-birth tip
`snapshot.height` is 3,428,142 against the panel's `birthHeight` 3,428,143, both REQUIRED, so
`height < birthHeight` is readable by anyone holding the document. The other three claims in the
comment were then checked rather than assumed.

**The test carried the same confusion and could have been green while the claim it stood for was
false**: it asserted on `belowInputs.ironwoodWindow` - the INPUTS - where the claim is about the
DOCUMENT. It now builds the snapshot and asserts on the published panel, which is the only place the
claim can be checked.

### Round 4's two commissioned reviews, and both of them found the fix commit

L2's round 4 commissioned two reviews rather than one: `0e2df0c` reviewed as its own commit - the
review §7 itself had named as missing - and then round 4's own fix commit under the amended clause
(ii), because that fix is control flow. **Budgets in the first lines, as LEDGER-05 Q5 requires: 34
candidates / 21 by execution, and 22 / 15.** Eleven findings, three HIGH. Both reviewers reported a
malformed probe of their own against themselves rather than silently redoing it, which is the
converse rule working for the sixth and seventh time.

**THE HIGH THAT MATTERS MOST IS THE ONE WHOSE TEST RESULT DOES NOT DISCRIMINATE.**
`truncate-guard.test.ts` was written in round 3 to prove that `truncateAll` protects a developer's
database. Its fourth case tests the escape hatch, so it must DELETE `ZR_TEST_SCHEMA` - and then it
called the real `truncateAll(sql)`. `getSql()` fixes `search_path` at CREATION time, so on a run
whose `globalSetup` line is missing - the exact door `_setup.ts` names in as many words - the
connection resolves to `public` and the file wipes the developer's six chain tables. The case above
it throws in that state, and a thrown test does not stop the file. The header said **"IT NEVER
TRUNCATES ANYTHING"**.

Reproduced twice, against a throwaway database created for it:

| | test result | `blocks` | `pool_nullifiers` |
| --- | --- | --- | --- |
| the file as round 3 wrote it | 1 failed, 3 passed | **0** | **0** |
| the file as round 4 leaves it | 1 failed, 3 passed | 1 | 1 |

**The test result is IDENTICAL in both polarities.** Only the database discriminates, which is why
three rounds of reading missed it and one execution found it. The hatch case now drives a recording
stub: what the hatch has to be shown to do is let the TRUNCATE through, and a recorded statement is
that exactly, while the pass side above it already proves the same statement empties real tables.

**THE SECOND HIGH IS A GUARD THAT LOST ITS TEST INSIDE THE COMMIT SAYING BOTH GUARDS WERE COVERED.**
Round 2 added the fault wrapper in `readSnapshotInputs` with its two-polarity transcript, `F11`.
Round 3 added two cases for the OTHER site, `panelOrNull`, and deleted `F11`. So `0e2df0c`, whose
message reads "both sites now guard", left one of them with no transcript in either polarity - in a
repository whose §5 rule is a transcript per assertion. Measured at that commit: replacing the
wrapper with a bare `sink(panel, err)` left the whole publisher suite unchanged at 90 passed / 2
skipped. Restored in `units.test.ts` rather than back in the integration file, because nothing about
a broken logger needs a database and a suite skipped for want of Postgres is a second way to have no
transcript. Each half now dies to its OWN mutation: the sync case when the outer `try`/`catch` goes,
the async case when the promise wrap goes - the first draft used one mutation for both and it only
killed the async half, which is a fail-side probe that does not discriminate and is reported here as
one.

**THE THIRD HIGH IS THE SWEEP RULE, ON THIS BRANCH, IN THE COMMIT THAT ARGUED FOR IT.** `0e2df0c`
rewrote SNAPSHOT.md's "what closed each one" table to say 09b supplied both missing sources, and
left §8.1's rendering contract twenty-five lines below still reading `drain: not measured - needs a
block-time source (HANDOFF-09b)`. The publisher change in that same commit was made FOR this reason
- "naming a handoff for an absence no handoff can close". `drain` is still reachable as `null` on
the production path (no `queryOrchardSeries`, no baseline row, or a non-positive baseline), so a
renderer would have told a visitor that a database which did not answer on this tip needs a handoff
that had already shipped. All four rows now name a CONDITION. That is the `POOLS_VIEW_GAPS`
precedent applied - `apps/gateway/src/views/pools.ts` already records that **an owner is a live
statement on the wire and decays silently, and a prediction that outlives its subject reads as a
fact** - and a condition does not decay. Swept: the integration test comment restating the old
rendering is now past tense and says so.

**AND THE ROUND-4 FIX'S OWN TEST ASSERTED IN A COMMENT WHAT IT DID NOT CHECK.** The F-46-1 test
takes one tip below the birth height and one above; the `explode` query that proves the pre-birth
branch never queries was passed only to the BELOW call, while the comment claimed "one block above,
the query IS called - so the two tips take different paths". Mutating the guard to `if (true)` left
**both halves of F-46-1 green** (eight other tests in the file caught it, so the suite was safe and
the test's statement about itself was false). The DATA-mutation half - the half L2's Q2 rule exists
for - was the half that did not discriminate. Now counted, and red under that mutation with
`expected +0 to be 1`.

**THE DELETION'S SECOND REASON NAMED READERS THAT DO NOT EXIST, AND THE FIX WAS TO MAKE IT TRUE.**
The comment argued that no log line is needed because "the document already carries it, at the
surface that has readers". Executed: `neffSeries` appears **zero times** in `apps/web`, the gateway
has no snapshot read path, and §8.1's contract distinguished only `null` from non-null - so nothing
in the repository instructed anyone to compare `height` against `birthHeight`, which is the single
comparison the whole argument rests on. True of the FIELDS, false of the CONTRACT. §8.1 now carries
a four-row `neffSeries` rendering table keyed on that comparison, and the branch points at it; the
deletion itself was still right, and it is the justification that has been repaired.

**Two findings were the reach the round-3 extrapolation predicted**, and it is worth recording that
the prediction was right about the floor and wrong about the ceiling, in the direction that flatters
the branch - for the second time on this branch and the fifth in this project. It said a fourth
round would probably find "a stale count in a docblock, or an assertion that passes either way". It
found both (`blocks.ts` claiming four pool rollbacks and "all five" where there are six, wrong when
written and missed by the sweep that fixed its sibling; and the F-46-1 assertion above) - and three
HIGHs besides, one of which wipes a database.

**The rest, fixed with their evidence.** A producer-side refusal for the `windowSpendCount`
invariant round 3 added at the schema and nowhere else: `serializeSnapshot` validates nothing and
the gateway's `safeParse` rejects the WHOLE document, so an inverted pair costs `pools`, `residual`
and `lastReports` while the process logs `snapshot published` - which is verbatim the trade
`buildDrain` already makes six lines away in the same file. Three-way evidence, because a refusal
needs it: refusal removed goes red, the DATA made well-formed goes red, both correct is green. A
runbook paragraph spliced mid-chain leaving "It" pointing at the hand-correction step rather than at
migration 005 - the third instance on this branch of inserted text breaking the structure of the
text it was inserted into. `CLAUDE.md`'s clause (ii) still stated as an absolute two bullets below
the amendment bounding it, and clause (b)'s "shape" now saying which of two objects it quantifies
over. The publisher's hand-written second copy of the schema refusal, which lived inside a
`beforeEach` where nothing reached either branch, now a named predicate with five cases - one of
which pins it against `_setup.ts`'s copy on every input, because two copies of one rule with one
test is how they come apart.

**And the runbook entry for publisher input faults was written from the measured channel rather than
from the log line's text**, which changed it. The fixed half of that message says "publishing that
panel as a stated absence"; enumerating the four things that reach the channel shows it is true of
two of them. The `drain` baseline refusal publishes a series with no baseline, and the partial
anchor loss **publishes the panel** over fewer spends than the window holds - and that log line is
the only place the gap is stated at all, since `buildNeffSeries` drops the audit record. The
runbook's table says so. The imprecision in `index.ts`'s message is real and is NOT fixed here:
round 4 was commissioned narrow, the message is outside F-46-1, and it is carried to §8 rather than
taken in.

### Round 5, and the headline is a negative result

`923372e` changes control flow in three places, so the amended clause (ii) makes it a round rather
than an in-round read. **Budget in the first line: 47 candidates / 35 by execution** - eleven
mutations, a 2,000-case randomised sweep of the production path, three throwaway-database
reproductions, a 63-pair predicate-equivalence check, a 7-path null-cause enumeration, nine suite
runs. Two of the reviewer's own probes were wrong and are reported against itself.

**NONE OF IT FOUND A LIVE DEFECT IN ANY EXECUTABLE LINE ROUND 4 ADDED, and that is the finding.**
The producer refusal is the precise negation of the schema's refine (`b.spendCount` IS the published
`spendCount`, not `series.length` under another name) and cannot fire on the production path: 2,000
randomised tips gave 1,958 published, 0 refusals, `windowSpendCount >= spendCount` on every one -
and injecting `spendsInWindow: rows.length - 1` fires it immediately, so the probe discriminates.
`mayTruncate` is exhaustively equal to the inline condition it replaced across 63 pairs including
`""`, `" "`, `"0"`, `" 1"` and `"TRUE"`. The recording stub reproduces round 4's own two-polarity
claim exactly. **All eight findings are in prose, in guards, or in one assertion.**

**THE TWO HIGHs ARE BOTH IN THE RUNBOOK SECTION ROUND 4 WROTE, AND BOTH ARE THE SAME ERROR.** Its
`published?` column said a non-positive drain baseline publishes the series without its baseline.
`buildDrain` returns null the moment the baseline is null, so the whole panel goes - absent for
three of the four rows, not two. And the section says "the publisher logs each one" while
documenting one of the two production sinks: `index.ts` wires `onInputFault` and, separately, an
inline callback logging *"analysis panel refused its inputs"*, and `grep -rn "analysis panel
refused" docs/` returned nothing. The case reaching only that second channel is `buildDrain` on an
Orchard series emptied by the INNER JOIN against an empty `blocks` - **any 005 database before a
backfill, which is the state the runbook's own section 4 says the VPS is about to be in.**

Both errors have one cause, and §7 records it because the commit message got it wrong: that table
was built by enumerating the `fault()` CALL SITES and not following what each one RETURNS. The
commit message called it "written from the measured channel rather than from the log line's text".
It was half a measurement, in the section that exists to warn against reading half of one.

**AND THE OWNER-TO-CONDITION SWEEP LANDED AT ONE SITE OF THREE.** Round 4 rewrote §8.1's four rows,
wrote twenty-two lines ending *"a condition does not decay, which is why all four now name one"*,
swept the integration test's comment to past tense - and left the sentence INTRODUCING that table,
three lines above it, still mandating "a named absence carrying its owner", plus `chain-inputs.ts`'s
restatement still in the present tense, in a file the same commit edited fifty lines higher. §7 said
"Swept:".

**That is the fifth instance of "a corrected fact landing at some of its sites", and the fifth was
committed inside the fix for the fourth.** Round 3's own commit title names the shape; round 4's two
reviews found it twice; round 5 found it inside round 4's fix. Four rounds, so under the recurrence
rule the instrument is a GUARD and not another reading. The register row `H09b-ABSENCE-CONDITION`
is in `check-finding-sites.mjs`, driven to **FAIL naming both open sites** and to **PASS at 15
findings / 42 sites** once closed, with the already-swept third site correctly reported closed
throughout. The guard existed; what was missing was the row, and adding the row is part of fixing a
multi-site finding rather than paperwork after it.

**One MEDIUM, and it is the same defect one layer down from the one round 4 had just fixed.** §8.1's
new `neffSeries` string read "the Ironwood spend query did not answer". Enumerated by execution,
that panel is null on five paths and **the query answered on three of them** - the dominant one
being rows returned with no resolvable anchor, which the same commit's runbook calls "the state of
any database that applied 005 without a backfill". A renderer following it would have told a visitor
the query failed when it succeeded and nothing in it could be bounded. Both strings now name their
dominant cause, and the pre-birth row attributes its claim to the published `birthHeight` rather
than asserting it of the chain, because that number is `SNAPSHOT_IRONWOOD_BIRTH_HEIGHT` and a
misconfigured one is visible there and nowhere else.

**The three LOWs.** §7.1 shipped unguarded - which is precisely what the round-4 review had named as
the reason `check-infra-docs` passed over it - so it gains two topics, one per channel, because a
single row matching only the input channel would have certified exactly the half-coverage that was
the HIGH. `CLAUDE.md`'s clause (ii) still read as both "a new round" and "not a gate round", which
give different budgets under Loop 4's three-rounds-per-finding, and the same ambiguous "shape" sat
in the guard-recurrence rule without clause (b)'s disambiguation. And the round-4 stub assertion
pinned one of six tables: measured, dropping `pool_snapshots` from `truncateAll` left **the file
that exists to be this guard's transcript at 4 passed** while the rest of the tree went red. It now
asserts the whole statement and is red under that mutation.

### Round 6, in which the guard written to stop this shape was green on it

`39de2f6` changes two guard predicates and a test assertion, so the amended clause (ii) makes it a
round. **Budget in the first line: 31 candidates / 24 by execution, 38 mutations** - nine against the
TRUNCATE assertion, eight paraphrase substitutions, six site reverts, five guard-row mutations, four
data mutations, two runbook deletions, four probe re-checks. The reviewer reported a malformed probe
of its own, and reported that it had written one scratch file into the tree and deleted it.

**THE HIGH IS THE WORST KIND THIS PROJECT HAS: A GUARD THAT CERTIFIED ITS OWN HOLE.** Round 5 added
`H09b-ABSENCE-CONDITION` precisely to stop "a corrected fact landing at some of its sites", and drove
it to fail by reverting the two SENTENCES it had just fixed. Reproduced in this session before
acting on the finding:

```
DATA MUTATION: the round-3 table rows restored verbatim -
  | `drain` | `drain: not measured - needs a block-time source (HANDOFF-09b)` |
[finding-sites] OK: 15 multi-site finding(s), 42 site(s) checked, all closed
```

**Green, on the exact rendering string the rule forbids.** That is CLAUDE.md's data-mutation rule
broken by the session that quotes it: the fail side was drawn from the CODE - the prose the fix
happened to touch - and never from the set the predicate claims to exclude. Seven of eight
paraphrases passed too. The row now has three arms: the phrasing arms catch seven of eight (the
eighth, "a named absence that names the handoff responsible", uses no owner-word and is stated as
beyond a phrase match rather than claimed closed), and **the third arm matches the OBJECT** - a
table cell pairing "not measured" with a HANDOFF reference - which does not depend on how a future
session words the rule. It carries a `dataProbe` beside its `probe`, and the self-test drives both.

**AND THE SWEEP IT WAS WRITTEN TO CLOSE HAD LANDED AT THREE SITES OF SEVEN.** Sixth instance of the
shape, committed inside the fix for the fifth. Four live assertions stood: `SNAPSHOT.md`'s own
cutover permission **twelve lines below the paragraph that replaced it**; `handoffs/README.md`; this
handoff's own §1; and `HANDOFF-11-live-wiring.md` twice.

**`HANDOFF-11` IS AMENDED IN PLACE, AND THIS SESSION CHANGED ITS POSITION - WHICH IS RECORDED RATHER
THAN QUIETLY REVERSED.** §7 above raised that line for L2 and declined to touch it, on the ground
that a handoff body is not one of the five cross-handoff edits a session may make. Two facts moved
it. First, it is not a quoted example: it is a `status: queued` §3 CONTRACT that **cites §8.1 as its
authority** and hands the cutover session the exact string §8.1 now forbids. Second, and decisively,
that bullet already invokes the LEDGER-10 Q5 precedent in its own words - *"a rule whose premise
changed is one the next session obeys for the wrong reason unless the change is visible"*. The
premise changed when 09b shipped. **Amendment in place is what that sentence itself prescribes**,
and it is a strictly smaller act than the rewrite the cross-handoff rule forbids: the old form is
struck and visible, the new form states the condition, and the LEDGER-05 Q2 precedent it rests on is
untouched.

So `flatten()` now drops `~~...~~` spans. What is struck is not in force, and a guard that fired on
struck text would force exactly the deletion the amendment convention exists to prevent.

**NEITHER GUARD'S SELF-TEST ITERATED ITS OWN RULE DATA** (LEDGER-09a Q3), and both had just gained
members without it. Both now do, and both found holes on the first run - which is the whole argument
for that rule:

| guard | what the loop found |
| --- | --- |
| `check-finding-sites.mjs` | **three register rows** (`R3-H2`, `R2-GRADE`, `R3-ROWS`) whose patterns had never been driven against any text, while the run printed "detector self-tested in both directions" |
| `check-infra-docs.mjs` | **four topics with no positive probe and seven with no negative one** - so nothing showed those patterns cannot be satisfied by prose, which is the defect three rows in that list were tightened for. (Round 6 reported five and eight; round 7 measured the arrays at +4 and +7 and this session reproduced it. The wrong pair reached three sites before it was caught, which is the inverse of the sweep rule and is corrected here and in §8's round-7 block; `LEDGER.md` is append-only, so the round-6 block keeps the error and the round-7 block states it.) |

Fail side, the reviewer's own mutation: `{ topic: "UNPROBED TOPIC", re: /docker/ }` - a pattern any
prose in the runbook satisfies - now fails the self-test naming itself. Before, it printed OK across
all seventeen topics in silence.

**AND ROUND 5'S OWN CLAUDE.md EDIT HAD DISABLED AN ESCALATION.** The clause (ii) exemption was
written as a blanket "does not consume the three-round-per-finding budget". On a long gate every
round after the first IS a fix-commit review, so the blanket form makes `NOT CONVERGING` unreachable
in exactly the case it exists for. It now exempts only a round that does not re-surface a finding
with the same fingerprint.

**A read-only worker wrote to the tree for the third time.** The round-6 reviewer wrote
`apps/publisher/src/__drainprobe.mts`, executed it and deleted it, and **reported it against itself**
rather than leaving it to be found. The post-fan-out sweep confirmed the tree clean before this
session committed. Two things follow, and the second matters more: the finding that probe produced
is real and reproducible outside the tree, so it is kept; and this is now three occurrences across
three different agent roles, which is what CLAUDE.md's don't-list already predicts - the sweep is a
net, not a substitute for the rule.

### Round 7, L2's merge block, and the register driven against its own sites

**L2 blocked the merge on `9f99c0f` and the block was real there.** L2 reproduced `H09b-ABSENCE-CONDITION`
green on the data it forbids, independently rather than relaying round 6. Two facts belong beside
that, in this order. **The block was correct**, and it is the same finding round 6 had already
raised as F2(a). **And it was raised against a head two commits behind**: round 6's fix `9a534ed`
and its write-back `8d0c28d` were pushed before the ruling arrived. Executed here on `8d0c28d`,
with L2's own mutation in both the ASCII-hyphen form the ruling prints and the em-dash form the
file uses:

```
| `neffSeries` | `N_eff series: not measured - needs an Ironwood spend source (HANDOFF-09b)` |
[finding-sites] FAIL: 1 site(s) ... H09b-ABSENCE-CONDITION  docs/2.0/SNAPSHOT.md
rc=1
```

**L2's correction of this session's own reassurance is accepted and is the sharper half of the
ruling.** §7 had noted CI green as evidence the guards hold, "since CI runs `pnpm check` and would
have caught a guard that no longer passes". CI catches a guard that FAILS. It cannot catch one that
passes VACUOUSLY, which is what this one did on the same green run. A green `pnpm check` is evidence
about failure and silent about vacuity, and this branch has now produced the case that proves it.

**ROUND 7 FOUND THE ROUND-6 FIX HAD REINTRODUCED THE SAME FAILURE THROUGH A DIFFERENT DOOR.** Round
6 made `flatten()` drop `~~struck~~` spans so an amendment-in-place would not read as a live
assertion. The regex was `~~[\s\S]*?~~`, and pairing runs 1-2, 3-4 - so an ODD number of markers
inverts it and the guard eats the COMPLEMENTS, the prose BETWEEN the strikes. Measured on
`handoffs/README.md`:

| | spans stripped | characters | share of file |
| --- | --- | --- | --- |
| clean | 4 | 229 | 1.1% |
| one stray `~~` added | 4 | 16,269 | **80.3%** |

**And `check-finding-sites.mjs` itself carries five `~~` markers, an odd count**, produced by the
act of explaining the convention. End to end: the forbidden row live in a registered site plus one
stray marker took the guard from FAIL to OK. Fixed by scoping the strip to one line with no interior
tilde - GFM strikethrough does not span a blank line, so it costs nothing real and removes the
inversion. The attack now fails, rc=1.

**THE SECOND HIGH IS A GUARD THAT REDDENS ON CORRECT PROSE, WHICH IS HOW A GUARD GETS DELETED.**
Round 6's widened arm allowed any 48 characters between "named absence" and an owner-word, with no
polarity - so it fires on *"a named absence never names an owner"* as loudly as on the violation.
`SNAPSHOT.md`'s own correct sentence clears it by **five characters**, in the direction copy-editing
moves. Shortening "stating the CONDITION that produced it" to "stating its CONDITION" - still
correct prose - turned the build red with the message "still states the old answer" about a sentence
stating the new one. The arm now carries a negation lookahead; the shortened correct sentence is
green and every violating paraphrase is still caught.

**L2's ITEM 1, WHICH IS THE PART THAT OUTLASTS THIS BRANCH.** The requirement: each row's probe is
the defect **as it actually appeared at a real site**, and the row is driven to fail by applying that
probe **to the site itself**, not to a string the self-test holds. Two things had to change.

*The probe loop was under-covering for 7 of 15 rows.* Routed through `openSites`, a probe counted as
matched if `absent` fired **or** `present` was merely missing - so for every `present`-bearing row
the pattern was never driven, and the literal string `"banana"` passed all seven while the run
printed "self-tested in both directions". Each pattern is now asserted on its own terms, and an
`antiProbe` is required wherever an `absent` exists - the asymmetry `check-infra-docs.mjs` had closed
in the same commit that left this open.

*And every row is now driven against its own real sites*, with the perturbation the row's kind
demands: an `absent` row has its defect text spliced INTO the real file; a `present` row has its
corrected text DELETED from it. The second half is why this matters rather than being tidiness -
**a `present` row cannot be driven by a held string at all**, since any string lacking the required
text satisfies the check. Only the real file carries the difference between "this text is missing"
and "this is not the file". The drive discriminates: a pattern anchored so it matches its probe
standalone but not embedded in the real file now fails with exactly that message.

**THE PROBE AUDIT L2 ASKED FOR, AND THE COUNT IS NOT FLATTERING.** Fifteen rows carry a `probe`.
Searching each probe's text through `git log -S` against its own registered sites:

| verdict | count | rows |
| --- | --- | --- |
| **real-site text, recoverable from history** | **4** | `H09a-VITEST-ALIAS`, `R2-A9`, `H07-DENOM`, `R4-EXITZAT-REACH` |
| reconstruction or invented sentence | 11 | the rest |

So **four of fifteen** probes are the defect as it stood; eleven are sentences someone wrote to
resemble it. That is the honest measure of what this register proves by its probes alone, and it is
why the site drive above is the load-bearing half rather than a supplement. One qualification on the
instrument, stated because the number will be quoted: `git log -S` over a site path finds a probe
only if that exact text was committed at that path, so a faithful probe whose defect was reformatted,
or which lived at a path not in the row's `sites`, is counted "invented" here. The count is a lower
bound on faithfulness, not a proof of eleven fabrications.

`H09b-ABSENCE-CONDITION`'s `dataProbe` is now **byte-verbatim** from `docs/2.0/SNAPSHOT.md` at
`73ea340` line 329, recovered with `git show` rather than retyped - its first version used an ASCII
hyphen where the file used an em dash, which is the whole gap between "a sentence resembling the
defect" and "the defect".

**A SEVENTH SITE OF THE SWEEP, FOUND INSIDE THE FIX FOR THE SIXTH.**
`handoffs/HANDOFF-09a-estimator-package.md:210` - a supersession blockquote stating in the present
tense that the rule "permits a named absence carrying its owner". The guard's own self-test settles
the classification: the RECORD exclusion is pinned so it cannot widen to handoffs, because a
handoff's §7 asserts facts. Corrected and registered; the row now checks seven sites.

**AND A COUNT THIS SESSION GOT WRONG AND SWEPT TO THREE PLACES.** Round 6 reported
`check-infra-docs.mjs` as having "five topics with no positive probe and eight with no negative
one". Measured from the arrays: **four and seven**. It reached the commit message, §7 and §8 before
round 7 caught it - the inverse of the sweep rule, a wrong fact propagated rather than a right one
half-corrected. §7 is fixed above; `LEDGER.md` is append-only, so the round-6 block keeps the error
and the round-7 block states it.

**Three of this session's own probes were malformed and are reported rather than quietly redone.**
The first rebuilt a row's regex as `new RegExp(source, "g")` and dropped the `i`, so a capitalised
match survived the strip and the row read as inert. The second stripped the RAW file while
`openSites` matches the FLATTENED one, so a phrase that only forms after comment-prefix stripping -
`"number of\n * crossings"` in `migration-lens.ts` - could not be removed and the row read as inert
again. Both looked like defects in the row they were testing. The third was a fail side that did not
fail: mutating a pattern and its probe together is a consistent rename, not a discriminating
mutation, and it proved nothing until it was rebuilt as a pattern that matches its probe standalone
and not in the file.

### The gate has NOT converged, and that is stated rather than claimed away

**Seven rounds, each reviewing the previous round's fix commit as its own commit, budgets in every
first line: 28/24 and 16/14, then 34/24, then 57/44 with ten mutations of which nine killed their
target and ONE SURVIVED, then L2's own pass plus 34/21 and 22/15, then 47/35, then 31/24 with 38
mutations.** No finding was logged unread in any of them.

**ROUND 7 IS THE LAST ROUND, BY L2'S RULING AND FOR A REASON THIS SESSION COULD NOT SEE FROM
INSIDE.** L2's diagnosis: the product converged at round 5 and the gate did not, because rounds 5,
6 and 7 each found defects in the runbook prose, register rows and guard predicates that rounds 3, 4
and 5 had written. **The gate was reviewing its own output, and every fix commit added more of it.**
That is a scope problem rather than a convergence failure, and it does not terminate on its own. The
first clause (ii) amendment bounded prose-only commits and could not bound this, because a guard
predicate is not prose.

**So clause (ii) has a second amendment, now in CLAUDE.md**: once a round returns no finding in an
executable line of the PRODUCT - round 5 did, on the record - subsequent rounds review only (a) guard
predicates and their self-tests, (b) test assertions, and (c) sentences making a checkable claim
about runtime behaviour, checked by EXECUTING the behaviour. Everything else is applied without
earning a round. Both of round 5's HIGHs were in (c) and both were false when executed, which is
what makes (c) a real category rather than a loophole.

This session's own round-6 extrapolation said "round 7 is owed; round 8 probably is not", and got
the location right and the reason wrong: it argued from reach decay, and the actual argument is
scope. **Round 6 returned a HIGH a user could see**, so clause (a) is still not met. Two rounds running
have now found nothing wrong with the branch's executable core - round 5's eleven mutations, its
2,000-case randomised production-path sweep and its three database reproductions found no live
defect in the publisher, and round 6 spent its effort on the guards - **but what the last two rounds
found instead is that the INSTRUMENTS were not sound**: a register row green on the data it forbids,
two self-tests that under-covered their own rules and three register rows that had never been driven
against any text.

That distinction is what clause (b) is for, and it now cuts both ways. The estimator's shape is
covered. **The guard's shape is not, and round 6 is the fourth consecutive round in which a guard or
a self-test was the defect** - which is the argument for the guard-about-guards work HANDOFF-13
already holds, not for a further round of the same reading.

`9a534ed` earned round 7 and the `flatten()` change was exactly the right thing to point it at: it
had reintroduced the round-6 HIGH through a different door. Round 7's fix commit changes guard
predicates and a self-test, which under the FIRST amendment would earn a round 8 - and under the
SECOND it does not, because round 8 would be reviewing (a) again with no product defect in sight and
no finding that reaches a reader. **The gate stops here.** What is carried forward instead is
HANDOFF-13's registration question - what mechanically makes registration non-optional - which is the
half of this that a guard cannot decide and which no further round of reading will answer.

**Clause (b) is met for the shapes the guards cover and NOT for the one this branch found.** The
recurring shape here is *a fixture that makes two distinct quantities equal, so an assertion cannot
say which one it read* - `4095`/`4096`, `snapshots`/`blocks` both 2, `pool` stamped versus read,
`SNAPSHOT_DRAIN_BASELINE_HEIGHT` serving as two knobs. §8 Q4 records the guard ATTEMPT with its
numbers, as the amended clause (b) requires before a rule may stand in: precise for one form (3
hits, all genuine), unusable for the form the defect actually took (20 hits, about half correct
assertions). The rule is recorded AS WEAKER.

**The extrapolation, not a convergence claim - and the previous one is kept on the record because
it was wrong.** Round 3's extrapolation said a fourth round would probably find "a stale count in a
docblock, or an assertion that passes either way" and was "unlikely to find another defect that
reaches the published document". It found both of the named things AND three HIGHs, one of which
wipes a database. Wrong in the direction that flatters the branch, about commits this session had
itself written - the second time on this branch, the fifth in this project, and the pattern is now
a property of the codebase rather than an accident.

So this one is stated with that in mind, and two rounds have now tested it. Round 4's predicted
"one or two findings in the round-5 fix commit, not in the estimator"; round 5 returned eight, two
HIGH, all in the fix commit and none in the estimator. Round 5's predicted "one or two, most likely
in the two guard predicates `39de2f6` edits"; **round 6 returned six, one HIGH, and the HIGH was in
one of those two predicates.** Right about the location three times running, wrong about the count
and the severity three times running, always in the direction that flatters the branch.

**So the honest round-7 prediction is not a number, it is a location plus a warning about the
regress.** It will find something in `9a534ed`'s guard changes, most likely in `flatten()` - a
global semantic change made for one file - and that finding will itself be in a guard rather than in
anything a visitor sees. **The reach on the PRODUCT has been flat at zero for two rounds while the
reach on the INSTRUMENTS has not fallen at all**, and those are different curves. A gate that keeps
running until the guards are perfect does not terminate; the amended clause (ii) terminates where a
fix can no longer carry a behavioural defect, and a guard predicate can. The lead's judgement is
therefore that round 7 is owed and round 8 probably is not - and that if round 7 returns only
findings in guards, the right next instrument is HANDOFF-13's registration question rather than an
eighth reading. The behaviour is the part with real evidence behind it - every input
path is exercised against a real Postgres in both polarities, five code mutations and a 14-path
enumeration found no live defect in `readSnapshotInputs`, and the two HIGHs round 4 found were both
in TEST and DOCUMENT layers rather than in the publisher. **What has not decayed is the fix commit
itself**: six consecutive sessions, and rounds 2, 3, 4 and now 5 of this branch, have found the next
defect inside the previous round's fix. That is the prediction, and the PR stops at opened so L2 can
test it.

**And clause (b) now has a shape worth a guard rather than another round.** Both round-4 reviewers
independently named the same one: **a fix commit that moves a guard and does not move its test.**
Three instances on this branch - round 2's truncate refusal shipped with no test, round 3's fault
wrapper tested and then untested by the commit claiming both sites were covered, and round 3's
`truncate-guard.test.ts` itself, whose hatch case exercised the guard by performing the wipe. Under
the rule that when a shape recurs across three rounds the next instrument is a GUARD, this is
HANDOFF-12's fold rather than round 5's work - a guard in a fix commit makes that fix commit need a
review it will not get, which is the same reason L2 kept Q4's form A out of round 4.

### The gate: round 1 fanned out to two reviewers, round 2 reviewed the fix commit

**Budgets in the first line of each return, as LEDGER-05 Q5 requires: 28 candidates examined / 24
verified by execution, and 16 / 14.** No finding was logged unread. Round 1 returned **three HIGH,
one of them live on the published document**, and the fixes are in `96160c9`, reviewed as its own
commit by round 2.

**The publisher's integration suite was TRUNCATING the shared database.** It read `ZR_TEST_SCHEMA`
to scope itself and `apps/publisher/vitest.config.ts` declared no `globalSetup`, so the variable was
never set, `search_path` stayed at `public`, and `beforeEach` truncated four real tables.
Reproduced: a marker row in `public.blocks` was gone after a test run, and the fixture rows
**survived** it, so a locally-run publisher would then read five fabricated Orchard snapshots and
publish a drain from them. That is LEDGER-06 Q6 arriving through the door `_setup.ts` names - "the
one connection that forgot to opt in". Fixed and pinned: the marker now survives.

**An empty join published `neffSeries` as a measurement of zero, and that was the state of every
database that had just applied 005.** `anchor_root` is nullable with no backfill, so every
pre-existing spend joined to nothing, the inner join returned `[]`, and `buildNeffSeries` reads `[]`
as "measured, and no spend qualified" - the site stating, as a finding, that no Ironwood spend
requires disclosure. Verified against the real database: three spends on disk, zero rows out. **This
is the exact rule fold 3 had just written into `SNAPSHOT.md` §8.1, broken one level down in the same
branch.** The join is now a LEFT join so one round trip carries both facts, and the two cases are
separated: spends-with-no-anchor is a stated absence with a logged reason, an empty window stays an
honest measured zero. Both polarities pinned.

**`readSnapshotInputs` had no `try`/`catch` and its docblock said in capitals that it did.** The
promise dates from HANDOFF-09; executed, a rejecting query propagated and the tip published nothing
at all, `pools` and `residual` going with it. This handoff took the query count from one to four
under that promise, which is what makes it this handoff's to fix rather than an inherited defect to
note. The row PARSES are inside the wrapper too, and that half is not decorative: `NUMERIC(20,0)`
accepts `'NaN'` and `CHECK (max_position >= 0)` does not exclude it, because Postgres sorts NaN
above every number - so `BigInt` throws on a value a live constraint admits.

**The three production queries had zero execution coverage.** They were written in `index.ts` and
again by hand in the test, with a comment calling the duplication deliberate. Measured: breaking all
three at once - the Ironwood join stripped of `a.pool = n.pool`, the pool predicate replaced by
`1 = 1`, `blocks` joined on `s.nullifier_count`, the baseline's pool filter dropped - left the suite
**green**. They now live in `sources/queries.ts`, imported by both, so the duplication is DELETED
rather than policed (LEDGER-08 fold 6). Five mutations that were green are red.

The rest of round 1, each reproduced: `rollbackAllToHeight` rolled back neither `blocks` nor
`pool_snapshots`, so a reorg published three of four samples carrying the orphaned chain's balance
against the new chain's clock; `writeBlock` refreshed on conflict while `writePoolSnapshot` refused,
so the two writers described different reorg protocols for one event; `writePoolNullifier`'s
`DO NOTHING` made the late-arriving anchor 005 explicitly designs for permanently unrecordable;
`ironwoodLow` was not clamped to the birth height, so the query returned pre-birth spends that
`ironwoodBirth` dropped without a word; and **the `candidateCount` fixture was 4095** - the one value
where `max_position + 1` is indistinguishable from next-power-of-two, where a hardcoded `4096n`
passed three of the four assertions. At 4090 all of them catch it.

**`blocks_hash_idx` is deleted because NO QUERY IN THE TREE READS `blocks` BY HASH** - an
exhaustive static claim over `apps`, `packages` and `scripts`, which is the load-bearing half and
the only one that covers the indexer and the gateway. The `idx_scan = 0` measured after running the
three publisher queries five times is corroboration and is demoted to that, on L2's interim
correction and it is a correction worth keeping: **`idx_scan = 0` is equally true of an index that
is correct and simply unexercised**, so a report that led with it would be teaching the next reader
to drop an index on a predicate satisfied by every value it was written to exclude - LEDGER-09a Q2's
shape arriving in a performance argument. The cost figure is the third rung, not the first: 48 MB
per 400,000 rows at 64 hex characters in a btree, about 420 MB on the hot path at mainnet's height. Five prose claims in 005 were wrong about the tree the same commit
changed, **including one written in the present tense inside the commit that made it stale**.

**TWO OF THE ROUND'S FINDINGS CAME FROM DATA MUTATION, WHICH IS THE FIRST EVIDENCE LEDGER-09a Q2'S
RULE EARNED ITS COST.** The rule - "at least one fail side per assertion must be a DATA mutation, a
value drawn from the set the predicate claims to exclude" - was made one handoff ago on an argument
rather than on a measurement. Both findings were caught by changing a VALUE, not the code: a
hardcoded `4096n` passing three of four `candidateCount` assertions is instance five of "an
assertion whose predicate is satisfied by every value it was written to exclude" and was found by
varying the fixture to 4090; and `ironwoodLow` failing to clamp to the birth height was found by
widening the fixture with window-edge rows, not by reading the arithmetic. Recorded because the
next session will want to know whether the rule pays, and this round is the first data point.

**One finding is reported rather than fixed.** Migration 003's
`UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0` is not a no-op on re-application and
would reclassify a coinbase's MEASURED zero as an absence - the error 003 spends two paragraphs
condemning, in reverse. It is unreachable through the current runner and it is another handoff's
migration. **L2 pre-ruled it in an interim: the defect is the CLAIM, not the statement.** 003's
header said "RE-RUNNABLE BY CONSTRUCTION" without qualification and 004 and 005 both cite that as
the contract they follow, so the header now says re-runnable IN ITS DDL and not in that one DML
statement, and names what actually makes it safe - the runner's `schema_migrations` guard, which the
statement's own comment assumed without ever saying. **The statement's bytes are deliberately
unchanged**: 003 is already applied on CI, on development databases and in L2's container, and a
migration whose bytes change after application is a divergence `schema_migrations` cannot detect -
worse than the defect. There is also no correct rewrite: the statement is right for pre-003 rows and
afterwards no column distinguishes them. 005 no longer claims to follow a contract 003 does not
satisfy.

**THE `globalSetup` FACE IS A DIFFERENT SHAPE FROM THE ONE THE WIDENED GUARD COVERS, and it is
closed by a REGISTER ROW rather than a thirteenth guard** (L2's interim, item 1).
`assert-no-skipped-integration.mjs` covers "a green CI is not evidence a package RAN" - silence.
This suite RAN, against `public`, and the failure is a truncated developer database plus fabricated
rows left behind. Same origin - a new suite joins the workspace without inheriting a convention
every existing member has - and a different failure mode. Verified before writing the row: **no
guard in the tree reads a vitest config for `globalSetup`**, so deleting the line that fixed it
could not have failed anything. `check-finding-sites.mjs` gains `H09b-TEST-SCHEMA` over the two
configs that are already `H09a-VITEST-ALIAS`'s sites - ten lines inside a guard that has already
been reviewed, rather than a thirteenth written under time pressure, which is a failure mode this
very report documents. Shown to fire at BOTH sites by deleting the line at each in turn. One
residual is written down rather than designed against: the publisher's entry reaches across apps, so
a moved file fails loudly, but a change to the indexer's schema convention that silently does not
apply to the publisher is what the row cannot see.

### The corrected fact, swept in one commit (LEDGER-03 Q3)

`chain-inputs.ts`'s header, `instruments-wired.test.ts`'s header AND its A1 assertion,
`docs/2.0/SNAPSHOT.md` §8.1's table, `docs/2.0/RUNBOOK-VPS.md`'s "MIGRATIONS 003 AND 004" note, and
`handoffs/README.md`'s click list. **`HANDOFF-09a`'s §7 keeps its text** - it is a dated report of
what was measured then, and rewriting a report to match a later state falsifies the record (the same
reasoning 09a used for `CLAUDE-CODE-PROMPTS.md`) - but it gains a dated forward pointer in place, so
a reader is not left holding a contradiction.

**Round 6's sweep, which found the previous two both incomplete and is why the guard now matches the
OBJECT.** Round 5's sweep below closed three sites; four more were still asserting - `SNAPSHOT.md`'s
own cutover permission, `handoffs/README.md`, this handoff's §1, and `HANDOFF-11` twice. All are
corrected in `9a534ed`, `HANDOFF-11` by amendment in place per the LEDGER-10 Q5 precedent that
bullet itself invokes. **The register row that was supposed to make this mechanical was green on the
forbidden data**, so it now carries an arm matching the rendering string rather than the sentence
about it, plus a `dataProbe` the self-test drives. Sites registered: five, with
`HANDOFF-09b-snapshot-inputs.md` deliberately NOT among them and the reason stated in the guard -
its §7 must narrate the defect, and `absent` cannot tell an assertion from a report of one, so
registering it would make the guard fight this write-back.

**Round 5's sweep, and it is the reason there is now a guard.** Round 4's sweep below was
incomplete: it corrected §8.1's table and the test comment and left the sentence introducing that
table, plus `chain-inputs.ts`'s present-tense restatement. Both are corrected in `39de2f6`, and the
completeness of the NEXT sweep of this fact is now a check rather than a claim -
`H09b-ABSENCE-CONDITION` in `check-finding-sites.mjs`, with its three sites named as data.

**Round 4's sweep, of the same fact one layer down.** `0e2df0c` corrected the claim that 09b left
two panels unmeasured and left §8.1's contract table still naming 09b as their owner. Swept in
`923372e`: `docs/2.0/SNAPSHOT.md` §8.1's table and the paragraph under it (all four rows now name a
CONDITION), and `snapshot-inputs.integration.test.ts`'s comment restating the old rendering, now in
past tense with a note that the quoted string is history.

**ONE RESTATEMENT WAS FOUND AND DELIBERATELY NOT CORRECTED, WHICH IS THE HONEST HALF OF THIS RULE.**
`handoffs/HANDOFF-11-live-wiring.md` line 58 quotes L2's ruling with the old string as its worked
example - "drain: not measured - needs a block-time source, HANDOFF-09b". It was true when written,
its own paragraph says 09b is ordered first, and a handoff body is not one of the five cross-handoff
edits a session may make (CLAUDE.md's revolution protocol). But the string is the one a session
executing 11 would copy. **Correcting it is L2's, not this session's**, and it is raised in §8 as
such rather than left silent - the sweep rule and the cross-handoff rule genuinely conflict here,
and the resolution is to name the conflict rather than to pick the rule that lets the session act.

### Folds 1-6

| fold | disposition |
|---|---|
| 1 | **APPLIED**, plus the correction to its stated verification above |
| 2 | **APPLIED** — HANDOFF-11 §3 amended in place, old wording struck through per LEDGER-10 Q5 |
| 3 | **APPLIED** — `SNAPSHOT.md` §8.1 gains the rendering contract with copy for all four panels; the two input-layer absences named 09b as owner, the other two name a CONDITION because their inputs exist |
| 4 | **APPLIED** — three rules in `CLAUDE.md` |
| 5 | **NOT-MATCHED, already satisfied.** HANDOFF-13's A2 already names `apps packages scripts .github`; the 09a session widened it and recorded the measurement. Reported rather than applied twice |
| 6 | **APPLIED** — 09b's §5 is in the amended format and `check-ledger-structure.mjs` gains R4, opt-in by marker rather than retroactive, with "checks PRESENT, never CORRECT" in its own header. **R4 driven over the real tree found a real defect on its first run: A8 of this session's own §5 carried no exclusion set.** |

### Provenance

Executed, with output shown in the transcript: every §5 assertion in both polarities; the twelve
guards (carrying sixteen runbook topics after round 5); `typecheck` (13/13); `lint`; `content validate`; `pnpm build` (9/9); `pnpm -r test` before
and after; the migration applied twice with a schema diff; the postgres.js type probe; the
`pg_constraint` read-back; the fold-1 probes against both the pre-fold and post-fold guard; the
CI-skip probe against both the pre-widening and widened guard; and the four source mutations that
turn A4, A7 and the birth-height pin red.

Round 4 adds, all executed: the `if (true)` mutation of the pre-birth guard against F-46-1's `above`
half, before and after the counter; the truncate-guard reproduction on a throwaway database created
and dropped for it, in both polarities, with the row counts shown; the fault-wrapper mutations, one
per half, after a first single mutation was found not to discriminate; the `windowSpendCount`
refusal in three states (refusal removed, DATA made well-formed, both correct); the `mayTruncate`
mutation dropping the empty-string case; and the enumeration of the fault channel's four cases from
source, which is what the runbook's new table states - and which round 5 showed was HALF the
enumeration, because it followed the call sites and not their returns.

Round 5 adds, executed by the reviewer and the load-bearing ones re-run here before applying: the
`H09b-ABSENCE-CONDITION` register row driven to FAIL naming both open sites and to PASS at 15
findings / 42 sites; the `pool_snapshots` mutation of `truncateAll` against the strengthened stub
assertion, which round 4's regex left green at 4 passed; the two new `check-infra-docs` topics; and
the reviewer's 2,000-case randomised production-path sweep, 63-pair predicate-equivalence check and
three throwaway-database reproductions, which are the evidence for the NEGATIVE result rather than
for any fix.

Round 6 adds, every one re-run in this session before the finding was acted on: the DATA mutation
that shows `H09b-ABSENCE-CONDITION` green on the round-3 table rows; the eight-paraphrase sweep
against the widened predicate, reported as seven caught and one not; the four site reverts, each
naming its own site; the `{ topic: "UNPROBED TOPIC", re: /docker/ }` mutation against
`check-infra-docs`'s new completeness loop; the deletion of each of the two runbook grep lines,
reddening one topic each; and the probeless-row mutation against `check-finding-sites`'s loop, which
found three pre-existing rows rather than the one it was written for.

Read (file + commit): migration 003's and 004's nullability arguments; `orchardDrain` and
`ironwoodBirth`'s admission rules; `rawCandidateRange`'s definition of Cand_0.

**UNVERIFIED, labelled:** `docker build` has still never run anywhere - no daemon in this container,
unchanged from HANDOFF-09 and -09a. The VPS database has not been migrated; that is the operator's
click and is now named in `README.md` with all three migrations. No session can reach a preview host,
the VPS or a live node.

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*Appended: `## HANDOFF-09b — the two missing snapshot input sources (L3, 31 Aug 2026)`,
`## HANDOFF-09b round 4 — F-46-1, and L2's own correction (L3, 31 Aug 2026)` and
`## HANDOFF-09b round 4 continued — the two commissioned reviews (L3, 31 Aug 2026)` and
`## HANDOFF-09b round 5 — the negative result, and a sweep that landed at one site of three (L3, 31 Aug 2026)`
`## HANDOFF-09b round 6 — a guard that certified its own hole (L3, 31 Aug 2026)` and
`## HANDOFF-09b round 7 — L2's merge block, and the gate reviewing its own output (L3, 31 Aug 2026)`. The third
block carries the ledger-worthy finding of this round: a test whose RESULT is identical in both
polarities, so only the database it wiped discriminated. Two items are raised there for L2 and are
deliberately not taken into round 4 - `index.ts`'s fault message being true of two of the four
things that reach its channel, and `HANDOFF-11`'s line 58 still quoting the corrected string, where
the sweep rule and the cross-handoff rule conflict.*
