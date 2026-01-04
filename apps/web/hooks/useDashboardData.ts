'use client'

import { useMemo, useCallback } from 'react'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { DailyActivity, getDashboardSummary, getDailyActivityByDate, getRecentEntries } from '@/lib/database'
import { FoodEntry } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'

interface DashboardData {
  summary: {
    mood: number | null
    totalCalories: number
    mealsLogged: number
    macros: { protein: number; carbs: number; fat: number }
    foodEntries: FoodEntry[]
  }
  recentEntries: FoodEntry[]
  activity: DailyActivity | null
}

const defaultSummary = {
  mood: null,
  totalCalories: 0,
  mealsLogged: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
  foodEntries: [],
}

const defaultData: DashboardData = {
  summary: defaultSummary,
  recentEntries: [],
  activity: null,
}

export const useDashboardData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const date = filters.dashboard.date

  const queryKey = useMemo(() => ['dashboard', user?.id, date], [user?.id, date])

  const fetcher = useCallback(async () => {
    if (!user?.id) return defaultData
    const [summary, recentEntries, activity] = await Promise.all([
      getDashboardSummary(user.id, date),
      getRecentEntries(user.id, 5),
      getDailyActivityByDate(user.id, date),
    ])
    return {
      summary: summary ?? defaultSummary,
      recentEntries: (recentEntries as FoodEntry[]) ?? [],
      activity: activity ?? null,
    }
  }, [user?.id, date])

  return useFilterQuery<DashboardData>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: defaultData,
  })
}
