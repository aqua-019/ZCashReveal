-- 002_candidate_analysis.sql
-- Persistent storage for the per-pool state machine S^p_h from Module 1.
-- See RESEARCH.md for the math; apps/indexer/src/state/ for the in-memory shape.
--
-- Naming: pool_<component> mirrors the PoolState property names. The
-- commitments/anchors/nullifiers tables from 001_initial.sql are v0.1
-- mempool-observability scaffolding with different semantics (FK to
-- leak_reports, no position, no max_position). They appear unwired and
-- are candidates for a future 003_drop_legacy_mempool_tables.sql. THIS
-- migration does NOT modify them.

CREATE TABLE IF NOT EXISTS pool_commitments (
  pool          TEXT          NOT NULL CHECK (pool IN ('sapling', 'orchard')),
  cm_id         TEXT          NOT NULL,
  position      NUMERIC(20,0) NOT NULL CHECK (position >= 0),
  txid          TEXT          NOT NULL,
  block_height  INTEGER       NOT NULL,
  inserted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool, cm_id),
  UNIQUE (pool, position)
);
CREATE INDEX IF NOT EXISTS pool_commitments_height_idx
  ON pool_commitments (pool, block_height);

CREATE TABLE IF NOT EXISTS pool_anchors (
  pool            TEXT          NOT NULL CHECK (pool IN ('sapling', 'orchard')),
  root            TEXT          NOT NULL,
  height_created  INTEGER       NOT NULL,
  max_position    NUMERIC(20,0) NOT NULL CHECK (max_position >= 0),
  inserted_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool, root)
);
CREATE INDEX IF NOT EXISTS pool_anchors_height_idx
  ON pool_anchors (pool, height_created);

CREATE TABLE IF NOT EXISTS pool_nullifiers (
  pool          TEXT        NOT NULL CHECK (pool IN ('sapling', 'orchard')),
  nf_id         TEXT        NOT NULL,
  spent_txid    TEXT        NOT NULL,
  spent_height  INTEGER     NOT NULL,
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool, nf_id)
);
CREATE INDEX IF NOT EXISTS pool_nullifiers_height_idx
  ON pool_nullifiers (pool, spent_height);

CREATE TABLE IF NOT EXISTS pool_boundary_flows (
  id            BIGSERIAL     PRIMARY KEY,
  pool          TEXT          NOT NULL CHECK (pool IN ('sapling', 'orchard')),
  txid          TEXT          NOT NULL,
  tx_seq        INTEGER       NOT NULL CHECK (tx_seq >= 0),
  block_height  INTEGER       NOT NULL,
  delta_zat     NUMERIC(20,0) NOT NULL,
  inserted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (pool, txid, tx_seq)
);
CREATE INDEX IF NOT EXISTS pool_boundary_flows_height_id_idx
  ON pool_boundary_flows (pool, block_height, id);
-- Note: (pool, txid, tx_seq) lookups are served by the auto-created
-- index backing the UNIQUE constraint above
-- (pool_boundary_flows_pool_txid_tx_seq_key). No separate index needed.
