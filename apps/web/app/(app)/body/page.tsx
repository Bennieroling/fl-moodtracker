'use client'

import { format, parseISO } from 'date-fns'
import { CalendarRange, ChevronLeft, ChevronRight, Scale, Percent, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAuth } from '@/lib/auth-context'
import { RangeMode } from '@/lib/range-utils'
import { useBodyData } from '@/hooks/useBodyData'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'

export default function BodyPage() {
  const { user } = useAuth()
  const {
    weightSeries,
    bodyFatSeries,
    latest,
    loading,
    error,
    range,
    shiftRange,
    setRangeMode,
    setAnchorDate,
  } = useBodyData()

  const anchorDateObj = parseISO(range.anchorDate)
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
            <CardTitle className="text-center">Unable to load body data</CardTitle>
            <CardDescription className="text-center">{errorMessage}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Body" description="Weight, body fat, and BMI trends from Apple Health." />

      <Card>
        <CardHeader>
          <CardTitle>Data Controls</CardTitle>
          <CardDescription>Choose the date granularity and anchor date for the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={range.mode} onValueChange={(value) => setRangeMode(value as RangeMode)}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftRange(-1)} aria-label="Previous range">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  <span>{range.label}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0">
                <Calendar
                  mode="single"
                  selected={anchorDateObj}
                  onSelect={(date) => date && setAnchorDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => shiftRange(1)} aria-label="Next range">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{range.label}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Stats</CardTitle>
          <CardDescription>
            {latest?.date
              ? `Latest measurement on ${format(parseISO(latest.date), 'MMM d, yyyy')}`
              : 'No measurements synced yet'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BodyStatTile
            label="Weight"
            icon={<Scale className="h-4 w-4 text-muted-foreground" />}
            value={latest?.weight_kg}
            unit="kg"
            decimals={1}
          />
          <BodyStatTile
            label="Body Fat"
            icon={<Percent className="h-4 w-4 text-muted-foreground" />}
            value={latest?.body_fat_pct}
            unit="%"
            decimals={1}
          />
          <BodyStatTile
            label="BMI"
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            value={latest?.bmi}
            decimals={1}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Weight Trend
          </CardTitle>
          <CardDescription>
            Daily weight between {range.startDate} and {range.endDate}.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {weightSeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                  name="Weight (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No weight data for this range yet." />
          )}
        </CardContent>
      </Card>

      {bodyFatSeries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Body Fat Trend
            </CardTitle>
            <CardDescription>
              Daily body fat percentage between {range.startDate} and {range.endDate}.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyFatSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="body_fat_pct"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={false}
                  name="Body Fat (%)"
                />
              </LineChart>
            </ResponsiveContainer>
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

interface BodyStatTileProps {
  label: string
  icon: React.ReactNode
  value: number | string | null | undefined
  unit?: string
  decimals?: number
}

function BodyStatTile({ label, icon, value, unit, decimals }: BodyStatTileProps) {
  const hasValue = value !== null && value !== undefined
  const formatted = hasValue ? `${formatNumber(value, { decimals })}${unit ? ` ${unit}` : ''}` : '--'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatted}</div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
