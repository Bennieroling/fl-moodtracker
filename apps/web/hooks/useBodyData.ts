'use client'

import { useCallback, useMemo } from 'react'
import { format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { getBodyMetrics, getLatestBodyMetrics } from '@/lib/database'
import { HealthMetricsBody } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

interface BodyQueryResult {
  series: HealthMetricsBody[]
  latest: HealthMetricsBody | null
}

const defaultResult: BodyQueryResult = { series: [], latest: null }

export function useBodyData() {
  const { user } = useAuth()
  const { filters, setExerciseFilters } = useFilters()
  // Reuse the exercise range filter so the body page shares the same anchor/mode controls.
  const filterState = filters.exercise

  const anchorDateObj = useMemo(() => parseAnchorDate(filterState.anchorDate), [filterState.anchorDate])
  const rangeBounds = useMemo(
    () => computeRangeBounds(filterState.mode, anchorDateObj),
    [filterState.mode, anchorDateObj]
  )
  const rangeStartDate = format(rangeBounds.start, 'yyyy-MM-dd')
  const rangeEndDate = format(rangeBounds.end, 'yyyy-MM-dd')
  const rangeLabel = formatRangeLabel(filterState.mode, rangeBounds.start, rangeBounds.end)

  const queryKey = useMemo(
    () => ['body', user?.id, filterState.mode, filterState.anchorDate, rangeStartDate, rangeEndDate],
    [user?.id, filterState.mode, filterState.anchorDate, rangeStartDate, rangeEndDate]
  )

  const fetcher = useCallback(async () => {
    if (!user?.id) return defaultResult
    const [series, latest] = await Promise.all([
      getBodyMetrics(user.id, rangeStartDate, rangeEndDate),
      getLatestBodyMetrics(user.id),
    ])
    return { series, latest }
  }, [user?.id, rangeStartDate, rangeEndDate])

  const { data, loading, error, refetch } = useFilterQuery<BodyQueryResult>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: defaultResult,
  })

  const series = data?.series ?? []
  const latest = data?.latest ?? null

  const weightSeries = useMemo(
    () =>
      series
        .filter((row) => row.weight_kg !== null && row.weight_kg !== undefined)
        .map((row) => ({ date: row.date, weight_kg: Number(row.weight_kg) })),
    [series]
  )

  const bodyFatSeries = useMemo(
    () =>
      series
        .filter((row) => row.body_fat_pct !== null && row.body_fat_pct !== undefined)
        .map((row) => ({ date: row.date, body_fat_pct: Number(row.body_fat_pct) })),
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
        return {
          ...prev,
          anchorDate: format(normalizeDateForMode(shifted, prev.mode), 'yyyy-MM-dd'),
        }
      })
    },
    [setExerciseFilters]
  )

  return {
    series,
    weightSeries,
    bodyFatSeries,
    latest,
    latestWeight: latest?.weight_kg ?? null,
    loading,
    error,
    refetch,
    range: {
      mode: filterState.mode,
      anchorDate: filterState.anchorDate,
      startDate: rangeStartDate,
      endDate: rangeEndDate,
      label: rangeLabel,
    },
    shiftRange,
    setRangeMode,
    setAnchorDate,
  }
}
