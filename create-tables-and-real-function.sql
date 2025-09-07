-- Create missing tables and replace mock function with real logic
-- Run this in Supabase SQL Editor

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS mood_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    mood_score INTEGER NOT NULL CHECK (mood_score >= 1 AND mood_score <= 5),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal TEXT NOT NULL, -- breakfast, lunch, dinner, snack
    photo_url TEXT,
    voice_url TEXT,
    ai_raw JSONB,
    food_labels TEXT[],
    calories NUMERIC,
    macros JSONB, -- {protein: number, carbs: number, fat: number}
    note TEXT,
    journal_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY IF NOT EXISTS "Users can view their own mood entries" ON mood_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own mood entries" ON mood_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own mood entries" ON mood_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can view their own food entries" ON food_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own food entries" ON food_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own food entries" ON food_entries
    FOR UPDATE USING (auth.uid() = user_id);

-- Now replace the mock function with real logic
CREATE OR REPLACE FUNCTION calculate_weekly_metrics(
    user_uuid UUID, 
    start_date DATE, 
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
BEGIN
    -- Calculate average mood
    SELECT COALESCE(AVG(mood_score), 0), COALESCE(COUNT(*), 0)
    INTO avg_mood, mood_count
    FROM mood_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date 
    AND date <= end_date;
    
    -- Calculate total calories
    SELECT COALESCE(SUM(calories), 0), COALESCE(COUNT(*), 0)
    INTO total_calories, food_count
    FROM food_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date 
    AND date <= end_date
    AND COALESCE(journal_mode, FALSE) = FALSE;
    
    -- Get top 5 most frequent foods
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

-- Test with real data (will show zeros if no data exists yet)
SELECT 'SUCCESS: Real function created!' AS status;
SELECT 'Tables and function are ready for real data' AS message;