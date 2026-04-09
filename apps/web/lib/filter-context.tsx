'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { format, startOfMonth, subDays } from 'date-fns'
import { RangeMode, normalizeDateForMode, parseAnchorDate } from '@/lib/range-utils'

const EXERCISE_MODE_KEY = 'exercise_range_mode'
const EXERCISE_ANCHOR_KEY = 'exercise_anchor_date'

type ExerciseFilters = {
  mode: RangeMode
  anchorDate: string
}

type CalendarFilters = {
  currentMonth: string
  selectedDate: string | null
}

type DayFilters = {
  date: string | null
}

type HistoricFilters = {
  date: string
}

type DashboardFilters = {
  date: string
}

type InsightsFilters = {
  startDate: string
  endDate: string
}

export type FilterState = {
  exercise: ExerciseFilters
  calendar: CalendarFilters
  day: DayFilters
  historic: HistoricFilters
  dashboard: DashboardFilters
  insights: InsightsFilters
}

type FilterAction =
  | { type: 'SET_EXERCISE'; payload: ExerciseFilters }
  | { type: 'SET_CALENDAR'; payload: CalendarFilters }
  | { type: 'SET_DAY'; payload: DayFilters }
  | { type: 'SET_HISTORIC'; payload: HistoricFilters }
  | { type: 'SET_DASHBOARD'; payload: DashboardFilters }
  | { type: 'SET_INSIGHTS'; payload: InsightsFilters }

const todayString = format(new Date(), 'yyyy-MM-dd')

const initialState: FilterState = {
  exercise: {
    mode: 'day',
    anchorDate: todayString,
  },
  calendar: {
    currentMonth: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    selectedDate: null,
  },
  day: {
    date: todayString,
  },
  historic: {
    date: todayString,
  },
  dashboard: {
    date: todayString,
  },
  insights: {
    startDate: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
    endDate: todayString,
  },
}

const FilterContext = createContext<{
  filters: FilterState
  setExerciseFilters: (next: ExerciseFilters | ((prev: ExerciseFilters) => ExerciseFilters)) => void
  setCalendarFilters: (next: CalendarFilters | ((prev: CalendarFilters) => CalendarFilters)) => void
  setDayFilters: (next: DayFilters | ((prev: DayFilters) => DayFilters)) => void
  setHistoricFilters: (next: HistoricFilters | ((prev: HistoricFilters) => HistoricFilters)) => void
  setDashboardFilters: (next: DashboardFilters | ((prev: DashboardFilters) => DashboardFilters)) => void
  setInsightsFilters: (next: InsightsFilters | ((prev: InsightsFilters) => InsightsFilters)) => void
}>({
  filters: initialState,
  setExerciseFilters: () => {},
  setCalendarFilters: () => {},
  setDayFilters: () => {},
  setHistoricFilters: () => {},
  setDashboardFilters: () => {},
  setInsightsFilters: () => {},
})

const reducer = (state: FilterState, action: FilterAction): FilterState => {
  switch (action.type) {
    case 'SET_EXERCISE':
      return { ...state, exercise: action.payload }
    case 'SET_CALENDAR':
      return { ...state, calendar: action.payload }
    case 'SET_DAY':
      return { ...state, day: action.payload }
    case 'SET_HISTORIC':
      return { ...state, historic: action.payload }
    case 'SET_DASHBOARD':
      return { ...state, dashboard: action.payload }
    case 'SET_INSIGHTS':
      return { ...state, insights: action.payload }
    default:
      return state
  }
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setExerciseFilters = useCallback(
    (next: ExerciseFilters | ((prev: ExerciseFilters) => ExerciseFilters)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: ExerciseFilters) => ExerciseFilters)(state.exercise) : next
      if (resolved === state.exercise) return
      dispatch({
        type: 'SET_EXERCISE',
        payload: resolved,
      })
    },
    [state.exercise]
  )

  const setCalendarFilters = useCallback(
    (next: CalendarFilters | ((prev: CalendarFilters) => CalendarFilters)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: CalendarFilters) => CalendarFilters)(state.calendar) : next
      if (resolved === state.calendar) return
      dispatch({
        type: 'SET_CALENDAR',
        payload: resolved,
      })
    },
    [state.calendar]
  )

  const setDayFilters = useCallback(
    (next: DayFilters | ((prev: DayFilters) => DayFilters)) => {
      const resolved = typeof next === 'function' ? (next as (prev: DayFilters) => DayFilters)(state.day) : next
      if (resolved === state.day) return
      dispatch({
        type: 'SET_DAY',
        payload: resolved,
      })
    },
    [state.day]
  )

  const setHistoricFilters = useCallback(
    (next: HistoricFilters | ((prev: HistoricFilters) => HistoricFilters)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: HistoricFilters) => HistoricFilters)(state.historic) : next
      if (resolved === state.historic) return
      dispatch({
        type: 'SET_HISTORIC',
        payload: resolved,
      })
    },
    [state.historic]
  )

  const setDashboardFilters = useCallback(
    (next: DashboardFilters | ((prev: DashboardFilters) => DashboardFilters)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: DashboardFilters) => DashboardFilters)(state.dashboard) : next
      if (resolved === state.dashboard) return
      dispatch({
        type: 'SET_DASHBOARD',
        payload: resolved,
      })
    },
    [state.dashboard]
  )

  const setInsightsFilters = useCallback(
    (next: InsightsFilters | ((prev: InsightsFilters) => InsightsFilters)) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: InsightsFilters) => InsightsFilters)(state.insights) : next
      if (resolved === state.insights) return
      dispatch({
        type: 'SET_INSIGHTS',
        payload: resolved,
      })
    },
    [state.insights]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedMode = window.localStorage.getItem(EXERCISE_MODE_KEY) as RangeMode | null
    const storedAnchor = window.localStorage.getItem(EXERCISE_ANCHOR_KEY)
    if (!storedMode && !storedAnchor) return
    dispatch({
      type: 'SET_EXERCISE',
      payload: {
        mode: storedMode || initialState.exercise.mode,
        anchorDate: storedAnchor || initialState.exercise.anchorDate,
      },
    })
    // Run exactly once on mount to hydrate from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(EXERCISE_MODE_KEY, state.exercise.mode)
    window.localStorage.setItem(EXERCISE_ANCHOR_KEY, state.exercise.anchorDate)
  }, [state.exercise])

  const value = useMemo(
    () => ({
      filters: state,
      setExerciseFilters,
      setCalendarFilters,
      setDayFilters,
      setHistoricFilters,
      setDashboardFilters,
      setInsightsFilters,
    }),
    [state, setExerciseFilters, setCalendarFilters, setDayFilters, setHistoricFilters, setDashboardFilters, setInsightsFilters]
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export const useFilters = () => {
  const context = useContext(FilterContext)
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider')
  }
  return context
}

export const resetExerciseAnchor = (mode: RangeMode, currentAnchor: string) => {
  const normalized = normalizeDateForMode(parseAnchorDate(currentAnchor), mode)
  return format(normalized, 'yyyy-MM-dd')
}
