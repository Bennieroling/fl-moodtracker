'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { getAnomalyCount } from '@/lib/database'

export function AnomalyBadge() {
  const { user } = useAuth()
  const userId = user?.id

  const { data: count = 0, isLoading } = useQuery({
    queryKey: ['anomaly-count', userId],
    queryFn: () => (userId ? getAnomalyCount(userId, 7) : 0),
    enabled: !!userId,
    staleTime: 60_000,
  })

  if (isLoading || count === 0) return null

  return (
    <Link
      href="/insights?tab=anomalies"
      className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm transition-colors hover:bg-orange-100 dark:border-orange-900/60 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
      <p className="flex-1 text-orange-900 dark:text-orange-200">
        <span className="font-semibold">
          {count} {count === 1 ? 'anomaly' : 'anomalies'}
        </span>{' '}
        in the last 7 days
      </p>
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-orange-700 dark:text-orange-300">
        Review
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  )
}
