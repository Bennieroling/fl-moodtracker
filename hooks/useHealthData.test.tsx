import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHealthData } from '@/hooks/useHealthData'
import * as database from '@/lib/database'

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/filter-context', () => ({
  useFilters: () => ({
    filters: {
      health: { mode: 'month', anchorDate: '2026-04-01' },
    },
    setHealthFilters: vi.fn(),
  }),
}))

vi.mock('@/lib/database', async () => ({
  getBodyMetrics: vi.fn(),
  getLatestBodyMetrics: vi.fn(),
  getDailyActivityRange: vi.fn(),
  getEcgReadings: vi.fn(),
  getHeartRateNotifications: vi.fn(),
  getSleepEvents: vi.fn(),
  getLatestSleepEvent: vi.fn(),
}))

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useHealthData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns health data on success', async () => {
    vi.mocked(database.getBodyMetrics).mockResolvedValue([
      { date: '2026-04-01', weight_kg: 74, body_fat_pct: null },
    ] as never)
    vi.mocked(database.getLatestBodyMetrics).mockResolvedValue({ weight_kg: 74 } as never)
    vi.mocked(database.getDailyActivityRange).mockResolvedValue([
      { resting_heart_rate: 60, hrv: 40 },
    ] as never)
    vi.mocked(database.getEcgReadings).mockResolvedValue([])
    vi.mocked(database.getHeartRateNotifications).mockResolvedValue([])
    vi.mocked(database.getSleepEvents).mockResolvedValue([
      {
        total_sleep_hours: 7.5,
        rem_hours: 1.5,
        deep_hours: 1.2,
        wrist_temperature: null,
        date: '2026-04-01',
      },
    ] as never)
    vi.mocked(database.getLatestSleepEvent).mockResolvedValue(null)

    const { result } = renderHook(() => useHealthData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.weightSeries).toHaveLength(1)
    expect(result.current.healthSummary.restingHeartRateAvg).toBe(60)
    expect(result.current.healthSummary.hrvAvg).toBe(40)
    expect(result.current.sleepSummary.totalAvg).toBe(7.5)
    expect(result.current.error).toBeNull()
  })

  it('computes null averages when daily activity has no HR or HRV data', async () => {
    vi.mocked(database.getBodyMetrics).mockResolvedValue([])
    vi.mocked(database.getLatestBodyMetrics).mockResolvedValue(null)
    vi.mocked(database.getDailyActivityRange).mockResolvedValue([
      { resting_heart_rate: null, hrv: null },
    ] as never)
    vi.mocked(database.getEcgReadings).mockResolvedValue([])
    vi.mocked(database.getHeartRateNotifications).mockResolvedValue([])
    vi.mocked(database.getSleepEvents).mockResolvedValue([])
    vi.mocked(database.getLatestSleepEvent).mockResolvedValue(null)

    const { result } = renderHook(() => useHealthData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.healthSummary.restingHeartRateAvg).toBeNull()
    expect(result.current.healthSummary.hrvAvg).toBeNull()
    expect(result.current.sleepSummary.totalAvg).toBeNull()
  })

  it('returns empty defaults when query fails', async () => {
    vi.mocked(database.getBodyMetrics).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getLatestBodyMetrics).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getDailyActivityRange).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getEcgReadings).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getHeartRateNotifications).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getSleepEvents).mockRejectedValue(new Error('network error'))
    vi.mocked(database.getLatestSleepEvent).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useHealthData(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.bodySeries).toEqual([])
    expect(result.current.ecgReadings).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
