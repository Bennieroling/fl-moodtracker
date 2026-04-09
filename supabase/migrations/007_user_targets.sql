-- Configurable per-user daily targets stored on user_preferences.
-- Defaults match the previously hardcoded dashboard values.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS daily_targets JSONB DEFAULT '{
    "steps": 10000,
    "exercise_minutes": 30,
    "calorie_intake": 2000,
    "active_energy": 600
  }'::jsonb;
