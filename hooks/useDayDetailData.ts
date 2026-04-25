'use client'

import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { getFoodEntriesForDate, getMoodEntryByDate } from '@/lib/database'
import { FoodEntry, MoodEntry } from '@/lib/types/database'

interface DayDetailData {
  moodEntry: MoodEntry | null
  foodEntries: FoodEntry[]
}

const defaultData: DayDetailData = {
  moodEntry: null,
  foodEntries: [],
}

export const useDayDetailData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const date = filters.day.date
  const userId = user?.id

  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['day-detail', userId, date],
    queryFn: async () => {
      if (!userId || !date) throw new Error('No user or date')
      const [mood, food] = await Promise.all([
        getMoodEntryByDate(userId, date),
        getFoodEntriesForDate(userId, date),
      ])
      return {
        moodEntry: (mood as MoodEntry | null) ?? null,
        foodEntries: (food as FoodEntry[] | null) ?? [],
      }
    },
    enabled: !!(userId && date),
  })

  return { data: data ?? defaultData, loading, error: error as Error | null, refetch }
}
