-- 003_four_pools.sql
-- Four pools in the database. Sprout and Ironwood join Sapling and Orchard in
-- the pool CHECK on the Module 2 state-machine tables; leak_reports gains the
-- Sprout balance and loses its false zero fee; and the two tables the
-- post-NU6.3 lenses will read - pool_snapshots and migrations_zip318 - are
-- created empty here.
--
-- RE-RUNNABLE IN ITS DDL. HANDOFF-06 A2 asserts that re-running the migrations
-- is a no-op, and this is the first migration that ALTERs objects it did not
-- create, so "IF NOT EXISTS on every CREATE" no longer covers the file on its
-- own. Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each pool CHECK is
-- dropped by name and re-added; every ALTER TABLE below is written in a form
-- that is a no-op the second time it runs.
--
-- AND NOT IN ITS ONE DML STATEMENT, WHICH THIS HEADER USED TO CLAIM (found by
-- HANDOFF-09b's gate round 1, corrected here rather than rewritten). The header
-- said "RE-RUNNABLE BY CONSTRUCTION" without qualification, and 004 and 005 both
-- cite this file's re-runnability as the contract they follow. The
-- `UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0` below is NOT a
-- no-op on a second application: after the first run a `0` in that column is a
-- coinbase's MEASURED zero - `fee.ts` returns `0n` there and calls it "a fact
-- rather than an absence" - so re-applying would reclassify a fact as an
-- absence, which is the error this file spends two paragraphs condemning, in
-- reverse.
--
-- WHAT MAKES IT SAFE IS THE RUNNER, NOT THE STATEMENT'S SHAPE. `migrate.ts`
-- wraps each migration's body and its `schema_migrations` row in ONE
-- transaction, so a file that has been applied is never executed again and a
-- file that failed left no row. The statement's own comment says "this runs
-- once, inside the transaction that applies this file"; it just never said what
-- enforces that. Now it does.
--
-- THE STATEMENT IS DELIBERATELY NOT REWRITTEN. Its bytes are already applied on
-- CI, on development databases and in L2's container, and a migration whose
-- bytes change after application is a divergence `schema_migrations` cannot
-- detect - a worse defect than the one being fixed. There is also no correct
-- rewrite available: the statement is right for pre-003 rows, and after it runs
-- there is no column that distinguishes those rows from later ones.
--
-- THE CONSTRAINT NAMES ARE POSTGRES'S, NOT OURS. 002 wrote the pool checks as
-- inline unnamed column constraints, so the server named them
-- <table>_<column>_check. The four names used below were read back from
-- pg_constraint on a database migrated through 002 rather than assumed, because
-- guessing one wrong fails quietly in the worst direction: DROP CONSTRAINT IF
-- EXISTS would find nothing, the four-pool CHECK would be added beside the
-- surviving two-pool one, both would then apply, and an 'ironwood' insert would
-- still be rejected by a constraint no longer named anywhere in this tree.

-- ---------------------------------------------------------------------------
-- (a) The pool CHECK, widened from two pools to four.
-- ---------------------------------------------------------------------------
--
-- Neither new value is a new feature. Sprout has existed since launch and
-- Ironwood since NU6.3 at height 3,428,143, so a two-value CHECK meant these
-- tables could not record a JoinSplit or a migration output at all - the
-- schema, not the decoder, was the thing that could not see them.
--
-- The order of the four values follows ShieldedPool in
-- packages/zec-types/src/shielded.ts, which is chronological by activation, so
-- that the union and the constraint can be diffed by eye. A TypeScript union has
-- no runtime form, so this CHECK is where membership in it is actually enforced
-- against a value that arrives from outside the process.

ALTER TABLE pool_commitments DROP CONSTRAINT IF EXISTS pool_commitments_pool_check;
ALTER TABLE pool_commitments ADD CONSTRAINT pool_commitments_pool_check
  CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood'));

ALTER TABLE pool_anchors DROP CONSTRAINT IF EXISTS pool_anchors_pool_check;
ALTER TABLE pool_anchors ADD CONSTRAINT pool_anchors_pool_check
  CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood'));

ALTER TABLE pool_nullifiers DROP CONSTRAINT IF EXISTS pool_nullifiers_pool_check;
ALTER TABLE pool_nullifiers ADD CONSTRAINT pool_nullifiers_pool_check
  CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood'));

ALTER TABLE pool_boundary_flows DROP CONSTRAINT IF EXISTS pool_boundary_flows_pool_check;
ALTER TABLE pool_boundary_flows ADD CONSTRAINT pool_boundary_flows_pool_check
  CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood'));

-- ---------------------------------------------------------------------------
-- leak_reports: a Sprout balance, and a fee that is allowed to be unknown.
-- ---------------------------------------------------------------------------
--
-- sprout_value_balance_zat completes the per-pool row. With Sprout in the union
-- a report carrying only the Sapling and Orchard balances would drop the
-- JoinSplit sum for precisely the transactions that touch the oldest pool. It
-- is summed over vjoinsplit rather than read off a decoded bundle, because
-- Sprout has no bundle to decode - see apps/indexer/src/decoder/sprout.ts.
--
-- IT IS NULLABLE WITH NO DEFAULT, AND THE ARGUMENT IS NARROWER THAN IT LOOKS.
--
-- A first draft added it NOT NULL DEFAULT 0, matching sapling_value_balance_zat
-- and orchard_value_balance_zat in 001. The counter-argument for that is real
-- and was made at the gate: it is this table's existing convention, and unlike
-- a fee, a value balance of 0 IS a measurement - sproutValueBalanceZat returns
-- 0n for a transaction with no JoinSplit, which is true and worth recording.
-- Both points are correct FOR ROWS WRITTEN FROM NOW ON, and for those the
-- default never fires anyway, because persistLeakReport always supplies the
-- column.
--
-- The rows it decides are the ones already written. Every one of those was
-- produced by an analyser that could not see Sprout at all, so backfilling 0
-- would assert that those transactions moved no Sprout value when nothing ever
-- looked. NULL is the only value that distinguishes "measured, and it did not
-- move" from "never examined", and this migration is the exact moment the two
-- populations meet. Divergence from the 001 convention is the price of that
-- distinction, and it is stated here rather than left to be rediscovered.
--
-- fee_zat LOSES BOTH NOT NULL AND ITS DEFAULT OF 0. No node sends a fee: Zebra's
-- TransactionObject has no such field and neither does zcashd's
-- getrawtransaction. Until this handoff every row here therefore recorded a fee
-- of zero for every transaction - a measurement that had never been taken,
-- stored in the one shape indistinguishable from a transaction that genuinely
-- paid nothing. The fee is now computed by summing the outputs a transaction
-- spends (apps/indexer/src/analysis/fee.ts) and is NULL when a previous output
-- could not be resolved. Dropping the DEFAULT matters as much as dropping NOT
-- NULL: a default of 0 would go on writing the same false zero for any INSERT
-- that omits the column.

ALTER TABLE leak_reports
  ADD COLUMN IF NOT EXISTS sprout_value_balance_zat NUMERIC(20,0);
ALTER TABLE leak_reports ALTER COLUMN fee_zat DROP NOT NULL;
ALTER TABLE leak_reports ALTER COLUMN fee_zat DROP DEFAULT;

-- AND THE ROWS ALREADY WRITTEN ARE CORRECTED, not just the column.
--
-- Dropping the constraint changes what a 0 MEANS in this column: after this
-- migration, 0 says "measured, and it paid nothing". Every row written before
-- it carries a 0 that means "never measured", because the analyser read
-- `tx.feeZat` and no node sends one. Leaving them would take a column full of
-- absences and silently reclassify all of them as observations - the exact
-- error this file spends two paragraphs above condemning, committed to the
-- data instead of to the schema.
--
-- The rewrite is lossless and total for the same reason it is necessary: the
-- old expression was `BigInt(tx.feeZat ?? 0)` and the field never arrives, so
-- EVERY pre-003 row is a false zero without exception. There is no genuine
-- measurement here to lose. Rows written after 003 come from `computeFeeZat`
-- and are unaffected, because this runs once, inside the transaction that
-- applies this file.
UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0;

-- ---------------------------------------------------------------------------
-- (b) pool_snapshots: S^p_h, one row per pool per height.
-- ---------------------------------------------------------------------------
--
-- Mirrors PoolStateSnapshot in packages/zec-types/src/analysis.ts field for
-- field. The column types follow that type's own split rather than one uniform
-- choice: balanceZat and commitmentCount are bigint there, so they are
-- NUMERIC(20,0) here for the reason 001 took and 003a restates; anchorCount and
-- nullifierCount are number there, and INTEGER is what keeps them arriving back
-- as JS numbers instead of the strings a NUMERIC column would hand to a field
-- that is not a bigint.
--
-- PRIMARY KEY (pool, height), pool first: every reader of this table follows one
-- pool through time. The Orchard drain D_h in plan section 3.3 is exactly a scan
-- of one pool's balance_zat across a height range, and pool-first is the
-- direction that index serves.

CREATE TABLE IF NOT EXISTS pool_snapshots (
  pool              TEXT          NOT NULL
    CONSTRAINT pool_snapshots_pool_check
    CHECK (pool IN ('sprout', 'sapling', 'orchard', 'ironwood')),
  height            INTEGER       NOT NULL,
  -- No CHECK (balance_zat >= 0), though ZIP 209 makes non-negativity a
  -- consensus invariant. ValuePool raises NegativeBalanceError before a
  -- snapshot of a negative balance can be taken, so a second copy of the rule
  -- here could only report the same fault later, as a write failure carrying
  -- none of that error's context.
  balance_zat       NUMERIC(20,0) NOT NULL,
  commitment_count  NUMERIC(20,0) NOT NULL
    CONSTRAINT pool_snapshots_commitment_count_check CHECK (commitment_count >= 0),
  nullifier_count   INTEGER       NOT NULL
    CONSTRAINT pool_snapshots_nullifier_count_check CHECK (nullifier_count >= 0),
  anchor_count      INTEGER       NOT NULL
    CONSTRAINT pool_snapshots_anchor_count_check CHECK (anchor_count >= 0),
  ts                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool, height)
);

