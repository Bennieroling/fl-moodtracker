-- HealthFit sync support: ensure health_metrics_daily has all required columns.

CREATE TABLE IF NOT EXISTS health_metrics_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_energy_kcal NUMERIC,
  active_energy_kcal NUMERIC,
  resting_energy_kcal NUMERIC,
  steps NUMERIC,
  resting_heart_rate NUMERIC,
  hrv NUMERIC,
  vo2max NUMERIC,
  exercise_time_minutes NUMERIC,
  stand_hours NUMERIC,
  source TEXT DEFAULT 'healthfit',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT health_metrics_daily_user_date UNIQUE (user_id, date)
);

ALTER TABLE health_metrics_daily
  ADD COLUMN IF NOT EXISTS active_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS resting_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS resting_heart_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS hrv NUMERIC,
  ADD COLUMN IF NOT EXISTS steps NUMERIC,
  ADD COLUMN IF NOT EXISTS vo2max NUMERIC,
  ADD COLUMN IF NOT EXISTS exercise_time_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS stand_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS total_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'healthfit',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_metrics_daily_user_date'
      AND conrelid = 'health_metrics_daily'::regclass
  ) THEN
    ALTER TABLE health_metrics_daily
      ADD CONSTRAINT health_metrics_daily_user_date UNIQUE (user_id, date);
  END IF;
END $$;

ALTER TABLE health_metrics_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_metrics_daily'
      AND policyname = 'Users manage own health metrics daily'
  ) THEN
    CREATE POLICY "Users manage own health metrics daily" ON health_metrics_daily
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
