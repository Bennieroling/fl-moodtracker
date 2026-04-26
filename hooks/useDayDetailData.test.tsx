import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDayDetailData } from '@/hooks/useDayDetailData'
import * as database from '@/lib/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: { day: { date: '2026-04-25' } },
  }),
}))

vi.mock('@/lib/database', async () => ({
  getMoodEntryByDate: vi.fn(),
  getFoodEntriesForDate: vi.fn(),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useDayDetailData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mood and food entries on success', async () => {
    vi.mocked(database.getMoodEntryByDate).mockResolvedValue({
      id: 'mood-1',
      user_id: 'user-1',
      date: '2026-04-25',
      mood_score: 4,
    } as never)
    vi.mocked(database.getFoodEntriesForDate).mockResolvedValue([
      { id: 'food-1', meal: 'breakfast' },
    ] as never)

    const { result } = renderHook(() => useDayDetailData(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.moodEntry?.mood_score).toBe(4)
    expect(result.current.data.foodEntries).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('returns default empty state when query fails', async () => {
    vi.mocked(database.getMoodEntryByDate).mockRejectedValue(new Error('db error'))
    vi.mocked(database.getFoodEntriesForDate).mockRejectedValue(new Error('db error'))

    const { result } = renderHook(() => useDayDetailData(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.moodEntry).toBeNull()
    expect(result.current.data.foodEntries).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
