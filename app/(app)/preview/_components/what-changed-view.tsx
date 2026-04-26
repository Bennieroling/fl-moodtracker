'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import type { PreviewData } from '@/hooks/usePreviewData'

type GoodDirection = 'up' | 'down' | 'neutral'
type Aggregation = 'avg' | 'sum'
type WindowKey = '7' | '14' | '30'

interface MetricSpec {
  id: string
  label: string
  unit?: string
  goodDirection: GoodDirection
  aggregation: Aggregation
  format?: (n: number) => string
  priority: number
  /** Where to navigate when this metric row is tapped. */
  detailHref: string
}

const METRIC_SPECS: MetricSpec[] = [
  {
    id: 'sleep',
    label: 'Sleep Duration',
    unit: 'h',
    goodDirection: 'up',
    aggregation: 'avg',
    format: (n) => n.toFixed(1),
    priority: 5,
    detailHref: '/health',
  },
  {
    id: 'hrv',
    label: 'HRV (avg)',
    unit: 'ms',
    goodDirection: 'up',
    aggregation: 'avg',
    format: (n) => n.toFixed(0),
    priority: 4,
    detailHref: '/health',
  },
  {
    id: 'rhr',
    label: 'Resting HR',
    unit: 'bpm',
    goodDirection: 'down',
    aggregation: 'avg',
    format: (n) => n.toFixed(0),
    priority: 3,
    detailHref: '/health',
  },
  {
    id: 'active_energy',
    label: 'Active Energy',
    unit: 'kcal',
    goodDirection: 'neutral',
    aggregation: 'sum',
    format: (n) => Math.round(n).toLocaleString(),
    priority: 2,
    detailHref: '/exercise',
  },
  {
    id: 'steps',
    label: 'Steps (daily avg)',
    goodDirection: 'up',
    aggregation: 'avg',
    format: (n) => Math.round(n).toLocaleString(),
    priority: 1,
    detailHref: '/exercise',
  },
  {
    id: 'mood',
    label: 'Mood valence',
    goodDirection: 'up',
    aggregation: 'avg',
    format: (n) => n.toFixed(2),
    priority: 1,
    detailHref: '/insights',
  },
  {
    id: 'wrist_temp',
    label: 'Wrist temperature',
    unit: '°C',
    goodDirection: 'neutral',
    aggregation: 'avg',
    format: (n) => n.toFixed(1),
    priority: 0,
    detailHref: '/health',
  },
  {
    id: 'weight',
    label: 'Weight',
    unit: 'kg',
    goodDirection: 'neutral',
    aggregation: 'avg',
    format: (n) => n.toFixed(1),
    priority: 0,
    detailHref: '/health',
  },
]

interface DeltaEntry {
  spec: MetricSpec
  thisValue: number | null
  lastValue: number | null
  deltaAbs: number | null
  deltaPct: number | null
  goodOrBad: 'good' | 'bad' | 'neutral' | 'flat'
}

function aggregate(values: (number | null)[], agg: Aggregation): number | null {
  const numeric = values.filter((v): v is number => v !== null && !Number.isNaN(v))
  if (!numeric.length) return null
  if (agg === 'sum') return numeric.reduce((a, b) => a + b, 0)
  return numeric.reduce((a, b) => a + b, 0) / numeric.length
}

function computeEntry(
  spec: MetricSpec,
  thisWindow: (number | null)[],
  lastWindow: (number | null)[],
): DeltaEntry {
  const thisValue = aggregate(thisWindow, spec.aggregation)
  const lastValue = aggregate(lastWindow, spec.aggregation)
  let deltaAbs: number | null = null
  let deltaPct: number | null = null
  let goodOrBad: DeltaEntry['goodOrBad'] = 'neutral'

  if (thisValue !== null && lastValue !== null) {
    deltaAbs = thisValue - lastValue
    deltaPct = lastValue !== 0 ? deltaAbs / Math.abs(lastValue) : null

    if (spec.goodDirection === 'neutral') {
      goodOrBad = Math.abs(deltaPct ?? 0) < 0.03 ? 'flat' : 'neutral'
    } else if (Math.abs(deltaPct ?? 0) < 0.02) {
      goodOrBad = 'flat'
    } else {
      const directionUp = deltaAbs > 0
      const goodUp = spec.goodDirection === 'up'
      goodOrBad = directionUp === goodUp ? 'good' : 'bad'
    }
  }
  return { spec, thisValue, lastValue, deltaAbs, deltaPct, goodOrBad }
}

