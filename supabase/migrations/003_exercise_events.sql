-- HealthFit sync support: full v5-compatible exercise_events table.

CREATE TABLE IF NOT EXISTS exercise_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  workout_type TEXT,
  workout_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,

  -- v5 schema
  duration_seconds INTEGER,
  distance_km NUMERIC,
  elevation_gain_m NUMERIC,
  active_energy_kcal NUMERIC,
  total_energy_kcal NUMERIC,
  avg_heart_rate NUMERIC,
  max_heart_rate NUMERIC,
  hr_zone_type TEXT,
  hrz0_seconds INTEGER DEFAULT 0,
  hrz1_seconds INTEGER DEFAULT 0,
  hrz2_seconds INTEGER DEFAULT 0,
  hrz3_seconds INTEGER DEFAULT 0,
  hrz4_seconds INTEGER DEFAULT 0,
  hrz5_seconds INTEGER DEFAULT 0,
  trimp NUMERIC,
  mets NUMERIC,
  rpe NUMERIC,
  temperature NUMERIC,
  humidity NUMERIC,

  -- legacy columns used by app code
  total_minutes NUMERIC,
  move_minutes NUMERIC,
  avg_hr NUMERIC,
  min_hr NUMERIC,
  max_hr NUMERIC,

  source TEXT DEFAULT 'healthfit',
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT exercise_events_unique_workout UNIQUE (user_id, workout_date, started_at)
);

ALTER TABLE exercise_events
  ADD COLUMN IF NOT EXISTS workout_type TEXT,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS elevation_gain_m NUMERIC,
  ADD COLUMN IF NOT EXISTS active_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS total_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_heart_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS max_heart_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS hr_zone_type TEXT,
  ADD COLUMN IF NOT EXISTS hrz0_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrz1_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrz2_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrz3_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrz4_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hrz5_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trimp NUMERIC,
  ADD COLUMN IF NOT EXISTS mets NUMERIC,
  ADD COLUMN IF NOT EXISTS rpe NUMERIC,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC,
  ADD COLUMN IF NOT EXISTS humidity NUMERIC,
  ADD COLUMN IF NOT EXISTS total_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS move_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_hr NUMERIC,
  ADD COLUMN IF NOT EXISTS min_hr NUMERIC,
  ADD COLUMN IF NOT EXISTS max_hr NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'healthfit',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercise_events_unique_workout'
      AND conrelid = 'exercise_events'::regclass
  ) THEN
    ALTER TABLE exercise_events
      ADD CONSTRAINT exercise_events_unique_workout
        UNIQUE (user_id, workout_date, started_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_events_user_started_at
  ON exercise_events (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_events_user_workout_date
  ON exercise_events (user_id, workout_date DESC);

ALTER TABLE exercise_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exercise_events'
      AND policyname = 'Users manage own exercise events'
  ) THEN
    CREATE POLICY "Users manage own exercise events" ON exercise_events
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
