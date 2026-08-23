-- 004: the Ironwood columns on leak_reports.
--
-- HANDOFF-07 decodes the Ironwood bundle, so a leak report now carries a fourth
-- pool's value balance and action count. Without these columns the INSERT in
-- persistence/leak-reports.ts keeps compiling and keeps writing - postgres.js
-- row types are caller-asserted, so TypeScript cannot see a missing SQL column -
-- and the figure would survive only inside the JSONB `report` blob while the
-- columns the gateway actually queries knew nothing about it. One row would then
-- hold the Ironwood balance in one place and not in another, which is the exact
-- split migration 003 records for `fee_zat`.
--
-- Re-runnable: every statement is `IF NOT EXISTS`, matching 003 and what
-- migrate.ts's per-migration transaction assumes.
--
-- NUMERIC(20,0) FOR THE BALANCE, INTEGER FOR THE COUNT, following 001 and 003a.
-- A NUMERIC column comes back from postgres.js as a string, which is what keeps
-- a zatoshi value out of a JS number; a count is a `number` in this project's
-- conventions and INTEGER is what returns one.
--
-- ---------------------------------------------------------------------------
-- BOTH COLUMNS ARE NULLABLE WITH NO DEFAULT, AND 003'S ARGUMENT IS STRONGER
-- HERE THAN IT WAS FOR SPROUT.
-- ---------------------------------------------------------------------------
--
-- 003 added `sprout_value_balance_zat` nullable because NULL is "the only value
-- that distinguishes 'measured, and it did not move' from 'never examined'",
-- and it conceded that for Sprout the distinction was a one-shot fact about
-- rows written before the analyser could see the pool: afterwards
-- persistLeakReport always supplies the column, so the nullability never fires
-- again.
--
-- Ironwood's does not expire. `leak_class = 'UNSUPPORTED_TX'` is, by
-- construction, a row whose bundles were never examined - the decoder declined
-- to read a transaction shape it does not model, and every quantitative field
-- on that report is a default rather than a measurement. Those rows are written
-- from now on, not only before this migration. A `DEFAULT 0` would go on
-- manufacturing "measured, and it did not move" for every one of them, which is
-- 003's stated reason for dropping `fee_zat`'s default: "a default of 0 would go
-- on writing the same false zero for any INSERT that omits the column."
--
-- NO BACKFILL, AND THE ABSENCE OF ONE IS THE POINT. 003 had to REWRITE rows
-- (`UPDATE leak_reports SET fee_zat = NULL WHERE fee_zat = 0`) because those
-- rows carried a false zero that had been written as if measured. Nothing here
-- needs that: the columns did not exist, so every pre-004 row is NULL from the
-- moment it is added, which already says "never examined" correctly.

ALTER TABLE leak_reports
  ADD COLUMN IF NOT EXISTS ironwood_value_balance_zat NUMERIC(20,0);

ALTER TABLE leak_reports
  ADD COLUMN IF NOT EXISTS ironwood_action_count INTEGER;

-- The supply and migration views read reports by class, and `UNSUPPORTED_TX` is
-- the first class whose rows must be excluded from every aggregate rather than
-- counted in one. `leak_reports_leak_class_idx` (001) already serves that.
-- Stated here so the next reader does not add a second index for it.