-- The supply view reads all four pools at a single height, which is the one
-- question the pool-first primary key cannot answer without a full scan.
CREATE INDEX IF NOT EXISTS pool_snapshots_height_idx ON pool_snapshots (height);

-- ---------------------------------------------------------------------------
-- (c) migrations_zip318: one row per Orchard to Ironwood crossing.
-- ---------------------------------------------------------------------------
--
-- ZIP 318 migration is two-phase: a wallet first quantises its balance into
-- canonical denominations by sending to itself inside Orchard, then broadcasts
-- pre-signed pool-crossing transfers on a schedule. Only the second phase
-- appears here. Each crossing spends exactly one Orchard note into exactly one
-- Ironwood output, which is why txid alone is the primary key: there is no
-- second crossing inside the same transaction to disambiguate it from.
-- (docs/2.0/research/01-contemporary-zcash.md section 2.7.)
--
-- THE AMOUNT IS PUBLIC AND THE DENOMINATION IS AN INFERENCE. ZIP 318 reveals the
-- net amount crossing between the pools on-chain; the wallet identity is not
-- revealed, and the privacy defence is the denomination bucketing plus the
-- schedule, both heuristic rather than cryptographic. `canonical` therefore
-- records a measurement and not an assertion: an amount that does not land on
-- n x 10^k is a real observation this table has to be able to hold, and it is
-- held with denom_n and denom_k NULL rather than rounded into the nearest
-- bucket. Rounding it would manufacture the very regularity the lens is
-- supposed to be measuring.
--
-- denom_k IS AN EXPONENT IN ZATOSHI, WHICH IS WHY IT IS NON-NEGATIVE. The research
-- states the denominations in ZEC, where 0.5 ZEC would need k = -1. CLAUDE.md's
-- unit is integer zatoshi throughout, and in zatoshi that same denomination is
-- 5 x 10^7 (n = 5, k = 7) while 1 ZEC is 1 x 10^8 (n = 1, k = 8). Reading a
-- stored (n, k) back as ZEC is a division by 10^8 at the display boundary, and
-- no row ever carries a negative exponent.
--
-- THERE IS DELIBERATELY NO UPPER CHECK ON amount_zat. The original reason was
-- that the corpus stated DENOM_CAP two irreconcilable ways, so a CHECK written
-- to one would reject a crossing legal under the other. That premise is retired
-- (LEDGER-07 Q3: DENOM_CAP bounds the FUNDING NOTE at 10,000 ZEC plus the
-- canonical fee, and 10,000 ZEC is the largest CROSSING - two quantities, not
-- two readings), and the conclusion is unchanged and now rests on the stronger
-- half of the argument alone. This project's rule is that a
-- violated invariant means our decoder is wrong, never that the chain is, and a
-- database constraint that refuses to record something the chain did inverts
-- that rule: it destroys the evidence instead of raising it. The cap belongs in
-- the analysis layer, where an over-cap crossing is a finding to go and look at.
--
-- amount_zat DOES carry a non-negative CHECK, which is a different kind of rule.
-- The direction of a crossing is fixed by its definition - out of Orchard, into
-- Ironwood - so the magnitude is stored unsigned. A negative value here could
-- only be a sign error on our side of the boundary, never a chain observation.

