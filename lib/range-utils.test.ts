import { describe, expect, it } from 'vitest'
import { computeRangeBounds, parseLocalDate } from '@/lib/range-utils'

describe('range-utils', () => {
  it('computes week bounds from a local date', () => {
    const anchor = parseLocalDate('2026-04-21')

    expect(anchor).not.toBeNull()

    const { start, end } = computeRangeBounds('week', anchor!)

    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(3)
    expect(start.getDate()).toBe(20)
    expect(end.getFullYear()).toBe(2026)
    expect(end.getMonth()).toBe(3)
    expect(end.getDate()).toBe(26)
  })
})
