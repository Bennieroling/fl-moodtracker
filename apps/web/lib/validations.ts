import { z } from 'zod';

// Base schemas
export const MealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const UnitsSchema = z.enum(['metric', 'imperial']);
export const ModelProviderSchema = z.enum(['openai', 'gemini']);

// Mood schemas
export const MoodScoreSchema = z.number().int().min(1).max(5);

export const MoodEntrySchema = z.object({
  id: z.string().uuid({ message: "Invalid UUID format" }).optional(),
  user_id: z.string().uuid({ message: "Invalid user ID format" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  mood_score: MoodScoreSchema,
  note: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const MoodEntryInsertSchema = MoodEntrySchema.omit({ id: true, created_at: true, updated_at: true });
export const MoodEntryUpdateSchema = MoodEntrySchema.partial().required({ id: true });

// Nutrition schemas
export const MacrosSchema = z.object({
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
});

export const NutritionSchema = z.object({
  calories: z.number().min(0),
  macros: MacrosSchema,
});

// Food schemas
export const FoodItemSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  quantity: z.string().optional(),
});

export const FoodEntrySchema = z.object({
  id: z.string().uuid({ message: "Invalid UUID format" }).optional(),
  user_id: z.string().uuid({ message: "Invalid user ID format" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: MealTypeSchema,
  photo_url: z.string().url({ message: "Invalid URL format" }).nullable().optional(),
  voice_url: z.string().url({ message: "Invalid URL format" }).nullable().optional(),
  ai_raw: z.any().nullable().optional(),
  food_labels: z.array(z.string()).nullable().optional(),
  calories: z.number().min(0).nullable().optional(),
  macros: MacrosSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  journal_mode: z.boolean().default(false),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const FoodEntryInsertSchema = FoodEntrySchema.omit({ id: true, created_at: true, updated_at: true });
export const FoodEntryUpdateSchema = FoodEntrySchema.partial().required({ id: true });

// AI Contract schemas

// AI Vision contracts
export const AIVisionRequestSchema = z.object({
  imageUrl: z.string().url({ message: "Invalid URL format" }),
  userId: z.string().uuid({ message: "Invalid user ID format" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: MealTypeSchema,
});

export const AIVisionResponseSchema = z.object({
  foods: z.array(FoodItemSchema),
  nutrition: NutritionSchema,
  provider: ModelProviderSchema,
  raw: z.any(),
});

// AI Speech contracts
export const AISpeechRequestSchema = z.object({
  audioUrl: z.string().url({ message: "Invalid URL format" }),
  userId: z.string().uuid({ message: "Invalid UUID" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const AISpeechResponseSchema = z.object({
  meal: MealTypeSchema,
  foods: z.array(FoodItemSchema),
  nutrition: NutritionSchema,
  transcript: z.string(),
  provider: ModelProviderSchema,
  raw: z.any(),
});

// AI Insights contracts
export const AIInsightsRequestSchema = z.object({
  userId: z.string().uuid({ message: "Invalid UUID" }),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const WeeklyMetricsSchema = z.object({
  avgMood: z.number().min(0).max(5),
  kcalTotal: z.number().min(0),
  topFoods: z.array(z.string()),
  moodEntries: z.number().int().min(0),
  foodEntries: z.number().int().min(0),
});

export const AIInsightsResponseSchema = z.object({
  summary_md: z.string().min(1).max(1000), // 80-150 words roughly
  tips_md: z.string().min(1).max(500), // 3-5 bullet tips
  metrics: WeeklyMetricsSchema,
  provider: ModelProviderSchema,
  raw: z.any(),
});

// Insights table schema
export const InsightSchema = z.object({
  id: z.string().uuid({ message: "Invalid UUID" }).optional(),
  user_id: z.string().uuid({ message: "Invalid UUID" }),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary_md: z.string().nullable().optional(),
  tips_md: z.string().nullable().optional(),
  metrics: WeeklyMetricsSchema.nullable().optional(),
  created_at: z.string().optional(),
});

export const InsightInsertSchema = InsightSchema.omit({ id: true, created_at: true });

// Streak schema
export const StreakSchema = z.object({
  id: z.string().uuid({ message: "Invalid UUID" }).optional(),
  user_id: z.string().uuid({ message: "Invalid UUID" }),
  current_streak: z.number().int().min(0).default(0),
  longest_streak: z.number().int().min(0).default(0),
  last_entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  updated_at: z.string().optional(),
});

// User preferences schema
export const UserPreferencesSchema = z.object({
  id: z.string().uuid({ message: "Invalid UUID" }).optional(),
  user_id: z.string().uuid({ message: "Invalid UUID" }),
  units: UnitsSchema.default('metric'),
  reminder_enabled: z.boolean().default(true),
  reminder_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).default('09:00:00'), // HH:MM:SS format
  journal_mode_default: z.boolean().default(false),
  notifications_enabled: z.boolean().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const UserPreferencesInsertSchema = UserPreferencesSchema.omit({ id: true, created_at: true, updated_at: true });
export const UserPreferencesUpdateSchema = UserPreferencesSchema.partial().required({ user_id: true });

// Authentication schemas
export const LoginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Manual food entry schema
export const ManualFoodEntrySchema = z.object({
  meal: MealTypeSchema,
  food_labels: z.array(z.string().min(1)).min(1, 'At least one food item is required'),
  calories: z.number().min(0).optional(),
  macros: MacrosSchema.optional(),
  note: z.string().optional(),
  journal_mode: z.boolean().default(false),
});

// File upload schemas
export const FileUploadSchema = z.object({
  file: z.instanceof(File),
  bucket: z.enum(['food-photos', 'voice-notes']),
  path: z.string(),
});

// Storage signed URL schema
export const SignedURLRequestSchema = z.object({
  bucket: z.enum(['food-photos', 'voice-notes']),
  path: z.string(),
  expiresIn: z.number().min(60).max(3600).default(3600), // 1 minute to 1 hour
});

export const SignedURLResponseSchema = z.object({
  signedUrl: z.string().url({ message: "Invalid URL format" }),
  expiresAt: z.string(),
});

// Analytics event schemas
export const AnalyticsEventSchema = z.object({
  event: z.enum([
    'login',
    'register',
    'mood_saved',
    'food_saved',
    'ai_vision_used',
    'ai_speech_used',
    'insights_generated',
    'photo_uploaded',
    'voice_uploaded',
    'export_data',
    'preferences_updated',
  ]),
  properties: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().uuid({ message: "Invalid UUID" }).optional(),
});

// Export validation functions
export const validateMoodEntry = (data: unknown) => MoodEntrySchema.parse(data);
export const validateFoodEntry = (data: unknown) => FoodEntrySchema.parse(data);
export const validateAIVisionRequest = (data: unknown) => AIVisionRequestSchema.parse(data);
export const validateAIVisionResponse = (data: unknown) => AIVisionResponseSchema.parse(data);
export const validateAISpeechRequest = (data: unknown) => AISpeechRequestSchema.parse(data);
export const validateAISpeechResponse = (data: unknown) => AISpeechResponseSchema.parse(data);
export const validateAIInsightsRequest = (data: unknown) => AIInsightsRequestSchema.parse(data);
export const validateAIInsightsResponse = (data: unknown) => AIInsightsResponseSchema.parse(data);
export const validateUserPreferences = (data: unknown) => UserPreferencesSchema.parse(data);
export const validateLogin = (data: unknown) => LoginSchema.parse(data);
export const validateRegister = (data: unknown) => RegisterSchema.parse(data);
export const validateManualFoodEntry = (data: unknown) => ManualFoodEntrySchema.parse(data);
export const validateAnalyticsEvent = (data: unknown) => AnalyticsEventSchema.parse(data);
export const validateSignedURLRequest = (data: unknown) => SignedURLRequestSchema.parse(data);

// Type exports
export type MoodEntry = z.infer<typeof MoodEntrySchema>;
export type MoodEntryInsert = z.infer<typeof MoodEntryInsertSchema>;
export type MoodEntryUpdate = z.infer<typeof MoodEntryUpdateSchema>;

export type FoodEntry = z.infer<typeof FoodEntrySchema>;
export type FoodEntryInsert = z.infer<typeof FoodEntryInsertSchema>;
export type FoodEntryUpdate = z.infer<typeof FoodEntryUpdateSchema>;

export type FoodItem = z.infer<typeof FoodItemSchema>;
export type Macros = z.infer<typeof MacrosSchema>;
export type Nutrition = z.infer<typeof NutritionSchema>;

export type AIVisionRequest = z.infer<typeof AIVisionRequestSchema>;
export type AIVisionResponse = z.infer<typeof AIVisionResponseSchema>;
export type AISpeechRequest = z.infer<typeof AISpeechRequestSchema>;
export type AISpeechResponse = z.infer<typeof AISpeechResponseSchema>;
export type AIInsightsRequest = z.infer<typeof AIInsightsRequestSchema>;
export type AIInsightsResponse = z.infer<typeof AIInsightsResponseSchema>;

export type WeeklyMetrics = z.infer<typeof WeeklyMetricsSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type InsightInsert = z.infer<typeof InsightInsertSchema>;

export type Streak = z.infer<typeof StreakSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type UserPreferencesInsert = z.infer<typeof UserPreferencesInsertSchema>;
export type UserPreferencesUpdate = z.infer<typeof UserPreferencesUpdateSchema>;

export type LoginData = z.infer<typeof LoginSchema>;
export type RegisterData = z.infer<typeof RegisterSchema>;
export type ManualFoodEntry = z.infer<typeof ManualFoodEntrySchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type FileUpload = z.infer<typeof FileUploadSchema>;
export type SignedURLRequest = z.infer<typeof SignedURLRequestSchema>;
export type SignedURLResponse = z.infer<typeof SignedURLResponseSchema>;

export type MealType = z.infer<typeof MealTypeSchema>;
export type Units = z.infer<typeof UnitsSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;