function buildDailyMap(data: PreviewData): {
  sleep: Map<string, number>
  hrv: Map<string, number>
  rhr: Map<string, number>
  steps: Map<string, number>
  active: Map<string, number>
  mood: Map<string, number>
  wrist: Map<string, number>
  weight: Map<string, number>
} {
  const sleep = new Map<string, number>()
  const wrist = new Map<string, number>()
  for (const s of data.sleep) {
    if (s.total_sleep_hours !== null) sleep.set(s.date, s.total_sleep_hours)
    if (s.wrist_temperature !== null && s.wrist_temperature !== undefined)
      wrist.set(s.date, s.wrist_temperature)
  }
  const hrv = new Map<string, number>()
  const rhr = new Map<string, number>()
  const steps = new Map<string, number>()
  const active = new Map<string, number>()
  for (const d of data.daily) {
    if (d.hrv !== null && d.hrv !== undefined) hrv.set(d.date, d.hrv)
    if (d.resting_heart_rate !== null && d.resting_heart_rate !== undefined)
      rhr.set(d.date, d.resting_heart_rate)
    if (d.steps !== null) steps.set(d.date, d.steps)
    if (d.active_energy_kcal !== null) active.set(d.date, d.active_energy_kcal)
  }
  const mood = new Map<string, number>()
  for (const m of data.mood) mood.set(m.date, m.avg_valence)
  const weight = new Map<string, number>()
  for (const b of data.body) {
    if (b.weight_kg !== null) weight.set(b.date, b.weight_kg)
  }
  return { sleep, hrv, rhr, steps, active, mood, wrist, weight }
}

function valuesForRange(
  map: Map<string, number>,
  startDate: Date,
  days: number,
): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    out.push(map.has(key) ? map.get(key)! : null)
  }
  return out
}

