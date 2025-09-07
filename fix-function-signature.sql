-- Fix the function signature to match what the app is actually calling
-- The app is calling: calculate_weekly_metrics(uuid, timestamp, date)

-- Drop all existing versions
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, TIMESTAMP, DATE);
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, TIMESTAMP WITHOUT TIME ZONE, DATE);

-- Create function with the EXACT signature the app expects
CREATE OR REPLACE FUNCTION calculate_weekly_metrics(
    user_uuid UUID, 
    start_date TIMESTAMP WITHOUT TIME ZONE, 
    end_date DATE
)
RETURNS JSONB 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    avg_mood NUMERIC := 0;
    total_calories NUMERIC := 0;
    top_foods TEXT[] := '{}';
    mood_count INTEGER := 0;
    food_count INTEGER := 0;
    start_date_only DATE;
BEGIN
    -- Convert timestamp to date for comparison
    start_date_only := start_date::DATE;
    
    -- Calculate average mood
    SELECT COALESCE(AVG(mood_score), 0), COALESCE(COUNT(*), 0)
    INTO avg_mood, mood_count
    FROM mood_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date_only 
    AND date <= end_date;
    
    -- Calculate total calories
    SELECT COALESCE(SUM(calories), 0), COALESCE(COUNT(*), 0)
    INTO total_calories, food_count
    FROM food_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date_only 
    AND date <= end_date
    AND COALESCE(journal_mode, FALSE) = FALSE;
    
    -- Get top 5 most frequent foods
    SELECT COALESCE(ARRAY_AGG(food_label), '{}')
    INTO top_foods
    FROM (
        SELECT UNNEST(food_labels) AS food_label, COUNT(*) as frequency
        FROM food_entries 
        WHERE user_id = user_uuid 
        AND date >= start_date_only 
        AND date <= end_date
        AND COALESCE(journal_mode, FALSE) = FALSE
        AND food_labels IS NOT NULL
        AND array_length(food_labels, 1) > 0
        GROUP BY food_label
        ORDER BY frequency DESC
        LIMIT 5
    ) AS top_food_query;
    
    -- Return actual data from database
    RETURN jsonb_build_object(
        'avgMood', COALESCE(avg_mood, 0),
        'kcalTotal', COALESCE(total_calories, 0),
        'topFoods', COALESCE(top_foods, '{}'),
        'moodEntries', COALESCE(mood_count, 0),
        'foodEntries', COALESCE(food_count, 0)
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, TIMESTAMP WITHOUT TIME ZONE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, TIMESTAMP WITHOUT TIME ZONE, DATE) TO anon;

-- Test the function (this should work now)
SELECT 'Function created with correct signature!' AS status;