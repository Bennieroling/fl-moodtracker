'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, isToday } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Footprints, HeartPulse, Moon, Scale, Smile, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { useDashboardData } from '@/hooks/useDashboardData'
import { useDashboardSparklines } from '@/hooks/useDashboardSparklines'
import { getHaeFreshness, getLatestBodyMetrics, getLatestSleepEvent } from '@/lib/database'
import { PageHeader } from '@/components/page-header'
import { DateStepper, moodEmojis } from '@/components/entry'
import { HighlightCard } from '@/components/health'
import { ReadinessHero } from '@/components/dashboard/readiness-hero'
import { AnomalyBadge } from '@/components/dashboard/anomaly-badge'
import { LogFab } from '@/components/dashboard/log-fab'
import { SoftBanner } from '@/components/dashboard/soft-banner'

const formatNumber = (value: number | null | undefined): string => {
  if (value == null) return '—'
  return Number(value).toLocaleString()
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { filters, setDashboardFilters } = useFilters()
  const date = filters.dashboard.date
  const dateObj = useMemo(() => parseISO(date), [date])
  const isViewingToday = isToday(dateObj)
  const dateLabel = format(dateObj, 'EEEE, MMMM d')
  const reducedMotion = useReducedMotion()

  const { data, loading } = useDashboardData()
  const { sparklines } = useDashboardSparklines()

  const latestBodyQuery = useQuery({
    queryKey: ['latest-body-metrics', user?.id],
    queryFn: () => getLatestBodyMetrics(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  })
  const latestSleepQuery = useQuery({
    queryKey: ['latest-sleep-event', user?.id],
    queryFn: () => getLatestSleepEvent(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
  })

  const [haeFreshness, setHaeFreshness] = useState<'OK' | 'STALE' | null>(null)
  const [freshnessDismissed, setFreshnessDismissed] = useState(false)

  useEffect(() => {
    if (!isViewingToday) {
      setHaeFreshness(null)
      setFreshnessDismissed(false)
      return
    }
    let cancelled = false
    getHaeFreshness().then((result) => {
      if (!cancelled) setHaeFreshness(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [isViewingToday])

  const handleDateChange = (value: string) => {
    if (!value) return
    setDashboardFilters((prev) => ({ ...prev, date: value }))
  }

  const summary = data?.summary
  const activity = data?.activity
  const heartRateNotifications = data?.heartRateNotifications ?? []
  const stateOfMind = data?.stateOfMind ?? []
  const targets = data?.targets

  // Card-by-card derived values
  const stepsValue = activity?.steps != null ? Number(activity.steps) : null
  const exerciseValue =
    activity?.exercise_time_minutes != null ? Number(activity.exercise_time_minutes) : null
  const distanceValue = activity?.distance_km != null ? Number(activity.distance_km) : null
  const activitySecondary =
    exerciseValue != null && distanceValue != null
      ? `${Math.round(exerciseValue)} min · ${distanceValue.toFixed(1)} km`
      : exerciseValue != null
        ? `${Math.round(exerciseValue)} min`
        : distanceValue != null
          ? `${distanceValue.toFixed(1)} km`
          : 'No activity recorded'

  const latestSleep = latestSleepQuery.data
  const sleepHours =
    latestSleep?.total_sleep_hours != null ? Number(latestSleep.total_sleep_hours) : null
  const sleepHoursDisplay =
    sleepHours != null ? `${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m` : '—'
  const sleepDeep = latestSleep?.deep_hours != null ? Number(latestSleep.deep_hours) : null
  const sleepRem = latestSleep?.rem_hours != null ? Number(latestSleep.rem_hours) : null
  const sleepSecondary =
    sleepDeep != null || sleepRem != null
      ? [
          sleepDeep != null ? `Deep ${sleepDeep.toFixed(1)}h` : null,
          sleepRem != null ? `REM ${sleepRem.toFixed(1)}h` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Latest night'

  const moodScore = summary?.mood ?? null
  const moodMeta = moodScore != null ? moodEmojis.find((m) => m.score === moodScore) : null
  const latestSom = stateOfMind[0] ?? null
  const moodSecondary = latestSom?.valence_classification
    ? latestSom.valence_classification.replace(/_/g, ' ')
    : moodScore != null
      ? 'Mood logged'
      : 'No mood logged'

  const latestBody = latestBodyQuery.data
  const bodyWeight = latestBody?.weight_kg != null ? Number(latestBody.weight_kg) : null
  const bodyFat = latestBody?.body_fat_pct != null ? Number(latestBody.body_fat_pct) : null
  const bodyBmi = latestBody?.bmi != null ? Number(latestBody.bmi) : null
  const bodySecondary =
    bodyFat != null || bodyBmi != null
      ? [
          bodyFat != null ? `BF ${bodyFat.toFixed(1)}%` : null,
          bodyBmi != null ? `BMI ${bodyBmi.toFixed(1)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Latest measurement'

  const calorieGoal = targets?.calorie_intake ?? 2000
  const caloriesEaten = summary?.totalCalories ?? 0
  const calorieRemaining = calorieGoal - caloriesEaten
  const calorieSecondary =
    calorieRemaining >= 0
      ? `Goal ${calorieGoal.toLocaleString()}, ${calorieRemaining.toLocaleString()} left`
      : `${Math.abs(calorieRemaining).toLocaleString()} over goal`

  const hrvValue = activity?.hrv != null ? Number(activity.hrv) : null
  const rhrValue = activity?.resting_heart_rate != null ? Number(activity.resting_heart_rate) : null
  const vitalsSecondary = rhrValue != null ? `RHR ${rhrValue} bpm` : 'No vitals recorded'

  const cards = [
    {
      title: 'Activity',
      category: 'activity' as const,
      href: '/exercise',
      icon: <Footprints className="h-4 w-4" />,
      primary: { value: stepsValue ?? 0, unit: stepsValue != null ? 'steps' : undefined },
      secondary: { value: activitySecondary },
      sparkline: { values: sparklines.activity },
      empty: stepsValue == null ? { label: 'No activity recorded today' } : undefined,
    },
    {
      title: 'Sleep',
      category: 'sleep' as const,
      href: '/health#sleep',
      icon: <Moon className="h-4 w-4" />,
      primary: { value: sleepHoursDisplay },
      secondary: { value: sleepSecondary },
      sparkline: { values: sparklines.sleep },
      empty: sleepHours == null ? { label: 'No sleep recorded yet' } : undefined,
    },
    {
      title: 'Mood & State',
      category: 'mood' as const,
      href: '/charts',
      icon: <Smile className="h-4 w-4" />,
      primary: { value: moodMeta?.label ?? (moodScore != null ? `${moodScore}/5` : '—') },
      secondary: { value: moodSecondary },
      sparkline: { values: sparklines.mood },
      empty: moodScore == null ? { label: 'No mood logged today' } : undefined,
    },
    {
      title: 'Body',
      category: 'body' as const,
      href: '/health#body',
      icon: <Scale className="h-4 w-4" />,
      primary: {
        value: bodyWeight != null ? bodyWeight.toFixed(1) : '—',
        unit: bodyWeight != null ? 'kg' : undefined,
      },
      secondary: { value: bodySecondary },
      sparkline: { values: sparklines.body },
      empty: bodyWeight == null ? { label: 'No body data yet' } : undefined,
    },
    {
      title: 'Nutrition',
      category: 'nutrition' as const,
      href: '/log',
      icon: <UtensilsCrossed className="h-4 w-4" />,
      primary: {
        value: formatNumber(caloriesEaten),
        unit: 'kcal',
      },
      secondary: { value: calorieSecondary },
      sparkline: { values: sparklines.nutrition },
      empty: caloriesEaten === 0 ? { label: 'No meals logged today' } : undefined,
    },
    {
      title: 'Vitals',
      category: 'vitals' as const,
      href: '/health',
      icon: <HeartPulse className="h-4 w-4" />,
      primary: {
        value: hrvValue != null ? hrvValue.toFixed(0) : '—',
        unit: hrvValue != null ? 'ms HRV' : undefined,
      },
      secondary: { value: vitalsSecondary },
      sparkline: { values: sparklines.vitals },
      empty: hrvValue == null && rhrValue == null ? { label: 'No vitals recorded' } : undefined,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={isViewingToday ? 'Today' : dateLabel}
        description={isViewingToday ? dateLabel : undefined}
        action={<DateStepper date={date} onDateChange={handleDateChange} />}
      />

      {haeFreshness === 'STALE' && !freshnessDismissed && (
        <SoftBanner
          tone="warn"
          title="Apple Health sync delayed"
          description="No data received from Health Auto Export in the last 30 minutes. Steps and activity may be outdated."
          onDismiss={() => setFreshnessDismissed(true)}
        />
      )}

      {heartRateNotifications.length > 0 && (
        <div className="space-y-2">
          {heartRateNotifications.slice(0, 3).map((notification, i) => (
            <SoftBanner
              key={i}
              tone="alert"
              title={`Heart Rate Alert on ${format(parseISO(notification.recorded_at), 'MMM d, yyyy h:mm a')}`}
              description={`${notification.notification_type} — ${notification.heart_rate} bpm (threshold: ${notification.threshold})`}
            />
          ))}
        </div>
      )}

      {isViewingToday && <AnomalyBadge />}

      {isViewingToday && <ReadinessHero />}

      <motion.section className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Highlights">
        {cards.map((card, index) => {
          const initial = reducedMotion ? false : { opacity: 0, y: 8 }
          const animate = reducedMotion ? undefined : { opacity: 1, y: 0 }
          return (
            <motion.div
              key={card.title}
              initial={initial}
              animate={animate}
              transition={{ duration: 0.28, delay: index * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <HighlightCard {...card} loading={loading && card.empty == null} />
            </motion.div>
          )
        })}
      </motion.section>

      <LogFab />
    </div>
  )
}
