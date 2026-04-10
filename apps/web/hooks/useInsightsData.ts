'use client'

import { useMemo, useCallback } from 'react'
import { eachDayOfInterval, format, parseISO } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { createClient } from '@/lib/supabase-browser'
import { getStateOfMindTrends, getStateOfMindLabelCounts, getStateOfMindAssociationCounts } from '@/lib/database'
import { WeeklyMetrics } from '@/lib/validations'
import { Database, FoodEntry, MoodEntry, Insight } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'

interface DailyData {
  date: string
  mood: number
  calories: number
}

interface MacroDatum {
  name: string
  value: number
  color: string
}

interface InsightsData {
  weeklyMetrics: WeeklyMetrics
  weeklyData: DailyData[]
  macroData: MacroDatum[]
  aiSummary: string | null
  aiTips: string | null
  lastGenerated: Date | null
  valenceTrend: { date: string; avg_valence: number }[]
  topLabels: { label: string; count: number }[]
  topAssociations: { association: string; count: number }[]
}

const defaultWeeklyMetrics: WeeklyMetrics = {
  avgMood: 0,
  kcalTotal: 0,
  topFoods: [],
  moodEntries: 0,
  foodEntries: 0,
}

const defaultMacroData: MacroDatum[] = [
  { name: 'Protein', value: 0, color: '#3B82F6' },
  { name: 'Carbs', value: 0, color: '#10B981' },
  { name: 'Fat', value: 0, color: '#F59E0B' },
]

export const defaultInsightsData: InsightsData = {
  weeklyMetrics: defaultWeeklyMetrics,
  weeklyData: [],
  macroData: defaultMacroData,
  aiSummary: null,
  aiTips: null,
  lastGenerated: null,
  valenceTrend: [],
  topLabels: [],
  topAssociations: [],
}

export const useInsightsData = () => {
  const { user } = useAuth()
  const { filters } = useFilters()
  const { startDate, endDate } = filters.insights

  const queryKey = useMemo(() => ['insights', user?.id, startDate, endDate], [user?.id, startDate, endDate])

  const fetcher = useCallback(async () => {
    if (!user?.id) return defaultInsightsData
    const supabase = createClient()
    const start = parseISO(startDate)
    const end = parseISO(endDate)

    const metricsArgs = {
      user_uuid: user.id,
      start_date: startDate,
      end_date: endDate,
    } satisfies Database['public']['Functions']['calculate_weekly_metrics']['Args']

    const metricsPromise = supabase.rpc(
      'calculate_weekly_metrics',
      metricsArgs as Database['public']['Functions']['calculate_weekly_metrics']['Args']
    )

    const moodPromise = supabase
      .from('mood_entries')
      .select('date, mood_score')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    const foodPromise = supabase
      .from('food_entries')
      .select('date, calories, macros')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)

    const insightsPromise = supabase
      .from('insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_start', startDate)
      .eq('period_end', endDate)
      .single()

    const [metricsRes, moodRes, foodRes, insightsRes, valenceTrend, topLabels, topAssociations] = await Promise.all([
      metricsPromise,
      moodPromise,
      foodPromise,
      insightsPromise,
      getStateOfMindTrends(user.id, startDate, endDate),
      getStateOfMindLabelCounts(user.id, startDate, endDate),
      getStateOfMindAssociationCounts(user.id, startDate, endDate),
    ])

    const weeklyMetrics = ((metricsRes.data as WeeklyMetrics | null) ?? defaultWeeklyMetrics)
    const moodData = (moodRes.data as MoodEntry[]) || []
    const foodData = (foodRes.data as FoodEntry[]) || []

    const combinedData: DailyData[] = eachDayOfInterval({ start, end }).map((currentDate) => {
      const dateStr = format(currentDate, 'yyyy-MM-dd')
      const shortDate = format(currentDate, 'M/d')
      const moodEntry = moodData.find((entry) => entry.date === dateStr)
      const dayCalories = foodData
        .filter((entry) => entry.date === dateStr)
        .reduce((sum, entry) => sum + (entry.calories || 0), 0)

      return {
        date: shortDate,
        mood: moodEntry?.mood_score || 0,
        calories: dayCalories,
      }
    })

    const macroData = calculateMacroDistribution(foodData)

    const insightRow = (insightsRes.data as Insight | null) ?? null

    return {
      weeklyMetrics,
      weeklyData: combinedData,
      macroData,
      aiSummary: insightRow?.summary_md ?? null,
      aiTips: insightRow?.tips_md ?? null,
      lastGenerated: insightRow?.created_at ? new Date(insightRow.created_at) : null,
      valenceTrend,
      topLabels,
      topAssociations,
    }
  }, [user?.id, startDate, endDate])

  return useFilterQuery<InsightsData>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: defaultInsightsData,
  })
}

const calculateMacroDistribution = (foodData: FoodEntry[]) => {
  const totals = foodData.reduce(
    (acc, entry) => {
      const macros = entry.macros || { protein: 0, carbs: 0, fat: 0 }
      return {
        protein: acc.protein + macros.protein,
        carbs: acc.carbs + macros.carbs,
        fat: acc.fat + macros.fat,
      }
    },
    { protein: 0, carbs: 0, fat: 0 }
  )

  const total = totals.protein + totals.carbs + totals.fat
  if (total === 0) return defaultMacroData

  return [
    {
      name: 'Protein',
      value: Math.round((totals.protein / total) * 100),
      color: '#3B82F6',
    },
    {
      name: 'Carbs',
      value: Math.round((totals.carbs / total) * 100),
      color: '#10B981',
    },
    {
      name: 'Fat',
      value: Math.round((totals.fat / total) * 100),
      color: '#F59E0B',
    },
  ]
}
