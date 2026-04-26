-- Make sync_hae_to_production() runnable from the user-scoped API route.
--
-- Background: the function is invoked two ways:
--   1. pg_cron every 15 minutes — runs as `postgres`, all grants implicit.
--   2. POST /api/sync (the "Sync now" button on /profile) — runs as
--      `authenticated`. Hits 500s because the function writes to
--      `sync_audit_log` (created via SQL Editor, no `authenticated` grant)
--      and other internal tables.
--
-- Switching the function to SECURITY DEFINER pins execution to the function
-- owner (postgres) regardless of caller, mirroring the cron behaviour. The
-- search_path lock prevents schema-injection attacks via temp/search-path
-- shadowing — same hardening already applied to detect_anomalies() and
-- compute_readiness().
--
-- No body change. ALTER FUNCTION lets us flip the security clause without
-- repeating the ~360-line PL/pgSQL body.

ALTER FUNCTION public.sync_hae_to_production()
  SECURITY DEFINER
  SET search_path = public, pg_temp;
