-- HealthFit sync support: per-run operational logging.

CREATE TABLE IF NOT EXISTS sync_log (
  id BIGSERIAL PRIMARY KEY,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  sheet_name TEXT NOT NULL,
  rows_fetched INTEGER DEFAULT 0,
  rows_upserted INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_log_run_at
  ON sync_log (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_sheet_name
  ON sync_log (sheet_name);
