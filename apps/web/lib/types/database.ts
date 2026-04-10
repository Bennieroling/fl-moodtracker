export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Units = 'metric' | 'imperial';
export type ModelProvider = 'openai' | 'gemini';

export type DailyTargets = {
  steps: number;
  exercise_minutes: number;
  calorie_intake: number;
  active_energy: number;
};

export const DEFAULT_DAILY_TARGETS: DailyTargets = {
  steps: 10000,
  exercise_minutes: 30,
  calorie_intake: 2000,
  active_energy: 600,
};

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
        Relationships: never[];
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
        Relationships: never[];
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
        Relationships: never[];
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
        Relationships: never[];
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
          onboarding_completed: boolean;
          onboarding_preferred_method: 'photo' | 'voice' | 'text' | 'manual' | null;
          onboarding_completed_at: string | null;
          daily_targets: DailyTargets | null;
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
          onboarding_completed?: boolean;
          onboarding_preferred_method?: 'photo' | 'voice' | 'text' | 'manual' | null;
          onboarding_completed_at?: string | null;
          daily_targets?: DailyTargets | null;
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
          onboarding_completed?: boolean;
          onboarding_preferred_method?: 'photo' | 'voice' | 'text' | 'manual' | null;
          onboarding_completed_at?: string | null;
          daily_targets?: DailyTargets | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
      exercise_daily: {
        Row: {
          user_id: string;
          date: string;
          exercise_time_minutes: number | null;
          move_time_minutes: number | null;
          stand_time_minutes: number | null;
          active_energy_kcal: number | null;
          distance_km: number | null;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          exercise_time_minutes?: number | null;
          move_time_minutes?: number | null;
          stand_time_minutes?: number | null;
          active_energy_kcal?: number | null;
          distance_km?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          date?: string;
          exercise_time_minutes?: number | null;
          move_time_minutes?: number | null;
          stand_time_minutes?: number | null;
          active_energy_kcal?: number | null;
          distance_km?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
      exercise_events: {
        Row: {
          id: number;
          user_id: string;
          workout_date: string;
          started_at: string;
          workout_type: string | null;
          total_minutes: number | null;
          move_minutes: number | null;
          distance_km: number | null;
          active_energy_kcal: number | null;
          avg_hr: number | null;
          min_hr: number | null;
          max_hr: number | null;
          duration_seconds: number | null;
          ended_at: string | null;
          total_energy_kcal: number | null;
          avg_heart_rate: number | null;
          max_heart_rate: number | null;
          elevation_gain_m: number | null;
          temperature: number | null;
          humidity: number | null;
          trimp: number | null;
          mets: number | null;
          rpe: number | null;
          hr_zone_type: string | null;
          hrz0_seconds: number | null;
          hrz1_seconds: number | null;
          hrz2_seconds: number | null;
          hrz3_seconds: number | null;
          hrz4_seconds: number | null;
          hrz5_seconds: number | null;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          workout_date: string;
          started_at: string;
          workout_type?: string | null;
          total_minutes?: number | null;
          move_minutes?: number | null;
          distance_km?: number | null;
          active_energy_kcal?: number | null;
          avg_hr?: number | null;
          min_hr?: number | null;
          max_hr?: number | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          total_energy_kcal?: number | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          elevation_gain_m?: number | null;
          temperature?: number | null;
          humidity?: number | null;
          trimp?: number | null;
          mets?: number | null;
          rpe?: number | null;
          hr_zone_type?: string | null;
          hrz0_seconds?: number | null;
          hrz1_seconds?: number | null;
          hrz2_seconds?: number | null;
          hrz3_seconds?: number | null;
          hrz4_seconds?: number | null;
          hrz5_seconds?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          workout_date?: string;
          started_at?: string;
          workout_type?: string | null;
          total_minutes?: number | null;
          move_minutes?: number | null;
          distance_km?: number | null;
          active_energy_kcal?: number | null;
          avg_hr?: number | null;
          min_hr?: number | null;
          max_hr?: number | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          total_energy_kcal?: number | null;
          avg_heart_rate?: number | null;
          max_heart_rate?: number | null;
          elevation_gain_m?: number | null;
          temperature?: number | null;
          humidity?: number | null;
          trimp?: number | null;
          mets?: number | null;
          rpe?: number | null;
          hr_zone_type?: string | null;
          hrz0_seconds?: number | null;
          hrz1_seconds?: number | null;
          hrz2_seconds?: number | null;
          hrz3_seconds?: number | null;
          hrz4_seconds?: number | null;
          hrz5_seconds?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
      health_metrics_daily: {
        Row: {
          user_id: string;
          date: string;
          total_energy_kcal: number | null;
          active_energy_kcal: number | null;
          resting_energy_kcal: number | null;
          steps: number | null;
          resting_heart_rate: number | null;
          hrv: number | null;
          vo2max: number | null;
          exercise_time_minutes: number | null;
          stand_hours: number | null;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          total_energy_kcal?: number | null;
          active_energy_kcal?: number | null;
          resting_energy_kcal?: number | null;
          steps?: number | null;
          resting_heart_rate?: number | null;
          hrv?: number | null;
          vo2max?: number | null;
          exercise_time_minutes?: number | null;
          stand_hours?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          date?: string;
          total_energy_kcal?: number | null;
          active_energy_kcal?: number | null;
          resting_energy_kcal?: number | null;
          steps?: number | null;
          resting_heart_rate?: number | null;
          hrv?: number | null;
          vo2max?: number | null;
          exercise_time_minutes?: number | null;
          stand_hours?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
      health_metrics_body: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          weight_kg: number | null;
          body_fat_pct: number | null;
          bmi: number | null;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          date: string;
          weight_kg?: number | null;
          body_fat_pct?: number | null;
          bmi?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          date?: string;
          weight_kg?: number | null;
          body_fat_pct?: number | null;
          bmi?: number | null;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: never[];
      };
    };
    Views: {
      [_ in never]: never
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
    Enums: {
      [_ in never]: never
    };
    CompositeTypes: {
      [_ in never]: never
    };
  };
}

// Convenience type exports
export type MoodEntry = Database['public']['Tables']['mood_entries']['Row'];
export type FoodEntry = Database['public']['Tables']['food_entries']['Row'];
export type Insight = Database['public']['Tables']['insights']['Row'];
export type Streak = Database['public']['Tables']['streaks']['Row'];
export type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];
export type ExerciseDaily = Database['public']['Tables']['exercise_daily']['Row'];
export type HealthMetricsDaily = Database['public']['Tables']['health_metrics_daily']['Row'];
export type ExerciseEvent = Database['public']['Tables']['exercise_events']['Row'];
export type HealthMetricsBody = Database['public']['Tables']['health_metrics_body']['Row'];

export interface StateOfMind {
  id?: number;
  user_id: string;
  recorded_at: string;
  kind: string;
  valence: number;
  valence_classification: string;
  labels: string[] | null;
  associations: string[] | null;
  source_id: string | null;
  raw_payload: unknown | null;
}

export interface EcgReading {
  id?: number;
  user_id: string;
  recorded_at: string;
  classification: string;
  average_heart_rate: number | null;
  number_of_measurements: number | null;
  sampling_frequency: number | null;
  source: string | null;
}

export interface HeartRateNotification {
  id?: number;
  user_id: string;
  recorded_at: string;
  notification_type: string;
  heart_rate: number | null;
  threshold: number | null;
  raw_payload: unknown | null;
}

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
