import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoricData } from '@/hooks/useHistoricData'
import * as database from '@/lib/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: { historic: { date: '2026-04-20' } },
  }),
}))

vi.mock('@/lib/database', async () => ({
  getDashboardSummary: vi.fn(),
  getDailyActivityByDate: vi.fn(),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const summary = {
  mood: 3,
  totalCalories: 1600,
  mealsLogged: 2,
  macros: { protein: 80, carbs: 120, fat: 50 },
  foodEntries: [],
}
const activity = {
  user_id: 'user-1',
  date: '2026-04-20',
  total_energy_kcal: 2200,
  active_energy_kcal: null,
  resting_energy_kcal: null,
  steps: 8000,
  exercise_time_minutes: null,
  move_time_minutes: null,
  stand_time_minutes: null,
  distance_km: null,
  exercise_kcal: null,
}

describe('useHistoricData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns summary and activity on success', async () => {
    vi.mocked(database.getDashboardSummary).mockResolvedValue(summary as never)
    vi.mocked(database.getDailyActivityByDate).mockResolvedValue(activity as never)

    const { result } = renderHook(() => useHistoricData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.summary.mood).toBe(3)
    expect(result.current.data.activity?.steps).toBe(8000)
    expect(result.current.error).toBeNull()
  })

  it('returns default state when query fails', async () => {
    vi.mocked(database.getDashboardSummary).mockRejectedValue(new Error('db error'))
    vi.mocked(database.getDailyActivityByDate).mockRejectedValue(new Error('db error'))

    const { result } = renderHook(() => useHistoricData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data.summary.mood).toBeNull()
    expect(result.current.data.activity).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
