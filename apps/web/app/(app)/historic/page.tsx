'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, TrendingDown, TrendingUp, Minus } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { Card, CardContent } from '@/components/ui/card'
import { StandardCardHeader } from '@/components/ui/standard-card-header'
import { toast } from '@/hooks/use-toast'
import { upsertMoodEntry, insertFoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import { getTotalBurnedCalories } from '@/lib/activity'
import { MealType, FoodEntry } from '@/lib/types/database'
import { useHistoricData } from '@/hooks/useHistoricData'
import { SummarySkeleton } from '@/components/skeletons/summary-skeleton'
import { MoodPicker, moodEmojis, LogFoodCard, RecentEntriesList, EntryEditorDialog, DateStepper, type EntryEditForm } from '@/components/entry'
import { PageHeader } from '@/components/page-header'
import { MacroDisplay } from '@/components/macro-display'

const DEFAULT_DAY_SUMMARY = {
  mood: null as number | null,
  totalCalories: 0,
  mealsLogged: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
  foodEntries: [] as FoodEntry[],
}

export default function HistoricPage() {
  const { user } = useAuth()
  const { filters, setHistoricFilters } = useFilters()
  const selectedDate = useMemo(() => parseISO(filters.historic.date), [filters.historic.date])
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null)
  const [optimisticEntries, setOptimisticEntries] = useState<FoodEntry[]>([])
  const { data: historicData, loading: historyLoading, refetch } = useHistoricData()
  const selectedDaySummary = historicData?.summary ?? DEFAULT_DAY_SUMMARY
  const currentMood = selectedMood ?? selectedDaySummary.mood
  const dailyEntries = selectedDaySummary.foodEntries ?? []
  const displayedDailyEntries = useMemo(() => {
    const merged = [...optimisticEntries, ...dailyEntries]
    return merged.filter((entry, index, arr) => arr.findIndex((candidate) => candidate.id === entry.id) === index)
  }, [optimisticEntries, dailyEntries])
  const dailyActivity = historicData?.activity ?? null
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

  const todayString = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const selectedDateString = filters.historic.date
  const selectedDateLabel = format(selectedDate, 'EEEE, MMMM d')
  const formatMetric = (value: number | null | undefined) => (value === null || value === undefined ? '—' : Math.round(value).toLocaleString())
  const dailyBurned = getTotalBurnedCalories(dailyActivity)
  const netCalories = dailyBurned !== null ? dailyBurned - selectedDaySummary.totalCalories : null
  const balanceDisplay = netCalories === null ? '—' : `${netCalories > 0 ? '+' : ''}${Math.round(netCalories)}`
  const balanceLabel = netCalories === null ? 'No data' : netCalories > 0 ? 'Deficit' : netCalories < 0 ? 'Over' : 'On track'
  const balanceClass =
    netCalories === null
      ? 'text-muted-foreground'
      : netCalories > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : netCalories < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-primary'
  const BalanceIcon = netCalories === null ? Minus : netCalories > 0 ? TrendingDown : netCalories < 0 ? TrendingUp : Minus
  const handleDateChange = (value: string) => {
    if (!value) return
    setHistoricFilters((prev) => ({ ...prev, date: value }))
  }

  const handleMoodSelect = async (moodScore: number) => {
    if (!user?.id) return

    const previousMood = currentMood ?? null
    setSelectedMood(moodScore)

    try {
      await upsertMoodEntry({
        user_id: user.id,
        date: selectedDateString,
        mood_score: moodScore,
      })
      await refetch()
      setSelectedMood(null)
    } catch (error) {
      console.error('Error saving mood:', error)
      setSelectedMood(previousMood)
      toast({
        title: 'Error saving mood',
        description: 'There was a problem saving your mood. Please try again.',
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    setOptimisticEntries([])
  }, [selectedDateString])

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
      date: selectedDateString,
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
        date: selectedDateString,
        meal: selectedMeal,
        photo_url: result.photoUrl,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result,
      })

      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`
      })

      setSelectedMeal(null)
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
        variant: 'destructive',
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
        date: selectedDateString,
        meal: result.meal as MealType,
        voice_url: result.voiceUrl,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        note: result.transcript,
        ai_raw: result,
      })

      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })

      setSelectedMeal(null)
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
        variant: 'destructive',
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
        date: selectedDateString,
        meal: data.meal as MealType,
        food_labels: data.food_labels,
        calories: data.calories,
        macros: data.macros,
        note: data.note,
        journal_mode: data.journal_mode,
      })

      toast({
        title: 'Food logged successfully!',
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
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
        variant: 'destructive',
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
        date: selectedDateString,
        meal: result.meal as MealType,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result
      })

      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map(f => f.label).join(', ')} (${result.nutrition.calories} cal)`
      })

      setSelectedMeal(null)
      await refetch()
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
    } catch (error) {
      if (optimisticEntry) {
        setOptimisticEntries((prev) => prev.filter((entry) => entry.id !== optimisticEntry.id))
      }
      console.error('Error saving AI text entry:', error)
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
        variant: 'destructive'
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

      toast({
        title: 'Entry updated!',
        description: 'Your food entry has been successfully updated.',
      })

      setEditingEntry(null)
      await refetch()
    } catch (error) {
      console.error('Error updating entry:', error)
      toast({
        title: 'Error updating entry',
        description: 'There was a problem updating your entry. Please try again.',
        variant: 'destructive',
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
        description: 'Your food entry has been successfully deleted.',
      })

      await refetch()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast({
        title: 'Error deleting entry',
        description: 'There was a problem deleting your entry. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historic Log"
        description={selectedDateLabel}
        action={<DateStepper date={selectedDateString} onDateChange={handleDateChange} maxDate={todayString} />}
      />

      <Card>
        <StandardCardHeader
          title="Selected Day Summary"
          description={`Your wellness overview for ${selectedDateLabel}`}
        />
        <CardContent>
          {historyLoading ? (
            <SummarySkeleton cards={6} className="grid-cols-2 md:grid-cols-3 lg:grid-cols-6" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{selectedDaySummary.totalCalories}</div>
                <div className="text-sm text-muted-foreground">Calories Consumed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{formatMetric(dailyBurned)}</div>
                <div className="text-sm text-muted-foreground">Calories Burned</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${balanceClass}`}>{balanceDisplay}</div>
                <div className="text-sm text-muted-foreground">Calorie Balance</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <BalanceIcon className="h-3 w-3" />
                  <span>{balanceLabel}</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{selectedDaySummary.mealsLogged}</div>
                <div className="text-sm text-muted-foreground">Meals Logged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl">
                  {currentMood ? moodEmojis.find((m) => m.score === currentMood)?.emoji : '—'}
                </div>
                <div className="text-sm text-muted-foreground">Mood</div>
              </div>
              <div className="text-center col-span-2 md:col-span-3 lg:col-span-2">
                <MacroDisplay macros={selectedDaySummary.macros} compact className="text-left md:text-center" />
                <div className="text-sm text-muted-foreground">Macros</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <StandardCardHeader
          title="How were you feeling?"
          description={`Track your mood for ${selectedDateLabel}.`}
        />
        <CardContent>
          <MoodPicker selectedMood={currentMood} onMoodSelect={handleMoodSelect} />
        </CardContent>
      </Card>

      <LogFoodCard
        title="Log Your Food"
        description={`Backfill a meal for ${selectedDateLabel} with any method.`}
        selectedMeal={selectedMeal}
        onMealSelect={setSelectedMeal}
        date={selectedDateString}
        onPhotoAnalysis={handlePhotoAnalysis}
        onVoiceAnalysis={handleVoiceAnalysis}
        onTextAnalysis={handleTextAnalysis}
        onManualSave={handleManualSave}
      />

      <RecentEntriesList
        title={`Entries for ${selectedDateLabel}`}
        description="Review anything already logged on this day."
        entries={displayedDailyEntries}
        loading={historyLoading}
        loadingText="Loading entries..."
        emptyTitle="No entries logged for this date"
        emptyDescription="Use the tools above to backfill meals or moods."
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
