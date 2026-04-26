-- Snapshot of pg_cron jobs as they exist in production (2026-04-26).
-- Created from cron.job table output because these were configured via the
-- Supabase Dashboard rather than a migration file.

SELECT cron.schedule(
  'sync-hae-to-production',
  '*/15 * * * *',
  'SELECT sync_hae_to_production();'
);

SELECT cron.schedule(
  'purge-old-staging-rows',
  '0 3 * * *',
  'SELECT purge_old_staging_rows();'
);

SELECT cron.schedule(
  'recalc-streaks-nightly',
  '0 4 * * *',
  'SELECT recalc_streaks(user_id) FROM user_preferences;'
);
