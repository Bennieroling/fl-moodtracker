-- Phase 2 of docs/PRODUCTION_PLAN.md — Readiness scores table.
-- Stores per-day weighted recovery score computed by compute_readiness().
-- One row per (user, date); UI surfaces (Dashboard hero, /preview Readiness
-- tab) read directly from this table.

CREATE TABLE IF NOT EXISTS public.readiness_scores (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                date NOT NULL,
  score               int NOT NULL CHECK (score BETWEEN 0 AND 100),
  band                text NOT NULL CHECK (band IN ('peak','primed','steady','recover')),
  caption             text NOT NULL,
  sleep_contribution  int NOT NULL,
  hrv_contribution    int NOT NULL,
  rhr_contribution    int NOT NULL,
  load_contribution   int NOT NULL,
  components          jsonb NOT NULL,
  computed_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'readiness_scores_user_date_unique'
      AND conrelid = 'public.readiness_scores'::regclass
  ) THEN
    ALTER TABLE public.readiness_scores
      ADD CONSTRAINT readiness_scores_user_date_unique
      UNIQUE (user_id, date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS readiness_scores_user_date_idx
  ON public.readiness_scores (user_id, date DESC);

ALTER TABLE public.readiness_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'readiness_scores'
      AND policyname = 'Users read own readiness scores'
  ) THEN
    CREATE POLICY "Users read own readiness scores" ON public.readiness_scores
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT ON public.readiness_scores TO authenticated;
