-- D1: Drop legacy columns on health_metrics_daily that have no frontend readers.
-- Columns still read by the frontend (total_energy_kcal, average_heart_rate,
-- distance_km, vo2max) are intentionally kept until the app is migrated.
ALTER TABLE public.health_metrics_daily
  DROP COLUMN IF EXISTS exercise_minutes;

-- D2: Drop legacy columns on exercise_events confirmed unused by frontend audit.
-- Columns still read by the frontend (avg_hr, min_hr, max_hr, total_minutes,
-- move_minutes, total_energy_kcal, trimp, distance_km, vo2max) are kept.
ALTER TABLE public.exercise_events
  DROP COLUMN IF EXISTS sheet_row_number,
  DROP COLUMN IF EXISTS hr_zone_type,
  DROP COLUMN IF EXISTS hrz0_seconds,
  DROP COLUMN IF EXISTS hrz1_seconds,
  DROP COLUMN IF EXISTS hrz2_seconds,
  DROP COLUMN IF EXISTS hrz3_seconds,
  DROP COLUMN IF EXISTS hrz4_seconds,
  DROP COLUMN IF EXISTS hrz5_seconds,
  DROP COLUMN IF EXISTS rpe;

-- Drop the unique constraint that referenced sheet_row_number
ALTER TABLE public.exercise_events
  DROP CONSTRAINT IF EXISTS uniq_exercise_events_user_row;

-- D3: Drop redundant timestamp column from keep_alive (pinged_at already covers it)
ALTER TABLE public.keep_alive
  DROP COLUMN IF EXISTS "timestamp";

-- E1: Drop empty deprecated exercise_daily table
-- get_latest_exercise_date was repointed to exercise_events in task B1
DROP TABLE IF EXISTS public.exercise_daily CASCADE;

-- E2: Drop legacy sync_log — superseded by sync_audit_log created in C4
DROP TABLE IF EXISTS public.sync_log CASCADE;
