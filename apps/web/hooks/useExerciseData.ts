'use client'

import { useMemo, useCallback } from 'react'
import { format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import {
  DailyActivity,
  DailyActivityAggregate,
  getActivityAggregates,
  getDailyActivityRange,
  getExerciseEventIsoRange,
  getExerciseEventsForRange,
} from '@/lib/database'
import { ExerciseEvent } from '@/lib/types/database'
import { useFilterQuery } from '@/hooks/useFilterQuery'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

interface ExerciseQueryResult {
  workouts: ExerciseEvent[]
  dailySeries: DailyActivity[]
  aggregates: {
    week: DailyActivityAggregate[]
    month: DailyActivityAggregate[]
    year: DailyActivityAggregate[]
  }
}

const defaultAggregates = { week: [], month: [], year: [] }

export function useExerciseData() {
  const { user } = useAuth()
  const { filters, setExerciseFilters } = useFilters()
  const filterState = filters.exercise

  const anchorDateObj = useMemo(() => parseAnchorDate(filterState.anchorDate), [filterState.anchorDate])
  const rangeBounds = useMemo(() => computeRangeBounds(filterState.mode, anchorDateObj), [filterState.mode, anchorDateObj])
  const rangeStartDate = format(rangeBounds.start, 'yyyy-MM-dd')
  const rangeEndDate = format(rangeBounds.end, 'yyyy-MM-dd')
  const rangeLabel = formatRangeLabel(filterState.mode, rangeBounds.start, rangeBounds.end)
  const eventRange = useMemo(
    () => getExerciseEventIsoRange(rangeStartDate, rangeEndDate),
    [rangeStartDate, rangeEndDate]
  )

  const queryKey = useMemo(
    () => ['exercise', user?.id, filterState.mode, filterState.anchorDate, rangeStartDate, rangeEndDate],
    [user?.id, filterState.mode, filterState.anchorDate, rangeStartDate, rangeEndDate]
  )

  const fetcher = useCallback(async () => {
    if (!user?.id) {
      return { workouts: [], dailySeries: [], aggregates: defaultAggregates }
    }
    const workouts = await getExerciseEventsForRange(user.id, eventRange.startIso, eventRange.endIso)
    const [dailySeries, weekAgg, monthAgg, yearAgg] = await Promise.all([
      getDailyActivityRange(user.id, rangeStartDate, rangeEndDate, { workouts }),
      getActivityAggregates(user.id, 'week', 12, rangeStartDate, rangeEndDate),
      getActivityAggregates(user.id, 'month', 12, rangeStartDate, rangeEndDate),
      getActivityAggregates(user.id, 'year', 5, rangeStartDate, rangeEndDate),
    ])
    return {
      workouts,
      dailySeries,
      aggregates: {
        week: weekAgg,
        month: monthAgg,
        year: yearAgg,
      },
    }
  }, [user?.id, eventRange.startIso, eventRange.endIso, rangeStartDate, rangeEndDate])

  const { data, loading, error, refetch } = useFilterQuery<ExerciseQueryResult>(queryKey, fetcher, {
    enabled: !!user?.id,
    initialData: { workouts: [], dailySeries: [], aggregates: defaultAggregates },
  })

  const workouts = useMemo(() => (data ? data.workouts : []), [data])
  const dailySeries = useMemo(() => (data ? data.dailySeries : []), [data])
  const aggregates = data?.aggregates ?? defaultAggregates
  const exerciseSummary = useMemo(() => summarizeWorkouts(workouts), [workouts])
  const healthSummary = useMemo(() => summarizeHealth(dailySeries), [dailySeries])

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
    workouts,
    dailySeries,
    aggregates,
    loading,
    error,
    refetch,
    healthSummary,
    exerciseSummary,
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

const summarizeWorkouts = (events: ExerciseEvent[]) =>
  events.reduce(
    (acc, workout) => {
      acc.minutes += numberFromValue(workout.total_minutes)
      acc.moveMinutes += numberFromValue(workout.move_minutes)
      acc.activeEnergy += numberFromValue(workout.active_energy_kcal)
      acc.distance += numberFromValue(workout.distance_km)
      acc.elevation += numberFromValue(workout.elevation_gain_m)
      acc.trimp += numberFromValue(workout.trimp)
      return acc
    },
    { minutes: 0, moveMinutes: 0, activeEnergy: 0, distance: 0, elevation: 0, trimp: 0 }
  )

const summarizeHealth = (series: DailyActivity[]) => {
  let steps = 0
  let restingHeartRateTotal = 0
  let restingHeartRateCount = 0
  let hrvTotal = 0
  let hrvCount = 0
  let vo2Total = 0
  let vo2Count = 0
  let standHoursTotal = 0
  let standHoursCount = 0
  const hasHealthData = series.some(hasHealthMetrics)

  for (const day of series) {
    steps += numberFromValue(day.steps)
    if (day.resting_heart_rate !== null && day.resting_heart_rate !== undefined) {
      restingHeartRateTotal += Number(day.resting_heart_rate)
      restingHeartRateCount++
    }
    if (day.hrv !== null && day.hrv !== undefined) {
      hrvTotal += Number(day.hrv)
      hrvCount++
    }
    if (day.vo2max !== null && day.vo2max !== undefined) {
      vo2Total += Number(day.vo2max)
      vo2Count++
    }
    if (day.stand_hours !== null && day.stand_hours !== undefined) {
      standHoursTotal += Number(day.stand_hours)
      standHoursCount++
    }
  }

  return {
    steps,
    restingHeartRateAvg: restingHeartRateCount ? restingHeartRateTotal / restingHeartRateCount : null,
    hrvAvg: hrvCount ? hrvTotal / hrvCount : null,
    vo2maxAvg: vo2Count ? vo2Total / vo2Count : null,
    standHoursAvg: standHoursCount ? standHoursTotal / standHoursCount : null,
    hasHealthData,
  }
}

const hasHealthMetrics = (day: DailyActivity) =>
  day.total_energy_kcal !== null ||
  day.resting_energy_kcal !== null ||
  day.steps !== null ||
  day.resting_heart_rate !== null ||
  day.hrv !== null ||
  day.vo2max !== null

const numberFromValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
