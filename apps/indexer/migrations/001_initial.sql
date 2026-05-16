-- ZCashReveal initial schema (001)
-- Persistent record of every leak report observed in the mempool
-- + anchor → height registry for depth analysis.

CREATE TABLE IF NOT EXISTS leak_reports (
  txid                          TEXT PRIMARY KEY,
  seen_at                       TIMESTAMPTZ NOT NULL,
  tip_height_at_seen            INTEGER NOT NULL,
  tx_version                    SMALLINT NOT NULL,
  leak_class                    TEXT NOT NULL,
  overall_severity              TEXT NOT NULL,
  sapling_value_balance_zat     NUMERIC(20,0) NOT NULL DEFAULT 0,
  orchard_value_balance_zat     NUMERIC(20,0) NOT NULL DEFAULT 0,
  sapling_spend_count           INTEGER NOT NULL DEFAULT 0,
  sapling_output_count          INTEGER NOT NULL DEFAULT 0,
  orchard_action_count          INTEGER NOT NULL DEFAULT 0,
  net_transparent_inflow_zat    NUMERIC(20,0) NOT NULL DEFAULT 0,
  value_flow_direction          TEXT NOT NULL,
  fee_zat                       NUMERIC(20,0) NOT NULL DEFAULT 0,
  expiry_delta                  INTEGER,
  likely_wallet                 TEXT,
  report                        JSONB NOT NULL,
  inserted_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leak_reports_seen_at_idx ON leak_reports (seen_at DESC);
CREATE INDEX IF NOT EXISTS leak_reports_leak_class_idx ON leak_reports (leak_class);
CREATE INDEX IF NOT EXISTS leak_reports_severity_idx ON leak_reports (overall_severity);
CREATE INDEX IF NOT EXISTS leak_reports_wallet_idx ON leak_reports (likely_wallet);
CREATE INDEX IF NOT EXISTS leak_reports_tip_height_idx ON leak_reports (tip_height_at_seen);

CREATE TABLE IF NOT EXISTS anchors (
  anchor          TEXT PRIMARY KEY,
  height          INTEGER NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pool            TEXT
);
CREATE INDEX IF NOT EXISTS anchors_height_idx ON anchors (height);

CREATE TABLE IF NOT EXISTS nullifiers (
  nullifier      TEXT PRIMARY KEY,
  pool           TEXT NOT NULL,
  txid           TEXT NOT NULL REFERENCES leak_reports(txid) ON DELETE CASCADE,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  block_height   INTEGER
);
CREATE INDEX IF NOT EXISTS nullifiers_txid_idx ON nullifiers (txid);
CREATE INDEX IF NOT EXISTS nullifiers_observed_at_idx ON nullifiers (observed_at DESC);

CREATE TABLE IF NOT EXISTS commitments (
  commitment     TEXT PRIMARY KEY,
  pool           TEXT NOT NULL,
  txid           TEXT NOT NULL REFERENCES leak_reports(txid) ON DELETE CASCADE,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  block_height   INTEGER
);
CREATE INDEX IF NOT EXISTS commitments_txid_idx ON commitments (txid);
CREATE INDEX IF NOT EXISTS commitments_pool_height_idx ON commitments (pool, block_height);
