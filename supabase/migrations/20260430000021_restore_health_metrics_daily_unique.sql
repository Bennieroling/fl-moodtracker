-- Restore the UNIQUE (user_id, date) constraint on health_metrics_daily.
--
-- Background: 20260426000014_index_cleanup.sql ran
--     DROP INDEX IF EXISTS public.health_metrics_daily_user_date;
-- under the assumption that the canonical name was
-- `health_metrics_daily_user_date_key`. The actual constraint (added in
-- 20260419000002) is named `health_metrics_daily_user_date`, so the cleanup
-- silently dropped the backing index — and with it the unique constraint.
--
-- Effect: sync_hae_to_production() failed every 15 minutes from
-- 2026-04-26 16:45 UTC onward with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" because the function's
-- INSERT … ON CONFLICT (user_id, date) clause on health_metrics_daily had no
-- matching constraint. ~4 days of staging rows accumulated unprocessed.
--
-- Fix: re-add the constraint under its original name. No duplicate rows
-- exist in the table, so this runs cleanly.

ALTER TABLE public.health_metrics_daily
  ADD CONSTRAINT health_metrics_daily_user_date UNIQUE (user_id, date);
