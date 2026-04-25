'use client'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import {
  DailyActivity,
  getDashboardSummary,
  getDailyActivityByDate,
  getRecentEntries,
  getUserTargets,
  getStateOfMindForDate,
  getHeartRateNotifications,
} from '@/lib/database'
import {
  FoodEntry,
  DailyTargets,
  DEFAULT_DAILY_TARGETS,
  StateOfMind,
  HeartRateNotification,
} from '@/lib/types/database'
import { useQuery } from '@tanstack/react-query'

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
  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', userId, date],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const [summary, recentEntries, activity, targets, stateOfMind, heartRateNotifications] =
        await Promise.all([
          getDashboardSummary(userId, date),
          getRecentEntries(userId, 5),
          getDailyActivityByDate(userId, date),
          getUserTargets(userId),
          getStateOfMindForDate(userId, date),
          getHeartRateNotifications(userId),
        ])
      return {
        summary: summary ?? defaultSummary,
        recentEntries: (recentEntries as FoodEntry[]) ?? [],
        activity: activity ?? null,
        targets: targets ?? { ...DEFAULT_DAILY_TARGETS },
        stateOfMind: stateOfMind ?? [],
        heartRateNotifications: heartRateNotifications ?? [],
      }
    },
    enabled: !!userId,
  })

  return { data: data ?? defaultData, loading, error: error as Error | null, refetch }
}
