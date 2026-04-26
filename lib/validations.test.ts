import { describe, expect, it } from 'vitest'
import {
  AIInsightsRequestSchema,
  AISpeechRequestSchema,
  AITextRequestSchema,
  AIVisionRequestSchema,
  AnalyticsEventSchema,
  FoodEntrySchema,
  LoginSchema,
  MacrosSchema,
  ManualFoodEntrySchema,
  MealTypeSchema,
  MoodEntrySchema,
  MoodScoreSchema,
  RegisterSchema,
  SignedURLRequestSchema,
  StreakSchema,
  UserPreferencesSchema,
} from '@/lib/validations'

const UUID = '00000000-0000-4000-8000-000000000001'
const DATE = '2026-04-25'
const URL = 'https://example.supabase.co/storage/v1/object/sign/food-photos/test.jpg'

describe('MoodScoreSchema', () => {
  it.each([1, 2, 3, 4, 5])('accepts %i', (score) => {
    expect(MoodScoreSchema.parse(score)).toBe(score)
  })
  it.each([0, 6, -1, 1.5])('rejects %i', (score) => {
    expect(() => MoodScoreSchema.parse(score)).toThrow()
  })
})

describe('MealTypeSchema', () => {
  it.each(['breakfast', 'lunch', 'dinner', 'snack'])('accepts %s', (meal) => {
    expect(MealTypeSchema.parse(meal)).toBe(meal)
  })
  it('rejects unknown meal type', () => {
    expect(() => MealTypeSchema.parse('brunch')).toThrow()
  })
})

describe('MacrosSchema', () => {
  it('accepts valid macros', () => {
    expect(MacrosSchema.parse({ protein: 25, carbs: 50, fat: 15 })).toEqual({
      protein: 25,
      carbs: 50,
      fat: 15,
    })
  })
  it('rejects negative values', () => {
    expect(() => MacrosSchema.parse({ protein: -1, carbs: 50, fat: 15 })).toThrow()
  })
  it('rejects missing fields', () => {
    expect(() => MacrosSchema.parse({ protein: 25 })).toThrow()
  })
})

describe('MoodEntrySchema', () => {
  const valid = { user_id: UUID, date: DATE, mood_score: 3 }

  it('accepts a valid mood entry', () => {
    const result = MoodEntrySchema.parse(valid)
    expect(result.mood_score).toBe(3)
  })
  it('rejects invalid date format', () => {
    expect(() => MoodEntrySchema.parse({ ...valid, date: '25-04-2026' })).toThrow()
  })
  it('rejects non-uuid user_id', () => {
    expect(() => MoodEntrySchema.parse({ ...valid, user_id: 'not-a-uuid' })).toThrow()
  })
  it('rejects mood_score out of range', () => {
    expect(() => MoodEntrySchema.parse({ ...valid, mood_score: 0 })).toThrow()
  })
})

describe('FoodEntrySchema', () => {
  const valid = { user_id: UUID, date: DATE, meal: 'lunch' }

  it('accepts minimal food entry', () => {
    const result = FoodEntrySchema.parse(valid)
    expect(result.meal).toBe('lunch')
    expect(result.journal_mode).toBe(false)
  })
  it('rejects invalid meal type', () => {
    expect(() => FoodEntrySchema.parse({ ...valid, meal: 'supper' })).toThrow()
  })
  it('rejects invalid photo_url', () => {
    expect(() => FoodEntrySchema.parse({ ...valid, photo_url: 'not-a-url' })).toThrow()
  })
})

describe('AIVisionRequestSchema', () => {
  const valid = { imageUrl: URL, userId: UUID, date: DATE, meal: 'breakfast' }

  it('accepts valid request', () => {
    expect(AIVisionRequestSchema.parse(valid)).toMatchObject({ meal: 'breakfast' })
  })
  it('rejects non-url imageUrl', () => {
    expect(() => AIVisionRequestSchema.parse({ ...valid, imageUrl: 'not-a-url' })).toThrow()
  })
  it('rejects non-uuid userId', () => {
    expect(() => AIVisionRequestSchema.parse({ ...valid, userId: 'bad-id' })).toThrow()
  })
})

describe('AISpeechRequestSchema', () => {
  const valid = { audioUrl: URL, userId: UUID }

  it('accepts valid request', () => {
    expect(AISpeechRequestSchema.parse(valid)).toMatchObject({ userId: UUID })
  })
  it('rejects non-url audioUrl', () => {
    expect(() => AISpeechRequestSchema.parse({ ...valid, audioUrl: '/local' })).toThrow()
  })
})

