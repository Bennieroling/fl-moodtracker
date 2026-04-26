-- Phase 1 of docs/PRODUCTION_PLAN.md — Anomalies table.
-- Stores statistical outliers detected by the nightly detect_anomalies() job.
-- Append-only by the cron; users can only update dismissed_at via the UI.

CREATE TABLE IF NOT EXISTS public.anomalies (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_id       text NOT NULL,
  observed_at     date NOT NULL,
  value           numeric NOT NULL,
  baseline_mean   numeric NOT NULL,
  baseline_stddev numeric NOT NULL,
  z_score         numeric NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('high','low')),
  kind            text NOT NULL CHECK (kind IN ('alert','positive')),
  hint            text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  dismissed_at    timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anomalies_user_metric_observed_unique'
      AND conrelid = 'public.anomalies'::regclass
  ) THEN
    ALTER TABLE public.anomalies
      ADD CONSTRAINT anomalies_user_metric_observed_unique
      UNIQUE (user_id, metric_id, observed_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS anomalies_user_detected_idx
  ON public.anomalies (user_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS anomalies_user_observed_active_idx
  ON public.anomalies (user_id, observed_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'anomalies'
      AND policyname = 'Users manage own anomalies'
  ) THEN
    CREATE POLICY "Users manage own anomalies" ON public.anomalies
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, UPDATE ON public.anomalies TO authenticated;
