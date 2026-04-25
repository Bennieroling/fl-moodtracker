import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboardData } from '@/hooks/useDashboardData'
import * as database from '@/lib/database'
import { DEFAULT_DAILY_TARGETS } from '@/lib/types/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: {
      dashboard: {
        date: '2026-04-21',
      },
    },
  }),
}))

vi.mock('@/lib/database', async () => {
  return {
    getDashboardSummary: vi.fn(),
    getRecentEntries: vi.fn(),
    getDailyActivityByDate: vi.fn(),
    getUserTargets: vi.fn(),
    getStateOfMindForDate: vi.fn(),
    getHeartRateNotifications: vi.fn(),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(database.getDashboardSummary).mockResolvedValue({
      mood: 4,
      totalCalories: 1800,
      mealsLogged: 3,
      macros: { protein: 100, carbs: 150, fat: 60 },
      foodEntries: [],
    })
    vi.mocked(database.getRecentEntries).mockResolvedValue([])
    vi.mocked(database.getDailyActivityByDate).mockResolvedValue(null)
    vi.mocked(database.getUserTargets).mockResolvedValue(DEFAULT_DAILY_TARGETS)
    vi.mocked(database.getStateOfMindForDate).mockResolvedValue([])
    vi.mocked(database.getHeartRateNotifications).mockResolvedValue([])
  })

  it('loads dashboard data for the authenticated user', async () => {
    const { result } = renderHook(() => useDashboardData(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(database.getDashboardSummary).toHaveBeenCalledWith('user-1', '2026-04-21')
    expect(result.current.data.summary.mood).toBe(4)
    expect(result.current.error).toBeNull()
  })
})
