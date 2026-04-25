'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseISO } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import {
  getMoodEntriesForMonth,
  getMoodEntryByDate,
  getFoodEntriesForDate,
  getDailyActivityByDate,
  getStateOfMindForDate,
  DailyActivity,
} from '@/lib/database'
import { MoodEntry, FoodEntry, StateOfMind } from '@/lib/types/database'

export const useCalendarMonthData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const { currentMonth } = filters.calendar
  const currentMonthDate = useMemo(() => parseISO(currentMonth), [currentMonth])
  const year = currentMonthDate.getFullYear()
  const month = currentMonthDate.getMonth() + 1
  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['calendar-month', userId, currentMonth],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const entries = await getMoodEntriesForMonth(userId, year, month)
      return (entries as MoodEntry[]) ?? []
    },
    enabled: !!userId,
  })

  return { data: data ?? [], loading, error: error as Error | null, refetch }
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
  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['calendar-day', userId, selectedDate],
    queryFn: async () => {
      if (!userId || !selectedDate) throw new Error('No user or date')
      const [mood, food, activity, stateOfMind] = await Promise.all([
        getMoodEntryByDate(userId, selectedDate),
        getFoodEntriesForDate(userId, selectedDate),
        getDailyActivityByDate(userId, selectedDate),
        getStateOfMindForDate(userId, selectedDate),
      ])
      return {
        mood: (mood as MoodEntry | null) ?? null,
        foodEntries: (food as FoodEntry[] | null) ?? [],
        activity: (activity as DailyActivity | null) ?? null,
        stateOfMind: stateOfMind ?? [],
      }
    },
    enabled: !!(userId && selectedDate),
  })

  return { data: data ?? defaultDayData, loading, error: error as Error | null, refetch }
}