function formatDateRange(start: Date, days: number): string {
  const end = new Date(start)
  end.setDate(end.getDate() + days - 1)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${(pct * 100).toFixed(0)}%`
}

function formatDelta(entry: DeltaEntry): string {
  if (entry.deltaAbs === null) return '—'
  const fmt = entry.spec.format ?? ((n: number) => n.toFixed(1))
  const sign = entry.deltaAbs > 0 ? '+' : ''
  return `${sign}${fmt(entry.deltaAbs)}${entry.spec.unit ? ' ' + entry.spec.unit : ''}`
}

function MajorDeltaCard({ entry }: { entry: DeltaEntry }) {
  const directionUp = (entry.deltaAbs ?? 0) > 0
  const accentClass =
    entry.goodOrBad === 'good'
      ? 'border-l-emerald-500'
      : entry.goodOrBad === 'bad'
        ? 'border-l-red-500'
        : 'border-l-muted-foreground/40'
  const valueTone =
    entry.goodOrBad === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : entry.goodOrBad === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground'
  const Icon = directionUp ? ArrowUp : ArrowDown
  const fmt = entry.spec.format ?? ((n: number) => n.toFixed(1))
  return (
    <Link
      href={entry.spec.detailHref}
      aria-label={`Open ${entry.spec.label} detail`}
      className="block transition-transform hover:-translate-y-0.5"
    >
      <Card size="sm" className={cn('border-l-4 cursor-pointer', accentClass)}>
        <div className="flex items-center gap-4 px-4">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              entry.goodOrBad === 'good' &&
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              entry.goodOrBad === 'bad' && 'bg-red-500/10 text-red-600 dark:text-red-400',
              (entry.goodOrBad === 'neutral' || entry.goodOrBad === 'flat') &&
                'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption">{entry.spec.label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
              {entry.lastValue !== null ? fmt(entry.lastValue) : '—'}
              <span className="mx-2 text-muted-foreground">→</span>
              <span className={valueTone}>
                {entry.thisValue !== null ? fmt(entry.thisValue) : '—'}
                {entry.spec.unit && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {entry.spec.unit}
                  </span>
                )}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                entry.goodOrBad === 'good' && 'text-emerald-600 dark:text-emerald-400',
                entry.goodOrBad === 'bad' && 'text-red-600 dark:text-red-400',
                (entry.goodOrBad === 'neutral' || entry.goodOrBad === 'flat') &&
                  'text-muted-foreground',
              )}
            >
              {formatPct(entry.deltaPct)}
            </p>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
          </div>
        </div>
      </Card>
    </Link>
  )
}

const WINDOW_DAYS: Record<WindowKey, number> = { '7': 7, '14': 14, '30': 30 }
const WINDOW_LABEL: Record<WindowKey, string> = {
  '7': 'This week',
  '14': 'Last 14d',
  '30': 'Last 30d',
}

interface NarrativeRequestDelta {
  metric: string
  label: string
  unit?: string
  thisValue: number | null
  lastValue: number | null
  deltaPct: number | null
  goodDirection: 'up' | 'down' | 'neutral'
  goodOrBad: 'good' | 'bad' | 'neutral' | 'flat'
}

interface NarrativeResponse {
  narrative: string
  cached: boolean
  generated_at: string
  model: string
}

async function fetchNarrative(payload: {
  userId: string
  windowKey: WindowKey
  windowStart: string
  deltas: NarrativeRequestDelta[]
}): Promise<NarrativeResponse> {
  const res = await fetch('/api/ai/what-changed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`narrative ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json()
}

