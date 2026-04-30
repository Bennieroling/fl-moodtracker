'use client'

import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import {
  getBodyMetrics,
  getDailyActivityRange,
  getFoodEntriesForDateRange,
  getSleepEvents,
} from '@/lib/database'
import { createClient } from '@/lib/supabase-browser'

// Last-7-days numeric series for each dashboard HighlightCard.
// Missing days are skipped — Sparkline degrades gracefully when length < 2.

export interface DashboardSparklines {
  activity: number[]
  sleep: number[]
  mood: number[]
  body: number[]
  nutrition: number[]
  vitals: number[]
}

const EMPTY: DashboardSparklines = {
  activity: [],
  sleep: [],
  mood: [],
  body: [],
  nutrition: [],
  vitals: [],
}

async function loadSparklines(userId: string, anchor: string): Promise<DashboardSparklines> {
  const end = parseISO(anchor)
  const start = subDays(end, 6)
  const startStr = format(start, 'yyyy-MM-dd')
  const endStr = anchor
  const supabase = createClient()

  const [activity, sleep, body, food, moodRows] = await Promise.all([
    getDailyActivityRange(userId, startStr, endStr),
    getSleepEvents(userId, startStr, endStr),
    getBodyMetrics(userId, startStr, endStr),
    getFoodEntriesForDateRange(userId, startStr, endStr),
    supabase
      .from('mood_entries')
      .select('date, mood_score')
      .eq('user_id', userId)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: true })
      .then(({ data }) => data ?? []),
  ])

  // Activity (steps), Vitals (HRV) — derived from the same DailyActivity rows
  const activitySteps = activity
    .map((row) => (row.steps != null ? Number(row.steps) : null))
    .filter((v): v is number => v != null)
  const vitalsHrv = activity
    .map((row) => (row.hrv != null ? Number(row.hrv) : null))
    .filter((v): v is number => v != null)

  // Sleep — total hours per night
  const sleepHours = sleep
    .map((row) => (row.total_sleep_hours != null ? Number(row.total_sleep_hours) : null))
    .filter((v): v is number => v != null)

  // Body — weight kg
  const bodyWeight = body
    .map((row) => (row.weight_kg != null ? Number(row.weight_kg) : null))
    .filter((v): v is number => v != null)

  // Nutrition — sum calories per day
  const caloriesByDay = new Map<string, number>()
  for (const f of food ?? []) {
    if (f.calories == null) continue
    const cur = caloriesByDay.get(f.date) ?? 0
    caloriesByDay.set(f.date, cur + Number(f.calories))
  }
  const nutritionCalories = Array.from(caloriesByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)

  // Mood — daily score (already one row per day per user_id by schema unique key)
  const mood = moodRows
    .map((row) => (row.mood_score != null ? Number(row.mood_score) : null))
    .filter((v): v is number => v != null)

  return {
    activity: activitySteps,
    sleep: sleepHours,
    mood,
    body: bodyWeight,
    nutrition: nutritionCalories,
    vitals: vitalsHrv,
  }
}

export function useDashboardSparklines() {
  const { user } = useAuth()
  const { filters } = useFilters()
  const date = filters.dashboard.date

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-sparklines', user?.id, date],
    queryFn: () => loadSparklines(user!.id, date),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })

  return { sparklines: data ?? EMPTY, loading: isLoading }
}
