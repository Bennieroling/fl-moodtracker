-- HealthFit sync support: harmonized daily activity view.

DROP VIEW IF EXISTS v_daily_activity;

CREATE VIEW v_daily_activity AS
SELECT
  hmd.user_id,
  hmd.date,
  hmd.total_energy_kcal,
  hmd.active_energy_kcal,
  hmd.resting_energy_kcal,
  hmd.steps,
  COALESCE(hmd.exercise_time_minutes, ex.duration_minutes) AS exercise_time_minutes,
  COALESCE(ex.duration_minutes, hmd.exercise_time_minutes) AS move_time_minutes,
  CASE
    WHEN hmd.stand_hours IS NULL THEN NULL
    ELSE hmd.stand_hours * 60
  END AS stand_time_minutes,
  ex.distance_km,
  ex.total_exercise_kcal AS exercise_kcal,
  hmd.resting_heart_rate,
  hmd.hrv,
  hmd.vo2max,
  COALESCE(hmd.source, 'healthfit') AS source
FROM health_metrics_daily hmd
LEFT JOIN (
  SELECT
    user_id,
    workout_date,
    SUM(COALESCE(duration_seconds, 0)) / 60.0 AS duration_minutes,
    SUM(COALESCE(distance_km, 0)) AS distance_km,
    SUM(COALESCE(active_energy_kcal, 0)) AS total_exercise_kcal,
    COUNT(*) AS workout_count
  FROM exercise_events
  GROUP BY user_id, workout_date
) ex
  ON ex.user_id = hmd.user_id
 AND ex.workout_date = hmd.date
WHERE hmd.user_id = auth.uid();

GRANT SELECT ON v_daily_activity TO authenticated;
