-- Test if the calculate_weekly_metrics function exists
-- Run this in your Supabase SQL Editor to verify

-- 1. Check if the function exists
SELECT 
    routine_name,
    routine_type,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'calculate_weekly_metrics'
AND routine_schema = 'public';

-- 2. If function exists, test it with dummy data
-- (This will return zeros if no data exists, which is expected)
-- Note: Replace the UUID with a real user UUID from auth.users table
SELECT calculate_weekly_metrics(
    '00000000-0000-0000-0000-000000000000'::uuid,  -- Dummy UUID for testing
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE
) as test_result;

-- 3. Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('mood_entries', 'food_entries', 'insights')
ORDER BY table_name;