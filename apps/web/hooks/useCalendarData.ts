'use client'

import { useMemo, useCallback } from 'react'
import { parseISO } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { getMoodEntriesForMonth, getMoodEntryByDate, getFoodEntriesForDate, getDailyActivityByDate, getStateOfMindForDate, DailyActivity } from '@/lib/database'
import { MoodEntry, FoodEntry, StateOfMind } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'

export const useCalendarMonthData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const { currentMonth } = filters.calendar
  const currentMonthDate = useMemo(() => parseISO(currentMonth), [currentMonth])
  const year = currentMonthDate.getFullYear()
  const month = currentMonthDate.getMonth() + 1

  const queryKey = useMemo(() => ['calendar-month', user?.id, currentMonth], [user?.id, currentMonth])

  const fetcher = useCallback(async () => {
    if (!user?.id) return [] as MoodEntry[]
    const entries = await getMoodEntriesForMonth(user.id, year, month)
    return entries as MoodEntry[]
  }, [user?.id, year, month])

  return useFilterQuery<MoodEntry[]>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: [],
  })
}

interface CalendarDayData {
  mood: MoodEntry | null
  foodEntries: FoodEntry[]
  activity: DailyActivity | null
  stateOfMind: StateOfMind[]
}

const defaultDayData: CalendarDayData = {
  mood: null,
  foodEntries: [],
  activity: null,
  stateOfMind: [],
}

export const useCalendarDayData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const selectedDate = filters.calendar.selectedDate

  const queryKey = useMemo(() => ['calendar-day', user?.id, selectedDate], [user?.id, selectedDate])

  const fetcher = useCallback(async () => {
    if (!user?.id || !selectedDate) return defaultDayData
    const [mood, food, activity, stateOfMind] = await Promise.all([
      getMoodEntryByDate(user.id, selectedDate),
      getFoodEntriesForDate(user.id, selectedDate),
      getDailyActivityByDate(user.id, selectedDate),
      getStateOfMindForDate(user.id, selectedDate),
    ])
    const moodEntry = (mood as MoodEntry | null) ?? null
    const foodEntries = (food as FoodEntry[] | null) ?? []
    const activityEntry = (activity as DailyActivity | null) ?? null
    return {
      mood: moodEntry,
      foodEntries,
      activity: activityEntry,
      stateOfMind: stateOfMind ?? [],
    }
  }, [user?.id, selectedDate])

  return useFilterQuery<CalendarDayData>(queryKey, fetcher, {
    enabled: !!(user?.id && selectedDate),
    initialData: defaultDayData,
  })
}
