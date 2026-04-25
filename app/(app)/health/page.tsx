'use client'

import { format, parseISO } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  Bed,
  Check,
  ChevronDown,
  HeartPulse,
  Moon,
  Percent,
  Scale,
  Thermometer,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import {
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
import { useHealthData } from '@/hooks/useHealthData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BodyStatTile } from '@/components/body-stat-tile'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { RangeControls } from '@/components/range-controls'

export default function HealthPage() {
  const { user } = useAuth()
  const {
    bodyFatSeries,
    weightSeries,
    latestBody,
    dailyActivity,
    ecgReadings,
    heartRateNotifications,
    sleepEvents,
    latestSleep,
    wristTempSeries,
    healthSummary,
    sleepSummary,
    loading,
    error,
    range,
    shiftRange,
    setRangeMode,
    setAnchorDate,
  } = useHealthData()
  const [ecgExpanded, setEcgExpanded] = useState(false)

  if (!user || loading) {
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
            <CardTitle className="text-center">Unable to load health data</CardTitle>
            <CardDescription className="text-center">{error.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const hrHrvSeries = dailyActivity
  const hasHrData = hrHrvSeries.some((d) => d.resting_heart_rate != null)
  const hasHrvData = hrHrvSeries.some((d) => d.hrv != null)

  return (
    <div className="space-y-6">
      <PageHeader title="Health" description="Your vitals, recovery, and body trends." />

      <RangeControls
        mode={range.mode}
        anchorDate={range.anchorDate}
        rangeLabel={range.label}
        rangeStartDate={range.startDate}
        rangeEndDate={range.endDate}
        onModeChange={setRangeMode}
        onAnchorDateChange={setAnchorDate}
        onShift={shiftRange}
        description="Choose the date granularity and anchor date for health metrics."
      />

      {/* Sleep */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Sleep
          </CardTitle>
          <CardDescription>
            {latestSleep?.date
              ? `Last night: ${format(parseISO(latestSleep.date), 'MMM d, yyyy')}`
              : 'No sleep data synced yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <BodyStatTile
              label="Total"
              icon={<Bed className="h-4 w-4 text-muted-foreground" />}
              value={latestSleep?.total_sleep_hours}
              unit="h"
              decimals={1}
            />
            <BodyStatTile label="REM" value={latestSleep?.rem_hours} unit="h" decimals={1} />
            <BodyStatTile label="Core" value={latestSleep?.core_hours} unit="h" decimals={1} />
            <BodyStatTile label="Deep" value={latestSleep?.deep_hours} unit="h" decimals={1} />
            <BodyStatTile label="Awake" value={latestSleep?.awake_hours} unit="h" decimals={1} />
          </div>
          <div className="h-80">
            {sleepEvents.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sleepEvents}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                    }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="deep_hours" stackId="sleep" fill="var(--chart-4)" name="Deep (h)" />
                  <Bar dataKey="core_hours" stackId="sleep" fill="var(--chart-3)" name="Core (h)" />
                  <Bar dataKey="rem_hours" stackId="sleep" fill="var(--chart-5)" name="REM (h)" />
                  <Bar
                    dataKey="awake_hours"
                    stackId="sleep"
                    fill="var(--chart-2)"
                    name="Awake (h)"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={<Moon className="h-8 w-8" />}
                title="No sleep data for this range."
                description="Sleep syncs automatically from Apple Health."
              />
            )}
          </div>
          {sleepSummary.totalAvg != null && (
            <p className="text-sm text-muted-foreground">
              Avg total {sleepSummary.totalAvg.toFixed(1)}h
              {sleepSummary.remAvg != null && ` · REM ${sleepSummary.remAvg.toFixed(1)}h`}
              {sleepSummary.deepAvg != null && ` · Deep ${sleepSummary.deepAvg.toFixed(1)}h`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Body */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Body
          </CardTitle>
          <CardDescription>
            {latestBody?.date
              ? `Latest measurement on ${format(parseISO(latestBody.date), 'MMM d, yyyy')}`
              : 'No measurements synced yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BodyStatTile
              label="Weight"
              icon={<Scale className="h-4 w-4 text-muted-foreground" />}
              value={latestBody?.weight_kg}
              unit="kg"
              decimals={1}
            />
            <BodyStatTile
              label="Body Fat"
              icon={<Percent className="h-4 w-4 text-muted-foreground" />}
              value={latestBody?.body_fat_pct}
              unit="%"
              decimals={1}
            />
            <BodyStatTile
              label="BMI"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              value={latestBody?.bmi}
              decimals={1}
            />
          </div>
          <div className="h-72">
            {weightSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightSeries}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                    }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight_kg"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    name="Weight (kg)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={<Scale className="h-8 w-8" />}
                title="No weight data for this range."
                description="Weight syncs automatically from Apple Health."
              />
            )}
          </div>
          {bodyFatSeries.length > 0 && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bodyFatSeries}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                    }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="body_fat_pct"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                    name="Body Fat (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Heart Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Heart Rate
          </CardTitle>
          <CardDescription>
            Resting heart rate between {range.startDate} and {range.endDate}.
            {healthSummary.restingHeartRateAvg != null &&
              ` Avg ${Math.round(healthSummary.restingHeartRateAvg)} bpm.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72">
            {hasHrData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hrHrvSeries}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                    }}
                    labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="resting_heart_rate"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    name="Resting HR (bpm)"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={<HeartPulse className="h-8 w-8" />}
                title="No heart rate data for this range."
              />
            )}
          </div>
          {heartRateNotifications.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Heart rate alerts
              </p>
              {heartRateNotifications.map((notification, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30"
                >
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-red-800 dark:text-red-200">
                      {format(parseISO(notification.recorded_at), 'MMM d, yyyy @ h:mm a')}
                    </p>
                    <p className="text-red-700 dark:text-red-300">
                      {notification.notification_type} — {notification.heart_rate} bpm (threshold:{' '}
                      {notification.threshold})
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* HRV */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            HRV
          </CardTitle>
          <CardDescription>
            Heart rate variability between {range.startDate} and {range.endDate}.
            {healthSummary.hrvAvg != null && ` Avg ${Math.round(healthSummary.hrvAvg)} ms.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {hasHrvData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hrHrvSeries}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                  tick={{ fontSize: 11 }}
                />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                  }}
                  labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="hrv"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  name="HRV (ms)"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<Activity className="h-8 w-8" />}
              title="No HRV data for this range."
            />
          )}
        </CardContent>
      </Card>

      {/* ECG */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            ECG
          </CardTitle>
          <CardDescription>Electrocardiogram results from Apple Watch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ecgReadings.length ? (
            <>
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
                    {ecgReadings[0].average_heart_rate &&
                      ` — ${Math.round(ecgReadings[0].average_heart_rate)} bpm avg`}
                  </p>
                </div>
                <Badge variant="outline">Latest</Badge>
              </div>
              {ecgReadings.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEcgExpanded(!ecgExpanded)}
                    className="w-full justify-between"
                  >
                    <span>
                      {ecgReadings.length - 1} older reading{ecgReadings.length > 2 ? 's' : ''}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${ecgExpanded ? 'rotate-180' : ''}`}
                    />
                  </Button>
                  {ecgExpanded && (
                    <div className="space-y-2">
                      {ecgReadings.slice(1).map((reading, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                        >
                          {reading.classification === 'Sinus Rhythm' ? (
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                          )}
                          <span className="font-medium">{reading.classification}</span>
                          <span className="text-muted-foreground ml-auto">
                            {format(parseISO(reading.recorded_at), 'MMM d, yyyy')}
                            {reading.average_heart_rate &&
                              ` — ${Math.round(reading.average_heart_rate)} bpm`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <EmptyState icon={<HeartPulse className="h-8 w-8" />} title="No ECG readings yet." />
          )}
        </CardContent>
      </Card>

      {/* Wrist Temperature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Wrist Temperature
          </CardTitle>
          <CardDescription>Overnight wrist temperature deviation.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {wristTempSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wristTempSeries}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'MM/dd')}
                  tick={{ fontSize: 11 }}
                />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                  }}
                  labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="wrist_temperature"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                  name="Wrist temp (°C)"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<Thermometer className="h-8 w-8" />}
              title="No wrist temperature data for this range."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
