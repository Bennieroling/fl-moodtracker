'use client'

import { useMemo, useCallback } from 'react'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { DailyActivity, getDashboardSummary, getDailyActivityByDate, getRecentEntries, getUserTargets, getStateOfMindForDate, getHeartRateNotifications } from '@/lib/database'
import { FoodEntry, DailyTargets, DEFAULT_DAILY_TARGETS, StateOfMind, HeartRateNotification } from '@/lib/types/database'
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
  targets: DailyTargets
  stateOfMind: StateOfMind[]
  heartRateNotifications: HeartRateNotification[]
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
  targets: { ...DEFAULT_DAILY_TARGETS },
  stateOfMind: [],
  heartRateNotifications: [],
}

export const useDashboardData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const date = filters.dashboard.date

  const queryKey = useMemo(() => ['dashboard', user?.id, date], [user?.id, date])

  const fetcher = useCallback(async () => {
    if (!user?.id) return defaultData
    const [summary, recentEntries, activity, targets, stateOfMind, heartRateNotifications] = await Promise.all([
      getDashboardSummary(user.id, date),
      getRecentEntries(user.id, 5),
      getDailyActivityByDate(user.id, date),
      getUserTargets(user.id),
      getStateOfMindForDate(user.id, date),
      getHeartRateNotifications(user.id),
    ])
    return {
      summary: summary ?? defaultSummary,
      recentEntries: (recentEntries as FoodEntry[]) ?? [],
      activity: activity ?? null,
      targets: targets ?? { ...DEFAULT_DAILY_TARGETS },
      stateOfMind: stateOfMind ?? [],
      heartRateNotifications: heartRateNotifications ?? [],
    }
  }, [user?.id, date])

  return useFilterQuery<DashboardData>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: defaultData,
  })
}
