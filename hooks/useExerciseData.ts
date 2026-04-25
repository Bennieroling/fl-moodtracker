'use client'

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  getEcgReadings,
  getHeartRateNotifications,
} from '@/lib/database'
import {
  ExerciseEvent,
  WorkoutRouteMeta,
  EcgReading,
  HeartRateNotification,
} from '@/lib/types/database'
import { createClient } from '@/lib/supabase-browser'
import {
  RangeMode,
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseAnchorDate,
  shiftAnchor,
} from '@/lib/range-utils'

const defaultAggregates = {
  week: [] as DailyActivityAggregate[],
  month: [] as DailyActivityAggregate[],
  year: [] as DailyActivityAggregate[],
}

export function useExerciseData() {
  const { user } = useAuth()
  const { filters, setExerciseFilters } = useFilters()
  const filterState = filters.exercise

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
  const eventRange = useMemo(
    () => getExerciseEventIsoRange(rangeStartDate, rangeEndDate),
    [rangeStartDate, rangeEndDate],
  )

  const userId = user?.id

  const {
    data,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'exercise',
      userId,
      filterState.mode,
      filterState.anchorDate,
      rangeStartDate,
      rangeEndDate,
    ],
    queryFn: async () => {
      if (!userId) throw new Error('No user')
      const workouts = await getExerciseEventsForRange(
        userId,
        eventRange.startIso,
        eventRange.endIso,
      )
      const [dailySeries, weekAgg, monthAgg, yearAgg, ecgReadings, heartRateNotifications] =
        await Promise.all([
          getDailyActivityRange(userId, rangeStartDate, rangeEndDate, { workouts }),
          getActivityAggregates(userId, 'week', 12, rangeStartDate, rangeEndDate),
          getActivityAggregates(userId, 'month', 12, rangeStartDate, rangeEndDate),
          getActivityAggregates(userId, 'year', 5, rangeStartDate, rangeEndDate),
          getEcgReadings(userId),
          getHeartRateNotifications(userId),
        ])

      const routesByWorkoutId = new Map<number, WorkoutRouteMeta>()
      if (workouts.length > 0) {
        const workoutIds = workouts.map((w) => w.id)
        const supabase = createClient()
        const { data: routes } = await supabase
          .from('workout_routes')
          .select(
            'id, exercise_event_id, point_count, bounds_ne_lat, bounds_ne_lng, bounds_sw_lat, bounds_sw_lng, source',
          )
          .in('exercise_event_id', workoutIds)
        if (routes) {
          for (const route of routes) {
            routesByWorkoutId.set(route.exercise_event_id, route as WorkoutRouteMeta)
          }
        }
      }

      return {
        workouts,
        dailySeries,
        aggregates: { week: weekAgg, month: monthAgg, year: yearAgg },
        ecgReadings,
        heartRateNotifications,
        routesByWorkoutId,
      }
    },
    enabled: !!userId,
  })

  const workouts = useMemo(() => data?.workouts ?? [], [data])
  const dailySeries = useMemo(() => data?.dailySeries ?? [], [data])
  const aggregates = data?.aggregates ?? defaultAggregates
  const ecgReadings = data?.ecgReadings ?? []
  const heartRateNotifications = data?.heartRateNotifications ?? []
  const routesByWorkoutId = data?.routesByWorkoutId ?? new Map()
  const exerciseSummary = useMemo(() => summarizeWorkouts(workouts), [workouts])
  const healthSummary = useMemo(() => summarizeHealth(dailySeries), [dailySeries])

  const setRangeMode = useCallback(
    (mode: RangeMode) => {
      setExerciseFilters((prev) => {
        const normalizedAnchor = format(
          normalizeDateForMode(parseAnchorDate(prev.anchorDate), mode),
          'yyyy-MM-dd',
        )
        return { mode, anchorDate: normalizedAnchor }
      })
    },
    [setExerciseFilters],
  )

  const setAnchorDate = useCallback(
    (date: Date) => {
      setExerciseFilters((prev) => ({
        ...prev,
        anchorDate: format(normalizeDateForMode(date, prev.mode), 'yyyy-MM-dd'),
      }))
    },
    [setExerciseFilters],
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
    [setExerciseFilters],
  )

  return {
    workouts,
    dailySeries,
    aggregates,
    ecgReadings,
    heartRateNotifications,
    loading,
    error: error as Error | null,
    refetch,
    healthSummary,
    exerciseSummary,
    routesByWorkoutId,
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
      acc.minutes += numberFromValue(
        workout.total_minutes ??
          (workout.duration_seconds != null ? Math.round(workout.duration_seconds / 60) : null),
      )
      acc.moveMinutes += numberFromValue(workout.move_minutes)
      acc.activeEnergy += numberFromValue(workout.active_energy_kcal)
      acc.distance += numberFromValue(workout.distance_km)
      acc.elevation += numberFromValue(workout.elevation_gain_m)
      acc.trimp += numberFromValue(workout.trimp)
      return acc
    },
    { minutes: 0, moveMinutes: 0, activeEnergy: 0, distance: 0, elevation: 0, trimp: 0 },
  )

const summarizeHealth = (series: DailyActivity[]) => {
  let steps = 0,
    exerciseMinutes = 0,
    activeEnergy = 0
  let restingHeartRateTotal = 0,
    restingHeartRateCount = 0
  let hrvTotal = 0,
    hrvCount = 0
  let vo2Total = 0,
    vo2Count = 0
  let standHoursTotal = 0,
    standHoursCount = 0
  const hasHealthData = series.some(hasHealthMetrics)

  for (const day of series) {
    steps += numberFromValue(day.steps)
    exerciseMinutes += numberFromValue(day.exercise_time_minutes)
    activeEnergy += numberFromValue(day.active_energy_kcal)
    if (day.resting_heart_rate != null) {
      restingHeartRateTotal += Number(day.resting_heart_rate)
      restingHeartRateCount++
    }
    if (day.hrv != null) {
      hrvTotal += Number(day.hrv)
      hrvCount++
    }
    if (day.vo2max != null) {
      vo2Total += Number(day.vo2max)
      vo2Count++
    }
    const standVal =
      day.stand_hours ??
      (day.stand_time_minutes != null ? Number(day.stand_time_minutes) / 60 : null)
    if (standVal != null) {
      standHoursTotal += Number(standVal)
      standHoursCount++
    }
  }

  return {
    steps,
    exerciseMinutes,
    activeEnergy,
    restingHeartRateAvg: restingHeartRateCount
      ? restingHeartRateTotal / restingHeartRateCount
      : null,
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
