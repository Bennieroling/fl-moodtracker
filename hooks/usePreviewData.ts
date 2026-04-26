'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import {
  DailyActivity,
  getBodyMetrics,
  getDailyActivityRange,
  getExerciseEventIsoRange,
  getExerciseEventsForRange,
  getSleepEvents,
  getStateOfMindTrends,
} from '@/lib/database'
import { ExerciseEvent, HealthMetricsBody, SleepEvent } from '@/lib/types/database'

export interface PreviewData {
  today: string
  daily: DailyActivity[]
  sleep: SleepEvent[]
  mood: { date: string; avg_valence: number }[]
  exercise: ExerciseEvent[]
  body: HealthMetricsBody[]
}

const emptyData: PreviewData = {
  today: '',
  daily: [],
  sleep: [],
  mood: [],
  exercise: [],
  body: [],
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function usePreviewData() {
  const { user } = useAuth()
  const userId = user?.id

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['preview-data', userId],
    queryFn: async (): Promise<PreviewData> => {
      if (!userId) throw new Error('No user')

      const today = new Date()
      const todayStr = isoDate(today)
      const sixtyDaysAgo = isoDate(shiftDays(today, -60))
      const fourteenDaysAgo = isoDate(shiftDays(today, -14))

      const exerciseIso = getExerciseEventIsoRange(fourteenDaysAgo, todayStr)

      const [daily, sleep, mood, exercise, body] = await Promise.all([
        getDailyActivityRange(userId, sixtyDaysAgo, todayStr),
        getSleepEvents(userId, sixtyDaysAgo, todayStr),
        getStateOfMindTrends(userId, fourteenDaysAgo, todayStr),
        getExerciseEventsForRange(userId, exerciseIso.startIso, exerciseIso.endIso),
        getBodyMetrics(userId, fourteenDaysAgo, todayStr),
      ])

      return {
        today: todayStr,
        daily,
        sleep,
        mood,
        exercise,
        body,
      }
    },
    enabled: !!userId,
    staleTime: 60_000,
  })

  return {
    data: data ?? emptyData,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  }
}
