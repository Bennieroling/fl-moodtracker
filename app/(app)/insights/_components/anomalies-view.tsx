'use client'

import { useMemo } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { dismissAnomaly, getRecentAnomalies } from '@/lib/database'
import type { AnomalyRow } from '@/lib/types/database'
import { ANOMALY_SOURCES, SAMPLE_ANOMALIES, type Anomaly } from './anomaly-types'
import { AnomalySparkline } from './anomaly-sparkline'
import type { PreviewData } from '@/hooks/usePreviewData'

const SOURCE_BY_ID = new Map(ANOMALY_SOURCES.map((s) => [s.id, s]))

function build30DayWindow(endDate: string): string[] {
  const out: string[] = []
  const end = new Date(`${endDate}T00:00:00`)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function valueAt(row: AnomalyRow, date: string, data: PreviewData): number | null {
  switch (row.metric_id) {
    case 'hrv':
      return data.daily.find((d) => d.date === date)?.hrv ?? null
    case 'rhr':
      return data.daily.find((d) => d.date === date)?.resting_heart_rate ?? null
    case 'sleep':
      return data.sleep.find((s) => s.date === date)?.total_sleep_hours ?? null
    case 'deep_sleep': {
      const v = data.sleep.find((s) => s.date === date)?.deep_hours
      return v != null ? v * 60 : null
    }
    default:
      return null
  }
}

function rowToViewModel(row: AnomalyRow, data: PreviewData): Anomaly {
  const source = SOURCE_BY_ID.get(row.metric_id)
  const dates = build30DayWindow(row.observed_at)
  const series = dates.map((d) => valueAt(row, d, data))
  const highlightIndex = dates.findIndex((d) => d === row.observed_at)
  return {
    metricId: row.metric_id,
    label: source?.label ?? row.metric_id,
    unit: source?.unit ?? '',
    date: row.observed_at,
    value: Number(row.value),
    baseline: Number(row.baseline_mean),
    std: Number(row.baseline_stddev),
    z: Number(row.z_score),
    direction: row.direction,
    kind: row.kind,
    series,
    highlightIndex: highlightIndex >= 0 ? highlightIndex : 29,
    bandHalfWidth: Number(row.baseline_stddev),
    format: source?.format ?? ((n: number) => n.toFixed(0)),
    hint: row.hint,
  }
}

function formatRelative(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })
}

function tagFor(a: Anomaly): string {
  if (a.kind === 'positive') return a.metricId.includes('deep') ? 'Personal Best' : 'Improved'
  return a.direction === 'high' ? 'Elevated' : 'Dropped'
}

interface AnomalyCardProps {
  anomaly: Anomaly
  rowId: number | null
  onDismiss?: (id: number) => void
  dismissPending?: boolean
}

function AnomalyCard({ anomaly, rowId, onDismiss, dismissPending }: AnomalyCardProps) {
  const isAlert = anomaly.kind === 'alert'
  return (
    <Card
      size="sm"
      className={cn('border-l-4', isAlert ? 'border-l-red-500/70' : 'border-l-emerald-500/70')}
    >
      <div className="space-y-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <Badge
            variant={isAlert ? 'destructive' : 'outline'}
            className={cn(
              !isAlert &&
                'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            )}
          >
            {tagFor(anomaly)}
          </Badge>
          <div className="flex items-center gap-2">
            {anomaly.isSample && (
              <Badge variant="outline" className="text-[10px]">
                Sample
              </Badge>
            )}
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {formatRelative(anomaly.date)}
            </span>
            {rowId !== null && onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(rowId)}
                disabled={dismissPending}
                aria-label="Dismiss anomaly"
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-2xl font-semibold tracking-tight">
          {anomaly.label}
          <span className="ml-2 italic font-normal text-muted-foreground">
            {anomaly.format(anomaly.value)} {anomaly.unit}
          </span>
        </p>

        <AnomalySparkline
          values={anomaly.series}
          highlightIndex={anomaly.highlightIndex}
          baseline={anomaly.baseline}
          bandHalfWidth={anomaly.bandHalfWidth}
          kind={anomaly.kind}
        />

        <div className="flex gap-4 border-t border-border pt-3">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Value
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
              {anomaly.format(anomaly.value)} {anomaly.unit}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Baseline
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
              {anomaly.format(anomaly.baseline)} {anomaly.unit}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
              Z-score
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
              {anomaly.z > 0 ? '+' : ''}
              {anomaly.z.toFixed(1)}σ
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs italic text-muted-foreground">{anomaly.hint ?? ''}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--chart-3)] hover:underline"
          >
            View day <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </Card>
  )
}

export function AnomaliesView({ data }: { data: PreviewData }) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['anomalies', userId],
    queryFn: () => (userId ? getRecentAnomalies(userId, 30) : []),
    enabled: !!userId,
    staleTime: 60_000,
  })

  const dismiss = useMutation({
    mutationFn: (id: number) => dismissAnomaly(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['anomalies', userId] })
      const previous = queryClient.getQueryData<AnomalyRow[]>(['anomalies', userId])
      queryClient.setQueryData<AnomalyRow[]>(['anomalies', userId], (old) =>
        (old ?? []).filter((a) => a.id !== id),
      )
      queryClient.setQueryData<number>(['anomaly-count', userId], (old) =>
        Math.max(0, (old ?? 0) - 1),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['anomalies', userId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies', userId] })
      queryClient.invalidateQueries({ queryKey: ['anomaly-count', userId] })
    },
  })

  const items = useMemo(() => {
    if (rows.length === 0) {
      return SAMPLE_ANOMALIES.map((a) => ({ rowId: null, anomaly: a }))
    }
    return rows.map((row) => ({
      rowId: row.id,
      anomaly: rowToViewModel(row, data),
    }))
  }, [rows, data])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Looking for outliers…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold leading-none tracking-tight md:text-4xl">
          {items.length} <span className="italic text-orange-500">anomalies</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Readings that fell outside your normal range over the last 30 days.
        </p>
      </div>

      <div className="space-y-3">
        {items.map(({ rowId, anomaly }) => (
          <AnomalyCard
            key={rowId !== null ? `row-${rowId}` : `${anomaly.metricId}-${anomaly.date}`}
            anomaly={anomaly}
            rowId={rowId}
            onDismiss={(id) => dismiss.mutate(id)}
            dismissPending={dismiss.isPending}
          />
        ))}
      </div>

      <Card size="sm">
        <div className="px-4 text-sm text-muted-foreground">
          <p className="text-caption mb-2">How it works</p>
          <p className="leading-relaxed">
            For every numeric metric, Pulse computes a 30-day rolling mean and standard deviation,
            then flags any reading more than 2σ from the mean. Personal bests surface alongside
            alerts. Detection runs nightly; results live in the{' '}
            <code className="font-mono text-xs">anomalies</code> table.
          </p>
        </div>
      </Card>
    </div>
  )
}