describe('AITextRequestSchema', () => {
  const valid = { text: 'I had oatmeal with banana for breakfast', userId: UUID }

  it('accepts valid request', () => {
    expect(AITextRequestSchema.parse(valid)).toMatchObject({ userId: UUID })
  })
  it('rejects text shorter than 10 chars', () => {
    expect(() => AITextRequestSchema.parse({ ...valid, text: 'short' })).toThrow()
  })
})

describe('AIInsightsRequestSchema', () => {
  const valid = { userId: UUID, periodStart: '2026-04-01', periodEnd: '2026-04-07' }

  it('accepts valid request', () => {
    expect(AIInsightsRequestSchema.parse(valid)).toMatchObject({ userId: UUID })
  })
  it('rejects missing periodStart', () => {
    expect(() => AIInsightsRequestSchema.parse({ userId: UUID, periodEnd: '2026-04-07' })).toThrow()
  })
})

describe('UserPreferencesSchema', () => {
  const valid = { user_id: UUID }

  it('applies defaults', () => {
    const result = UserPreferencesSchema.parse(valid)
    expect(result.units).toBe('metric')
    expect(result.reminder_enabled).toBe(true)
    expect(result.journal_mode_default).toBe(false)
  })
  it('rejects invalid units', () => {
    expect(() => UserPreferencesSchema.parse({ ...valid, units: 'us-customary' })).toThrow()
  })
  it('rejects invalid reminder_time format', () => {
    expect(() => UserPreferencesSchema.parse({ ...valid, reminder_time: '9:00' })).toThrow()
  })
})

describe('StreakSchema', () => {
  const valid = { user_id: UUID }

  it('applies defaults', () => {
    const result = StreakSchema.parse(valid)
    expect(result.current_streak).toBe(0)
    expect(result.longest_streak).toBe(0)
  })
  it('rejects negative streaks', () => {
    expect(() => StreakSchema.parse({ ...valid, current_streak: -1 })).toThrow()
  })
})

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    expect(LoginSchema.parse({ email: 'user@example.com', password: 'secret123' })).toMatchObject({
      email: 'user@example.com',
    })
  })
  it('rejects invalid email', () => {
    expect(() => LoginSchema.parse({ email: 'not-an-email', password: 'secret123' })).toThrow()
  })
  it('rejects short password', () => {
    expect(() => LoginSchema.parse({ email: 'user@example.com', password: '12345' })).toThrow()
  })
})

describe('RegisterSchema', () => {
  const valid = { email: 'user@example.com', password: 'secret123', confirmPassword: 'secret123' }

  it('accepts matching passwords', () => {
    expect(RegisterSchema.parse(valid)).toMatchObject({ email: 'user@example.com' })
  })
  it('rejects mismatched passwords', () => {
    expect(() => RegisterSchema.parse({ ...valid, confirmPassword: 'different' })).toThrow()
  })
})

describe('ManualFoodEntrySchema', () => {
  const valid = { meal: 'dinner', food_labels: ['rice', 'chicken'] }

  it('accepts valid manual entry', () => {
    expect(ManualFoodEntrySchema.parse(valid)).toMatchObject({ meal: 'dinner' })
  })
  it('rejects empty food_labels array', () => {
    expect(() => ManualFoodEntrySchema.parse({ ...valid, food_labels: [] })).toThrow()
  })
})

describe('SignedURLRequestSchema', () => {
  const valid = { bucket: 'food-photos', path: 'user-1/photo.jpg' }

  it('accepts valid request with default expiresIn', () => {
    const result = SignedURLRequestSchema.parse(valid)
    expect(result.expiresIn).toBe(3600)
  })
  it('rejects unknown bucket', () => {
    expect(() => SignedURLRequestSchema.parse({ ...valid, bucket: 'other' })).toThrow()
  })
  it('rejects expiresIn below minimum', () => {
    expect(() => SignedURLRequestSchema.parse({ ...valid, expiresIn: 30 })).toThrow()
  })
})

describe('AnalyticsEventSchema', () => {
  it('accepts valid event', () => {
    expect(AnalyticsEventSchema.parse({ event: 'login' })).toMatchObject({ event: 'login' })
  })
  it('rejects unknown event type', () => {
    expect(() => AnalyticsEventSchema.parse({ event: 'custom_event' })).toThrow()
  })
  it('accepts optional userId and properties', () => {
    const result = AnalyticsEventSchema.parse({
      event: 'mood_saved',
      userId: UUID,
      properties: { score: 4 },
    })
    expect(result.userId).toBe(UUID)
  })
})
