-- Snapshot of sleep_events table as it exists in production (2026-04-26).
-- Created from pg_get_functiondef / information_schema output because the
-- table was originally created in the Supabase Dashboard rather than via a
-- migration file.

CREATE TABLE IF NOT EXISTS public.sleep_events (
  id                 bigint         NOT NULL DEFAULT nextval('sleep_events_id_seq'::regclass),
  user_id            uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date               date           NOT NULL,
  total_sleep_hours  numeric,
  rem_hours          numeric,
  core_hours         numeric,
  deep_hours         numeric,
  awake_hours        numeric,
  sleep_start        timestamptz,
  sleep_end          timestamptz,
  in_bed_start       timestamptz,
  in_bed_end         timestamptz,
  wrist_temperature  numeric,
  source             text,
  created_at         timestamptz    DEFAULT now(),

  PRIMARY KEY (id),
  UNIQUE (user_id, date)
);

ALTER TABLE public.sleep_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY sleep_events_select_own ON public.sleep_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY sleep_events_insert_own ON public.sleep_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY sleep_events_update_own ON public.sleep_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY sleep_events_delete_own ON public.sleep_events
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT ON public.sleep_events TO authenticated;
