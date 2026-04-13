'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { getBodyMetrics, getLatestBodyMetrics } from '@/lib/database'
import { HealthMetricsBody } from '@/lib/types/database'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

export function useBodyData() {
  const { user } = useAuth()
  const { filters, setExerciseFilters } = useFilters()
  const filterState = filters.exercise

  const anchorDateObj = useMemo(() => parseAnchorDate(filterState.anchorDate), [filterState.anchorDate])
  const rangeBounds = useMemo(() => computeRangeBounds(filterState.mode, anchorDateObj), [filterState.mode, anchorDateObj])
  const rangeStartDate = useMemo(() => format(rangeBounds.start, 'yyyy-MM-dd'), [rangeBounds.start])
  const rangeEndDate = useMemo(() => format(rangeBounds.end, 'yyyy-MM-dd'), [rangeBounds.end])
  const rangeLabel = useMemo(() => formatRangeLabel(filterState.mode, rangeBounds.start, rangeBounds.end), [filterState.mode, rangeBounds.start, rangeBounds.end])

  const userId = user?.id

  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['body', userId, filterState.mode, filterState.anchorDate, rangeStartDate, rangeEndDate],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const [series, latest] = await Promise.all([
        getBodyMetrics(userId, rangeStartDate, rangeEndDate),
        getLatestBodyMetrics(userId),
      ])
      return { series, latest }
    },
    enabled: !!userId,
  })

  const series = data?.series ?? []
  const latest = data?.latest ?? null

  const weightSeries = useMemo(
    () => series.filter((row) => row.weight_kg != null).map((row) => ({ date: row.date, weight_kg: Number(row.weight_kg) })),
    [series]
  )

  const bodyFatSeries = useMemo(
    () => series.filter((row) => row.body_fat_pct != null).map((row) => ({ date: row.date, body_fat_pct: Number(row.body_fat_pct) })),
    [series]
  )

  const setRangeMode = useCallback(
    (mode: RangeMode) => {
      setExerciseFilters((prev) => {
        const normalizedAnchor = format(normalizeDateForMode(parseAnchorDate(prev.anchorDate), mode), 'yyyy-MM-dd')
        return { mode, anchorDate: normalizedAnchor }
      })
    },
    [setExerciseFilters]
  )

  const setAnchorDate = useCallback(
    (date: Date) => {
      setExerciseFilters((prev) => ({
        ...prev,
        anchorDate: format(normalizeDateForMode(date, prev.mode), 'yyyy-MM-dd'),
      }))
    },
    [setExerciseFilters]
  )

  const shiftRange = useCallback(
    (direction: number) => {
      setExerciseFilters((prev) => {
        const base = parseAnchorDate(prev.anchorDate)
        const shifted = shiftAnchor(base, prev.mode, direction)
        return { ...prev, anchorDate: format(normalizeDateForMode(shifted, prev.mode), 'yyyy-MM-dd') }
      })
    },
    [setExerciseFilters]
  )

  return {
    series, weightSeries, bodyFatSeries, latest, latestWeight: latest?.weight_kg ?? null,
    loading, error: error as Error | null, refetch,
    range: { mode: filterState.mode, anchorDate: filterState.anchorDate, startDate: rangeStartDate, endDate: rangeEndDate, label: rangeLabel },
    shiftRange, setRangeMode, setAnchorDate,
  }
}
