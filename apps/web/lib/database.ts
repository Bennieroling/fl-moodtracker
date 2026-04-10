'use client'

import { createClient } from '@/lib/supabase-browser'
import { MoodEntryInsert, FoodEntryInsert, MealType, ExerciseEvent, HealthMetricsBody, DailyTargets, DEFAULT_DAILY_TARGETS, StateOfMind, EcgReading, HeartRateNotification } from '@/lib/types/database'
import { format } from 'date-fns'

const supabase = createClient()

export interface DailyActivity {
  user_id: string
  date: string
  total_energy_kcal: number | null
  active_energy_kcal: number | null
  resting_energy_kcal: number | null
  steps: number | null
  exercise_time_minutes: number | null
  move_time_minutes: number | null
  stand_time_minutes: number | null
  stand_hours?: number | null
  distance_km: number | null
  exercise_kcal: number | null
  resting_heart_rate?: number | null
  hrv?: number | null
  vo2max?: number | null
  source?: string | null
}

export interface DailyActivityAggregate {
  period: string
  total_energy_kcal: number | null
  active_energy_kcal: number | null
  exercise_time_minutes: number | null
  move_time_minutes: number | null
  steps: number | null
  distance_km: number | null
}

type ExerciseEventTotals = {
  total_minutes: number
  move_minutes: number
  active_energy_kcal: number
  distance_km: number
}

const createLocalMidnight = (dateString: string) => {
  const parts = dateString.split('-').map((value) => Number(value))
  const [year, month, day] = parts
  if (!year || !month || !day) {
    return new Date(dateString)
  }
  return new Date(year, month - 1, day)
}

export const getExerciseEventIsoRange = (startDate: string, endDate: string) => {
  const start = createLocalMidnight(startDate)
  const exclusiveEnd = createLocalMidnight(endDate)
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1)
  return {
    startIso: start.toISOString(),
    endIso: exclusiveEnd.toISOString(),
  }
}

const numberFromValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getWorkoutDateKey = (event: ExerciseEvent) => {
  if (event.workout_date) return event.workout_date
  if (event.started_at) return event.started_at.slice(0, 10)
  return null
}

const groupExerciseEventsByDate = (events: ExerciseEvent[]) => {
  const grouped = new Map<string, ExerciseEventTotals>()
  for (const workout of events) {
    const dateKey = getWorkoutDateKey(workout)
    if (!dateKey) continue
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        total_minutes: 0,
        move_minutes: 0,
        active_energy_kcal: 0,
        distance_km: 0,
      })
    }
    const totals = grouped.get(dateKey)!
    totals.total_minutes += numberFromValue(workout.total_minutes)
    totals.move_minutes += numberFromValue(workout.move_minutes)
    totals.active_energy_kcal += numberFromValue(workout.active_energy_kcal)
    totals.distance_km += numberFromValue(workout.distance_km)
  }
  return grouped
}

const createDailyActivityFromExercise = (
  userId: string,
  date: string,
  totals: ExerciseEventTotals
): DailyActivity => ({
  user_id: userId,
  date,
  total_energy_kcal: null,
  active_energy_kcal: totals.active_energy_kcal,
  resting_energy_kcal: null,
  steps: null,
  exercise_time_minutes: totals.total_minutes,
  move_time_minutes: totals.move_minutes,
  stand_time_minutes: null,
  distance_km: totals.distance_km,
  exercise_kcal: totals.active_energy_kcal,
  resting_heart_rate: null,
  hrv: null,
  vo2max: null,
  source: 'exercise_events',
})

const mergeActivityWithExercise = (
  userId: string,
  activityRows: DailyActivity[] = [],
  workouts: ExerciseEvent[] = []
) => {
  if (!workouts.length) {
    return activityRows || []
  }

  const grouped = groupExerciseEventsByDate(workouts)
  const merged = activityRows.map((row) => {
    const totals = grouped.get(row.date)
    if (!totals) {
      return row
    }
    return {
      ...row,
      exercise_time_minutes: totals.total_minutes,
      move_time_minutes: totals.move_minutes,
      active_energy_kcal: totals.active_energy_kcal,
      distance_km: totals.distance_km,
      exercise_kcal: totals.active_energy_kcal,
    }
  })

  const seenDates = new Set(merged.map((row) => row.date))
  for (const [date, totals] of grouped.entries()) {
    if (!seenDates.has(date)) {
      merged.push(createDailyActivityFromExercise(userId, date, totals))
    }
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date))
}

const getExerciseEventsBetweenDates = async (
  userId: string,
  startDate: string,
  endDate: string
) => {
  const { startIso, endIso } = getExerciseEventIsoRange(startDate, endDate)
  return getExerciseEventsForRange(userId, startIso, endIso)
}

