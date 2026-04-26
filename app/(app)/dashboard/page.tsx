'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StandardCardHeader } from '@/components/ui/standard-card-header'
import { format, parseISO, isToday } from 'date-fns'
import { toast } from 'sonner'
import {
  upsertMoodEntry,
  insertFoodEntry,
  updateFoodEntry,
  deleteFoodEntry,
  getHaeFreshness,
} from '@/lib/database'
import { getTotalBurnedCalories } from '@/lib/activity'
import { createClient } from '@/lib/supabase-browser'
import { MealType, FoodEntry } from '@/lib/types/database'
import { useDashboardData } from '@/hooks/useDashboardData'
import {
  MoodPicker,
  moodEmojis,
  LogFoodCard,
  RecentEntriesList,
  EntryEditorDialog,
  DateStepper,
  type EntryEditForm,
} from '@/components/entry'
import { PageHeader } from '@/components/page-header'
import { MacroDisplay } from '@/components/macro-display'
import { Activity, AlertTriangle, Footprints, TrendingDown, TrendingUp, Minus } from 'lucide-react'

const valenceColor = (classification: string) => {
  switch (classification) {
    case 'very_unpleasant':
      return '#EF4444'
    case 'slightly_unpleasant':
      return '#F59E0B'
    case 'neutral':
      return '#6B7280'
    case 'slightly_pleasant':
      return '#34D399'
    case 'very_pleasant':
      return '#10B981'
    default:
      return '#6B7280'
  }
}

const DEFAULT_DASHBOARD_SUMMARY = {
  mood: null as number | null,
  totalCalories: 0,
  mealsLogged: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
  foodEntries: [] as FoodEntry[],
}

