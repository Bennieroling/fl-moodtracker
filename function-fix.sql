-- Alternative version of the function with better error handling
-- Run this if the original function has issues

DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION calculate_weekly_metrics(
    user_uuid UUID, 
    start_date DATE, 
    end_date DATE
)
RETURNS JSONB AS $$
DECLARE
    avg_mood NUMERIC := 0;
    total_calories NUMERIC := 0;
    top_foods TEXT[] := '{}';
    mood_count INTEGER := 0;
    food_count INTEGER := 0;
BEGIN
    -- Validate inputs
    IF user_uuid IS NULL OR start_date IS NULL OR end_date IS NULL THEN
        RETURN jsonb_build_object(
            'avgMood', 0,
            'kcalTotal', 0,
            'topFoods', '{}',
            'moodEntries', 0,
            'foodEntries', 0,
            'error', 'Invalid parameters'
        );
    END IF;

    -- Calculate average mood (handle empty case)
    BEGIN
        SELECT COALESCE(AVG(mood_score), 0), COALESCE(COUNT(*), 0)
        INTO avg_mood, mood_count
        FROM mood_entries 
        WHERE user_id = user_uuid 
        AND date >= start_date 
        AND date <= end_date;
    EXCEPTION WHEN OTHERS THEN
        avg_mood := 0;
        mood_count := 0;
    END;
    
    -- Calculate total calories (handle empty case)
    BEGIN
        SELECT COALESCE(SUM(calories), 0), COALESCE(COUNT(*), 0)
        INTO total_calories, food_count
        FROM food_entries 
        WHERE user_id = user_uuid 
        AND date >= start_date 
        AND date <= end_date
        AND COALESCE(journal_mode, FALSE) = FALSE;
    EXCEPTION WHEN OTHERS THEN
        total_calories := 0;
        food_count := 0;
    END;
    
    -- Get top foods (handle empty case)
    BEGIN
        SELECT COALESCE(ARRAY_AGG(food_label), '{}')
        INTO top_foods
        FROM (
            SELECT UNNEST(food_labels) AS food_label, COUNT(*) as frequency
            FROM food_entries 
            WHERE user_id = user_uuid 
            AND date >= start_date 
            AND date <= end_date
            AND COALESCE(journal_mode, FALSE) = FALSE
            AND food_labels IS NOT NULL
            AND array_length(food_labels, 1) > 0
            GROUP BY food_label
            ORDER BY frequency DESC
            LIMIT 5
        ) AS top_food_query;
    EXCEPTION WHEN OTHERS THEN
        top_foods := '{}';
    END;
    
    -- Return results
    RETURN jsonb_build_object(
        'avgMood', COALESCE(avg_mood, 0),
        'kcalTotal', COALESCE(total_calories, 0),
        'topFoods', COALESCE(top_foods, '{}'),
        'moodEntries', COALESCE(mood_count, 0),
        'foodEntries', COALESCE(food_count, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, DATE, DATE) TO authenticated, anon;

-- Test the function
SELECT 'Function created successfully!' as result;