// Check if we're in demo mode
const isDemoMode = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !url || url.includes('demo-project') || !key || key.includes('demo-')
}

// Test Supabase connection
export async function testConnection() {
  try {
    console.log('Testing Supabase connection...')
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Supabase Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    
    // Test basic connection first
    const { data: authData, error: authError } = await supabase.auth.getSession()
    console.log('Auth session check:', { user: authData?.session?.user?.id, authError })
    
    // Try a simple select instead of count to get better error info
    const { data, error } = await supabase
      .from('mood_entries')
      .select('id')
      .limit(1)
    
    console.log('Table access test result:', { data, error })
    
    if (error) {
      console.error('Full error object:', error)
      console.error('Connection test error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return { success: false, error: error.message || 'Connection failed' }
    }
    
    console.log('Connection test successful!')
    return { success: true, error: null }
  } catch (error) {
    console.error('Connection test exception:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Mood entry functions
export async function getMoodEntryByDate(userId: string, date: string) {
  try {
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching mood entry:', error)
    throw error
  }
}

export async function getMoodEntriesForMonth(userId: string, year: number, month: number) {
  try {
    const startDate = format(new Date(year, month - 1, 1), 'yyyy-MM-dd')
    const endDate = format(new Date(year, month, 0), 'yyyy-MM-dd')
    
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching mood entries for month:', error)
    throw error
  }
}

export async function upsertMoodEntry(moodEntry: MoodEntryInsert) {
  try {
    // First try to find existing entry
    const existing = await getMoodEntryByDate(moodEntry.user_id, moodEntry.date) as any
    
    if (existing) {
      // Update existing entry - bypass TypeScript issue temporarily  
      const supabaseAny = supabase as any
      const { data, error } = await supabaseAny
        .from('mood_entries')
        .update({
          mood_score: moodEntry.mood_score,
          note: moodEntry.note,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return data
    } else {
      // Insert new entry - bypass TypeScript issue temporarily
      const supabaseAny = supabase as any
      const { data, error } = await supabaseAny
        .from('mood_entries')
        .insert({
          ...moodEntry,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
  } catch (error) {
    console.error('Error upserting mood entry:', error)
    throw error
  }
}

// Food entry functions
export async function getFoodEntriesForDate(userId: string, date: string) {
  try {
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching food entries for date:', error)
    throw error
  }
}

export async function getFoodEntriesForDateRange(userId: string, startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching food entries for date range:', error)
    throw error
  }
}

export async function insertFoodEntry(foodEntry: FoodEntryInsert) {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('food_entries')
      .insert({
        ...foodEntry,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error inserting food entry:', error)
    throw error
  }
}

export async function updateFoodEntry(id: string, updates: Partial<FoodEntryInsert>) {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('food_entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating food entry:', error)
    throw error
  }
}

export async function deleteFoodEntry(id: string) {
  try {
    const { error } = await supabase
      .from('food_entries')
      .delete()
      .eq('id', id)

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error deleting food entry:', error)
    throw error
  }
}

// Daily activity helpers
export async function getExerciseEventsForDate(userId: string, date: string): Promise<ExerciseEvent[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('exercise_events')
      .select('*')
      .eq('user_id', userId)
      .eq('workout_date', date)
      .order('started_at', { ascending: false })

    if (error) throw error
    return (data || []) as ExerciseEvent[]
  } catch (error) {
    console.error('Error fetching exercise events for date:', error)
    return []
  }
}

export async function getExerciseEventsForRange(
  userId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<ExerciseEvent[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('exercise_events')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', rangeStartIso)
      .lt('started_at', rangeEndIso)
      .order('started_at', { ascending: false })

    if (error) throw error
    return (data || []) as ExerciseEvent[]
  } catch (error) {
    console.error('Error fetching exercise events for range:', error)
    return []
  }
}

export async function getDailyActivityRange(
  userId: string,
  startDate: string,
  endDate: string,
  options: { workouts?: ExerciseEvent[] } = {}
): Promise<DailyActivity[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('v_daily_activity')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (error) throw error

    const workouts =
      options.workouts ??
      (await getExerciseEventsBetweenDates(userId, startDate, endDate))

    return mergeActivityWithExercise(userId, (data || []) as DailyActivity[], workouts)
  } catch (error) {
    console.error('Error fetching daily activity range:', error)
    return []
  }
}

export async function getDailyActivityByDate(userId: string, date: string): Promise<DailyActivity | null> {
  try {
    const workouts = await getExerciseEventsForDate(userId, date)
    const range = await getDailyActivityRange(userId, date, date, { workouts })
    return range[0] || null
  } catch (error) {
    console.error('Error fetching daily activity by date:', error)
    return null
  }
}

export type ActivityAggregateBucket = 'week' | 'month' | 'year'

export async function getActivityAggregates(
  userId: string,
  bucket: ActivityAggregateBucket,
  limit: number = 12,
  startDate?: string,
  endDate?: string
): Promise<DailyActivityAggregate[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny.rpc('get_activity_aggregates', {
      p_user_id: userId,
      p_period: bucket,
      p_start_date: startDate ?? '1970-01-01',
      p_end_date: endDate ?? '2099-12-31',
      p_limit: limit,
    })

    if (error) {
      console.error('Aggregates error:', error)
      return []
    }

    return (data ?? []) as DailyActivityAggregate[]
  } catch (error) {
    console.error('Error fetching activity aggregates:', error)
    return []
  }
}

// Dashboard summary calculations
export async function getDashboardSummary(userId: string, date: string) {
  try {
    // Handle demo mode
    if (isDemoMode()) {
      console.warn('Demo mode: Returning mock dashboard summary')
      return {
        mood: Math.floor(Math.random() * 5) + 1, // Random mood 1-5
        totalCalories: 1850,
        mealsLogged: 3,
        macros: {
          protein: 85,
          carbs: 220,
          fat: 65
        },
        foodEntries: []
      }
    }

    // Fetch mood entry for the day
    const moodPromise = getMoodEntryByDate(userId, date)
    
    // Fetch food entries for the day
    const foodPromise = getFoodEntriesForDate(userId, date)

    const [moodEntry, foodEntries] = await Promise.all([moodPromise, foodPromise])

    // Calculate totals - apply type assertion for TypeScript issues
    const foodEntriesTyped = foodEntries as any[]
    const totalCalories = foodEntriesTyped.reduce((sum, entry) => {
      return sum + (entry.calories || 0)
    }, 0)

    const mealsLogged = foodEntriesTyped.length

    const totalMacros = foodEntriesTyped.reduce(
      (sum, entry) => {
        const macros = entry.macros || { protein: 0, carbs: 0, fat: 0 }
        return {
          protein: sum.protein + macros.protein,
          carbs: sum.carbs + macros.carbs,
          fat: sum.fat + macros.fat
        }
      },
      { protein: 0, carbs: 0, fat: 0 }
    )

    return {
      mood: (moodEntry as any)?.mood_score || null,
      totalCalories: Math.round(totalCalories),
      mealsLogged,
      macros: {
        protein: Math.round(totalMacros.protein),
        carbs: Math.round(totalMacros.carbs),
        fat: Math.round(totalMacros.fat)
      },
      foodEntries: foodEntriesTyped
    }
  } catch (error) {
    console.error('Error fetching dashboard summary:', error)
    
    // Fallback to demo data on error
    console.warn('Falling back to demo dashboard summary')
    return {
      mood: null,
      totalCalories: 0,
      mealsLogged: 0,
      macros: { protein: 0, carbs: 0, fat: 0 },
      foodEntries: []
    }
  }
}

// Daily targets
export async function getUserTargets(userId: string): Promise<DailyTargets> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('user_preferences')
      .select('daily_targets')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    const stored = (data?.daily_targets ?? null) as Partial<DailyTargets> | null
    return { ...DEFAULT_DAILY_TARGETS, ...(stored ?? {}) }
  } catch (error) {
    console.error('Error fetching user targets:', error)
    return { ...DEFAULT_DAILY_TARGETS }
  }
}

export async function updateUserTargets(userId: string, targets: DailyTargets): Promise<void> {
  try {
    const supabaseAny = supabase as any
    const { error } = await supabaseAny
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          daily_targets: targets,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
    if (error) throw error
  } catch (error) {
    console.error('Error updating user targets:', error)
    throw error
  }
}

// Body metrics
export async function getBodyMetrics(
  userId: string,
  startDate: string,
  endDate: string
): Promise<HealthMetricsBody[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('health_metrics_body')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (error) throw error
    return (data || []) as HealthMetricsBody[]
  } catch (error) {
    console.error('Error fetching body metrics:', error)
    return []
  }
}

export async function getLatestBodyMetrics(userId: string): Promise<HealthMetricsBody | null> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('health_metrics_body')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return (data || null) as HealthMetricsBody | null
  } catch (error) {
    console.error('Error fetching latest body metrics:', error)
    return null
  }
}

