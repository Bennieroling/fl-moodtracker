-- MINIMAL DATABASE FIX - Run this in Supabase SQL Editor
-- This creates just the essential function to fix the insights page

-- First, create the function with explicit type casting
CREATE OR REPLACE FUNCTION calculate_weekly_metrics(
    user_uuid UUID, 
    start_date DATE, 
    end_date DATE
)
RETURNS JSONB 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
    -- Return sample data for now to get the page working
    -- This will be replaced with real logic once tables are confirmed
    RETURN jsonb_build_object(
        'avgMood', 3.5::numeric,
        'kcalTotal', 1200::numeric,
        'topFoods', ARRAY['Apple', 'Banana', 'Chicken']::text[],
        'moodEntries', 5::integer,
        'foodEntries', 8::integer
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, DATE, DATE) TO anon;

-- Test the function immediately
SELECT 'SUCCESS: Function created!' AS status;
SELECT calculate_weekly_metrics(
    '00000000-0000-0000-0000-000000000000'::uuid,
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE::date
) AS test_result;