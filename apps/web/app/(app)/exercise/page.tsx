'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import Link from 'next/link'
import {
  Activity,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Flame,
  Footprints,
  HeartPulse,
  MapPin,
  Timer,
  TrendingUp,
} from 'lucide-react'
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
  getExerciseEventsForRange,
} from '@/lib/database'
import { ExerciseEvent } from '@/lib/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type RangeMode = 'day' | 'week' | 'month' | 'year'
type AggregateView = 'week' | 'month' | 'year'

const RANGE_STORAGE_KEYS = {
  mode: 'exercise_range_mode',
  anchor: 'exercise_anchor_date',
} as const

export default function ExercisePage() {
  const { user } = useAuth()
  const [rangeMode, setRangeMode] = useState<RangeMode>('day')
  const [anchorDate, setAnchorDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [dailySeries, setDailySeries] = useState<DailyActivity[]>([])
  const [workouts, setWorkouts] = useState<ExerciseEvent[]>([])
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
    const storedMode = window.localStorage.getItem(RANGE_STORAGE_KEYS.mode) as RangeMode | null
    const storedAnchor = window.localStorage.getItem(RANGE_STORAGE_KEYS.anchor)
    if (storedMode) setRangeMode(storedMode)
    if (storedAnchor) setAnchorDate(storedAnchor)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(RANGE_STORAGE_KEYS.mode, rangeMode)
    window.localStorage.setItem(RANGE_STORAGE_KEYS.anchor, anchorDate)
  }, [rangeMode, anchorDate])

  useEffect(() => {
    setAnchorDate((current) => {
      const parsed = parseAnchorDate(current)
      const normalized = format(normalizeDateForMode(parsed, rangeMode), 'yyyy-MM-dd')
      return normalized === current ? current : normalized
    })
  }, [rangeMode])

  const anchorDateObj = useMemo(() => parseAnchorDate(anchorDate), [anchorDate])
  const rangeBounds = useMemo(() => computeRangeBounds(rangeMode, anchorDateObj), [rangeMode, anchorDateObj])
  const rangeStartDate = format(rangeBounds.start, 'yyyy-MM-dd')
  const rangeEndDate = format(rangeBounds.end, 'yyyy-MM-dd')
  const eventRange = useMemo(() => {
    const exclusiveEnd = addDays(rangeBounds.end, 1)
    return {
      startIso: rangeBounds.start.toISOString(),
      endIso: exclusiveEnd.toISOString(),
    }
  }, [rangeBounds])
  const rangeLabel = formatRangeLabel(rangeMode, rangeBounds.start, rangeBounds.end)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      setLoading(true)
      setError(null)
      try {
        const workoutsPromise = getExerciseEventsForRange(user.id, eventRange.startIso, eventRange.endIso)
        const weeklyAggPromise = getActivityAggregates(user.id, 'week', 12, rangeStartDate, rangeEndDate)
        const monthlyAggPromise = getActivityAggregates(user.id, 'month', 12, rangeStartDate, rangeEndDate)
        const yearlyAggPromise = getActivityAggregates(user.id, 'year', 5, rangeStartDate, rangeEndDate)

        const workoutsResult = await workoutsPromise
        const dailyRangePromise = getDailyActivityRange(user.id, rangeStartDate, rangeEndDate, {
          workouts: workoutsResult,
        })

        const [dailyRange, weeklyAgg, monthlyAgg, yearlyAgg] = await Promise.all([
          dailyRangePromise,
          weeklyAggPromise,
          monthlyAggPromise,
          yearlyAggPromise,
        ])

        setWorkouts(workoutsResult)
        setDailySeries(dailyRange)
        setAggregates({
          week: weeklyAgg,
          month: monthlyAgg,
          year: yearlyAgg,
        })
      } catch (err) {
        console.error('Failed to load exercise data:', err)
        setError('Unable to load exercise data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.id, eventRange.startIso, eventRange.endIso, rangeStartDate, rangeEndDate])

  const exerciseSummary = useMemo(() => summarizeWorkouts(workouts), [workouts])
  const healthSummary = useMemo(() => summarizeHealth(dailySeries), [dailySeries])
  const healthPending = workouts.length > 0 && !healthSummary.hasHealthData

  const chartData = useMemo(() => dailySeries, [dailySeries])

  const handleShiftRange = (direction: number) => {
    setAnchorDate((current) => {
      const shifted = shiftAnchor(parseAnchorDate(current), rangeMode, direction)
      return format(normalizeDateForMode(shifted, rangeMode), 'yyyy-MM-dd')
    })
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return
    setAnchorDate(format(normalizeDateForMode(date, rangeMode), 'yyyy-MM-dd'))
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise</h1>
        <p className="text-muted-foreground">
          Raw workout events merged with daily health metrics. Pick any period to explore.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Controls</CardTitle>
          <CardDescription>Choose the date granularity and anchor date for the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={rangeMode} onValueChange={(value) => setRangeMode(value as RangeMode)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => handleShiftRange(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  <span>{rangeLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0">
                <Calendar
                  mode="single"
                  selected={anchorDateObj}
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => handleShiftRange(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{rangeLabel}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Range Summary</CardTitle>
            <CardDescription>Movement totals and health signals for {rangeLabel.toLowerCase()}.</CardDescription>
          </div>
          {healthPending && (
            <Badge variant="secondary" className="text-xs">
              Health metrics pending sync
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryTile
              label="Exercise Minutes"
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              value={exerciseSummary.minutes}
              unit="min"
              description="Structured workouts logged"
            />
            <SummaryTile
              label="Move Minutes"
              icon={<Timer className="h-4 w-4 text-muted-foreground" />}
              value={exerciseSummary.moveMinutes}
              unit="min"
              description="All movement inside workouts"
            />
            <SummaryTile
              label="Active Calories"
              icon={<Flame className="h-4 w-4 text-muted-foreground" />}
              value={exerciseSummary.activeEnergy}
              unit="kcal"
              description="Burned via exercise"
            />
            <SummaryTile
              label="Distance"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              value={exerciseSummary.distance}
              unit="km"
              decimals={2}
              description="Tracked workout distance"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryTile
              label="Steps"
              icon={<Footprints className="h-4 w-4 text-muted-foreground" />}
              value={healthSummary.steps}
              description="Sum of captured days"
              pending={healthPending && !healthSummary.steps}
            />
            <SummaryTile
              label="Resting Heart Rate"
              icon={<HeartPulse className="h-4 w-4 text-muted-foreground" />}
              value={healthSummary.restingHeartRateAvg}
              unit="bpm"
              description="Average of synced days"
              pending={healthPending && healthSummary.restingHeartRateAvg === null}
            />
            <SummaryTile
              label="HRV"
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              value={healthSummary.hrvAvg}
              unit="ms"
              description="Average variability"
              pending={healthPending && healthSummary.hrvAvg === null}
            />
            <SummaryTile
              label="VO2 Max"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              value={healthSummary.vo2maxAvg}
              unit="ml/kg/min"
              decimals={1}
              description="Average aerobic fitness"
              pending={healthPending && healthSummary.vo2maxAvg === null}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workouts in Range</CardTitle>
          <CardDescription>
            Pulled directly from exercise_events and sorted by real workout start times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workouts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 space-y-2">
              <p className="text-lg font-medium">No workouts yet for this range.</p>
              <p>Import or sync from HealthFit to populate these tiles.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {workouts.map((workout) => (
                <WorkoutTile key={`${workout.id}-${workout.started_at}`} workout={workout} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Steps & Distance Trend
            </CardTitle>
            <CardDescription>Every day between {rangeStartDate} and {rangeEndDate}.</CardDescription>
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
            <CardDescription>Range-based comparison between workouts and energy output.</CardDescription>
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
          <CardDescription>Weekly, monthly, and yearly rollups straight from Supabase SQL.</CardDescription>
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
          <CardDescription>Merged daily records from v_daily_activity with exercise_event fallbacks.</CardDescription>
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
              {dailySeries.map((day) => (
                <tr key={day.date} className="border-t">
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

function formatNumber(
  value: number | string | null | undefined,
  opts: { decimals?: number } = {}
) {
  if (value === null || value === undefined) return '--'
  const decimals = opts.decimals ?? 0
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return '--'
  const factor = Math.pow(10, decimals)
  const rounded = decimals > 0 ? Math.round(numeric * factor) / factor : Math.round(numeric)
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const renderAggregateTable = (data: DailyActivityAggregate[], bucket: AggregateView) => {
  if (!data.length) {
    return <EmptyState />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2">Period</th>
            <th className="py-2">Active kcal</th>
            <th className="py-2">Total energy</th>
            <th className="py-2">Exercise (min)</th>
            <th className="py-2">Move (min)</th>
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

interface SummaryTileProps {
  label: string
  icon: ReactNode
  value: number | string | null | undefined
  unit?: string
  description?: string
  decimals?: number
  pending?: boolean
}

function SummaryTile({ label, icon, value, unit, description, decimals, pending }: SummaryTileProps) {
  const hasValue = value !== null && value !== undefined
  const formattedValue = hasValue ? `${formatNumber(value, { decimals })}${unit ? ` ${unit}` : ''}` : '--'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{pending && !hasValue ? 'Pending' : formattedValue}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

interface WorkoutTileProps {
  workout: ExerciseEvent
}

function WorkoutTile({ workout }: WorkoutTileProps) {
  const startedLabel = workout.started_at
    ? format(parseISO(workout.started_at), 'EEE, MMM d @ h:mm a')
    : workout.workout_date
      ? format(parseISO(`${workout.workout_date}T00:00:00`), 'EEE, MMM d')
      : 'Unknown start'

  const heartRatePieces: string[] = []
  if (workout.avg_hr) {
    heartRatePieces.push(`avg ${Math.round(workout.avg_hr)} bpm`)
  }
  const rangePieces: string[] = []
  if (workout.min_hr) rangePieces.push(`min ${Math.round(workout.min_hr)}`)
  if (workout.max_hr) rangePieces.push(`max ${Math.round(workout.max_hr)}`)
  if (rangePieces.length) {
    heartRatePieces.push(`${rangePieces.join(' / ')} bpm`)
  }
  const heartRateLabel = heartRatePieces.join(' | ')

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold capitalize">{workout.workout_type || 'Workout'}</p>
          <p className="text-sm text-muted-foreground">{startedLabel}</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1">
          {workout.source && (
            <Badge variant="outline" className="text-xs uppercase tracking-wide">
              {workout.source}
            </Badge>
          )}
          {workout.started_at && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {workout.started_at}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <WorkoutStat label="Total minutes" value={workout.total_minutes} unit="min" />
        <WorkoutStat label="Move minutes" value={workout.move_minutes} unit="min" />
        <WorkoutStat label="Active kcal" value={workout.active_energy_kcal} unit="kcal" />
        <WorkoutStat label="Distance" value={workout.distance_km} unit="km" decimals={2} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <HeartPulse className="h-3.5 w-3.5" />
          <span>{heartRateLabel || 'No heart-rate sample'}</span>
        </div>
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            GPX route pending
          </Badge>
        </div>
      </div>
    </div>
  )
}

interface WorkoutStatProps {
  label: string
  value: number | string | null | undefined
  unit?: string
  decimals?: number
}

function WorkoutStat({ label, value, unit, decimals }: WorkoutStatProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">
        {formatNumber(value, { decimals })}
        {unit ? ` ${unit}` : ''}
      </p>
    </div>
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

const parseAnchorDate = (value: string) => {
  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const normalizeDateForMode = (date: Date, mode: RangeMode) => {
  switch (mode) {
    case 'week':
      return startOfDay(startOfWeek(date, { weekStartsOn: 1 }))
    case 'month':
      return startOfDay(startOfMonth(date))
    case 'year':
      return startOfDay(startOfYear(date))
    case 'day':
    default:
      return startOfDay(date)
  }
}

const computeRangeBounds = (mode: RangeMode, anchor: Date) => {
  const start = normalizeDateForMode(anchor, mode)
  let end = start
  switch (mode) {
    case 'week':
      end = startOfDay(endOfWeek(start, { weekStartsOn: 1 }))
      break
    case 'month':
      end = startOfDay(endOfMonth(start))
      break
    case 'year':
      end = startOfDay(endOfYear(start))
      break
    case 'day':
    default:
      end = start
      break
  }
  return { start, end }
}

const formatRangeLabel = (mode: RangeMode, start: Date, end: Date) => {
  if (mode === 'day') {
    return format(start, 'EEEE, MMM d, yyyy')
  }
  if (mode === 'week') {
    const sameMonth = start.getMonth() === end.getMonth()
    const startLabel = format(start, 'MMM d')
    const endLabel = sameMonth ? format(end, 'd, yyyy') : format(end, 'MMM d, yyyy')
    return `${startLabel} - ${endLabel}`
  }
  if (mode === 'month') {
    return format(start, 'MMMM yyyy')
  }
  return format(start, 'yyyy')
}

const shiftAnchor = (date: Date, mode: RangeMode, direction: number) => {
  switch (mode) {
    case 'week':
      return addWeeks(date, direction)
    case 'month':
      return addMonths(date, direction)
    case 'year':
      return addYears(date, direction)
    case 'day':
    default:
      return addDays(date, direction)
  }
}

const summarizeWorkouts = (events: ExerciseEvent[]) =>
  events.reduce(
    (acc, workout) => {
      acc.minutes += numberFromValue(workout.total_minutes)
      acc.moveMinutes += numberFromValue(workout.move_minutes)
      acc.activeEnergy += numberFromValue(workout.active_energy_kcal)
      acc.distance += numberFromValue(workout.distance_km)
      return acc
    },
    { minutes: 0, moveMinutes: 0, activeEnergy: 0, distance: 0 }
  )

const summarizeHealth = (series: DailyActivity[]) => {
  let steps = 0
  let restingHeartRateTotal = 0
  let restingHeartRateCount = 0
  let hrvTotal = 0
  let hrvCount = 0
  let vo2Total = 0
  let vo2Count = 0
  const hasHealthData = series.some(hasHealthMetrics)

  for (const day of series) {
    steps += numberFromValue(day.steps)
    if (day.resting_heart_rate !== null && day.resting_heart_rate !== undefined) {
      restingHeartRateTotal += Number(day.resting_heart_rate)
      restingHeartRateCount++
    }
    if (day.hrv !== null && day.hrv !== undefined) {
      hrvTotal += Number(day.hrv)
      hrvCount++
    }
    if (day.vo2max !== null && day.vo2max !== undefined) {
      vo2Total += Number(day.vo2max)
      vo2Count++
    }
  }

  return {
    steps,
    restingHeartRateAvg: restingHeartRateCount ? restingHeartRateTotal / restingHeartRateCount : null,
    hrvAvg: hrvCount ? hrvTotal / hrvCount : null,
    vo2maxAvg: vo2Count ? vo2Total / vo2Count : null,
    hasHealthData,
  }
}

const hasHealthMetrics = (day: DailyActivity) =>
  day.total_energy_kcal !== null ||
  day.resting_energy_kcal !== null ||
  day.steps !== null ||
  day.resting_heart_rate !== null ||
  day.hrv !== null ||
  day.vo2max !== null

const numberFromValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