// State of Mind
export async function getStateOfMindForDate(userId: string, date: string): Promise<StateOfMind[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('state_of_mind')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', `${date}T00:00:00`)
      .lt('recorded_at', `${date}T23:59:59.999`)
      .order('recorded_at', { ascending: false })

    if (error) throw error
    return (data || []) as StateOfMind[]
  } catch (error) {
    console.error('Error fetching state of mind for date:', error)
    return []
  }
}

export async function getStateOfMindTrends(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; avg_valence: number }[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('state_of_mind')
      .select('recorded_at, valence')
      .eq('user_id', userId)
      .gte('recorded_at', `${startDate}T00:00:00`)
      .lte('recorded_at', `${endDate}T23:59:59.999`)
      .order('recorded_at', { ascending: true })

    if (error) throw error
    if (!data || !data.length) return []

    // Group by date and average
    const byDate = new Map<string, { total: number; count: number }>()
    for (const row of data as StateOfMind[]) {
      const dateKey = row.recorded_at.slice(0, 10)
      const existing = byDate.get(dateKey) || { total: 0, count: 0 }
      existing.total += row.valence
      existing.count++
      byDate.set(dateKey, existing)
    }

    return Array.from(byDate.entries()).map(([date, { total, count }]) => ({
      date,
      avg_valence: total / count,
    }))
  } catch (error) {
    console.error('Error fetching state of mind trends:', error)
    return []
  }
}

