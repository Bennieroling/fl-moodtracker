'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { eachDayOfInterval, format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { createClient } from '@/lib/supabase-browser'
import {
  getStateOfMindTrends,
  getStateOfMindLabelCounts,
  getStateOfMindAssociationCounts,
} from '@/lib/database'
import { WeeklyMetrics } from '@/lib/validations'
import { FoodEntry, MoodEntry, Insight } from '@/lib/types/database'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

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
  aiReport: string | null
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
  aiReport: null,
  lastGenerated: null,
  valenceTrend: [],
  topLabels: [],
  topAssociations: [],
}

export const useInsightsData = () => {
  const { user } = useAuth()
  const { filters, setInsightsFilters } = useFilters()
  const filterState = filters.insights
  const userId = user?.id

  const anchorDateObj = useMemo(
    () => parseAnchorDate(filterState.anchorDate),
    [filterState.anchorDate],
  )
  const rangeBounds = useMemo(
    () => computeRangeBounds(filterState.mode, anchorDateObj),
    [filterState.mode, anchorDateObj],
  )
  const startDate = useMemo(() => format(rangeBounds.start, 'yyyy-MM-dd'), [rangeBounds.start])
  const endDate = useMemo(() => format(rangeBounds.end, 'yyyy-MM-dd'), [rangeBounds.end])
  const rangeLabel = useMemo(
    () => formatRangeLabel(filterState.mode, rangeBounds.start, rangeBounds.end),
    [filterState.mode, rangeBounds.start, rangeBounds.end],
  )
  const dayCount = useMemo(
    () => eachDayOfInterval({ start: rangeBounds.start, end: rangeBounds.end }).length,
    [rangeBounds.start, rangeBounds.end],
  )

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['insights', userId, filterState.mode, filterState.anchorDate, startDate, endDate],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const supabase = createClient()

      const [moodRes, foodRes, insightsRes, valenceTrend, topLabels, topAssociations] =
        await Promise.all([
          supabase
            .from('mood_entries')
            .select('date, mood_score')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date'),
          supabase
            .from('food_entries')
            .select('date, calories, macros, food_labels, journal_mode')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate),
          supabase
            .from('insights')
            .select('*')
            .eq('user_id', userId)
            .eq('period_start', startDate)
            .eq('period_end', endDate)
            .single(),
          getStateOfMindTrends(userId, startDate, endDate),
          getStateOfMindLabelCounts(userId, startDate, endDate),
          getStateOfMindAssociationCounts(userId, startDate, endDate),
        ])

      const moodData = (moodRes.data as MoodEntry[]) || []
      const foodData = (foodRes.data as FoodEntry[]) || []
      const weeklyMetrics = computeWeeklyMetrics(moodData, foodData)

      const combinedData: DailyData[] = eachDayOfInterval({
        start: rangeBounds.start,
        end: rangeBounds.end,
      }).map((currentDate) => {
        const dateStr = format(currentDate, 'yyyy-MM-dd')
        const shortDate = format(currentDate, 'M/d')
        const moodEntry = moodData.find((entry) => entry.date === dateStr)
        const dayCalories = foodData
          .filter((entry) => entry.date === dateStr)
          .reduce((sum, entry) => sum + (entry.calories || 0), 0)
        return { date: shortDate, mood: moodEntry?.mood_score || 0, calories: dayCalories }
      })

      const insightRow = (insightsRes.data as Insight | null) ?? null

      return {
        weeklyMetrics,
        weeklyData: combinedData,
        macroData: calculateMacroDistribution(foodData),
        aiSummary: insightRow?.summary_md ?? null,
        aiTips: insightRow?.tips_md ?? null,
        aiReport: insightRow?.report_md ?? null,
        lastGenerated: insightRow?.created_at ? new Date(insightRow.created_at) : null,
        valenceTrend,
        topLabels,
        topAssociations,
      }
    },
    enabled: !!userId,
  })

  const setRangeMode = useCallback(
    (mode: RangeMode) => {
      setInsightsFilters((prev) => {
        const normalizedAnchor = format(
          normalizeDateForMode(parseAnchorDate(prev.anchorDate), mode),
          'yyyy-MM-dd',
        )
        return { mode, anchorDate: normalizedAnchor }
      })
    },
    [setInsightsFilters],
  )

  const setAnchorDate = useCallback(
    (date: Date) => {
      setInsightsFilters((prev) => ({
        ...prev,
        anchorDate: format(normalizeDateForMode(date, prev.mode), 'yyyy-MM-dd'),
      }))
    },
    [setInsightsFilters],
  )

  const shiftRange = useCallback(
    (direction: number) => {
      setInsightsFilters((prev) => {
        const base = parseAnchorDate(prev.anchorDate)
        const shifted = shiftAnchor(base, prev.mode, direction)
        return {
          ...prev,
          anchorDate: format(normalizeDateForMode(shifted, prev.mode), 'yyyy-MM-dd'),
        }
      })
    },
    [setInsightsFilters],
  )

  return {
    data: data ?? defaultInsightsData,
    loading,
    error: error as Error | null,
    refetch,
    range: {
      mode: filterState.mode,
      anchorDate: filterState.anchorDate,
      startDate,
      endDate,
      label: rangeLabel,
      dayCount,
    },
    setRangeMode,
    setAnchorDate,
    shiftRange,
  }
}

const computeWeeklyMetrics = (
  moodData: Pick<MoodEntry, 'date' | 'mood_score'>[],
  foodData: Pick<FoodEntry, 'calories' | 'food_labels' | 'journal_mode'>[],
): WeeklyMetrics => {
  const moodScores = moodData
    .map((m) => m.mood_score)
    .filter((v): v is number => typeof v === 'number')
  const avgMood =
    moodScores.length > 0 ? moodScores.reduce((a, b) => a + b, 0) / moodScores.length : 0

  const trackedFood = foodData.filter((f) => !f.journal_mode)
  const kcalTotal = trackedFood.reduce((sum, f) => sum + (f.calories ?? 0), 0)

  const labelCounts = new Map<string, number>()
  for (const f of trackedFood) {
    for (const label of f.food_labels ?? []) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
    }
  }
  const topFoods = [...labelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label)

  return {
    avgMood,
    kcalTotal,
    topFoods,
    moodEntries: moodData.length,
    foodEntries: trackedFood.length,
  }
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
    { protein: 0, carbs: 0, fat: 0 },
  )
  const total = totals.protein + totals.carbs + totals.fat
  if (total === 0) return defaultMacroData
  return [
    { name: 'Protein', value: Math.round((totals.protein / total) * 100), color: '#3B82F6' },
    { name: 'Carbs', value: Math.round((totals.carbs / total) * 100), color: '#10B981' },
    { name: 'Fat', value: Math.round((totals.fat / total) * 100), color: '#F59E0B' },
  ]
}
