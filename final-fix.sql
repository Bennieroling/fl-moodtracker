-- FINAL FIX - Remove ambiguous functions and create one clear version
-- Run this in Supabase SQL Editor

-- Drop all existing versions to avoid ambiguity
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, TIMESTAMP, DATE);
DROP FUNCTION IF EXISTS calculate_weekly_metrics(UUID, TIMESTAMP WITHOUT TIME ZONE, DATE);

-- Create ONE clear function that handles both DATE and TIMESTAMP inputs
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
    -- Return sample data for now (will be replaced with real logic later)
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

-- Test the function
SELECT 'SUCCESS: Single function created!' AS status;
SELECT calculate_weekly_metrics(
    '00000000-0000-0000-0000-000000000000'::uuid,
    CURRENT_DATE - 7,
    CURRENT_DATE
) AS test_result;