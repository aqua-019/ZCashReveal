-- 003a_gateway_cache.sql
-- Cache-aside tables for the gateway's read API (HANDOFF-05 deliverable 3).
--
-- WHY THESE EXIST. The transparent side of the Tracking UI is served from
-- Zebra's address-index RPCs rather than from a historical index of our own -
-- plan section 9's explicit "ship faster" choice, revisited when a full index
-- exists. Those RPCs are cheap per call and expensive per PAGE: one address
-- view is a balance, a txid list and one getrawtransaction per row, so an
-- uncached /address is dozens of round trips to the node for a page a reader
-- may reload twice.
--
-- NUMBERED 003a, NOT 003. HANDOFF-06 owns migration 003 (widening the pool
-- CHECK constraints to four pools, pool_snapshots, migrations_zip318) and is
-- queued behind this handoff's track position. The migration runner sorts
-- filenames, so 003a applies after 003 whenever 003 lands, and applies on its
-- own until then. Nothing here touches a table 003 will alter, so the two are
-- order-independent in fact as well as by name.
--
-- CACHE INVALIDATION IS BY AGE, NOT BY EVENT. `refreshed_at` plus a TTL from
-- config, checked on read. The gateway does not subscribe to reorgs, and a
-- cache that believed itself current would serve a rolled-back balance forever;
-- a stale-by-at-most-TTL answer is bounded and its bound is stated on the
-- response.

CREATE TABLE IF NOT EXISTS tx_cache (
  txid          TEXT        PRIMARY KEY,
  -- NULL for a transaction still in the mempool: it has no height yet, and
  -- storing 0 or -1 would make it sort as the genesis block.
  height        INTEGER,
  json          JSONB       NOT NULL,
  refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The eviction sweep and the "how stale is this cache" question both read
-- refreshed_at, and the height index serves the block view's per-height reads.
CREATE INDEX IF NOT EXISTS tx_cache_refreshed_at_idx ON tx_cache (refreshed_at);
CREATE INDEX IF NOT EXISTS tx_cache_height_idx ON tx_cache (height);

CREATE TABLE IF NOT EXISTS address_cache (
  addr          TEXT          PRIMARY KEY,
  -- NUMERIC(20,0), not BIGINT: the same choice leak_reports made in 001, and
  -- for the same reason. Zatoshi are counted exactly and a NUMERIC round-trips
  -- through `postgres` as a string, which is what the bigint conversion wants.
  balance_zat   NUMERIC(20,0) NOT NULL,
  received_zat  NUMERIC(20,0) NOT NULL,
  -- Derived as received - balance rather than observed. Stored because the view
  -- prints it and because deriving it in two places is how the two disagree.
  spent_zat     NUMERIC(20,0) NOT NULL,
  utxo_count    INTEGER       NOT NULL,
  -- Heights, not timestamps: an address's first and last appearance are block
  -- positions, and a wall-clock time for them would be the block's, not the
  -- address's. NULL where the address has no transactions at all.
  first_seen    INTEGER,
  last_seen     INTEGER,
  refreshed_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS address_cache_refreshed_at_idx ON address_cache (refreshed_at);
