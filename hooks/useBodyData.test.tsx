import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBodyData } from '@/hooks/useBodyData'
import * as database from '@/lib/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: {
      exercise: { mode: 'month', anchorDate: '2026-04-01' },
    },
    setExerciseFilters: vi.fn(),
  }),
}))

vi.mock('@/lib/database', async () => ({
  getBodyMetrics: vi.fn(),
  getLatestBodyMetrics: vi.fn(),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const bodyRow = { date: '2026-04-01', weight_kg: 75.5, body_fat_pct: null }

describe('useBodyData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns body metrics series and latest on success', async () => {
    vi.mocked(database.getBodyMetrics).mockResolvedValue([bodyRow] as never)
    vi.mocked(database.getLatestBodyMetrics).mockResolvedValue(bodyRow as never)

    const { result } = renderHook(() => useBodyData(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.series).toHaveLength(1)
    expect(result.current.latestWeight).toBe(75.5)
    expect(result.current.error).toBeNull()
  })

  it('builds weight series from rows with weight_kg', async () => {
    vi.mocked(database.getBodyMetrics).mockResolvedValue([
      { date: '2026-04-01', weight_kg: 75.0, body_fat_pct: null },
      { date: '2026-04-02', weight_kg: null, body_fat_pct: 18 },
    ] as never)
    vi.mocked(database.getLatestBodyMetrics).mockResolvedValue(null as never)

    const { result } = renderHook(() => useBodyData(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.weightSeries).toHaveLength(1)
    expect(result.current.weightSeries[0].weight_kg).toBe(75)
    expect(result.current.latestWeight).toBeNull()
  })

  it('returns empty state when query fails', async () => {
    vi.mocked(database.getBodyMetrics).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getLatestBodyMetrics).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useBodyData(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.series).toEqual([])
    expect(result.current.latestWeight).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
