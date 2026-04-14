'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Flame,
  Footprints,
  HeartPulse,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAuth } from '@/lib/auth-context'
import { DailyActivityAggregate } from '@/lib/database'
import { ExerciseEvent, WorkoutRouteMeta } from '@/lib/types/database'
import dynamic from 'next/dynamic'

const WorkoutRouteMap = dynamic(() => import('@/components/workout-route-map').then((m) => m.WorkoutRouteMap), { ssr: false })
import { useExerciseData } from '@/hooks/useExerciseData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { RangeControls } from '@/components/range-controls'
import { MetricTile } from '@/components/metric-tile'
import { EmptyState as EmptyStateComponent } from '@/components/empty-state'

type AggregateView = 'week' | 'month' | 'year'

export default function ExercisePage() {
  const { user } = useAuth()
  const {
    workouts,
    dailySeries,
    aggregates,
    ecgReadings,
    heartRateNotifications,
    loading,
    error,
    healthSummary,
    exerciseSummary,
    range,
    shiftRange,
    routesByWorkoutId,
    setRangeMode,
    setAnchorDate,
  } = useExerciseData()
  const [aggregateView, setAggregateView] = useState<AggregateView>('week')
  const [ecgExpanded, setEcgExpanded] = useState(false)
  const [metricsExpanded, setMetricsExpanded] = useState(false)
  const rangeStartDate = range.startDate
  const rangeEndDate = range.endDate
  const rangeLabel = range.label
  const healthPending = workouts.length > 0 && !healthSummary.hasHealthData
  const chartData = dailySeries
  const errorMessage = error?.message ?? null

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

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">Unable to load exercise data</CardTitle>
            <CardDescription className="text-center">{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Exercise" description="Your activity and workout data" />

      <RangeControls
        mode={range.mode}
        anchorDate={range.anchorDate}
        rangeLabel={rangeLabel}
        rangeStartDate={rangeStartDate}
        rangeEndDate={rangeEndDate}
        onModeChange={setRangeMode}
        onAnchorDateChange={setAnchorDate}
        onShift={shiftRange}
        description="Choose the date granularity and anchor date for the dashboard."
      />

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricTile
          label="Steps"
          value={healthSummary.steps}
          icon={<Footprints className="h-4 w-4" />}
          size="lg"
          pending={healthPending && !healthSummary.steps}
        />
        <MetricTile
          label="Exercise"
          value={healthSummary.exerciseMinutes || exerciseSummary.minutes}
          unit="min"
          icon={<Activity className="h-4 w-4" />}
          size="lg"
        />
        <MetricTile
          label="Active Calories"
          value={healthSummary.activeEnergy || exerciseSummary.activeEnergy}
          unit="kcal"
          icon={<Flame className="h-4 w-4" />}
          size="lg"
        />
        <MetricTile
          label="Resting HR"
          value={healthSummary.restingHeartRateAvg}
          unit="bpm"
          icon={<HeartPulse className="h-4 w-4" />}
          size="lg"
          pending={healthPending && healthSummary.restingHeartRateAvg === null}
        />
      </div>

      {/* Collapsible More Metrics */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMetricsExpanded(!metricsExpanded)}
          className="w-full justify-between text-muted-foreground"
        >
          <span>{metricsExpanded ? 'Hide metrics' : 'Show more metrics'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${metricsExpanded ? 'rotate-180' : ''}`} />
        </Button>
        {metricsExpanded && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="HRV" value={healthSummary.hrvAvg} unit="ms" size="sm" pending={healthPending && healthSummary.hrvAvg === null} />
            <MetricTile label="VO2 Max" value={healthSummary.vo2maxAvg != null ? Number(healthSummary.vo2maxAvg).toFixed(1) : null} unit="ml/kg/min" size="sm" pending={healthPending && healthSummary.vo2maxAvg === null} />
            <MetricTile label="Distance" value={exerciseSummary.distance != null ? Number(exerciseSummary.distance).toFixed(2) : null} unit="km" size="sm" />
            <MetricTile label="Stand Hours" value={healthSummary.standHoursAvg != null ? Number(healthSummary.standHoursAvg).toFixed(1) : null} unit="hr/day" size="sm" pending={healthPending && healthSummary.standHoursAvg === null} />
            <MetricTile label="Move Minutes" value={exerciseSummary.moveMinutes} unit="min" size="sm" />
            <MetricTile label="Elevation" value={exerciseSummary.elevation} unit="m" size="sm" />
            <MetricTile label="Training Load" value={exerciseSummary.trimp} size="sm" />
          </div>
        )}
      </div>

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
              <p>No data for this range yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {workouts.map((workout) => (
                <WorkoutTile key={`${workout.id}-${workout.started_at}`} workout={workout} route={routesByWorkoutId.get(workout.id)} />
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
                  <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} tick={{ fontSize: 11 }} />
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
                  <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="exercise_time_minutes" fill="var(--chart-4)" name="Exercise minutes" />
                  <Bar dataKey="move_time_minutes" fill="var(--chart-2)" name="Move minutes" />
                  <Bar dataKey="active_energy_kcal" fill="var(--chart-1)" name="Active kcal" />
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
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Resting HR & HRV Trend
          </CardTitle>
          <CardDescription>
            Daily resting heart rate (bpm) and HRV (ms) between {rangeStartDate} and {rangeEndDate}.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {chartData.some((d) => d.resting_heart_rate != null || d.hrv != null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" orientation="left" domain={['auto', 'auto']} hide />
                <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} hide />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="resting_heart_rate"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  name="Resting HR (bpm)"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="hrv"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                  name="HRV (ms)"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
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

      {heartRateNotifications.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Heart Rate Alerts
            </CardTitle>
            <CardDescription>Notifications triggered by unusual heart rate readings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {heartRateNotifications.map((notification, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200">
                    {format(parseISO(notification.recorded_at), 'MMM d, yyyy @ h:mm a')}
                  </p>
                  <p className="text-red-700 dark:text-red-300">
                    {notification.notification_type} — {notification.heart_rate} bpm (threshold: {notification.threshold})
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ecgReadings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5" />
              ECG Readings
            </CardTitle>
            <CardDescription>Electrocardiogram results from Apple Watch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Latest ECG */}
            <div className="flex items-center gap-3 rounded-xl border p-4">
              {ecgReadings[0].classification === 'Sinus Rhythm' ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium">{ecgReadings[0].classification}</p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(ecgReadings[0].recorded_at), 'MMM d, yyyy @ h:mm a')}
                  {ecgReadings[0].average_heart_rate && ` — ${Math.round(ecgReadings[0].average_heart_rate)} bpm avg`}
                </p>
              </div>
              <Badge variant="outline">Latest</Badge>
            </div>

            {/* History toggle */}
            {ecgReadings.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEcgExpanded(!ecgExpanded)}
                  className="w-full justify-between"
                >
                  <span>{ecgReadings.length - 1} older reading{ecgReadings.length > 2 ? 's' : ''}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${ecgExpanded ? 'rotate-180' : ''}`} />
                </Button>
                {ecgExpanded && (
                  <div className="space-y-2">
                    {ecgReadings.slice(1).map((reading, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                        {reading.classification === 'Sinus Rhythm' ? (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                        )}
                        <span className="font-medium">{reading.classification}</span>
                        <span className="text-muted-foreground ml-auto">
                          {format(parseISO(reading.recorded_at), 'MMM d, yyyy')}
                          {reading.average_heart_rate && ` — ${Math.round(reading.average_heart_rate)} bpm`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {data.map((row) => (
          <div key={`${bucket}-card-${row.period}`} className="rounded-xl border p-3 space-y-2">
            <p className="font-medium">{formatAggregatePeriod(row.period, bucket)}</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <span>Active: {formatNumber(row.active_energy_kcal)} kcal</span>
              <span>Total: {formatNumber(row.total_energy_kcal)} kcal</span>
              <span>Exercise: {formatNumber(row.exercise_time_minutes)} min</span>
              <span>Move: {formatNumber(row.move_time_minutes)} min</span>
              <span>Steps: {formatNumber(row.steps)}</span>
              <span>Distance: {formatNumber(row.distance_km, { decimals: 2 })} km</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
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

interface WorkoutTileProps {
  workout: ExerciseEvent
  route?: WorkoutRouteMeta
}

function WorkoutTile({ workout, route }: WorkoutTileProps) {
  const startedLabel = workout.started_at
    ? format(parseISO(workout.started_at), 'EEE, MMM d @ h:mm a')
    : workout.workout_date
      ? format(parseISO(`${workout.workout_date}T00:00:00`), 'EEE, MMM d')
      : 'Unknown start'

  const totalMinutes = workout.total_minutes ?? (workout.duration_seconds ? Math.round(workout.duration_seconds / 60) : null)
  const avgHr = workout.avg_heart_rate ?? workout.avg_hr
  const maxHr = workout.max_heart_rate ?? workout.max_hr
  const minHr = workout.min_heart_rate ?? workout.min_hr
  const humidityPct = workout.humidity != null ? Math.round(Number(workout.humidity)) : null

  const hrZones = [
    { key: 0, label: 'Rest', seconds: workout.hrz0_seconds, color: 'bg-gray-400' },
    { key: 1, label: 'Easy', seconds: workout.hrz1_seconds, color: 'bg-blue-500' },
    { key: 2, label: 'Aerobic', seconds: workout.hrz2_seconds, color: 'bg-green-500' },
    { key: 3, label: 'Tempo', seconds: workout.hrz3_seconds, color: 'bg-yellow-500' },
    { key: 4, label: 'Threshold', seconds: workout.hrz4_seconds, color: 'bg-orange-500' },
    { key: 5, label: 'Max', seconds: workout.hrz5_seconds, color: 'bg-red-500' },
  ].map((z) => ({ ...z, seconds: Number(z.seconds ?? 0) }))
  const totalZoneSeconds = hrZones.reduce((sum, z) => sum + z.seconds, 0)
  const hasHrZones = totalZoneSeconds > 0

  return (
    <div className="border rounded-xl p-4 space-y-3">
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
      {route && route.point_count > 1 && <WorkoutRouteMap routeMeta={route} />}
      {/* Row 1: Duration, Energy, Distance, Speed */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <WorkoutStat label="Total minutes" value={totalMinutes} unit="min" />
        <WorkoutStat label="Active kcal" value={workout.active_energy_kcal} unit="kcal" />
        <WorkoutStat label="Distance" value={workout.distance_km} unit="km" decimals={2} />
        <WorkoutStat label="Avg Speed" value={workout.avg_speed_kmh} unit="km/h" decimals={1} />
      </div>
      {/* Row 2: Heart Rate, Elevation */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <WorkoutStat label="Avg HR" value={avgHr} unit="bpm" />
        <WorkoutStat label="Max HR" value={maxHr} unit="bpm" />
        <WorkoutStat label="Min HR" value={minHr} unit="bpm" />
        <WorkoutStat label="Elevation" value={workout.elevation_gain_m} unit="m" decimals={1} />
      </div>
      {/* Row 3: Conditions, Steps */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <WorkoutStat label="Temperature" value={workout.temperature} unit="°C" decimals={1} />
        <WorkoutStat label="Humidity" value={humidityPct} unit="%" raw />
        <WorkoutStat label="METs" value={workout.mets} decimals={2} />
        <WorkoutStat label="Steps" value={workout.step_count} />
      </div>
      {hasHrZones && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Heart Rate Zones</p>
          <div className="flex h-3 w-full overflow-hidden rounded">
            {hrZones.map((zone) =>
              zone.seconds > 0 ? (
                <div
                  key={zone.key}
                  className={zone.color}
                  style={{ width: `${(zone.seconds / totalZoneSeconds) * 100}%` }}
                  title={`${zone.label}: ${Math.round(zone.seconds / 60)} min`}
                />
              ) : null
            )}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-[11px] text-muted-foreground">
            {hrZones.map((zone) => (
              <div key={zone.key} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-sm ${zone.color}`} />
                <span>
                  {zone.label}: {Math.round(zone.seconds / 60)}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface WorkoutStatProps {
  label: string
  value: number | string | null | undefined
  unit?: string
  decimals?: number
}

function WorkoutStat({ label, value, unit, decimals, raw }: WorkoutStatProps & { raw?: boolean }) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return null

  const display = raw
    ? `${decimals != null ? numeric.toFixed(decimals) : Math.round(numeric)}`
    : formatNumber(value, { decimals })

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">
        {display}
        {unit ? ` ${unit}` : ''}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <EmptyStateComponent
      icon={<Activity className="h-8 w-8" />}
      title="No activity data yet"
      description="Data syncs automatically from Apple Health every 2 hours."
    />
  )
}
