'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useReadiness } from '@/hooks/useReadiness'
import type { ReadinessRow } from '@/lib/types/database'
import { ReadinessRing } from './readiness-ring'

interface ContributorTileProps {
  label: string
  value: string
  unit?: string
  fillPct: number
  fillTone: 'accent' | 'ok' | 'warn'
  delta?: { text: string; tone: 'up' | 'down' | 'neutral' }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function bandLabel(band: string): string {
  return band.charAt(0).toUpperCase() + band.slice(1)
}

function loadLabel(minutes: number): string {
  if (minutes === 0) return 'Rest'
  if (minutes < 30) return 'Light'
  if (minutes < 60) return 'Steady'
  return 'Heavy'
}

function ContributorTile({ label, value, unit, fillPct, fillTone, delta }: ContributorTileProps) {
  const fillBg =
    fillTone === 'ok'
      ? 'bg-emerald-500'
      : fillTone === 'warn'
        ? 'bg-orange-500'
        : 'bg-[color:var(--chart-3)]'
  return (
    <Card size="sm" className="gap-3">
      <div className="px-4 pt-1">
        <p className="text-caption">{label}</p>
        <p className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold leading-none tracking-tight">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </p>
        <div className="mt-3 h-1 w-full rounded-full bg-muted">
          <div
            className={cn('h-1 rounded-full transition-all', fillBg)}
            style={{ width: `${clamp(fillPct, 0, 100)}%` }}
          />
        </div>
        {delta && (
          <p
            className={cn(
              'mt-2 text-xs font-medium',
              delta.tone === 'up' && 'text-emerald-600 dark:text-emerald-400',
              delta.tone === 'down' && 'text-orange-600 dark:text-orange-400',
              delta.tone === 'neutral' && 'text-muted-foreground',
            )}
          >
            {delta.text}
          </p>
        )}
      </div>
    </Card>
  )
}

function TrendStrip({ history }: { history: ReadinessRow[] }) {
  // Pad to 14 cells; today is the last cell (rightmost).
  const cells: (ReadinessRow | null)[] = []
  const target = 14
  for (let i = 0; i < target - history.length; i++) cells.push(null)
  for (const row of history) cells.push(row)

  return (
    <div className="flex h-24 items-end gap-1.5 px-4">
      {cells.map((row, i) => {
        const isToday = i === cells.length - 1 && row !== null
        const value = row?.score ?? 50
        const hasData = row?.components.has_data ?? false
        return (
          <div
            key={row?.id ?? `placeholder-${i}`}
            className={cn(
              'flex-1 rounded-sm transition-all',
              row === null
                ? 'bg-muted-foreground/15'
                : isToday
                  ? 'bg-[color:var(--chart-3)] ring-2 ring-[color:var(--chart-3)]/40 ring-offset-2 ring-offset-card'
                  : hasData
                    ? 'bg-[color:var(--chart-3)]/70'
                    : 'bg-muted-foreground/30',
            )}
            style={{ height: `${clamp(value, 5, 100)}%` }}
            title={row ? `${row.date}: ${row.score}` : 'No data'}
          />
        )
      })}
    </div>
  )
}

export function ReadinessView() {
  const { latest, history, loading, buildingBaseline, baselineDaysRemaining } = useReadiness(14)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading readiness…</p>
      </div>
    )
  }

  if (!latest || buildingBaseline) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="px-6 py-4 text-center">
            <p className="text-caption">Readiness</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">Building your baseline</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
              {baselineDaysRemaining > 0
                ? `${baselineDaysRemaining} more day${baselineDaysRemaining === 1 ? '' : 's'} of HRV and resting HR are needed before scoring becomes meaningful. Detection runs nightly.`
                : 'Waiting for the first nightly compute_readiness_batch run.'}
            </p>
          </div>
        </Card>
        <Card size="sm">
          <div className="px-4 text-sm text-muted-foreground">
            <p className="text-caption mb-2">How it&apos;s computed</p>
            <p className="leading-relaxed">
              A weighted score (0–100) blending last night&apos;s sleep, HRV vs your 60-day
              baseline, resting HR vs baseline, and recent training load. Bands: 85+ Peak · 70–84
              Primed · 50–69 Steady · &lt;50 Recover.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const { score, band, caption, components } = latest
  const sleep = components.sleep_hours
  const hrv = components.hrv
  const rhr = components.rhr
  const exerciseMins = components.exercise_minutes

  const hrvDelta =
    hrv != null && components.hrv_baseline_mean != null ? hrv - components.hrv_baseline_mean : null
  const rhrDelta =
    rhr != null && components.rhr_baseline_mean != null ? rhr - components.rhr_baseline_mean : null

  const dateLabel = new Date(latest.date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const trendAvg = history.length
    ? Math.round(history.reduce((a, r) => a + r.score, 0) / history.length)
    : null

  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="text-caption">{dateLabel}</p>
        <ReadinessRing score={score} band={bandLabel(band)} className="mt-6" />
        <p className="mx-auto mt-4 max-w-xs text-base italic text-muted-foreground">{caption}</p>
        {!components.has_data && (
          <Badge variant="outline" className="mt-3">
            Sparse data
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-caption">Contributors</p>
        <div className="grid grid-cols-2 gap-3">
          <ContributorTile
            label="Sleep"
            value={sleep != null ? sleep.toFixed(1) : '—'}
            unit="h"
            fillPct={latest.sleep_contribution}
            fillTone="accent"
            delta={
              sleep != null
                ? {
                    text: sleep >= 7 ? 'on target' : 'below target',
                    tone: sleep >= 7 ? 'up' : 'down',
                  }
                : { text: 'no data', tone: 'neutral' }
            }
          />
          <ContributorTile
            label="HRV"
            value={hrv != null ? hrv.toFixed(0) : '—'}
            unit="ms"
            fillPct={latest.hrv_contribution}
            fillTone="accent"
            delta={
              hrvDelta != null
                ? {
                    text: `${hrvDelta > 0 ? '+' : ''}${hrvDelta.toFixed(0)} ms vs baseline`,
                    tone: hrvDelta >= 0 ? 'up' : 'down',
                  }
                : { text: 'building baseline', tone: 'neutral' }
            }
          />
          <ContributorTile
            label="Resting HR"
            value={rhr != null ? rhr.toFixed(0) : '—'}
            unit="bpm"
            fillPct={latest.rhr_contribution}
            fillTone="ok"
            delta={
              rhrDelta != null
                ? {
                    text: `${rhrDelta > 0 ? '+' : ''}${rhrDelta.toFixed(0)} bpm vs baseline`,
                    tone: rhrDelta <= 0 ? 'up' : 'down',
                  }
                : { text: 'building baseline', tone: 'neutral' }
            }
          />
          <ContributorTile
            label="Training Load"
            value={loadLabel(exerciseMins)}
            fillPct={latest.load_contribution}
            fillTone={latest.load_contribution >= 70 ? 'accent' : 'warn'}
            delta={{
              text: `${Math.round(exerciseMins)} min today`,
              tone: 'neutral',
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-caption">14-day readiness</p>
          {trendAvg !== null && (
            <p className="text-xs text-muted-foreground font-mono">
              avg <span className="font-semibold text-foreground">{trendAvg}</span>
            </p>
          )}
        </div>
        <Card size="sm">
          <TrendStrip history={history} />
        </Card>
      </div>

      <Card size="sm">
        <div className="px-4 text-sm text-muted-foreground">
          <p className="text-caption mb-2">How it&apos;s computed</p>
          <p className="leading-relaxed">
            A weighted score (0–100) blending last night&apos;s sleep, HRV vs your 60-day baseline,
            resting HR vs baseline, and recent training load. Bands: 85+ Peak · 70–84 Primed · 50–69
            Steady · &lt;50 Recover. Detection runs nightly; results live in the{' '}
            <code className="font-mono text-xs">readiness_scores</code> table.
          </p>
        </div>
      </Card>
    </div>
  )
}
