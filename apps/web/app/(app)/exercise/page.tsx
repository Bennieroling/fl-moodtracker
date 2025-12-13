'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Activity, Flame, Footprints, Timer, TrendingUp } from 'lucide-react'
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
import { DailyActivity, getDailyActivity } from '@/lib/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString(undefined, options)
}

export default function ExercisePage() {
  const { user } = useAuth()
  const [activityData, setActivityData] = useState<DailyActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    const loadActivity = async () => {
      if (!user?.id) return
      setLoading(true)
      const data = await getDailyActivity(user.id, 30)
      setActivityData(data)
      setSelectedDate((data[0]?.date) || null)
      setLoading(false)
    }

    loadActivity()
  }, [user])

  const selectedActivity = useMemo(() => {
    if (!selectedDate) return activityData[0]
    return activityData.find((day) => day.date === selectedDate) || activityData[0]
  }, [activityData, selectedDate])

  const sortedChartData = useMemo(() => {
    return [...activityData].sort((a, b) => a.date.localeCompare(b.date))
  }, [activityData])

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

  if (!selectedActivity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">No Exercise Data</CardTitle>
            <CardDescription className="text-center">
              Connect your tracker or import HealthFit data to see exercise insights.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const recentDays = activityData.slice(0, 14)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise</h1>
        <p className="text-muted-foreground">
          Daily movement, calories, and steps from your connected health data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Days</CardTitle>
          <CardDescription>Select a day to focus on its exercise summary.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {recentDays.map((day) => {
              const label = format(parseISO(day.date), 'MMM d')
              const isSelected = day.date === selectedActivity.date
              return (
                <Button
                  key={day.date}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedDate(day.date)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exercise Time</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.exercise_time_minutes)} min
            </div>
            <p className="text-xs text-muted-foreground">structured exercise</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Calories</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(selectedActivity.exercise_kcal ?? selectedActivity.active_energy_kcal)} kcal
            </div>
            <p className="text-xs text-muted-foreground">burned through activity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Steps</CardTitle>
            <Footprints className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(selectedActivity.steps)}</div>
            <p className="text-xs text-muted-foreground">total steps today</p>
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
            <p className="text-xs text-muted-foreground">overall movement</p>
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
            <CardDescription>Daily totals pulled directly from HealthFit exports.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sortedChartData}>
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
                  labelFormatter={(value) => format(parseISO(value), 'MMM d, yyyy')}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Movement Minutes vs Active Energy
            </CardTitle>
            <CardDescription>Compare structured exercise with total active calories.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickFormatter={(value) => format(parseISO(value), 'MM/dd')} />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                  labelFormatter={(value) => format(parseISO(value), 'MMM d, yyyy')}
                />
                <Bar dataKey="exercise_time_minutes" fill="#2563eb" name="Exercise Minutes" />
                <Bar dataKey="move_time_minutes" fill="#f97316" name="Move Minutes" />
                <Bar dataKey="active_energy_kcal" fill="#ef4444" name="Active kcal" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Overview</CardTitle>
          <CardDescription>Each row is sourced directly from Supabase v_daily_activity.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Date</th>
                <th className="py-2">Exercise (min)</th>
                <th className="py-2">Move (min)</th>
                <th className="py-2">Total kcal</th>
                <th className="py-2">Active kcal</th>
                <th className="py-2">Steps</th>
                <th className="py-2">Distance (km)</th>
              </tr>
            </thead>
            <tbody>
              {activityData.map((day) => (
                <tr
                  key={day.date}
                  className={`border-t ${day.date === selectedActivity.date ? 'bg-muted/50' : ''}`}
                >
                  <td className="py-2 font-medium">{format(parseISO(day.date), 'MMM d, yyyy')}</td>
                  <td className="py-2">{formatNumber(day.exercise_time_minutes)}</td>
                  <td className="py-2">{formatNumber(day.move_time_minutes)}</td>
                  <td className="py-2">{formatNumber(day.total_energy_kcal)}</td>
                  <td className="py-2">{formatNumber(day.active_energy_kcal)}</td>
                  <td className="py-2">{formatNumber(day.steps)}</td>
                  <td className="py-2">{formatNumber(day.distance_km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
