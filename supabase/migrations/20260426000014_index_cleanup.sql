-- D4: Remove duplicate indexes. Each table should have one unique index on
-- (user_id, date). The exact names below match the most common patterns;
-- IF EXISTS makes these safe if names differ in this environment.

-- health_metrics_daily — keep health_metrics_daily_user_date_key (unique)
DROP INDEX IF EXISTS public.health_metrics_daily_user_date;
DROP INDEX IF EXISTS public.uniq_health_daily_user_date;
DROP INDEX IF EXISTS public.ux_health_metrics_daily_user_date;
DROP INDEX IF EXISTS public.idx_health_metrics_daily_user_date;

-- exercise_events — keep exercise_events_pkey + one covering (user_id, started_at)
DROP INDEX IF EXISTS public.exercise_events_user_date_idx;
DROP INDEX IF EXISTS public.idx_exercise_events_user_date;
DROP INDEX IF EXISTS public.uniq_exercise_events_user_date;

-- food_entries — keep food_entries_user_date_idx (or equivalent unique)
DROP INDEX IF EXISTS public.food_entries_user_date;
DROP INDEX IF EXISTS public.idx_food_entries_user_date;

-- mood_entries — keep mood_entries_user_date_idx (or equivalent unique)
DROP INDEX IF EXISTS public.mood_entries_user_date;
DROP INDEX IF EXISTS public.idx_mood_entries_user_date;
