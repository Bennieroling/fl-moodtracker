'use client'

import { addDays, addMonths, addWeeks, addYears, endOfMonth, endOfWeek, endOfYear, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns'

export type RangeMode = 'day' | 'week' | 'month' | 'year'

export const parseLocalDate = (value: string | null | undefined) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export const parseAnchorDate = (value: string) => {
  const parsed = parseLocalDate(value)
  return parsed ?? new Date()
}

export const normalizeDateForMode = (date: Date, mode: RangeMode) => {
  switch (mode) {
    case 'week':
      return startOfDay(startOfWeek(date, { weekStartsOn: 1 }))
    case 'month':
      return startOfDay(startOfMonth(date))
    case 'year':
      return startOfDay(startOfYear(date))
    case 'day':
    default:
      return startOfDay(date)
  }
}

export const computeRangeBounds = (mode: RangeMode, anchor: Date) => {
  const start = normalizeDateForMode(anchor, mode)
  let end = start
  switch (mode) {
    case 'week':
      end = startOfDay(endOfWeek(start, { weekStartsOn: 1 }))
      break
    case 'month':
      end = startOfDay(endOfMonth(start))
      break
    case 'year':
      end = startOfDay(endOfYear(start))
      break
    case 'day':
    default:
      end = start
      break
  }
  return { start, end }
}

export const formatRangeLabel = (mode: RangeMode, start: Date, end: Date) => {
  if (mode === 'day') {
    return format(start, 'EEEE, MMM d, yyyy')
  }
  if (mode === 'week') {
    const sameMonth = start.getMonth() === end.getMonth()
    const startLabel = format(start, 'MMM d')
    const endLabel = sameMonth ? format(end, 'd, yyyy') : format(end, 'MMM d, yyyy')
    return `${startLabel} - ${endLabel}`
  }
  if (mode === 'month') {
    return format(start, 'MMMM yyyy')
  }
  return format(start, 'yyyy')
}

export const shiftAnchor = (date: Date, mode: RangeMode, direction: number) => {
  switch (mode) {
    case 'week':
      return addWeeks(date, direction)
    case 'month':
      return addMonths(date, direction)
    case 'year':
      return addYears(date, direction)
    case 'day':
    default:
      return addDays(date, direction)
  }
}