export function WhatChangedView({ data }: { data: PreviewData }) {
  const { user } = useAuth()
  const userId = user?.id
  const [windowKey, setWindowKey] = useState<WindowKey>('7')
  const days = WINDOW_DAYS[windowKey]

  const { major, minor, thisRangeLabel, lastRangeLabel, windowStartIso } = useMemo(() => {
    const today = data.today ? new Date(`${data.today}T00:00:00`) : new Date()
    const thisStart = new Date(today)
    thisStart.setDate(thisStart.getDate() - (days - 1))
    const lastStart = new Date(thisStart)
    lastStart.setDate(lastStart.getDate() - days)
    const windowStartIso = thisStart.toISOString().slice(0, 10)

    const dailyMaps = buildDailyMap(data)

    const sourceFor = (id: string) => {
      switch (id) {
        case 'sleep':
          return dailyMaps.sleep
        case 'hrv':
          return dailyMaps.hrv
        case 'rhr':
          return dailyMaps.rhr
        case 'active_energy':
          return dailyMaps.active
        case 'steps':
          return dailyMaps.steps
        case 'mood':
          return dailyMaps.mood
        case 'wrist_temp':
          return dailyMaps.wrist
        case 'weight':
          return dailyMaps.weight
      }
      return new Map<string, number>()
    }

    const entries = METRIC_SPECS.map((spec) => {
      const source = sourceFor(spec.id)
      const thisWindow = valuesForRange(source, thisStart, days)
      const lastWindow = valuesForRange(source, lastStart, days)
      return computeEntry(spec, thisWindow, lastWindow)
    })

    const ranked = [...entries].sort((a, b) => {
      const aHas = a.deltaPct !== null
      const bHas = b.deltaPct !== null
      if (aHas !== bHas) return aHas ? -1 : 1
      const absA = Math.abs(a.deltaPct ?? 0)
      const absB = Math.abs(b.deltaPct ?? 0)
      if (absB !== absA) return absB - absA
      return b.spec.priority - a.spec.priority
    })

    const top = ranked.filter((e) => e.deltaPct !== null).slice(0, 4)
    const topIds = new Set(top.map((e) => e.spec.id))
    const remaining = entries.filter((e) => !topIds.has(e.spec.id))

    return {
      major: top,
      minor: remaining,
      thisRangeLabel: formatDateRange(thisStart, days),
      lastRangeLabel: formatDateRange(lastStart, days),
      windowStartIso,
    }
  }, [data, days])

  const narrativeDeltas: NarrativeRequestDelta[] = useMemo(
    () =>
      major.map((e) => ({
        metric: e.spec.id,
        label: e.spec.label,
        unit: e.spec.unit,
        thisValue: e.thisValue,
        lastValue: e.lastValue,
        deltaPct: e.deltaPct,
        goodDirection: e.spec.goodDirection,
        goodOrBad: e.goodOrBad,
      })),
    [major],
  )

  const narrativeQuery = useQuery({
    queryKey: ['what-changed-narrative', userId, windowKey, windowStartIso],
    queryFn: () =>
      fetchNarrative({
        userId: userId!,
        windowKey,
        windowStart: windowStartIso,
        deltas: narrativeDeltas,
      }),
    enabled: !!userId && narrativeDeltas.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-bold leading-none tracking-tight md:text-4xl">
          What <span className="italic text-[color:var(--chart-3)]">changed</span>
        </h1>
        <div className="text-right text-[10px] uppercase tracking-wider text-muted-foreground font-mono leading-relaxed">
          <div>{thisRangeLabel}</div>
          <div className="text-muted-foreground/70">vs {lastRangeLabel}</div>
        </div>
      </div>

      <Tabs value={windowKey} onValueChange={(v) => setWindowKey(v as WindowKey)}>
        <TabsList className="w-full">
          <TabsTrigger value="7">{WINDOW_LABEL['7']}</TabsTrigger>
          <TabsTrigger value="14">{WINDOW_LABEL['14']}</TabsTrigger>
          <TabsTrigger value="30">{WINDOW_LABEL['30']}</TabsTrigger>
        </TabsList>
      </Tabs>

      {major.length === 0 ? (
        <Card size="sm">
          <p className="px-4 text-sm text-muted-foreground">
            Not enough data yet to compute deltas for this window. Try a shorter range or connect
            Apple Health and check back.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {major.map((entry) => (
            <MajorDeltaCard key={entry.spec.id} entry={entry} />
          ))}
        </div>
      )}

      <Card>
        <div className="px-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--chart-3)]" />
            <p className="text-caption text-[color:var(--chart-3)]">The story</p>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {narrativeQuery.data?.cached ? 'AI · cached' : 'AI'}
            </Badge>
          </div>
          {narrativeDeltas.length === 0 ? (
            <p className="text-base leading-relaxed text-muted-foreground">
              Need at least one delta in this window before a narrative makes sense.
            </p>
          ) : narrativeQuery.isLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ) : narrativeQuery.error ? (
            <p className="text-base leading-relaxed text-muted-foreground">
              Couldn&apos;t reach the narrative service. Numbers are still good — refresh to retry.
            </p>
          ) : narrativeQuery.data ? (
            <p className="text-base leading-relaxed">{narrativeQuery.data.narrative}</p>
          ) : null}
        </div>
      </Card>

      <div className="space-y-3">
        <p className="text-caption">Smaller shifts</p>
        <Card size="sm">
          <div className="divide-y divide-border px-4">
            {minor.map((entry) => (
              <Link
                key={entry.spec.id}
                href={entry.spec.detailHref}
                className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-muted/40 -mx-2 px-2 rounded"
              >
                <span className="text-muted-foreground font-mono text-xs">{entry.spec.label}</span>
                <span
                  className={cn(
                    'font-mono text-xs font-medium tabular-nums',
                    entry.goodOrBad === 'good' && 'text-emerald-600 dark:text-emerald-400',
                    entry.goodOrBad === 'bad' && 'text-red-600 dark:text-red-400',
                    (entry.goodOrBad === 'flat' || entry.goodOrBad === 'neutral') &&
                      'text-muted-foreground',
                  )}
                >
                  {entry.deltaAbs === null ? '—' : formatDelta(entry)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
