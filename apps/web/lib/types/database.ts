export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Units = 'metric' | 'imperial';
export type ModelProvider = 'openai' | 'gemini';

export interface Database {
  public: {
    Tables: {
      mood_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          mood_score: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          mood_score: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          mood_score?: number;
          note?: string | null;
          updated_at?: string;
        };
      };
      food_entries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          meal: MealType;
          photo_url: string | null;
          voice_url: string | null;
          ai_raw: unknown | null;
          food_labels: string[] | null;
          calories: number | null;
          macros: {
            protein: number;
            carbs: number;
            fat: number;
          } | null;
          note: string | null;
          journal_mode: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          meal: MealType;
          photo_url?: string | null;
          voice_url?: string | null;
          ai_raw?: unknown | null;
          food_labels?: string[] | null;
          calories?: number | null;
          macros?: {
            protein: number;
            carbs: number;
            fat: number;
          } | null;
          note?: string | null;
          journal_mode?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          meal?: MealType;
          photo_url?: string | null;
          voice_url?: string | null;
          ai_raw?: unknown | null;
          food_labels?: string[] | null;
          calories?: number | null;
          macros?: {
            protein: number;
            carbs: number;
            fat: number;
          } | null;
          note?: string | null;
          journal_mode?: boolean;
          updated_at?: string;
        };
      };
      insights: {
        Row: {
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          summary_md: string | null;
          tips_md: string | null;
          metrics: {
            avgMood: number;
            kcalTotal: number;
            topFoods: string[];
            moodEntries: number;
            foodEntries: number;
          } | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period_start: string;
          period_end: string;
          summary_md?: string | null;
          tips_md?: string | null;
          metrics?: {
            avgMood: number;
            kcalTotal: number;
            topFoods: string[];
            moodEntries: number;
            foodEntries: number;
          } | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          period_start?: string;
          period_end?: string;
          summary_md?: string | null;
          tips_md?: string | null;
          metrics?: {
            avgMood: number;
            kcalTotal: number;
            topFoods: string[];
            moodEntries: number;
            foodEntries: number;
          } | null;
        };
      };
      streaks: {
        Row: {
          id: string;
          user_id: string;
          current_streak: number;
          longest_streak: number;
          last_entry_date: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          current_streak?: number;
          longest_streak?: number;
          last_entry_date?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          current_streak?: number;
          longest_streak?: number;
          last_entry_date?: string | null;
          updated_at?: string;
        };
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          units: Units;
          reminder_enabled: boolean;
          reminder_time: string;
          journal_mode_default: boolean;
          notifications_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          units?: Units;
          reminder_enabled?: boolean;
          reminder_time?: string;
          journal_mode_default?: boolean;
          notifications_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          units?: Units;
          reminder_enabled?: boolean;
          reminder_time?: string;
          journal_mode_default?: boolean;
          notifications_enabled?: boolean;
          updated_at?: string;
        };
      };
    };
    Functions: {
      calculate_weekly_metrics: {
        Args: {
          user_uuid: string;
          start_date: string;
          end_date: string;
        };
        Returns: {
          avgMood: number;
          kcalTotal: number;
          topFoods: string[];
          moodEntries: number;
          foodEntries: number;
        };
      };
    };
  };
}

// Convenience type exports
export type MoodEntry = Database['public']['Tables']['mood_entries']['Row'];
export type FoodEntry = Database['public']['Tables']['food_entries']['Row'];
export type Insight = Database['public']['Tables']['insights']['Row'];
export type Streak = Database['public']['Tables']['streaks']['Row'];
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];

export type MoodEntryInsert = Database['public']['Tables']['mood_entries']['Insert'];
export type FoodEntryInsert = Database['public']['Tables']['food_entries']['Insert'];
export type InsightInsert = Database['public']['Tables']['insights']['Insert'];
export type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert'];

export type WeeklyMetrics = {
  avgMood: number;
  kcalTotal: number;
  topFoods: string[];
  moodEntries: number;
  foodEntries: number;
};