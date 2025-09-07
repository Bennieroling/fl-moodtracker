-- Simple debug to check existing data
-- Run this AFTER fixing the function signature

-- Check if you have mood entries
SELECT COUNT(*) as mood_entry_count, MIN(date) as earliest_mood, MAX(date) as latest_mood
FROM mood_entries 
WHERE user_id = auth.uid();

-- Check if you have food entries  
SELECT COUNT(*) as food_entry_count, MIN(date) as earliest_food, MAX(date) as latest_food
FROM food_entries 
WHERE user_id = auth.uid();

-- Show sample of recent food entries
SELECT date, meal, food_labels, calories 
FROM food_entries 
WHERE user_id = auth.uid()
AND date >= CURRENT_DATE - 7
ORDER BY date DESC;

-- Test the function with correct signature
SELECT calculate_weekly_metrics(
    auth.uid(),
    (CURRENT_DATE - 7)::timestamp,
    CURRENT_DATE
) AS function_result;