CREATE TABLE IF NOT EXISTS migrations_zip318 (
  txid        TEXT          PRIMARY KEY,
  height      INTEGER       NOT NULL,
  amount_zat  NUMERIC(20,0) NOT NULL
    CONSTRAINT migrations_zip318_amount_zat_check CHECK (amount_zat >= 0),
  -- NULL together with denom_k when the amount is not canonical.
  denom_n     SMALLINT
    CONSTRAINT migrations_zip318_denom_n_check CHECK (denom_n IN (1, 2, 5)),
  denom_k     SMALLINT
    CONSTRAINT migrations_zip318_denom_k_check CHECK (denom_k >= 0),
  canonical   BOOLEAN       NOT NULL,
  ts          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- The flag and the pair are one fact recorded twice, so the constraint holds
  -- them together in both directions: a canonical row that cannot say which
  -- denomination it matched is not a measurement, and a non-canonical row
  -- carrying a denomination is a bucket somebody guessed.
  CONSTRAINT migrations_zip318_denom_matches_canonical CHECK (
    (canonical AND denom_n IS NOT NULL AND denom_k IS NOT NULL)
    OR (NOT canonical AND denom_n IS NULL AND denom_k IS NULL)
  )
);

-- The lens counts and sums per block and per scheduling window, both of which
-- are height ranges; the txid primary key serves neither.
CREATE INDEX IF NOT EXISTS migrations_zip318_height_idx ON migrations_zip318 (height);

-- BOTH NEW TABLES ARE EMPTY UNTIL A LATER HANDOFF. The detector that writes
-- migrations_zip318 arrives with the v6 decoder (HANDOFF-07) and the
-- denomination histograms that read it with the instruments (HANDOFF-09);
-- pool_snapshots is written per confirmed block by the runtime pool state
-- (HANDOFF-12). They are created now because widening the pool CHECK and adding
-- the tables that depend on the wider union is one schema change, and splitting
-- it would leave a numbered migration in the tree that no test could exercise.
