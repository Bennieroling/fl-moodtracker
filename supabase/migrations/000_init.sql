-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Create custom types
CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- Users table (Supabase Auth manages this, but we can add custom fields if needed)
-- The auth.users table already exists, so we'll reference it directly

-- Mood entries table
CREATE TABLE mood_entries (
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
CREATE TABLE food_entries (
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
CREATE TABLE insights (
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
CREATE TABLE streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_entry_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- User preferences table
CREATE TABLE user_preferences (
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

-- Indexes for better performance
CREATE INDEX idx_mood_entries_user_date ON mood_entries(user_id, date DESC);
CREATE INDEX idx_food_entries_user_date ON food_entries(user_id, date DESC);
CREATE INDEX idx_food_entries_meal ON food_entries(meal);
CREATE INDEX idx_insights_user_period ON insights(user_id, period_start DESC);
CREATE INDEX idx_streaks_user ON streaks(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mood_entries
CREATE POLICY "Users can view their own mood entries" ON mood_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mood entries" ON mood_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mood entries" ON mood_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mood entries" ON mood_entries
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for food_entries
CREATE POLICY "Users can view their own food entries" ON food_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own food entries" ON food_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own food entries" ON food_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own food entries" ON food_entries
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for insights
CREATE POLICY "Users can view their own insights" ON insights
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insights" ON insights
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights" ON insights
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights" ON insights
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for streaks
CREATE POLICY "Users can view their own streaks" ON streaks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaks" ON streaks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaks" ON streaks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streaks" ON streaks
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences" ON user_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- Functions for streak management
CREATE OR REPLACE FUNCTION update_streak()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update streak when mood or food entry is added
    INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date, updated_at)
    VALUES (NEW.user_id, 1, 1, NEW.date, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        current_streak = CASE 
            WHEN streaks.last_entry_date = NEW.date - INTERVAL '1 day' OR streaks.last_entry_date = NEW.date THEN 
                CASE WHEN streaks.last_entry_date = NEW.date THEN streaks.current_streak 
                     ELSE streaks.current_streak + 1 END
            ELSE 1
        END,
        longest_streak = GREATEST(
            streaks.longest_streak, 
            CASE 
                WHEN streaks.last_entry_date = NEW.date - INTERVAL '1 day' OR streaks.last_entry_date = NEW.date THEN 
                    CASE WHEN streaks.last_entry_date = NEW.date THEN streaks.current_streak 
                         ELSE streaks.current_streak + 1 END
                ELSE 1
            END
        ),
        last_entry_date = NEW.date,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for streak updates
CREATE TRIGGER mood_entry_streak_trigger
    AFTER INSERT ON mood_entries
    FOR EACH ROW EXECUTE FUNCTION update_streak();

CREATE TRIGGER food_entry_streak_trigger
    AFTER INSERT ON food_entries
    FOR EACH ROW EXECUTE FUNCTION update_streak();

-- Function to create default user preferences
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create default preferences for new users
CREATE TRIGGER create_user_preferences_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_user_preferences();

-- Storage bucket policies will be set up separately via Supabase dashboard or CLI
-- Buckets needed: 'food-photos' and 'voice-notes' (both private)

-- Functions for analytics and insights
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

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Initial setup complete
-- Remember to create storage buckets:
-- 1. food-photos (private)
-- 2. voice-notes (private)
-- And set up bucket policies for authenticated users only