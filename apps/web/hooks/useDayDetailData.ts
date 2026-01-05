'use client'

import { useMemo, useCallback } from 'react'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { getFoodEntriesForDate, getMoodEntryByDate } from '@/lib/database'
import { FoodEntry, MoodEntry } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'

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

  const queryKey = useMemo(() => ['day-detail', user?.id, date], [user?.id, date])

  const fetcher = useCallback(async () => {
    if (!user?.id || !date) return defaultData
    const [mood, food] = await Promise.all([
      getMoodEntryByDate(user.id, date),
      getFoodEntriesForDate(user.id, date),
    ])
    const moodEntry = (mood as MoodEntry | null) ?? null
    const foodEntries = (food as FoodEntry[] | null) ?? []
    return {
      moodEntry,
      foodEntries,
    }
  }, [user?.id, date])

  return useFilterQuery<DayDetailData>(queryKey, fetcher, {
    enabled: !!(user?.id && date),
    initialData: defaultData,
  })
}
