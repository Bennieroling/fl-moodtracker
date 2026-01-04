'use client'

import { useMemo, useCallback } from 'react'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { DailyActivity, getDashboardSummary, getDailyActivityByDate } from '@/lib/database'
import { FoodEntry } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'

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

  const queryKey = useMemo(() => ['historic', user?.id, selectedDate], [user?.id, selectedDate])

  const fetcher = useCallback(async () => {
    if (!user?.id) return defaultHistoricData
    const [summary, activity] = await Promise.all([
      getDashboardSummary(user.id, selectedDate),
      getDailyActivityByDate(user.id, selectedDate),
    ])
    return {
      summary: summary ?? defaultSummary,
      activity: activity ?? null,
    }
  }, [user?.id, selectedDate])

  return useFilterQuery<HistoricData>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: defaultHistoricData,
  })
}
