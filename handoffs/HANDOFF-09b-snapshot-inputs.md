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
| **A6** | `pnpm -r test` unchanged in COUNT | **1220 -> 1240**, larger; split below | deleting a new integration file drops the total |
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
| **`apps/publisher`** | 67 (66 + 1 skipped) | **74** (72 + 2 skipped) | +7: the A1/A4/A5 integration suite and the birth-height regression pin |
| **`apps/indexer`** | 427 (426 + 1 skipped) | **440** (439 + 1 skipped) | +13: `blocks` and `pool_snapshots` persistence |
| **total** | **1220** (1218 + 2) | **1240** (1237 + 3) | +20 |

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

### The corrected fact, swept in one commit (LEDGER-03 Q3)

`chain-inputs.ts`'s header, `instruments-wired.test.ts`'s header AND its A1 assertion,
`docs/2.0/SNAPSHOT.md` §8.1's table, `docs/2.0/RUNBOOK-VPS.md`'s "MIGRATIONS 003 AND 004" note, and
`handoffs/README.md`'s click list. **`HANDOFF-09a`'s §7 keeps its text** - it is a dated report of
what was measured then, and rewriting a report to match a later state falsifies the record (the same
reasoning 09a used for `CLAUDE-CODE-PROMPTS.md`) - but it gains a dated forward pointer in place, so
a reader is not left holding a contradiction.

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
guards; `typecheck` (13/13); `lint`; `content validate`; `pnpm build` (9/9); `pnpm -r test` before
and after; the migration applied twice with a schema diff; the postgres.js type probe; the
`pg_constraint` read-back; the fold-1 probes against both the pre-fold and post-fold guard; the
CI-skip probe against both the pre-widening and widened guard; and the four source mutations that
turn A4, A7 and the birth-height pin red.

Read (file + commit): migration 003's and 004's nullability arguments; `orchardDrain` and
`ironwoodBirth`'s admission rules; `rawCandidateRange`'s definition of Cand_0.

**UNVERIFIED, labelled:** `docker build` has still never run anywhere - no daemon in this container,
unchanged from HANDOFF-09 and -09a. The VPS database has not been migrated; that is the operator's
click and is now named in `README.md` with all three migrations. No session can reach a preview host,
the VPS or a live node.

## §8 LEDGER — appended to `handoffs/LEDGER.md`; read by L2 before the next handoff

*(appended at write-back)*
