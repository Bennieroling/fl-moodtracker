'use client'

import { createClient } from '@/lib/supabase-browser'
import { MoodEntryInsert, FoodEntryInsert, MealType } from '@/lib/types/database'
import { format } from 'date-fns'

const supabase = createClient()
const restUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
  distance_km: number | null
  exercise_kcal: number | null
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
export async function getDailyActivityRange(userId: string, startDate: string, endDate: string): Promise<DailyActivity[]> {
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
    return (data || []) as DailyActivity[]
  } catch (error) {
    console.error('Error fetching daily activity range:', error)
    return []
  }
}

export async function getDailyActivityByDate(userId: string, date: string): Promise<DailyActivity | null> {
  try {
    const supabaseAny = supabase as any
    const { data, error } = await supabaseAny
      .from('v_daily_activity')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') throw error
    return (data as DailyActivity) || null
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
  if (!restUrl || !anonKey) {
    console.warn('Supabase URL or anon key missing; cannot load activity aggregates')
    return []
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) return []

    const url = new URL(`${restUrl}/rest/v1/v_daily_activity`)
    const selectColumns = [
      `period:date_trunc('${bucket}',date)`,
      'total_energy_kcal:sum(total_energy_kcal)',
      'active_energy_kcal:sum(active_energy_kcal)',
      'exercise_time_minutes:sum(exercise_time_minutes)',
      'move_time_minutes:sum(move_time_minutes)',
      'steps:sum(steps)',
      'distance_km:sum(distance_km)'
    ].join(',')

    url.searchParams.set('select', selectColumns)
    url.searchParams.append('user_id', `eq.${userId}`)
    if (startDate) url.searchParams.append('date', `gte.${startDate}`)
    if (endDate) url.searchParams.append('date', `lte.${endDate}`)
    url.searchParams.append('group', 'period')
    url.searchParams.append('order', 'period.desc')
    url.searchParams.append('limit', String(limit))

    const response = await fetch(url.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch activity aggregates: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    return result as DailyActivityAggregate[]
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
