'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import {
  getBodyMetrics,
  getDailyActivityRange,
  getEcgReadings,
  getHeartRateNotifications,
  getLatestBodyMetrics,
  getLatestSleepEvent,
  getSleepEvents,
} from '@/lib/database'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

export function useHealthData() {
  const { user } = useAuth()
  const { filters, setHealthFilters } = useFilters()
  const filterState = filters.health

  const anchorDateObj = useMemo(
    () => parseAnchorDate(filterState.anchorDate),
    [filterState.anchorDate],
  )
  const rangeBounds = useMemo(
    () => computeRangeBounds(filterState.mode, anchorDateObj),
    [filterState.mode, anchorDateObj],
  )
  const rangeStartDate = useMemo(() => format(rangeBounds.start, 'yyyy-MM-dd'), [rangeBounds.start])
  const rangeEndDate = useMemo(() => format(rangeBounds.end, 'yyyy-MM-dd'), [rangeBounds.end])
  const rangeLabel = useMemo(
    () => formatRangeLabel(filterState.mode, rangeBounds.start, rangeBounds.end),
    [filterState.mode, rangeBounds.start, rangeBounds.end],
  )

  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'health',
      userId,
      filterState.mode,
      filterState.anchorDate,
      rangeStartDate,
      rangeEndDate,
    ],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const [
        bodySeries,
        latestBody,
        dailyActivity,
        ecgReadings,
        heartRateNotifications,
        sleepEvents,
        latestSleep,
      ] = await Promise.all([
        getBodyMetrics(userId, rangeStartDate, rangeEndDate),
        getLatestBodyMetrics(userId),
        getDailyActivityRange(userId, rangeStartDate, rangeEndDate),
        getEcgReadings(userId),
        getHeartRateNotifications(userId),
        getSleepEvents(userId, rangeStartDate, rangeEndDate),
        getLatestSleepEvent(userId),
      ])
      return {
        bodySeries,
        latestBody,
        dailyActivity,
        ecgReadings,
        heartRateNotifications,
        sleepEvents,
        latestSleep,
      }
    },
    enabled: !!userId,
  })

  const bodySeries = data?.bodySeries ?? []
  const latestBody = data?.latestBody ?? null
  const dailyActivity = data?.dailyActivity ?? []
  const ecgReadings = data?.ecgReadings ?? []
  const heartRateNotifications = data?.heartRateNotifications ?? []
  const sleepEvents = data?.sleepEvents ?? []
  const latestSleep = data?.latestSleep ?? null

  const weightSeries = useMemo(
    () =>
      bodySeries
        .filter((row) => row.weight_kg != null)
        .map((row) => ({ date: row.date, weight_kg: Number(row.weight_kg) })),
    [bodySeries],
  )

  const bodyFatSeries = useMemo(
    () =>
      bodySeries
        .filter((row) => row.body_fat_pct != null)
        .map((row) => ({ date: row.date, body_fat_pct: Number(row.body_fat_pct) })),
    [bodySeries],
  )

  const healthSummary = useMemo(() => {
    let restingHeartRateTotal = 0
    let restingHeartRateCount = 0
    let hrvTotal = 0
    let hrvCount = 0
    for (const day of dailyActivity) {
      if (day.resting_heart_rate != null) {
        restingHeartRateTotal += Number(day.resting_heart_rate)
        restingHeartRateCount++
      }
      if (day.hrv != null) {
        hrvTotal += Number(day.hrv)
        hrvCount++
      }
    }
    return {
      restingHeartRateAvg: restingHeartRateCount
        ? restingHeartRateTotal / restingHeartRateCount
        : null,
      hrvAvg: hrvCount ? hrvTotal / hrvCount : null,
    }
  }, [dailyActivity])

  const sleepSummary = useMemo(() => {
    let totalSum = 0
    let totalCount = 0
    let remSum = 0
    let remCount = 0
    let deepSum = 0
    let deepCount = 0
    for (const row of sleepEvents) {
      if (row.total_sleep_hours != null) {
        totalSum += Number(row.total_sleep_hours)
        totalCount++
      }
      if (row.rem_hours != null) {
        remSum += Number(row.rem_hours)
        remCount++
      }
      if (row.deep_hours != null) {
        deepSum += Number(row.deep_hours)
        deepCount++
      }
    }
    return {
      totalAvg: totalCount ? totalSum / totalCount : null,
      remAvg: remCount ? remSum / remCount : null,
      deepAvg: deepCount ? deepSum / deepCount : null,
    }
  }, [sleepEvents])

  const wristTempSeries = useMemo(
    () =>
      sleepEvents
        .filter((row) => row.wrist_temperature != null)
        .map((row) => ({ date: row.date, wrist_temperature: Number(row.wrist_temperature) })),
    [sleepEvents],
  )

  const setRangeMode = useCallback(
    (mode: RangeMode) => {
      setHealthFilters((prev) => {
        const normalizedAnchor = format(
          normalizeDateForMode(parseAnchorDate(prev.anchorDate), mode),
          'yyyy-MM-dd',
        )
        return { mode, anchorDate: normalizedAnchor }
      })
    },
    [setHealthFilters],
  )

  const setAnchorDate = useCallback(
    (date: Date) => {
      setHealthFilters((prev) => ({
        ...prev,
        anchorDate: format(normalizeDateForMode(date, prev.mode), 'yyyy-MM-dd'),
      }))
    },
    [setHealthFilters],
  )

  const shiftRange = useCallback(
    (direction: number) => {
      setHealthFilters((prev) => {
        const base = parseAnchorDate(prev.anchorDate)
        const shifted = shiftAnchor(base, prev.mode, direction)
        return {
          ...prev,
          anchorDate: format(normalizeDateForMode(shifted, prev.mode), 'yyyy-MM-dd'),
        }
      })
    },
    [setHealthFilters],
  )

  return {
    bodySeries,
    latestBody,
    weightSeries,
    bodyFatSeries,
    dailyActivity,
    ecgReadings,
    heartRateNotifications,
    sleepEvents,
    latestSleep,
    wristTempSeries,
    healthSummary,
    sleepSummary,
    loading,
    error: error as Error | null,
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
