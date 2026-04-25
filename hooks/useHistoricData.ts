'use client'

import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { DailyActivity, getDashboardSummary, getDailyActivityByDate } from '@/lib/database'
import { FoodEntry } from '@/lib/types/database'

interface HistoricData {
  summary: {
    mood: number | null
    totalCalories: number
    mealsLogged: number
    macros: { protein: number; carbs: number; fat: number }
    foodEntries: FoodEntry[]
  }
  activity: DailyActivity | null
}

const defaultSummary: HistoricData['summary'] = {
  mood: null,
  totalCalories: 0,
  mealsLogged: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
  foodEntries: [],
}

const defaultHistoricData: HistoricData = {
  summary: defaultSummary,
  activity: null,
}

export const useHistoricData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const selectedDate = filters.historic.date
  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historic', userId, selectedDate],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const [summary, activity] = await Promise.all([
        getDashboardSummary(userId, selectedDate),
        getDailyActivityByDate(userId, selectedDate),
      ])
      return { summary: summary ?? defaultSummary, activity: activity ?? null }
    },
    enabled: !!userId,
  })

  return { data: data ?? defaultHistoricData, loading, error: error as Error | null, refetch }
}
