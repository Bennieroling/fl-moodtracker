'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth-context'
import { getLatestReadiness, getReadinessHistory } from '@/lib/database'
import type { ReadinessRow } from '@/lib/types/database'

export interface UseReadinessResult {
  latest: ReadinessRow | null
  history: ReadinessRow[]
  loading: boolean
  /** True when the user has fewer than 14 days of HRV/RHR baseline data. */
  buildingBaseline: boolean
  /** Approximate days remaining until baseline is established. */
  baselineDaysRemaining: number
}

const BASELINE_TARGET_DAYS = 14

export function useReadiness(historyDays: number = 14): UseReadinessResult {
  const { user } = useAuth()
  const userId = user?.id

  const latestQuery = useQuery({
    queryKey: ['readiness-latest', userId],
    queryFn: () => (userId ? getLatestReadiness(userId) : null),
    enabled: !!userId,
    staleTime: 60_000,
  })

  const historyQuery = useQuery({
    queryKey: ['readiness-history', userId, historyDays],
    queryFn: () => (userId ? getReadinessHistory(userId, historyDays) : []),
    enabled: !!userId,
    staleTime: 60_000,
  })

  const latest = latestQuery.data ?? null
  const history = historyQuery.data ?? []
  const loading = latestQuery.isLoading || historyQuery.isLoading

  const baselineN = Math.max(
    latest?.components.hrv_baseline_n ?? 0,
    latest?.components.rhr_baseline_n ?? 0,
  )
  const buildingBaseline = !latest || baselineN < BASELINE_TARGET_DAYS
  const baselineDaysRemaining = Math.max(0, BASELINE_TARGET_DAYS - baselineN)

  return {
    latest,
    history,
    loading,
    buildingBaseline,
    baselineDaysRemaining,
  }
}
