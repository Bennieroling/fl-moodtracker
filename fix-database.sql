-- Complete database setup for Wellness app insights page
-- Run this in your Supabase dashboard > SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tables if they don't exist

-- Mood entries table
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

-- Food entries table
CREATE TABLE IF NOT EXISTS food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal meal_type NOT NULL,
    photo_url TEXT,
    voice_url TEXT,
    ai_raw JSONB,
    food_labels TEXT ARRAY,
    calories NUMERIC,
    macros JSONB, -- {protein: number, carbs: number, fat: number}
    note TEXT,
    journal_mode BOOLEAN DEFAULT FALSE, -- Privacy flag to exclude from insights/exports
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insights table
CREATE TABLE IF NOT EXISTS insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    summary_md TEXT,
    tips_md TEXT,
    metrics JSONB, -- {avgMood: number, kcalTotal: number, topFoods: string[]}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, period_start, period_end)
);

-- Streaks table
CREATE TABLE IF NOT EXISTS streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_entry_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    units TEXT DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
    reminder_enabled BOOLEAN DEFAULT TRUE,
    reminder_time TIME DEFAULT '09:00:00',
    journal_mode_default BOOLEAN DEFAULT FALSE,
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_mood_entries_user_date ON mood_entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal ON food_entries(meal);
CREATE INDEX IF NOT EXISTS idx_insights_user_period ON insights(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mood_entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mood_entries' AND policyname = 'Users can view their own mood entries'
    ) THEN
        CREATE POLICY "Users can view their own mood entries" ON mood_entries
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mood_entries' AND policyname = 'Users can insert their own mood entries'
    ) THEN
        CREATE POLICY "Users can insert their own mood entries" ON mood_entries
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mood_entries' AND policyname = 'Users can update their own mood entries'
    ) THEN
        CREATE POLICY "Users can update their own mood entries" ON mood_entries
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END$$;

-- RLS Policies for food_entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'food_entries' AND policyname = 'Users can view their own food entries'
    ) THEN
        CREATE POLICY "Users can view their own food entries" ON food_entries
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'food_entries' AND policyname = 'Users can insert their own food entries'
    ) THEN
        CREATE POLICY "Users can insert their own food entries" ON food_entries
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'food_entries' AND policyname = 'Users can update their own food entries'
    ) THEN
        CREATE POLICY "Users can update their own food entries" ON food_entries
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END$$;

-- RLS Policies for insights
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'insights' AND policyname = 'Users can view their own insights'
    ) THEN
        CREATE POLICY "Users can view their own insights" ON insights
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'insights' AND policyname = 'Users can insert their own insights'
    ) THEN
        CREATE POLICY "Users can insert their own insights" ON insights
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END$$;

-- RLS Policies for streaks
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'streaks' AND policyname = 'Users can view their own streaks'
    ) THEN
        CREATE POLICY "Users can view their own streaks" ON streaks
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'streaks' AND policyname = 'Users can manage their own streaks'
    ) THEN
        CREATE POLICY "Users can manage their own streaks" ON streaks
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END$$;

-- RLS Policies for user_preferences
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_preferences' AND policyname = 'Users can manage their own preferences'
    ) THEN
        CREATE POLICY "Users can manage their own preferences" ON user_preferences
            FOR ALL USING (auth.uid() = user_id);
    END IF;
END$$;

-- THE CRITICAL MISSING FUNCTION: calculate_weekly_metrics
CREATE OR REPLACE FUNCTION calculate_weekly_metrics(user_uuid UUID, start_date DATE, end_date DATE)
RETURNS JSONB AS $$
DECLARE
    avg_mood NUMERIC;
    total_calories NUMERIC;
    top_foods TEXT ARRAY;
    mood_count INTEGER;
    food_count INTEGER;
BEGIN
    -- Calculate average mood
    SELECT AVG(mood_score), COUNT(*)
    INTO avg_mood, mood_count
    FROM mood_entries 
    WHERE user_id = user_uuid 
    AND date BETWEEN start_date AND end_date;
    
    -- Calculate total calories
    SELECT COALESCE(SUM(calories), 0), COUNT(*)
    INTO total_calories, food_count
    FROM food_entries 
    WHERE user_id = user_uuid 
    AND date BETWEEN start_date AND end_date
    AND journal_mode = FALSE; -- Exclude journal mode entries
    
    -- Get top foods
    SELECT ARRAY_AGG(food_label)
    INTO top_foods
    FROM (
        SELECT UNNEST(food_labels) AS food_label, COUNT(*) as frequency
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
        'avgMood', COALESCE(avg_mood, 0),
        'kcalTotal', COALESCE(total_calories, 0),
        'topFoods', COALESCE(top_foods, '{}'::TEXT[]),
        'moodEntries', COALESCE(mood_count, 0),
        'foodEntries', COALESCE(food_count, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function for user preferences creation
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user preferences on user creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
    ) THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION create_user_preferences();
    END IF;
END$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_weekly_metrics(UUID, DATE, DATE) TO authenticated;

-- Success message
SELECT 'Database setup completed successfully! The calculate_weekly_metrics function has been created.' AS result;