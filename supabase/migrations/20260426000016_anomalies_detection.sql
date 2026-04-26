-- Phase 1 of docs/PRODUCTION_PLAN.md — detect_anomalies() function + cron.
-- Computes leave-one-out z-scores over a 30-day rolling window and upserts
-- anomalies with |z| >= 2. Mirrors the math in the (now deprecated) client
-- helper `lib/anomalies.ts` so swap-over is a no-op for end users.
--
-- The function is SECURITY DEFINER because pg_cron runs as the postgres
-- role. RLS on the anomalies table still gates user-scoped reads via the
-- application path.

CREATE OR REPLACE FUNCTION public.detect_anomalies()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_window_start date := current_date - interval '29 days';
  v_window_end   date := current_date;
  v_inserted     int  := 0;
BEGIN
  WITH
  raw_metrics AS (
    -- HRV (good direction = up, higher is better)
    SELECT user_id, 'hrv'::text  AS metric_id, date AS observed_at,
           hrv::numeric AS value, 'up'::text AS good_direction
    FROM public.health_metrics_daily
    WHERE date BETWEEN v_window_start AND v_window_end
      AND hrv IS NOT NULL

    UNION ALL

    -- Resting heart rate (good direction = down, lower is better)
    SELECT user_id, 'rhr', date,
           resting_heart_rate::numeric, 'down'
    FROM public.health_metrics_daily
    WHERE date BETWEEN v_window_start AND v_window_end
      AND resting_heart_rate IS NOT NULL

    UNION ALL

    -- Total sleep duration (good direction = up)
    SELECT user_id, 'sleep', date,
           total_sleep_hours::numeric, 'up'
    FROM public.sleep_events
    WHERE date BETWEEN v_window_start AND v_window_end
      AND total_sleep_hours IS NOT NULL

    UNION ALL

    -- Deep sleep, expressed in minutes for parity with the UI (good = up)
    SELECT user_id, 'deep_sleep', date,
           (deep_hours * 60)::numeric, 'up'
    FROM public.sleep_events
    WHERE date BETWEEN v_window_start AND v_window_end
      AND deep_hours IS NOT NULL
  ),
  -- Precompute per-(user, metric) sum, sum-of-squares, and count once.
  windowed AS (
    SELECT
      user_id,
      metric_id,
      observed_at,
      value,
      good_direction,
      SUM(value)        OVER w AS sum_all,
      SUM(value * value) OVER w AS sumsq_all,
      COUNT(*)          OVER w AS n
    FROM raw_metrics
    WINDOW w AS (PARTITION BY user_id, metric_id)
  ),
  -- Leave-one-out mean and stddev (population variance over the n-1 sample,
  -- matching the client implementation in lib/anomalies.ts).
  scored AS (
    SELECT
      user_id,
      metric_id,
      observed_at,
      value,
      good_direction,
      n,
      ((sum_all - value) / (n - 1)::numeric) AS loo_mean,
      sqrt(GREATEST(
        ((sumsq_all - value * value) / (n - 1)::numeric)
          - (((sum_all - value) / (n - 1)::numeric) ^ 2),
        0::numeric
      )) AS loo_stddev
    FROM windowed
    WHERE n >= 14
  ),
  -- Per-day exercise minutes for the "likely training-related" hint on HRV.
  exercise_by_day AS (
    SELECT
      user_id,
      workout_date,
      SUM(COALESCE(duration_seconds, 0) / 60.0) AS minutes
    FROM public.exercise_events
    WHERE workout_date BETWEEN v_window_start - 1 AND v_window_end
    GROUP BY user_id, workout_date
  ),
  flagged AS (
    SELECT
      s.user_id,
      s.metric_id,
      s.observed_at,
      s.value,
      s.loo_mean      AS baseline_mean,
      s.loo_stddev    AS baseline_stddev,
      (s.value - s.loo_mean) / s.loo_stddev AS z_score,
      CASE WHEN s.value > s.loo_mean THEN 'high' ELSE 'low' END AS direction,
      s.good_direction,
      sl.total_sleep_hours,
      eb.minutes AS prev_day_exercise_minutes
    FROM scored s
    LEFT JOIN public.sleep_events sl
      ON sl.user_id = s.user_id AND sl.date = s.observed_at
    LEFT JOIN exercise_by_day eb
      ON eb.user_id = s.user_id AND eb.workout_date = (s.observed_at - 1)
    WHERE s.loo_stddev > 0
      AND ABS((s.value - s.loo_mean) / s.loo_stddev) >= 2
  )
  INSERT INTO public.anomalies (
    user_id, metric_id, observed_at, value,
    baseline_mean, baseline_stddev, z_score,
    direction, kind, hint
  )
  SELECT
    user_id,
    metric_id,
    observed_at,
    value,
    baseline_mean,
    baseline_stddev,
    z_score,
    direction,
    -- kind: positive when change is in the metric's good direction
    CASE
      WHEN good_direction = 'up'   AND direction = 'high' THEN 'positive'
      WHEN good_direction = 'down' AND direction = 'low'  THEN 'positive'
      ELSE 'alert'
    END AS kind,
    -- Lightweight rule-based hint, mirroring the client `pickHint`
    CASE
      WHEN metric_id = 'rhr'
           AND total_sleep_hours IS NOT NULL
           AND total_sleep_hours < 6
        THEN 'Correlates with short sleep'
      WHEN metric_id = 'hrv'
           AND prev_day_exercise_minutes IS NOT NULL
           AND prev_day_exercise_minutes > 60
        THEN 'Likely training-related'
      WHEN metric_id = 'deep_sleep'
        THEN 'Came after a quiet day'
      WHEN metric_id = 'sleep' AND value > 8.5
        THEN 'Long night — protect tomorrow'
      ELSE NULL
    END AS hint
  FROM flagged
  ON CONFLICT ON CONSTRAINT anomalies_user_metric_observed_unique
  DO UPDATE SET
    value           = EXCLUDED.value,
    baseline_mean   = EXCLUDED.baseline_mean,
    baseline_stddev = EXCLUDED.baseline_stddev,
    z_score         = EXCLUDED.z_score,
    direction       = EXCLUDED.direction,
    kind            = EXCLUDED.kind,
    hint            = EXCLUDED.hint,
    detected_at     = now()
  -- Don't refresh rows the user has already dismissed.
  WHERE anomalies.dismissed_at IS NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN format('detect_anomalies: window=%s..%s rows_upserted=%s',
                v_window_start, v_window_end, v_inserted);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.detect_anomalies() TO postgres;

-- ---------------------------------------------------------------------------
-- pg_cron schedule. Idempotent: drop any prior entry with this name first.
-- 03:30 UTC chosen to sit between purge-old-staging-rows (03:00) and
-- recalc-streaks-nightly (04:00).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'detect-anomalies';
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not installed; skip silently for local environments without it.
    NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'detect-anomalies',
    '30 3 * * *',
    'SELECT detect_anomalies();'
  );
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;