export async function getStateOfMindLabelCounts(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ label: string; count: number }[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('state_of_mind')
      .select('labels')
      .eq('user_id', userId)
      .gte('recorded_at', `${startDate}T00:00:00`)
      .lte('recorded_at', `${endDate}T23:59:59.999`)

    if (error) throw error
    if (!data) return []

    const labelCounts = new Map<string, number>()
    for (const row of data as { labels: string[] | null }[]) {
      if (!row.labels) continue
      for (const label of row.labels) {
        labelCounts.set(label, (labelCounts.get(label) || 0) + 1)
      }
    }

    return Array.from(labelCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  } catch (error) {
    console.error('Error fetching state of mind label counts:', error)
    return []
  }
}

export async function getStateOfMindAssociationCounts(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ association: string; count: number }[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('state_of_mind')
      .select('associations')
      .eq('user_id', userId)
      .gte('recorded_at', `${startDate}T00:00:00`)
      .lte('recorded_at', `${endDate}T23:59:59.999`)

    if (error) throw error
    if (!data) return []

    const counts = new Map<string, number>()
    for (const row of data as { associations: string[] | null }[]) {
      if (!row.associations) continue
      for (const assoc of row.associations) {
        counts.set(assoc, (counts.get(assoc) || 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .map(([association, count]) => ({ association, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  } catch (error) {
    console.error('Error fetching state of mind association counts:', error)
    return []
  }
}

// ECG readings
export async function getEcgReadings(userId: string): Promise<EcgReading[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('ecg_readings')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })

    if (error) throw error
    return (data || []) as EcgReading[]
  } catch (error) {
    console.error('Error fetching ECG readings:', error)
    return []
  }
}

// Heart rate notifications
export async function getHeartRateNotifications(userId: string): Promise<HeartRateNotification[]> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('heart_rate_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })

    if (error) throw error
    return (data || []) as HeartRateNotification[]
  } catch (error) {
    console.error('Error fetching heart rate notifications:', error)
    return []
  }
}

// Profile stats
export async function getProfileStats(userId: string) {
  try {
    const supabaseAny = supabase as any

    const [foodCount, moodCount, daysActive, streakRow] = await Promise.all([
      supabaseAny
        .from('food_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAny
        .from('mood_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabaseAny
        .from('health_metrics_daily')
        .select('date', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('steps', 0),
      supabaseAny
        .from('streaks')
        .select('current_streak, longest_streak')
        .eq('user_id', userId)
        .maybeSingle(),
    ])

    return {
      totalEntries: (foodCount.count ?? 0) + (moodCount.count ?? 0),
      daysActive: daysActive.count ?? 0,
      currentStreak: streakRow.data?.current_streak ?? 0,
      longestStreak: streakRow.data?.longest_streak ?? 0,
    }
  } catch (error) {
    console.error('Error fetching profile stats:', error)
    return { totalEntries: 0, daysActive: 0, currentStreak: 0, longestStreak: 0 }
  }
}

// Recent entries (last 7 days)
export async function getRecentEntries(userId: string, limit: number = 10) {
  try {
    // Handle demo mode
    if (isDemoMode()) {
      console.warn('Demo mode: Returning mock recent entries')
      return [
        {
          id: 'demo-1',
          user_id: userId,
          date: format(new Date(), 'yyyy-MM-dd'),
          meal: 'lunch' as MealType,
          photo_url: null,
          voice_url: null,
          ai_raw: null,
          food_labels: ['Grilled chicken', 'Brown rice', 'Broccoli'],
          calories: 520,
          macros: { protein: 42, carbs: 38, fat: 18 },
          note: null,
          journal_mode: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    }

    const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
    const today = format(new Date(), 'yyyy-MM-dd')
    
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo)
      .lte('date', today)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching recent entries:', error)
    
    // Fallback to empty array on error
    console.warn('Falling back to empty recent entries')
    return []
  }
}
