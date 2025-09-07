-- Debug script to see what data already exists
-- Run this in Supabase SQL Editor to see your actual data

-- Check your user ID
SELECT 'Your user ID: ' || auth.uid()::text AS user_info;

-- Check existing mood entries
SELECT 'MOOD ENTRIES:' AS section;
SELECT date, mood_score, note, created_at
FROM mood_entries 
WHERE user_id = auth.uid()
ORDER BY date DESC
LIMIT 10;

-- Check existing food entries  
SELECT 'FOOD ENTRIES:' AS section;
SELECT date, meal, food_labels, calories, macros, created_at
FROM food_entries 
WHERE user_id = auth.uid()
ORDER BY date DESC
LIMIT 10;

-- Test what the current function returns
SELECT 'CURRENT FUNCTION OUTPUT:' AS section;
SELECT calculate_weekly_metrics(
    auth.uid(),
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE
) AS current_result;

-- Check table structures
SELECT 'MOOD TABLE STRUCTURE:' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'mood_entries' 
AND table_schema = 'public';

SELECT 'FOOD TABLE STRUCTURE:' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'food_entries' 
AND table_schema = 'public';