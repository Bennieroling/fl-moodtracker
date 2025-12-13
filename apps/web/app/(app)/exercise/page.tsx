'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { format, parseISO, startOfYear, subDays } from 'date-fns'
import Link from 'next/link'
import { Activity, Flame, Footprints, Timer, TrendingUp, Zap, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAuth } from '@/lib/auth-context'
import {
  DailyActivity,
  DailyActivityAggregate,
  getActivityAggregates,
  getDailyActivityRange,
} from '@/lib/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type RangePreset = '7d' | '30d' | '90d' | 'ytd'
type AggregateView = 'week' | 'month' | 'year'

const RANGE_PRESETS: { label: string; value: RangePreset; days?: number }[] = [
  { label: 'Last 7 days', value: '7d', days: 7 },
  { label: 'Last 30 days', value: '30d', days: 30 },
  { label: 'Last 90 days', value: '90d', days: 90 },
  { label: 'Year to date', value: 'ytd' },
]
const STORAGE_KEYS = {
  range: 'exercise_range_preset',
  date: 'exercise_selected_date',
} as const

function formatNumber(
  value: number | string | null | undefined,
  opts: { decimals?: number } = {}
) {
  if (value === null || value === undefined) return '—'
  const decimals = opts.decimals ?? 0
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return '—'
  const factor = Math.pow(10, decimals)
  const rounded = decimals > 0 ? Math.round(numeric * factor) / factor : Math.round(numeric)
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function computeRange(preset: RangePreset) {
  const end = new Date()
  let start: Date
  switch (preset) {
    case '7d':
      start = subDays(end, 6)
      break
    case '30d':
      start = subDays(end, 29)
      break
    case '90d':
      start = subDays(end, 89)
      break
    case 'ytd':
    default:
      start = startOfYear(end)
      break
  }
  return { start, end }
}

function formatAggregatePeriod(period: string, bucket: AggregateView) {
  const parsed = parseISO(period)
  if (bucket === 'year') {
    return format(parsed, 'yyyy')
  }
  if (bucket === 'month') {
    return format(parsed, 'MMMM yyyy')
  }
  return `Week of ${format(parsed, 'MMM d, yyyy')}`
}

export default function ExercisePage() {
  const { user } = useAuth()
  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [rangeData, setRangeData] = useState<DailyActivity[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aggregateView, setAggregateView] = useState<AggregateView>('week')
  const [aggregates, setAggregates] = useState<{
    week: DailyActivityAggregate[]
    month: DailyActivityAggregate[]
    year: DailyActivityAggregate[]
  }>({ week: [], month: [], year: [] })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedRange = window.localStorage.getItem(STORAGE_KEYS.range) as RangePreset | null
    if (storedRange && RANGE_PRESETS.some((preset) => preset.value === storedRange)) {
      setRangePreset(storedRange)
    }
  }, [])

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return
      setLoading(true)
      setError(null)
      try {
        const { start, end } = computeRange(rangePreset)
        const startStr = format(start, 'yyyy-MM-dd')
        const endStr = format(end, 'yyyy-MM-dd')

        const [dailyRange, weeklyAgg, monthlyAgg, yearlyAgg] = await Promise.all([
          getDailyActivityRange(user.id, startStr, endStr),
          getActivityAggregates(user.id, 'week', 12, startStr, endStr),
          getActivityAggregates(user.id, 'month', 12, startStr, endStr),
          getActivityAggregates(user.id, 'year', 5, startStr, endStr),
        ])

        setRangeData(dailyRange)
        setAggregates({
          week: weeklyAgg,
          month: monthlyAgg,
          year: yearlyAgg,
        })
        const storedDate = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEYS.date) : null
        const fallbackDate = dailyRange.at(-1)?.date ?? null
        if (storedDate && dailyRange.some((day) => day.date === storedDate)) {
          setSelectedDate(storedDate)
        } else {
          setSelectedDate(fallbackDate)
        }
      } catch (err) {
        console.error('Failed to load activity data:', err)
        setError('Unable to load exercise data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, rangePreset])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.range, rangePreset)
  }, [rangePreset])

  useEffect(() => {
    if (!selectedDate || typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEYS.date, selectedDate)
  }, [selectedDate])

  const selectedActivity = useMemo(() => {
    if (!selectedDate) return rangeData.at(-1) ?? null
    return rangeData.find((day) => day.date === selectedDate) ?? rangeData.at(-1) ?? null
  }, [rangeData, selectedDate])

  const chartData = useMemo(() => rangeData, [rangeData])
  const previousEntry = useMemo(() => {
    if (!selectedActivity) return null
    const idx = rangeData.findIndex((day) => day.date === selectedActivity.date)
    if (idx > 0) {
      return rangeData[idx - 1]
    }
    return null
  }, [rangeData, selectedActivity])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">Unable to load exercise data</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!selectedActivity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">No data for this range</CardTitle>
            <CardDescription className="text-center">
              Import HealthFit data to unlock your exercise dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const renderAggregateTable = (data: DailyActivityAggregate[], bucket: AggregateView) => {
    if (!data.length) {
      return (
        <EmptyState />
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Period</th>
              <th className="py-2">Active kcal</th>
              <th className="py-2">Total energy</th>
              <th className="py-2">Exercise min</th>
              <th className="py-2">Move min</th>
              <th className="py-2">Steps</th>
              <th className="py-2">Distance (km)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${bucket}-${row.period}`} className="border-t">
                <td className="py-2 font-medium">{formatAggregatePeriod(row.period, bucket)}</td>
                <td className="py-2">{formatNumber(row.active_energy_kcal)}</td>
                <td className="py-2">{formatNumber(row.total_energy_kcal)}</td>
                <td className="py-2">{formatNumber(row.exercise_time_minutes)}</td>
                <td className="py-2">{formatNumber(row.move_time_minutes)}</td>
                <td className="py-2">{formatNumber(row.steps)}</td>
                <td className="py-2">{formatNumber(row.distance_km, { decimals: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise</h1>
        <p className="text-muted-foreground">
          Daily movement, calories, and steps sourced directly from HealthFit/Supabase.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Controls</CardTitle>
          <CardDescription>Pick a range for charts and choose which day the summary tiles show.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={rangePreset === preset.value ? 'default' : 'outline'}
                onClick={() => setRangePreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2 max-w-xs">
            <Label htmlFor="summary-date">Summary date</Label>
            <Select value={selectedActivity?.date} onValueChange={setSelectedDate}>
              <SelectTrigger id="summary-date">
                <SelectValue placeholder="Select date" />
              </SelectTrigger>
              <SelectContent>
                {rangeData
                  .slice()
                  .reverse()
                  .map((day) => (
                    <SelectItem key={day.date} value={day.date}>
                      {format(parseISO(day.date), 'EEE, MMM d, yyyy')}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Exercise Time"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          value={selectedActivity?.exercise_time_minutes}
          previousValue={previousEntry?.exercise_time_minutes}
          unit="min"
          description="Structured workouts only"
        />
        <MetricCard
          label="Move Time"
          icon={<Timer className="h-4 w-4 text-muted-foreground" />}
          value={selectedActivity?.move_time_minutes}
          previousValue={previousEntry?.move_time_minutes}
          unit="min"
          description="All activity including walking"
        />
        <MetricCard
          label="Active Calories"
          icon={<Flame className="h-4 w-4 text-muted-foreground" />}
          value={selectedActivity?.active_energy_kcal}
          previousValue={previousEntry?.active_energy_kcal}
          unit="kcal"
          description="Calories burned through movement"
        />
        <MetricCard
          label="Steps"
          icon={<Footprints className="h-4 w-4 text-muted-foreground" />}
          value={selectedActivity?.steps}
          previousValue={previousEntry?.steps}
          description="Daily total steps"
        />
        <MetricCard
          label="Total Energy"
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
          value={selectedActivity?.total_energy_kcal}
          previousValue={previousEntry?.total_energy_kcal}
          unit="kcal"
          description="Resting + active expenditure"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Steps & Distance Trend
            </CardTitle>
            <CardDescription>Shows the full selected range straight from Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="steps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Area type="monotone" dataKey="steps" stroke="#10b981" fill="url(#steps)" name="Steps" />
                  <Area
                    type="monotone"
                    dataKey="distance_km"
                    stroke="#6366f1"
                    fill="rgba(99, 102, 241, 0.1)"
                    name="Distance (km)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Movement Minutes vs Active Energy
            </CardTitle>
            <CardDescription>Range-based comparison of structured vs general movement.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Bar dataKey="exercise_time_minutes" fill="#2563eb" name="Exercise minutes" />
                  <Bar dataKey="move_time_minutes" fill="#f97316" name="Move minutes" />
                  <Bar dataKey="active_energy_kcal" fill="#ef4444" name="Active kcal" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aggregated Activity</CardTitle>
          <CardDescription>Weekly, monthly, and yearly rollups computed directly in SQL.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={aggregateView} onValueChange={(value) => setAggregateView(value as AggregateView)}>
            <TabsList>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="month">Monthly</TabsTrigger>
              <TabsTrigger value="year">Yearly</TabsTrigger>
            </TabsList>
            <TabsContent value="week">{renderAggregateTable(aggregates.week, 'week')}</TabsContent>
            <TabsContent value="month">{renderAggregateTable(aggregates.month, 'month')}</TabsContent>
            <TabsContent value="year">{renderAggregateTable(aggregates.year, 'year')}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Overview</CardTitle>
          <CardDescription>Each record is pulled straight from v_daily_activity (no client math).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Date</th>
                <th className="py-2">Exercise (min)</th>
                <th className="py-2">Move (min)</th>
                <th className="py-2">Active kcal</th>
                <th className="py-2">Total energy</th>
                <th className="py-2">Steps</th>
                <th className="py-2">Distance (km)</th>
              </tr>
            </thead>
            <tbody>
              {rangeData.map((day) => (
                <tr key={day.date} className={`border-t ${day.date === selectedActivity.date ? 'bg-muted/50' : ''}`}>
                  <td className="py-2 font-medium">{format(parseISO(day.date), 'MMM d, yyyy')}</td>
                  <td className="py-2">{formatNumber(day.exercise_time_minutes)}</td>
                  <td className="py-2">{formatNumber(day.move_time_minutes)}</td>
                  <td className="py-2">{formatNumber(day.active_energy_kcal)}</td>
                  <td className="py-2">{formatNumber(day.total_energy_kcal)}</td>
                  <td className="py-2">{formatNumber(day.steps)}</td>
                  <td className="py-2">{formatNumber(day.distance_km, { decimals: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

interface MetricCardProps {
  label: string
  icon: ReactNode
  value: number | string | null | undefined
  previousValue: number | string | null | undefined
  unit?: string
  description: string
}

function MetricCard({ label, icon, value, previousValue, unit, description }: MetricCardProps) {
  const formattedValue =
    value === null || value === undefined ? '—' : `${formatNumber(value)}${unit ? ` ${unit}` : ''}`
  const numericValue = value === null || value === undefined ? null : Number(value)
  const numericPrev = previousValue === null || previousValue === undefined ? null : Number(previousValue)
  const delta =
    numericValue !== null && !Number.isNaN(numericValue) && numericPrev !== null && !Number.isNaN(numericPrev)
      ? numericValue - numericPrev
      : null
  const hasDelta = delta !== null && delta !== 0
  const TrendIcon = delta && delta > 0 ? ArrowUpRight : ArrowDownRight
  const deltaText =
    delta === null
      ? 'No previous day'
      : hasDelta
        ? `${delta > 0 ? '+' : ''}${formatNumber(Math.abs(delta))}${unit ? ` ${unit}` : ''} vs prev day`
        : 'No change vs prev day'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{formattedValue}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="text-xs flex items-center gap-1">
          {delta !== null ? (
            <>
              {hasDelta && (
                <TrendIcon className={`h-3 w-3 ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`} />
              )}
              <span className={hasDelta ? (delta > 0 ? 'text-emerald-700' : 'text-red-600') : 'text-muted-foreground'}>
                {deltaText}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No previous day</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center text-muted-foreground">
      <p>No HealthFit data for this range yet. Import a recent export to unlock trends.</p>
      <Button asChild variant="outline">
        <Link href="/seed-data">Import HealthFit data</Link>
      </Button>
    </div>
  )
}
