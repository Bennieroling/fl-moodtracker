import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogEntries } from '@/hooks/useLogEntries'
import * as database from '@/lib/database'
import { DEFAULT_DAILY_TARGETS } from '@/lib/types/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({ filters: { dashboard: { date: '2026-04-30' } } }),
}))

vi.mock('@/lib/database', () => ({
  getDashboardSummary: vi.fn(),
  getRecentEntries: vi.fn(),
  getDailyActivityByDate: vi.fn(),
  getUserTargets: vi.fn(),
  getStateOfMindForDate: vi.fn(),
  getHeartRateNotifications: vi.fn(),
  upsertMoodEntry: vi.fn(),
  insertFoodEntry: vi.fn(),
  updateFoodEntry: vi.fn(),
  deleteFoodEntry: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useLogEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(database.getDashboardSummary).mockResolvedValue({
      mood: null,
      totalCalories: 0,
      mealsLogged: 0,
      macros: { protein: 0, carbs: 0, fat: 0 },
      foodEntries: [],
    })
    vi.mocked(database.getRecentEntries).mockResolvedValue([])
    vi.mocked(database.getDailyActivityByDate).mockResolvedValue(null)
    vi.mocked(database.getUserTargets).mockResolvedValue(DEFAULT_DAILY_TARGETS)
    vi.mocked(database.getStateOfMindForDate).mockResolvedValue([])
    vi.mocked(database.getHeartRateNotifications).mockResolvedValue([])
    vi.mocked(database.upsertMoodEntry).mockResolvedValue(undefined as never)
    vi.mocked(database.insertFoodEntry).mockResolvedValue(undefined as never)
  })

  it('exposes initial state and handler functions', async () => {
    const { result } = renderHook(() => useLogEntries(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.date).toBe('2026-04-30')
    expect(result.current.selectedMood).toBeNull()
    expect(result.current.selectedMeal).toBeNull()
    expect(result.current.editingEntry).toBeNull()
    expect(typeof result.current.handleMoodSelect).toBe('function')
    expect(typeof result.current.handlePhotoAnalysis).toBe('function')
    expect(typeof result.current.handleManualSave).toBe('function')
  })

  it('persists mood via upsertMoodEntry with the active date', async () => {
    const { result } = renderHook(() => useLogEntries(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleMoodSelect(4)
    })

    expect(database.upsertMoodEntry).toHaveBeenCalledWith({
      user_id: 'user-1',
      date: '2026-04-30',
      mood_score: 4,
    })
  })

  it('persists a manual food entry with provided macros and journal_mode', async () => {
    const { result } = renderHook(() => useLogEntries(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleManualSave({
        meal: 'lunch',
        food_labels: ['salad', 'bread'],
        calories: 480,
        macros: { protein: 20, carbs: 60, fat: 18 },
        note: 'office lunch',
        journal_mode: false,
      })
    })

    expect(database.insertFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        date: '2026-04-30',
        meal: 'lunch',
        food_labels: ['salad', 'bread'],
        calories: 480,
        macros: { protein: 20, carbs: 60, fat: 18 },
        note: 'office lunch',
        journal_mode: false,
      }),
    )
  })
})
