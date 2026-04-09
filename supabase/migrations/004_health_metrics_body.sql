-- HealthFit sync support: body composition table.

CREATE TABLE IF NOT EXISTS health_metrics_body (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_kg NUMERIC,
  body_fat_pct NUMERIC,
  bmi NUMERIC,
  source TEXT DEFAULT 'healthfit',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT health_metrics_body_user_date UNIQUE (user_id, date)
);

ALTER TABLE health_metrics_body
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS body_fat_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS bmi NUMERIC,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'healthfit',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_metrics_body_user_date'
      AND conrelid = 'health_metrics_body'::regclass
  ) THEN
    ALTER TABLE health_metrics_body
      ADD CONSTRAINT health_metrics_body_user_date UNIQUE (user_id, date);
  END IF;
END $$;

ALTER TABLE health_metrics_body ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_metrics_body'
      AND policyname = 'Users manage own body metrics'
  ) THEN
    CREATE POLICY "Users manage own body metrics" ON health_metrics_body
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
