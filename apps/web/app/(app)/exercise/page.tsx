'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, startOfYear, subDays } from 'date-fns'
import { Activity, Flame, Footprints, Timer, TrendingUp, Zap } from 'lucide-react'
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

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString(undefined, options)
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
        setSelectedDate(dailyRange.at(-1)?.date ?? null)
      } catch (err) {
        console.error('Failed to load activity data:', err)
        setError('Unable to load exercise data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user, rangePreset])

  const selectedActivity = useMemo(() => {
    if (!selectedDate) return rangeData.at(-1) ?? null
    return rangeData.find((day) => day.date === selectedDate) ?? rangeData.at(-1) ?? null
  }, [rangeData, selectedDate])

  const chartData = useMemo(() => rangeData, [rangeData])

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
        <div className="text-center text-muted-foreground py-8">
          No aggregated data available for this period.
        </div>
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
                <td className="py-2">{formatNumber(row.distance_km, { maximumFractionDigits: 2 })}</td>
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
          <CardDescription>
            Pick a time range for charts and choose a day for the summary tiles below.
          </CardDescription>
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
            <Select value={selectedActivity.date} onValueChange={setSelectedDate}>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exercise Time</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.exercise_time_minutes)} min
            </div>
            <p className="text-xs text-muted-foreground">Structured workouts only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Move Time</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.move_time_minutes)} min
            </div>
            <p className="text-xs text-muted-foreground">All activity including walking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calories</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.active_energy_kcal)} kcal
            </div>
            <p className="text-xs text-muted-foreground">Calories burned through movement</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Steps</CardTitle>
            <Footprints className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(selectedActivity.steps)}</div>
            <p className="text-xs text-muted-foreground">Daily total steps</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Energy</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.total_energy_kcal)} kcal
            </div>
            <p className="text-xs text-muted-foreground">Resting + active expenditure</p>
          </CardContent>
        </Card>
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
              <div className="text-center text-muted-foreground py-8">No data for this range.</div>
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
              <div className="text-center text-muted-foreground py-8">No data for this range.</div>
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
                  <td className="py-2">{formatNumber(day.distance_km, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
