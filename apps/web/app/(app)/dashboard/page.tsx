'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StandardCardHeader } from '@/components/ui/standard-card-header'
import { format, parseISO } from 'date-fns'
import { toast } from '@/hooks/use-toast'
import { upsertMoodEntry, insertFoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import { MealType, FoodEntry } from '@/lib/types/database'
import { useDashboardData } from '@/hooks/useDashboardData'
import { MoodPicker, moodEmojis, LogFoodCard, RecentEntriesList, EntryEditorDialog, DateStepper, type EntryEditForm } from '@/components/entry'
import { PageHeader } from '@/components/page-header'
import { MacroDisplay } from '@/components/macro-display'

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
  const { data, loading: dataLoading, refetch } = useDashboardData()
  const summary = data?.summary ?? DEFAULT_DASHBOARD_SUMMARY
  const recentEntries = data?.recentEntries ?? []
  const displayedRecentEntries = useMemo(() => {
    const merged = [...optimisticEntries, ...recentEntries]
    const deduped = merged.filter((entry, index, arr) => arr.findIndex((candidate) => candidate.id === entry.id) === index)
    return deduped.slice(0, 5)
  }, [optimisticEntries, recentEntries])
  const currentMood = selectedMood ?? summary.mood
  
  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState<EntryEditForm>({
    meal: '',
    food_labels: [] as string[],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    note: ''
  })

  const todayLabel = format(dashboardDate, 'EEEE, MMMM d')
  const todayString = dashboardDateString
  const handleDateChange = (value: string) => {
    if (!value) return
    setDashboardFilters((prev) => ({ ...prev, date: value }))
  }

  useEffect(() => {
    if (!user?.id) return
    const storageKey = `sofi:onboarding:completed:${user.id}`
    const hasCompleted = window.localStorage.getItem(storageKey)
    if (!hasCompleted) {
      router.replace('/onboarding')
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
      mood_score: moodScore
    }

    try {
      await upsertMoodEntry(moodEntryData)
      await refetch()
      setSelectedMood(null)
    } catch (error) {
      console.error('Error saving mood:', error)
      setSelectedMood(previousMood)
      toast({
        title: 'Error saving mood',
        description: 'There was a problem saving your mood. Please try again.',
        variant: 'destructive'
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
        food_labels: result.foods.map(f => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result
      })
      
      setSelectedMeal(null)
      
      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map(f => f.label).join(', ')} (${result.nutrition.calories} cal)`
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
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
        variant: 'destructive'
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
        food_labels: result.foods.map(f => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        note: result.transcript,
        ai_raw: result
      })
      
      setSelectedMeal(result.meal as MealType)
      
      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map(f => f.label).join(', ')} (${result.nutrition.calories} cal)`
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
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
        variant: 'destructive'
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
        journal_mode: data.journal_mode
      })
      
      setSelectedMeal(null)
      
      toast({
        title: 'Food logged successfully!',
        description: `${data.food_labels.join(', ')}${data.calories ? ` (${data.calories} cal)` : ''}`
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
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
        variant: 'destructive'
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

      toast({
        title: 'Meal logged!',
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
      toast({
        title: 'Error logging meal',
        description: 'Unable to log this meal. Please try again.',
        variant: 'destructive',
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
      note: entry.note || ''
    })
  }

  const handleSaveEdit = async () => {
    if (!editingEntry || !user?.id) return

    try {
      await updateFoodEntry(editingEntry.id, {
        meal: editForm.meal as MealType,
        food_labels: editForm.food_labels,
        calories: editForm.calories || undefined,
        macros: editForm.calories > 0 ? {
          protein: editForm.protein,
          carbs: editForm.carbs,
          fat: editForm.fat
        } : undefined,
        note: editForm.note || undefined
      })

      // Update local state
      setEditingEntry(null)
      toast({
        title: 'Entry updated!',
        description: 'Your food entry has been successfully updated.'
      })
      await refetch()

    } catch (error) {
      console.error('Error updating entry:', error)
      toast({
        title: 'Error updating entry',
        description: 'There was a problem updating your entry. Please try again.',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteEntry = async (entry: FoodEntry) => {
    if (!user?.id) return

    if (!confirm('Are you sure you want to delete this entry?')) return

    try {
      await deleteFoodEntry(entry.id)

      toast({
        title: 'Entry deleted!',
        description: 'Your food entry has been successfully deleted.'
      })
      await refetch()

    } catch (error) {
      console.error('Error deleting entry:', error)
      toast({
        title: 'Error deleting entry',
        description: 'There was a problem deleting your entry. Please try again.',
        variant: 'destructive'
      })
    }
  }

  const calorieGoal = 2000
  const calorieProgress = Math.min((summary.totalCalories / calorieGoal) * 100, 100)
  const calorieRemaining = calorieGoal - summary.totalCalories
  const moodMeta = currentMood ? moodEmojis.find((mood) => mood.score === currentMood) : null
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={todayLabel}
        action={<DateStepper date={todayString} onDateChange={handleDateChange} />}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today</h2>
          <p className="text-sm text-muted-foreground">At-a-glance wellness metrics and your latest logs.</p>
        </div>
        <Card>
          <StandardCardHeader title="Today&apos;s Summary" description="Calories and mood first, details second." />
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
                  <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-background p-6 dark:from-primary/20">
                    <p className="text-caption">Calories</p>
                    <p className="mt-2 text-metric">{summary.totalCalories.toLocaleString()}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Goal: {calorieGoal.toLocaleString()} kcal</p>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${calorieProgress}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {calorieRemaining >= 0 ? `${calorieRemaining} kcal left` : `${Math.abs(calorieRemaining)} kcal over`}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-amber-500/15 to-background p-6 dark:from-amber-400/10">
                    <p className="text-caption">Mood</p>
                    <div className="mt-2 flex items-end gap-3">
                      <p className="text-5xl leading-none">{moodMeta?.emoji ?? '—'}</p>
                      <p className="text-xl font-semibold">{moodMeta?.label ?? 'Not logged'}</p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Tap a mood below to update instantly.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-caption">Meals Logged</p>
                    <p className="mt-2 text-3xl font-bold">{summary.mealsLogged}</p>
                    <p className="text-sm text-muted-foreground">Entries recorded for this day.</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-caption">Macros</p>
                    <MacroDisplay macros={summary.macros} showBar className="mt-2" />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <RecentEntriesList
        title="Recent Entries"
        description="Your latest food and mood entries"
        entries={displayedRecentEntries}
        loading={dataLoading}
        loadingText="Loading recent entries..."
        emptyTitle="No recent entries"
        emptyDescription="Start logging food above to see your entries here"
        emptyCtaLabel="Log breakfast"
        onEmptyCta={() => setSelectedMeal('breakfast')}
        onEditEntry={handleEditEntry}
        onDeleteEntry={handleDeleteEntry}
      />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Log</h2>
          <p className="text-sm text-muted-foreground">Capture mood and meals with the fastest path.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-2">
            <StandardCardHeader
              title="How are you feeling today?"
              description="Track your mood to see patterns with your food."
            />
            <CardContent>
              <MoodPicker selectedMood={currentMood} onMoodSelect={handleMoodSelect} />
            </CardContent>
          </Card>
          <div className="xl:col-span-3">
            <LogFoodCard
              title="Log Your Food"
              description="Track what you eat with photos, voice, or manual entry"
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
