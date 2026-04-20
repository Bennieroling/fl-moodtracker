CREATE OR REPLACE FUNCTION public.sync_hae_to_production()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  metrics_count INTEGER := 0;
  workouts_count INTEGER := 0;
  routes_count INTEGER := 0;
  som_count INTEGER := 0;
  ecg_count INTEGER := 0;
  hrn_count INTEGER := 0;
  sleep_count INTEGER := 0;
  body_count INTEGER := 0;
  v_user_id UUID := 'a5dafd53-74d9-4492-9b60-944cfdf5d336'::uuid;
  v_tz TEXT;
  v_dates DATE[];
  v_body_dates DATE[];
BEGIN
  v_tz := COALESCE(
    (SELECT timezone FROM user_preferences WHERE user_id = v_user_id LIMIT 1),
    'UTC'
  );

  ------------------------------------------------------------------
  -- 1. METRICS: re-aggregate only for dates with unprocessed rows
  ------------------------------------------------------------------
  v_dates := ARRAY(
    SELECT DISTINCT (date AT TIME ZONE v_tz)::date
    FROM staging_hae_metrics
    WHERE processed_at IS NULL
  );

  IF array_length(v_dates, 1) > 0 THEN
    INSERT INTO health_metrics_daily (user_id, date, steps, active_energy_kcal, resting_energy_kcal, resting_heart_rate, hrv, exercise_time_minutes, stand_hours)
    SELECT
      v_user_id,
      (date AT TIME ZONE v_tz)::date AS date,
      ROUND(SUM(qty) FILTER (WHERE metric_name = 'step_count' AND qty < 500)::numeric, 0),
      ROUND((SUM(qty) FILTER (WHERE metric_name = 'active_energy') / 4.184)::numeric, 1),
      ROUND((SUM(qty) FILTER (WHERE metric_name = 'basal_energy_burned') / 4.184)::numeric, 1),
      ROUND(AVG(qty) FILTER (WHERE metric_name = 'resting_heart_rate')::numeric, 0),
      ROUND(AVG(qty) FILTER (WHERE metric_name = 'heart_rate_variability')::numeric, 1),
      ROUND(SUM(qty) FILTER (WHERE metric_name = 'apple_exercise_time')::numeric, 0),
      ROUND(SUM(qty) FILTER (WHERE metric_name = 'apple_stand_hour')::numeric, 0)
    FROM staging_hae_metrics
    WHERE (date AT TIME ZONE v_tz)::date = ANY(v_dates)
    GROUP BY (date AT TIME ZONE v_tz)::date
    ON CONFLICT (user_id, date) DO UPDATE SET
      steps = COALESCE(EXCLUDED.steps, health_metrics_daily.steps),
      active_energy_kcal = COALESCE(EXCLUDED.active_energy_kcal, health_metrics_daily.active_energy_kcal),
      resting_energy_kcal = COALESCE(EXCLUDED.resting_energy_kcal, health_metrics_daily.resting_energy_kcal),
      resting_heart_rate = COALESCE(EXCLUDED.resting_heart_rate, health_metrics_daily.resting_heart_rate),
      hrv = COALESCE(EXCLUDED.hrv, health_metrics_daily.hrv),
      exercise_time_minutes = COALESCE(EXCLUDED.exercise_time_minutes, health_metrics_daily.exercise_time_minutes),
      stand_hours = COALESCE(EXCLUDED.stand_hours, health_metrics_daily.stand_hours);
    GET DIAGNOSTICS metrics_count = ROW_COUNT;
  END IF;

  ------------------------------------------------------------------
  -- 7. BODY METRICS (latest-of-day weight/BMI/body fat)
  --    Computed BEFORE marking staging as processed
  ------------------------------------------------------------------
  v_body_dates := ARRAY(
    SELECT DISTINCT (date AT TIME ZONE v_tz)::date
    FROM staging_hae_metrics
    WHERE metric_name IN ('weight_body_mass', 'body_fat_percentage', 'body_mass_index')
      AND processed_at IS NULL
  );

  IF array_length(v_body_dates, 1) > 0 THEN
    INSERT INTO health_metrics_body (user_id, date, weight_kg, body_fat_pct, bmi, source)
    SELECT
      v_user_id,
      d AS date,
      (SELECT qty FROM staging_hae_metrics
        WHERE metric_name = 'weight_body_mass'
          AND (date AT TIME ZONE v_tz)::date = d
        ORDER BY date DESC LIMIT 1),
      (SELECT qty FROM staging_hae_metrics
        WHERE metric_name = 'body_fat_percentage'
          AND (date AT TIME ZONE v_tz)::date = d
        ORDER BY date DESC LIMIT 1),
      (SELECT qty FROM staging_hae_metrics
        WHERE metric_name = 'body_mass_index'
          AND (date AT TIME ZONE v_tz)::date = d
        ORDER BY date DESC LIMIT 1),
      'health_auto_export'
    FROM unnest(v_body_dates) AS d
    ON CONFLICT (user_id, date) DO UPDATE SET
      weight_kg    = COALESCE(EXCLUDED.weight_kg,    health_metrics_body.weight_kg),
      body_fat_pct = COALESCE(EXCLUDED.body_fat_pct, health_metrics_body.body_fat_pct),
      bmi          = COALESCE(EXCLUDED.bmi,          health_metrics_body.bmi),
      source       = EXCLUDED.source,
      updated_at   = NOW();
    GET DIAGNOSTICS body_count = ROW_COUNT;
  END IF;

  -- Now mark all metrics as processed (after both section 1 and 7 have read them)
  IF array_length(v_dates, 1) > 0 OR array_length(v_body_dates, 1) > 0 THEN
    UPDATE staging_hae_metrics SET processed_at = NOW() WHERE processed_at IS NULL;
  END IF;

  ------------------------------------------------------------------
  -- 2. WORKOUTS
  ------------------------------------------------------------------
  INSERT INTO exercise_events (
    user_id, workout_date, started_at, ended_at, workout_type,
    duration_seconds, active_energy_kcal, distance_km,
    avg_heart_rate, max_heart_rate, min_heart_rate,
    elevation_gain_m, temperature, humidity, mets,
    avg_speed_kmh, step_count, step_cadence,
    source, route_data
  )
  SELECT
    v_user_id,
    (start_time AT TIME ZONE v_tz)::date,
    start_time,
    end_time,
    workout_name,
    ROUND(duration_seconds::numeric, 0),
    ROUND((active_energy_qty / 4.184)::numeric, 1),
    ROUND(distance_qty::numeric, 2),
    ROUND(avg_heart_rate::numeric, 0),
    ROUND(max_heart_rate::numeric, 0),
    NULL::numeric,
    ROUND((raw_payload->'elevationUp'->>'qty')::numeric, 1),
    ROUND((raw_payload->'temperature'->>'qty')::numeric, 1),
    ROUND((raw_payload->'humidity'->>'qty')::numeric, 0),
    ROUND((raw_payload->'intensity'->>'qty')::numeric, 2),
    ROUND((raw_payload->'speed'->>'qty')::numeric, 2),
    ROUND((raw_payload->'stepCount'->>'qty')::numeric, 0),
    ROUND((raw_payload->'stepCadence'->>'qty')::numeric, 0),
    'health_auto_export',
    raw_payload->'route'
  FROM staging_hae_workouts
  WHERE processed_at IS NULL
  ON CONFLICT (user_id, workout_date, started_at) DO UPDATE SET
    ended_at = EXCLUDED.ended_at,
    workout_type = EXCLUDED.workout_type,
    duration_seconds = EXCLUDED.duration_seconds,
    active_energy_kcal = EXCLUDED.active_energy_kcal,
    distance_km = EXCLUDED.distance_km,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    max_heart_rate = EXCLUDED.max_heart_rate,
    min_heart_rate = EXCLUDED.min_heart_rate,
    elevation_gain_m = EXCLUDED.elevation_gain_m,
    temperature = EXCLUDED.temperature,
    humidity = EXCLUDED.humidity,
    mets = EXCLUDED.mets,
    avg_speed_kmh = EXCLUDED.avg_speed_kmh,
    step_count = EXCLUDED.step_count,
    step_cadence = EXCLUDED.step_cadence,
    route_data = EXCLUDED.route_data;
  GET DIAGNOSTICS workouts_count = ROW_COUNT;

  UPDATE staging_hae_workouts SET processed_at = NOW() WHERE processed_at IS NULL;

  ------------------------------------------------------------------
  -- 2b. WORKOUT ROUTES
  ------------------------------------------------------------------
  INSERT INTO workout_routes (user_id, exercise_event_id, route_points, point_count, bounds_ne_lat, bounds_ne_lng, bounds_sw_lat, bounds_sw_lng, source)
  SELECT
    e.user_id,
    e.id,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'lat', (pt->>'latitude')::numeric,
          'lng', (pt->>'longitude')::numeric,
          'alt', (pt->>'altitude')::numeric,
          'speed', (pt->>'speed')::numeric,
          'ts', pt->>'timestamp'
        )
      )
      FROM jsonb_array_elements(e.route_data) AS pt
    ),
    jsonb_array_length(e.route_data),
    (SELECT MAX((pt->>'latitude')::numeric)  FROM jsonb_array_elements(e.route_data) AS pt),
    (SELECT MAX((pt->>'longitude')::numeric) FROM jsonb_array_elements(e.route_data) AS pt),
    (SELECT MIN((pt->>'latitude')::numeric)  FROM jsonb_array_elements(e.route_data) AS pt),
    (SELECT MIN((pt->>'longitude')::numeric) FROM jsonb_array_elements(e.route_data) AS pt),
    'health_auto_export'
  FROM exercise_events e
  WHERE e.route_data IS NOT NULL
    AND jsonb_array_length(e.route_data) > 1
    AND e.user_id = v_user_id
    AND NOT EXISTS (SELECT 1 FROM workout_routes r WHERE r.exercise_event_id = e.id)
  ON CONFLICT (exercise_event_id) DO NOTHING;
  GET DIAGNOSTICS routes_count = ROW_COUNT;

  ------------------------------------------------------------------
  -- 3. STATE OF MIND
  ------------------------------------------------------------------
  INSERT INTO state_of_mind (
    recorded_at, kind, valence, valence_classification,
    labels, associations, source_id, raw_payload
  )
  SELECT DISTINCT ON ((raw_payload->>'start')::timestamptz, raw_payload->>'id')
    (raw_payload->>'start')::timestamptz,
    raw_payload->>'kind',
    (raw_payload->>'valence')::numeric,
    raw_payload->>'valenceClassification',
    ARRAY(SELECT jsonb_array_elements_text(raw_payload->'labels')),
    ARRAY(SELECT jsonb_array_elements_text(
      CASE WHEN raw_payload ? 'associations' THEN raw_payload->'associations' ELSE '[]'::jsonb END
    )),
    raw_payload->>'id',
    raw_payload
  FROM staging_hae_other
  WHERE data_type = 'stateOfMind' AND processed_at IS NULL
  ORDER BY (raw_payload->>'start')::timestamptz, raw_payload->>'id', received_at DESC
  ON CONFLICT (user_id, recorded_at, source_id) DO UPDATE SET
    valence = EXCLUDED.valence,
    valence_classification = EXCLUDED.valence_classification,
    labels = EXCLUDED.labels,
    associations = EXCLUDED.associations,
    raw_payload = EXCLUDED.raw_payload;
  GET DIAGNOSTICS som_count = ROW_COUNT;

  ------------------------------------------------------------------
  -- 4. ECG
  ------------------------------------------------------------------
  INSERT INTO ecg_readings (
    recorded_at, classification, average_heart_rate,
    number_of_measurements, sampling_frequency, source
  )
  SELECT DISTINCT ON ((raw_payload->>'start')::timestamptz)
    (raw_payload->>'start')::timestamptz,
    raw_payload->>'classification',
    (raw_payload->>'averageHeartRate')::numeric,
    (raw_payload->>'numberOfVoltageMeasurements')::integer,
    (raw_payload->>'samplingFrequency')::numeric,
    raw_payload->>'source'
  FROM staging_hae_other
  WHERE data_type = 'ecg' AND processed_at IS NULL
  ORDER BY (raw_payload->>'start')::timestamptz, received_at DESC
  ON CONFLICT (user_id, recorded_at) DO UPDATE SET
    classification = EXCLUDED.classification,
    average_heart_rate = EXCLUDED.average_heart_rate,
    number_of_measurements = EXCLUDED.number_of_measurements;
  GET DIAGNOSTICS ecg_count = ROW_COUNT;

  ------------------------------------------------------------------
  -- 5. HR NOTIFICATIONS
  ------------------------------------------------------------------
  INSERT INTO heart_rate_notifications (recorded_at, raw_payload)
  SELECT
    COALESCE(
      (raw_payload->>'start')::timestamptz,
      (raw_payload->>'date')::timestamptz
    ),
    raw_payload
  FROM staging_hae_other
  WHERE data_type IN ('heartRateNotifications', 'heartRateNotification')
    AND processed_at IS NULL
  ON CONFLICT (user_id, recorded_at) DO NOTHING;
  GET DIAGNOSTICS hrn_count = ROW_COUNT;

  UPDATE staging_hae_other SET processed_at = NOW() WHERE processed_at IS NULL;

  ------------------------------------------------------------------
  -- 6. SLEEP (deduplicated: one sleep + one wrist temp per date)
  ------------------------------------------------------------------
  IF array_length(v_dates, 1) > 0 THEN
    INSERT INTO sleep_events (
      user_id, date, total_sleep_hours, rem_hours, core_hours,
      deep_hours, awake_hours, sleep_start, sleep_end,
      in_bed_start, in_bed_end, wrist_temperature, source
    )
    SELECT DISTINCT ON ((s.date AT TIME ZONE v_tz)::date)
      v_user_id,
      (s.date AT TIME ZONE v_tz)::date,
      (s.raw_payload->>'totalSleep')::numeric,
      (s.raw_payload->>'rem')::numeric,
      (s.raw_payload->>'core')::numeric,
      (s.raw_payload->>'deep')::numeric,
      (s.raw_payload->>'awake')::numeric,
      (s.raw_payload->>'sleepStart')::timestamptz,
      (s.raw_payload->>'sleepEnd')::timestamptz,
      (s.raw_payload->>'inBedStart')::timestamptz,
      (s.raw_payload->>'inBedEnd')::timestamptz,
      (SELECT AVG(qty)::numeric 
         FROM staging_hae_metrics t
        WHERE t.metric_name = 'apple_sleeping_wrist_temperature'
          AND (t.date AT TIME ZONE v_tz)::date = (s.date AT TIME ZONE v_tz)::date),
      s.raw_payload->>'source'
    FROM staging_hae_metrics s
    WHERE s.metric_name = 'sleep_analysis'
      AND (s.date AT TIME ZONE v_tz)::date = ANY(v_dates)
    ORDER BY (s.date AT TIME ZONE v_tz)::date, s.date DESC
    ON CONFLICT (user_id, date) DO UPDATE SET
      total_sleep_hours = EXCLUDED.total_sleep_hours,
      rem_hours = EXCLUDED.rem_hours,
      core_hours = EXCLUDED.core_hours,
      deep_hours = EXCLUDED.deep_hours,
      awake_hours = EXCLUDED.awake_hours,
      sleep_start = EXCLUDED.sleep_start,
      sleep_end = EXCLUDED.sleep_end,
      in_bed_start = EXCLUDED.in_bed_start,
      in_bed_end = EXCLUDED.in_bed_end,
      wrist_temperature = COALESCE(EXCLUDED.wrist_temperature, sleep_events.wrist_temperature),
      source = EXCLUDED.source;
    GET DIAGNOSTICS sleep_count = ROW_COUNT;
  END IF;

  RETURN 'Synced: ' || metrics_count || ' days metrics, '
    || body_count || ' body, '
    || workouts_count || ' workouts, '
    || routes_count || ' routes, '
    || som_count || ' state_of_mind, '
    || ecg_count || ' ecg, '
    || hrn_count || ' hr_notifications, '
    || sleep_count || ' sleep [tz=' || v_tz || ']';
END;
$function$