export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { filters, setDashboardFilters } = useFilters()
  const dashboardDate = useMemo(() => parseISO(filters.dashboard.date), [filters.dashboard.date])
  const dashboardDateString = filters.dashboard.date
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null)
  const [optimisticEntries, setOptimisticEntries] = useState<FoodEntry[]>([])
  const [haeFreshness, setHaeFreshness] = useState<'OK' | 'STALE' | null>(null)
  const [freshnessDismissed, setFreshnessDismissed] = useState(false)
  const { data, loading: dataLoading, refetch } = useDashboardData()
  const summary = data?.summary ?? DEFAULT_DASHBOARD_SUMMARY
  const currentMood = selectedMood ?? summary.mood

  // Food entries for the selected day (merged with optimistic entries)
  const dailyEntries = summary.foodEntries ?? []
  const displayedDailyEntries = useMemo(() => {
    const merged = [...optimisticEntries, ...dailyEntries]
    return merged.filter(
      (entry, index, arr) => arr.findIndex((candidate) => candidate.id === entry.id) === index,
    )
  }, [optimisticEntries, dailyEntries])

  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState<EntryEditForm>({
    meal: '',
    food_labels: [] as string[],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    note: '',
  })

  const isViewingToday = isToday(dashboardDate)
  const dateLabel = format(dashboardDate, 'EEEE, MMMM d')

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
  const sectionTitle = isViewingToday ? 'Today' : dateLabel
  const todayString = dashboardDateString
  const handleDateChange = (value: string) => {
    if (!value) return
    setDashboardFilters((prev) => ({ ...prev, date: value }))
  }

  // Clear optimistic entries when date changes
  useEffect(() => {
    setOptimisticEntries([])
  }, [dashboardDateString])

  useEffect(() => {
    if (!user?.id) return
    const storageKey = `pulse:onboarding:completed:${user.id}`
    const cached = window.localStorage.getItem(storageKey)
    if (cached) return

    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return

      if (prefs?.onboarding_completed) {
        window.localStorage.setItem(storageKey, '1')
        return
      }

      const { count } = await supabase
        .from('food_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .limit(1)
      if (cancelled) return

      if ((count ?? 0) > 0) {
        await supabase.from('user_preferences').upsert(
          {
            user_id: user.id,
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        window.localStorage.setItem(storageKey, '1')
        return
      }

      router.replace('/onboarding')
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, router])

  const handleMoodSelect = async (moodScore: number) => {
    if (!user?.id) {
      return
    }

    const previousMood = currentMood ?? null
    setSelectedMood(moodScore)

    const moodEntryData = {
      user_id: user.id,
      date: todayString,
      mood_score: moodScore,
    }

    try {
      await upsertMoodEntry(moodEntryData)
      await refetch()
      setSelectedMood(null)
    } catch (error) {
      console.error('Error saving mood:', error)
      setSelectedMood(previousMood)
      toast.error('Error saving mood', {
        description: 'There was a problem saving your mood. Please try again.',
      })
    }
  }

  const createOptimisticEntry = (payload: {
    meal: MealType
    food_labels: string[]
    calories?: number
    macros?: { protein: number; carbs: number; fat: number }
    note?: string
    photo_url?: string
    voice_url?: string
    ai_raw?: unknown
    journal_mode?: boolean
  }) => {
    if (!user?.id) return null
    const now = new Date().toISOString()
    return {
      id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.id,
      date: todayString,
      meal: payload.meal,
      photo_url: payload.photo_url ?? null,
      voice_url: payload.voice_url ?? null,
      ai_raw: payload.ai_raw ?? null,
      food_labels: payload.food_labels,
      calories: payload.calories ?? null,
      macros: payload.macros ?? null,
      note: payload.note ?? null,
      journal_mode: payload.journal_mode ?? false,
      created_at: now,
      updated_at: now,
    } satisfies FoodEntry
  }

  const handlePhotoAnalysis = async (result: {
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    photoUrl: string
  }) => {
    if (!user?.id || !selectedMeal) return
    const optimisticEntry = createOptimisticEntry({
      meal: selectedMeal,
      photo_url: result.photoUrl,
      food_labels: result.foods.map((food) => food.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      ai_raw: result,
    })
    if (optimisticEntry) {
      setOptimisticEntries((prev) => [optimisticEntry, ...prev])
    }

    try {
      await insertFoodEntry({
        user_id: user.id,
        date: todayString,
        meal: selectedMeal,
        photo_url: result.photoUrl,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result,
      })

      setSelectedMeal(null)

      toast.success('Food logged successfully!', {
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })

      await refetch()
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
    } catch (error) {
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
      console.error('Error saving photo analysis:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
      })
    }
  }

  const handleVoiceAnalysis = async (result: {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    transcript: string
    voiceUrl: string
  }) => {
    if (!user?.id) return
    const optimisticEntry = createOptimisticEntry({
      meal: result.meal as MealType,
      voice_url: result.voiceUrl,
      food_labels: result.foods.map((food) => food.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      note: result.transcript,
      ai_raw: result,
    })
    if (optimisticEntry) {
      setOptimisticEntries((prev) => [optimisticEntry, ...prev])
    }

    try {
      await insertFoodEntry({
        user_id: user.id,
        date: todayString,
        meal: result.meal as MealType,
        voice_url: result.voiceUrl,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        note: result.transcript,
        ai_raw: result,
      })

      setSelectedMeal(result.meal as MealType)

      toast.success('Food logged successfully!', {
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })

      await refetch()
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
    } catch (error) {
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
      console.error('Error saving voice analysis:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
      })
    }
  }

  const handleManualSave = async (data: {
    meal: string
    food_labels: string[]
    calories?: number
    macros?: { protein: number; carbs: number; fat: number }
    note?: string
    journal_mode: boolean
  }) => {
    if (!user?.id) return
    const optimisticEntry = createOptimisticEntry({
      meal: data.meal as MealType,
      food_labels: data.food_labels,
      calories: data.calories,
      macros: data.macros,
      note: data.note,
      journal_mode: data.journal_mode,
    })
    if (optimisticEntry) {
      setOptimisticEntries((prev) => [optimisticEntry, ...prev])
    }

    try {
      await insertFoodEntry({
        user_id: user.id,
        date: todayString,
        meal: data.meal as MealType,
        food_labels: data.food_labels,
        calories: data.calories,
        macros: data.macros,
        note: data.note,
        journal_mode: data.journal_mode,
      })

      setSelectedMeal(null)

      toast.success('Food logged successfully!', {
        description: `${data.food_labels.join(', ')}${data.calories ? ` (${data.calories} cal)` : ''}`,
      })

      await refetch()
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
    } catch (error) {
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
      console.error('Error saving manual entry:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
      })
    }
  }

  const handleTextAnalysis = async (result: {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
  }) => {
    if (!user?.id) return
    const optimisticEntry = createOptimisticEntry({
      meal: result.meal as MealType,
      food_labels: result.foods.map((food) => food.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      ai_raw: result,
    })
    if (optimisticEntry) {
      setOptimisticEntries((prev) => [optimisticEntry, ...prev])
    }

    try {
      await insertFoodEntry({
        user_id: user.id,
        date: todayString,
        meal: result.meal as MealType,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result,
      })

      toast.success('Meal logged!', {
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })

      await refetch()
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
    } catch (error) {
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
      console.error('Error saving AI text analysis:', error)
      toast.error('Error logging meal', {
        description: 'Unable to log this meal. Please try again.',
      })
    }
  }

  const handleEditEntry = (entry: FoodEntry) => {
    setEditingEntry(entry)
    setEditForm({
      meal: entry.meal,
      food_labels: entry.food_labels || [],
      calories: entry.calories || 0,
      protein: entry.macros?.protein || 0,
      carbs: entry.macros?.carbs || 0,
      fat: entry.macros?.fat || 0,
      note: entry.note || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingEntry || !user?.id) return

    try {
      await updateFoodEntry(editingEntry.id, {
        meal: editForm.meal as MealType,
        food_labels: editForm.food_labels,
        calories: editForm.calories || undefined,
        macros:
          editForm.calories > 0
            ? {
                protein: editForm.protein,
                carbs: editForm.carbs,
                fat: editForm.fat,
              }
            : undefined,
        note: editForm.note || undefined,
      })

      setEditingEntry(null)
      toast.success('Entry updated!', {
        description: 'Your food entry has been successfully updated.',
      })
      await refetch()
    } catch (error) {
      console.error('Error updating entry:', error)
      toast.error('Error updating entry', {
        description: 'There was a problem updating your entry. Please try again.',
      })
    }
  }

  const handleDeleteEntry = async (entry: FoodEntry) => {
    if (!user?.id) return
    if (!confirm('Are you sure you want to delete this entry?')) return

    try {
      await deleteFoodEntry(entry.id)
      toast.success('Entry deleted!', {
        description: 'Your food entry has been successfully deleted.',
      })
      await refetch()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error('Error deleting entry', {
        description: 'There was a problem deleting your entry. Please try again.',
      })
    }
  }

  const calorieGoal = data?.targets?.calorie_intake ?? 2000
  const stepsGoal = data?.targets?.steps ?? 10000
  const exerciseGoal = data?.targets?.exercise_minutes ?? 30
  const calorieProgress = Math.min((summary.totalCalories / calorieGoal) * 100, 100)
  const calorieRemaining = calorieGoal - summary.totalCalories
  const stepsValue = data?.activity?.steps != null ? Number(data.activity.steps) : null
  const stepsProgress = stepsValue != null ? Math.min((stepsValue / stepsGoal) * 100, 100) : 0
  const exerciseValue =
    data?.activity?.exercise_time_minutes != null
      ? Number(data.activity.exercise_time_minutes)
      : null
  const exerciseProgress =
    exerciseValue != null ? Math.min((exerciseValue / exerciseGoal) * 100, 100) : 0
  const activeEnergy = Number(data?.activity?.active_energy_kcal ?? 0)
  const restingEnergy = Number(data?.activity?.resting_energy_kcal ?? 0)
  const burnedTotal = activeEnergy + restingEnergy
  const hasBurnData = burnedTotal > 0
  const stateOfMind = data?.stateOfMind ?? []
  const heartRateNotifications = data?.heartRateNotifications ?? []
  const latestSom = stateOfMind[0] ?? null
  const moodMeta = currentMood ? moodEmojis.find((mood) => mood.score === currentMood) : null

  // Calorie balance (from Historic)
  const dailyBurned = getTotalBurnedCalories(data?.activity)
  const calorieBalance = dailyBurned !== null ? dailyBurned - summary.totalCalories : null
  const balanceDisplay =
    calorieBalance === null ? '—' : `${calorieBalance > 0 ? '+' : ''}${Math.round(calorieBalance)}`
  const balanceLabel =
    calorieBalance === null
      ? 'No data'
      : calorieBalance > 0
        ? 'Deficit'
        : calorieBalance < 0
          ? 'Over'
          : 'On track'
  const balanceClass =
    calorieBalance === null
      ? 'text-muted-foreground'
      : calorieBalance > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : calorieBalance < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-primary'
  const BalanceIcon =
    calorieBalance === null
      ? Minus
      : calorieBalance > 0
        ? TrendingDown
        : calorieBalance < 0
          ? TrendingUp
          : Minus

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={dateLabel}
        action={<DateStepper date={todayString} onDateChange={handleDateChange} />}
      />

      {haeFreshness === 'STALE' && !freshnessDismissed && (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/30">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              Apple Health sync delayed
            </p>
            <p className="text-yellow-700 dark:text-yellow-300">
              No data received from Health Auto Export in the last 30 minutes. Steps and activity
              may be outdated.
            </p>
          </div>
          <button
            onClick={() => setFreshnessDismissed(true)}
            className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {heartRateNotifications.length > 0 && (
        <div className="space-y-2">
          {heartRateNotifications.slice(0, 3).map((notification, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30"
            >
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-red-800 dark:text-red-200">
                  Heart Rate Alert on{' '}
                  {format(parseISO(notification.recorded_at), 'MMM d, yyyy h:mm a')}
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{sectionTitle}</h2>
          <p className="text-sm text-muted-foreground">
            At-a-glance wellness metrics and your latest logs.
          </p>
        </div>
        <Card>
          <StandardCardHeader
            title={`${sectionTitle}\u2019s Summary`}
            description="Calories and mood first, details second."
          />
          <CardContent className="space-y-4">
            {dataLoading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-l-4 border-l-emerald-500 bg-card p-6">
                    <p className="text-caption">Calories</p>
                    <p className="mt-2 text-metric">{summary.totalCalories.toLocaleString()}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Goal: {calorieGoal.toLocaleString()} kcal
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${calorieProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {calorieRemaining >= 0
                        ? `${calorieRemaining} kcal left`
                        : `${Math.abs(calorieRemaining)} kcal over`}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-l-4 border-l-purple-500 bg-card p-6">
                    <p className="text-caption">Mood</p>
                    <div className="mt-2 flex items-end gap-3">
                      <p className="text-5xl leading-none">{moodMeta?.emoji ?? '—'}</p>
                      <p className="text-xl font-semibold">{moodMeta?.label ?? 'Not logged'}</p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Tap a mood below to update instantly.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border p-4">
                    <p className="text-caption">Meals Logged</p>
                    <p className="mt-2 text-3xl font-bold">{summary.mealsLogged}</p>
                    <p className="text-sm text-muted-foreground">Entries recorded for this day.</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-caption">Macros</p>
                    <MacroDisplay macros={summary.macros} showBar className="mt-2" />
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-caption">Steps</p>
                      <Footprints className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-3xl font-bold">
                      {stepsValue != null ? stepsValue.toLocaleString() : '--'}
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${stepsProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Goal: {stepsGoal.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-caption">Exercise</p>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-3xl font-bold">
                      {exerciseValue != null ? `${Math.round(exerciseValue)} min` : '--'}
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${exerciseProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Goal: {exerciseGoal} min</p>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/30 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-caption">Energy Balance</p>
                    <div className="flex items-center gap-1.5">
                      <BalanceIcon className="h-4 w-4" />
                      <span className={`text-sm font-semibold ${balanceClass}`}>
                        {balanceDisplay} kcal
                      </span>
                      <span className="text-xs text-muted-foreground">{balanceLabel}</span>
                    </div>
                  </div>
                  {hasBurnData ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Eaten {summary.totalCalories.toLocaleString()} kcal
                      {' \u2022 '}
                      Burned {Math.round(burnedTotal).toLocaleString()} kcal
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Eaten {summary.totalCalories.toLocaleString()} kcal \u2022 No burn data synced
                      yet
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {latestSom && (
          <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: valenceColor(latestSom.valence_classification) }}
            />
            <span className="text-sm font-medium capitalize">
              {latestSom.valence_classification.replace(/_/g, ' ')}
            </span>
            {latestSom.labels && latestSom.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 ml-1">
                {latestSom.labels.slice(0, 2).map((label) => (
                  <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                    {label}
                  </span>
                ))}
              </div>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {format(parseISO(latestSom.recorded_at), 'h:mm a')}
            </span>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Log</h2>
          <p className="text-sm text-muted-foreground">
            Capture mood and meals with the fastest path.
          </p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-2">
            <StandardCardHeader
              title={
                isViewingToday
                  ? 'How are you feeling today?'
                  : `How were you feeling on ${format(dashboardDate, 'MMM d')}?`
              }
              description="Track your mood to see patterns with your food."
            />
            <CardContent>
              <MoodPicker selectedMood={currentMood} onMoodSelect={handleMoodSelect} />
            </CardContent>
          </Card>
          <div className="xl:col-span-3">
            <LogFoodCard
              title="Log Your Food"
              description={
                isViewingToday
                  ? 'Track what you eat with photos, voice, or manual entry'
                  : `Backfill a meal for ${dateLabel}`
              }
              selectedMeal={selectedMeal}
              onMealSelect={setSelectedMeal}
              date={todayString}
              onPhotoAnalysis={handlePhotoAnalysis}
              onVoiceAnalysis={handleVoiceAnalysis}
              onTextAnalysis={handleTextAnalysis}
              onManualSave={handleManualSave}
            />
          </div>
        </div>
      </section>

      <RecentEntriesList
        title={`Entries for ${dateLabel}`}
        description="Review anything already logged on this day."
        entries={displayedDailyEntries}
        loading={dataLoading}
        loadingText="Loading entries..."
        emptyTitle="No entries logged for this date"
        emptyDescription="Use the tools above to log meals or moods."
        emptyCtaLabel="Log breakfast"
        onEmptyCta={() => setSelectedMeal('breakfast')}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
      />

      <EntryEditorDialog
        entry={editingEntry}
        form={editForm}
        setForm={setEditForm}
        onSave={handleSaveEdit}
        onClose={() => setEditingEntry(null)}
      />
    </div>
  )
}
