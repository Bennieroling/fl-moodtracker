-- Phase 2 of docs/PRODUCTION_PLAN.md — compute_readiness() + batch + cron.
-- PL/pgSQL port of the math in lib/readiness.ts (now deprecated). Tweaks to
-- the weighting / formulas / caption templates should land here, not in
-- the client.

-- ---------------------------------------------------------------------------
-- Per-day, per-user readiness score writer.
--
-- Weights: sleep 35 / HRV 30 / RHR 20 / training-load 15.
-- HRV / RHR sub-scores reference a 60-day rolling baseline (excluding the
-- target day). Training load uses 3-day acute / 14-day chronic ratio (ACWR).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_readiness(p_user_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  -- Snapshot for the target day
  v_sleep_hours numeric;
  v_hrv numeric;
  v_rhr numeric;
  v_exercise_minutes numeric;

  -- 60-day baselines (excluding target day)
  v_hrv_mean numeric;
  v_hrv_std numeric;
  v_hrv_baseline_count int;
  v_rhr_mean numeric;
  v_rhr_std numeric;
  v_rhr_baseline_count int;

  -- Training load
  v_history_count int;
  v_acute_minutes numeric;
  v_chronic_minutes numeric;
  v_acwr numeric;

  -- Sub-scores (defaults match the client's behaviour for missing data)
  v_sleep_score numeric := 20;
  v_hrv_score numeric := 50;
  v_rhr_score numeric := 50;
  v_load_score numeric := 60;

  -- Aggregate
  v_total_score int;
  v_band text;
  v_dominant text;
  v_weakest text;
  v_caption text;

  -- z-score scratch
  v_z numeric;
BEGIN
  -- ─── Pull the day's snapshot ──────────────────────────────────────────
  SELECT total_sleep_hours INTO v_sleep_hours
  FROM public.sleep_events
  WHERE user_id = p_user_id AND date = p_date
  LIMIT 1;

  SELECT hrv, resting_heart_rate INTO v_hrv, v_rhr
  FROM public.health_metrics_daily
  WHERE user_id = p_user_id AND date = p_date
  LIMIT 1;

  SELECT COALESCE(SUM(COALESCE(duration_seconds, 0) / 60.0), 0)
  INTO v_exercise_minutes
  FROM public.exercise_events
  WHERE user_id = p_user_id AND workout_date = p_date;

  -- ─── 60-day HRV baseline ──────────────────────────────────────────────
  SELECT AVG(hrv), STDDEV_POP(hrv), COUNT(hrv)
  INTO v_hrv_mean, v_hrv_std, v_hrv_baseline_count
  FROM public.health_metrics_daily
  WHERE user_id = p_user_id
    AND date >= p_date - 60
    AND date < p_date
    AND hrv IS NOT NULL;

  -- ─── 60-day RHR baseline ──────────────────────────────────────────────
  SELECT AVG(resting_heart_rate), STDDEV_POP(resting_heart_rate), COUNT(resting_heart_rate)
  INTO v_rhr_mean, v_rhr_std, v_rhr_baseline_count
  FROM public.health_metrics_daily
  WHERE user_id = p_user_id
    AND date >= p_date - 60
    AND date < p_date
    AND resting_heart_rate IS NOT NULL;

  -- ─── Training load (ACWR) ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_history_count
  FROM public.health_metrics_daily
  WHERE user_id = p_user_id
    AND date BETWEEN p_date - 13 AND p_date;

  IF v_history_count >= 14 THEN
    SELECT COALESCE(SUM(COALESCE(duration_seconds, 0) / 60.0) / 3.0, 0)
    INTO v_acute_minutes
    FROM public.exercise_events
    WHERE user_id = p_user_id
      AND workout_date BETWEEN p_date - 2 AND p_date;

    SELECT COALESCE(SUM(COALESCE(duration_seconds, 0) / 60.0) / 14.0, 0)
    INTO v_chronic_minutes
    FROM public.exercise_events
    WHERE user_id = p_user_id
      AND workout_date BETWEEN p_date - 13 AND p_date;

    IF v_chronic_minutes = 0 THEN
      v_acwr := CASE WHEN v_acute_minutes = 0 THEN 1 ELSE NULL END;
    ELSE
      v_acwr := v_acute_minutes / v_chronic_minutes;
    END IF;
  ELSE
    v_acwr := NULL;
  END IF;

  -- ─── Sleep sub-score ─────────────────────────────────────────────────
  IF v_sleep_hours IS NOT NULL THEN
    v_sleep_score := GREATEST(0, LEAST(100, (v_sleep_hours / 8.0) * 100));
  END IF;

  -- ─── HRV sub-score (z vs baseline; +1σ → 100, -2σ → 0, mean → 50) ────
  IF v_hrv IS NULL THEN
    v_hrv_score := 40;
  ELSIF v_hrv_baseline_count >= 5 AND v_hrv_std IS NOT NULL AND v_hrv_std > 0 THEN
    v_z := (v_hrv - v_hrv_mean) / v_hrv_std;
    v_hrv_score := CASE
      WHEN v_z >= 1 THEN 100
      WHEN v_z <= -2 THEN 0
      WHEN v_z >= 0 THEN 50 + v_z * 50
      ELSE 50 + v_z * 25
    END;
  END IF;

  -- ─── RHR sub-score (inverted: low is good) ───────────────────────────
  IF v_rhr IS NULL THEN
    v_rhr_score := 40;
  ELSIF v_rhr_baseline_count >= 5 AND v_rhr_std IS NOT NULL AND v_rhr_std > 0 THEN
    v_z := -((v_rhr - v_rhr_mean) / v_rhr_std);
    v_rhr_score := CASE
      WHEN v_z >= 1 THEN 100
      WHEN v_z <= -2 THEN 0
      WHEN v_z >= 0 THEN 50 + v_z * 50
      ELSE 50 + v_z * 25
    END;
  END IF;

  -- ─── Training load sub-score (ACWR) ──────────────────────────────────
  IF v_acwr IS NULL THEN
    v_load_score := 60;
  ELSIF v_acwr BETWEEN 0.8 AND 1.3 THEN
    v_load_score := 100;
  ELSIF v_acwr < 0.5 THEN
    v_load_score := 30;
  ELSIF v_acwr > 1.6 THEN
    v_load_score := 25;
  ELSIF v_acwr < 0.8 THEN
    v_load_score := 60 + (v_acwr - 0.5) * 133.3;
  ELSE  -- 1.3 < acwr <= 1.6
    v_load_score := 100 - (v_acwr - 1.3) * 250;
  END IF;

  -- ─── Weighted total + band ───────────────────────────────────────────
  v_total_score := ROUND(
    v_sleep_score * 0.35
    + v_hrv_score * 0.30
    + v_rhr_score * 0.20
    + v_load_score * 0.15
  );

  v_band := CASE
    WHEN v_total_score >= 85 THEN 'peak'
    WHEN v_total_score >= 70 THEN 'primed'
    WHEN v_total_score >= 50 THEN 'steady'
    ELSE 'recover'
  END;

  -- ─── Dominant / weakest sub-score key (for caption selection) ─────────
  -- Tie-break order matches the JS reduce: sleep, hrv, rhr, load.
  v_dominant := CASE GREATEST(v_sleep_score, v_hrv_score, v_rhr_score, v_load_score)
    WHEN v_sleep_score THEN 'sleep'
    WHEN v_hrv_score   THEN 'hrv'
    WHEN v_rhr_score   THEN 'rhr'
    ELSE                    'load'
  END;

  v_weakest := CASE LEAST(v_sleep_score, v_hrv_score, v_rhr_score, v_load_score)
    WHEN v_sleep_score THEN 'sleep'
    WHEN v_hrv_score   THEN 'hrv'
    WHEN v_rhr_score   THEN 'rhr'
    ELSE                    'load'
  END;

  -- ─── Caption ──────────────────────────────────────────────────────────
  -- Templates lifted verbatim from lib/readiness.ts captionFor(). Edit
  -- here, not in the client.
  v_caption := CASE
    WHEN v_total_score >= 85 AND v_dominant = 'hrv'   THEN 'HRV bounced back overnight — green light to push.'
    WHEN v_total_score >= 85 AND v_dominant = 'sleep' THEN 'Sleep held the line. Strong day to lean in.'
    WHEN v_total_score >= 85                          THEN 'Everything trending up — make it count.'
    WHEN v_total_score >= 70 AND v_dominant = 'sleep' THEN 'Sleep carried you. A good day to push.'
    WHEN v_total_score >= 70 AND v_weakest  = 'load'  THEN 'Recovery is solid; load has been light. Add a little.'
    WHEN v_total_score >= 70                          THEN 'Body looks ready. Steady effort fits today.'
    WHEN v_total_score >= 50                          THEN 'Nothing jumped out — a solid baseline day.'
    WHEN v_weakest = 'load' AND v_load_score < 30     THEN 'Heavy load caught up with you. Take it easy today.'
    WHEN v_weakest = 'sleep'                          THEN 'Short on sleep — protect intensity, prioritise rest.'
    ELSE                                                   'Recovery signals are low. Ease into the day.'
  END;

  -- ─── Upsert ──────────────────────────────────────────────────────────
  INSERT INTO public.readiness_scores (
    user_id, date, score, band, caption,
    sleep_contribution, hrv_contribution, rhr_contribution, load_contribution,
    components, computed_at
  )
  VALUES (
    p_user_id, p_date, v_total_score, v_band, v_caption,
    ROUND(v_sleep_score)::int,
    ROUND(v_hrv_score)::int,
    ROUND(v_rhr_score)::int,
    ROUND(v_load_score)::int,
    jsonb_build_object(
      'sleep_hours',         v_sleep_hours,
      'hrv',                 v_hrv,
      'rhr',                 v_rhr,
      'exercise_minutes',    v_exercise_minutes,
      'hrv_baseline_mean',   v_hrv_mean,
      'hrv_baseline_stddev', v_hrv_std,
      'hrv_baseline_n',      v_hrv_baseline_count,
      'rhr_baseline_mean',   v_rhr_mean,
      'rhr_baseline_stddev', v_rhr_std,
      'rhr_baseline_n',      v_rhr_baseline_count,
      'acwr',                v_acwr,
      'has_data',            (v_sleep_hours IS NOT NULL OR v_hrv IS NOT NULL OR v_rhr IS NOT NULL)
    ),
    now()
  )
  ON CONFLICT ON CONSTRAINT readiness_scores_user_date_unique
  DO UPDATE SET
    score              = EXCLUDED.score,
    band               = EXCLUDED.band,
    caption            = EXCLUDED.caption,
    sleep_contribution = EXCLUDED.sleep_contribution,
    hrv_contribution   = EXCLUDED.hrv_contribution,
    rhr_contribution   = EXCLUDED.rhr_contribution,
    load_contribution  = EXCLUDED.load_contribution,
    components         = EXCLUDED.components,
    computed_at        = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.compute_readiness(uuid, date) TO postgres;

-- ---------------------------------------------------------------------------
-- Batch runner — invoked nightly by pg_cron. Computes yesterday's score for
-- every user with at least one health_metrics_daily row in the last 14 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_readiness_batch()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid;
  v_target_date date := current_date - 1;
  v_count int := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM public.health_metrics_daily
    WHERE date >= current_date - 14
  LOOP
    PERFORM public.compute_readiness(v_user_id, v_target_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN format('compute_readiness_batch: date=%s users_processed=%s', v_target_date, v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.compute_readiness_batch() TO postgres;

-- ---------------------------------------------------------------------------
-- Cron schedule: 04:30 UTC, after detect-anomalies (03:30) and the streak
-- recalc (04:00).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'compute-readiness';
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'compute-readiness',
    '30 4 * * *',
    'SELECT compute_readiness_batch();'
  );
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;
