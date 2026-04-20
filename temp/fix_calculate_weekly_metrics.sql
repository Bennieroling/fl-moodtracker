CREATE OR REPLACE FUNCTION calculate_weekly_metrics(user_uuid UUID, start_date DATE, end_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_avg_mood NUMERIC;
    v_total_calories NUMERIC;
    v_top_foods TEXT[];
    v_mood_count INTEGER;
    v_food_count INTEGER;
BEGIN
    IF auth.uid() IS DISTINCT FROM user_uuid THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT AVG(mood_score), COUNT(*)
    INTO v_avg_mood, v_mood_count
    FROM mood_entries
    WHERE user_id = user_uuid
    AND date BETWEEN start_date AND end_date;

    SELECT COALESCE(SUM(calories), 0), COUNT(*)
    INTO v_total_calories, v_food_count
    FROM food_entries
    WHERE user_id = user_uuid
    AND date BETWEEN start_date AND end_date
    AND journal_mode = FALSE;

    SELECT ARRAY_AGG(food_label)
    INTO v_top_foods
    FROM (
        SELECT UNNEST(food_labels) AS food_label, COUNT(*) AS frequency
        FROM food_entries
        WHERE user_id = user_uuid
        AND date BETWEEN start_date AND end_date
        AND journal_mode = FALSE
        AND food_labels IS NOT NULL
        GROUP BY food_label
        ORDER BY frequency DESC
        LIMIT 5
    ) AS top_food_query;

    RETURN jsonb_build_object(
        'avgMood', COALESCE(v_avg_mood, 0),
        'kcalTotal', COALESCE(v_total_calories, 0),
        'topFoods', COALESCE(v_top_foods, '{}'::TEXT[]),
        'moodEntries', COALESCE(v_mood_count, 0),
        'foodEntries', COALESCE(v_food_count, 0)
    );
END;
$function$;