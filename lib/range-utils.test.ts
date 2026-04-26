import { describe, expect, it } from 'vitest'
import {
  computeRangeBounds,
  formatRangeLabel,
  normalizeDateForMode,
  parseLocalDate,
  shiftAnchor,
} from '@/lib/range-utils'

describe('parseLocalDate', () => {
  it('parses a YYYY-MM-DD string into a local Date', () => {
    const d = parseLocalDate('2026-04-25')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(3)
    expect(d!.getDate()).toBe(25)
  })

  it('returns null for null input', () => {
    expect(parseLocalDate(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(parseLocalDate(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseLocalDate('')).toBeNull()
  })
})

describe('computeRangeBounds', () => {
  it('computes week bounds from a local date (Mon–Sun)', () => {
    const anchor = parseLocalDate('2026-04-21')!
    const { start, end } = computeRangeBounds('week', anchor)
    expect(start.getDate()).toBe(20)
    expect(end.getDate()).toBe(26)
  })

  it('computes month bounds', () => {
    const anchor = parseLocalDate('2026-04-15')!
    const { start, end } = computeRangeBounds('month', anchor)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(30)
    expect(start.getMonth()).toBe(3)
  })

  it('computes year bounds', () => {
    const anchor = parseLocalDate('2026-07-01')!
    const { start, end } = computeRangeBounds('year', anchor)
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(11)
    expect(end.getDate()).toBe(31)
  })

  it('returns same day for day mode', () => {
    const anchor = parseLocalDate('2026-04-25')!
    const { start, end } = computeRangeBounds('day', anchor)
    expect(start.getDate()).toBe(end.getDate())
    expect(start.getTime()).toBe(end.getTime())
  })
})

describe('normalizeDateForMode', () => {
  it('normalizes to start of week (Monday)', () => {
    const d = parseLocalDate('2026-04-22')! // Wednesday
    const norm = normalizeDateForMode(d, 'week')
    expect(norm.getDate()).toBe(20) // Monday
  })

  it('normalizes to start of month', () => {
    const d = parseLocalDate('2026-04-15')!
    const norm = normalizeDateForMode(d, 'month')
    expect(norm.getDate()).toBe(1)
  })

  it('normalizes to start of year', () => {
    const d = parseLocalDate('2026-06-01')!
    const norm = normalizeDateForMode(d, 'year')
    expect(norm.getMonth()).toBe(0)
    expect(norm.getDate()).toBe(1)
  })

  it('normalizes to start of day', () => {
    const d = parseLocalDate('2026-04-25')!
    const norm = normalizeDateForMode(d, 'day')
    expect(norm.getHours()).toBe(0)
    expect(norm.getMinutes()).toBe(0)
  })
})

describe('shiftAnchor', () => {
  const base = parseLocalDate('2026-04-20')! // Monday

  it('shifts by days in day mode', () => {
    const shifted = shiftAnchor(base, 'day', 3)
    expect(shifted.getDate()).toBe(23)
  })

  it('shifts backwards in day mode', () => {
    const shifted = shiftAnchor(base, 'day', -1)
    expect(shifted.getDate()).toBe(19)
  })

  it('shifts by weeks in week mode', () => {
    const shifted = shiftAnchor(base, 'week', 1)
    expect(shifted.getDate()).toBe(27)
  })

  it('shifts by months in month mode', () => {
    const shifted = shiftAnchor(base, 'month', 2)
    expect(shifted.getMonth()).toBe(5) // June
  })

  it('shifts by years in year mode', () => {
    const shifted = shiftAnchor(base, 'year', 1)
    expect(shifted.getFullYear()).toBe(2027)
  })
})

describe('formatRangeLabel', () => {
  it('formats day label', () => {
    const d = parseLocalDate('2026-04-25')!
    const label = formatRangeLabel('day', d, d)
    expect(label).toContain('2026')
    expect(label).toContain('Apr')
  })

  it('formats month label', () => {
    const d = parseLocalDate('2026-04-01')!
    const label = formatRangeLabel('month', d, d)
    expect(label).toBe('April 2026')
  })

  it('formats year label', () => {
    const d = parseLocalDate('2026-01-01')!
    const label = formatRangeLabel('year', d, d)
    expect(label).toBe('2026')
  })

  it('formats same-month week label', () => {
    const start = parseLocalDate('2026-04-20')!
    const end = parseLocalDate('2026-04-26')!
    const label = formatRangeLabel('week', start, end)
    expect(label).toMatch(/Apr 20 - 26, 2026/)
  })

  it('formats cross-month week label', () => {
    const start = parseLocalDate('2026-04-27')!
    const end = parseLocalDate('2026-05-03')!
    const label = formatRangeLabel('week', start, end)
    expect(label).toContain('Apr 27')
    expect(label).toContain('May')
  })
})
