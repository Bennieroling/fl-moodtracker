import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCalendarDayData, useCalendarMonthData } from '@/hooks/useCalendarData'
import * as database from '@/lib/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: {
      calendar: { currentMonth: '2026-04-01', selectedDate: '2026-04-25' },
    },
  }),
}))

vi.mock('@/lib/database', async () => ({
  getMoodEntriesForMonth: vi.fn(),
  getMoodEntryByDate: vi.fn(),
  getFoodEntriesForDate: vi.fn(),
  getDailyActivityByDate: vi.fn(),
  getStateOfMindForDate: vi.fn(),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useCalendarMonthData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mood entries for the month', async () => {
    vi.mocked(database.getMoodEntriesForMonth).mockResolvedValue([
      { id: 'mood-1', date: '2026-04-25', mood_score: 4 },
    ] as never)

    const { result } = renderHook(() => useCalendarMonthData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when query fails', async () => {
    vi.mocked(database.getMoodEntriesForMonth).mockRejectedValue(new Error('db error'))

    const { result } = renderHook(() => useCalendarMonthData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })
})

describe('useCalendarDayData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all day data on success', async () => {
    vi.mocked(database.getMoodEntryByDate).mockResolvedValue({
      id: 'mood-1',
      mood_score: 5,
    } as never)
    vi.mocked(database.getFoodEntriesForDate).mockResolvedValue([{ id: 'food-1' }] as never)
    vi.mocked(database.getDailyActivityByDate).mockResolvedValue({ steps: 9000 } as never)
    vi.mocked(database.getStateOfMindForDate).mockResolvedValue([])

    const { result } = renderHook(() => useCalendarDayData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.mood?.mood_score).toBe(5)
    expect(result.current.data.foodEntries).toHaveLength(1)
    expect(result.current.data.activity?.steps).toBe(9000)
    expect(result.current.error).toBeNull()
  })

  it('returns empty defaults when query fails', async () => {
    vi.mocked(database.getMoodEntryByDate).mockRejectedValue(new Error('fail'))
    vi.mocked(database.getFoodEntriesForDate).mockRejectedValue(new Error('fail'))
    vi.mocked(database.getDailyActivityByDate).mockRejectedValue(new Error('fail'))
    vi.mocked(database.getStateOfMindForDate).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useCalendarDayData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.mood).toBeNull()
    expect(result.current.data.foodEntries).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
