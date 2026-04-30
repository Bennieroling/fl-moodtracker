'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { useDashboardData } from '@/hooks/useDashboardData'
import { upsertMoodEntry, insertFoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import type { MealType, FoodEntry } from '@/lib/types/database'
import type { EntryEditForm } from '@/components/entry'

// Shared client-side logging state and mutation handlers, lifted out of the
// dashboard so the new /log route and the dashboard quick-entry FAB can share
// behaviour without duplication.

const EMPTY_EDIT_FORM: EntryEditForm = {
  meal: '',
  food_labels: [],
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  note: '',
}

interface FoodAnalysisFoods {
  foods: Array<{ label: string; confidence: number; quantity?: string }>
  nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
}

interface PhotoResult extends FoodAnalysisFoods {
  photoUrl: string
}

interface VoiceResult extends FoodAnalysisFoods {
  meal: string
  transcript: string
  voiceUrl: string
}

interface TextResult extends FoodAnalysisFoods {
  meal: string
}

interface ManualSavePayload {
  meal: string
  food_labels: string[]
  calories?: number
  macros?: { protein: number; carbs: number; fat: number }
  note?: string
  journal_mode: boolean
}

export function useLogEntries() {
  const { user } = useAuth()
  const { filters } = useFilters()
  const date = filters.dashboard.date
  const { data, loading, refetch } = useDashboardData()

  const summary = data?.summary
  const dailyEntries = useMemo(() => summary?.foodEntries ?? [], [summary?.foodEntries])
  const summaryMood = summary?.mood ?? null

  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null)
  const [optimisticEntries, setOptimisticEntries] = useState<FoodEntry[]>([])
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState<EntryEditForm>(EMPTY_EDIT_FORM)

  const currentMood = selectedMood ?? summaryMood

  // Date change clears optimistic entries — they're scoped to the day in view.
  useEffect(() => {
    setOptimisticEntries([])
    setSelectedMeal(null)
    setSelectedMood(null)
  }, [date])

  const displayedDailyEntries = useMemo(() => {
    const merged = [...optimisticEntries, ...dailyEntries]
    return merged.filter((entry, index, arr) => arr.findIndex((c) => c.id === entry.id) === index)
  }, [optimisticEntries, dailyEntries])

  const buildOptimisticEntry = (payload: {
    meal: MealType
    food_labels: string[]
    calories?: number
    macros?: { protein: number; carbs: number; fat: number }
    note?: string
    photo_url?: string
    voice_url?: string
    ai_raw?: unknown
    journal_mode?: boolean
  }): FoodEntry | null => {
    if (!user?.id) return null
    const now = new Date().toISOString()
    return {
      id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.id,
      date,
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
    }
  }

  const removeOptimistic = (id: string) =>
    setOptimisticEntries((prev) => prev.filter((e) => e.id !== id))

  const handleMoodSelect = async (moodScore: number) => {
    if (!user?.id) return
    const previous = currentMood ?? null
    setSelectedMood(moodScore)
    try {
      await upsertMoodEntry({ user_id: user.id, date, mood_score: moodScore })
      await refetch()
      setSelectedMood(null)
    } catch (error) {
      console.error('Error saving mood:', error)
      setSelectedMood(previous)
      toast.error('Error saving mood', {
        description: 'There was a problem saving your mood. Please try again.',
      })
    }
  }

  const handlePhotoAnalysis = async (result: PhotoResult) => {
    if (!user?.id || !selectedMeal) return
    const optimistic = buildOptimisticEntry({
      meal: selectedMeal,
      photo_url: result.photoUrl,
      food_labels: result.foods.map((f) => f.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      ai_raw: result,
    })
    if (optimistic) setOptimisticEntries((prev) => [optimistic, ...prev])
    try {
      await insertFoodEntry({
        user_id: user.id,
        date,
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
      if (optimistic) removeOptimistic(optimistic.id)
    } catch (error) {
      if (optimistic) removeOptimistic(optimistic.id)
      console.error('Error saving photo analysis:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
      })
    }
  }

  const handleVoiceAnalysis = async (result: VoiceResult) => {
    if (!user?.id) return
    const optimistic = buildOptimisticEntry({
      meal: result.meal as MealType,
      voice_url: result.voiceUrl,
      food_labels: result.foods.map((f) => f.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      note: result.transcript,
      ai_raw: result,
    })
    if (optimistic) setOptimisticEntries((prev) => [optimistic, ...prev])
    try {
      await insertFoodEntry({
        user_id: user.id,
        date,
        meal: result.meal as MealType,
        voice_url: result.voiceUrl,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        note: result.transcript,
        ai_raw: result,
      })
      setSelectedMeal(null)
      toast.success('Food logged successfully!', {
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })
      await refetch()
      if (optimistic) removeOptimistic(optimistic.id)
    } catch (error) {
      if (optimistic) removeOptimistic(optimistic.id)
      console.error('Error saving voice analysis:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
      })
    }
  }

  const handleTextAnalysis = async (result: TextResult) => {
    if (!user?.id) return
    const optimistic = buildOptimisticEntry({
      meal: result.meal as MealType,
      food_labels: result.foods.map((f) => f.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      ai_raw: result,
    })
    if (optimistic) setOptimisticEntries((prev) => [optimistic, ...prev])
    try {
      await insertFoodEntry({
        user_id: user.id,
        date,
        meal: result.meal as MealType,
        food_labels: result.foods.map((f) => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        ai_raw: result,
      })
      setSelectedMeal(null)
      toast.success('Meal logged!', {
        description: `${result.foods.map((f) => f.label).join(', ')} (${result.nutrition.calories} cal)`,
      })
      await refetch()
      if (optimistic) removeOptimistic(optimistic.id)
    } catch (error) {
      if (optimistic) removeOptimistic(optimistic.id)
      console.error('Error saving AI text analysis:', error)
      toast.error('Error logging meal', {
        description: 'Unable to log this meal. Please try again.',
      })
    }
  }

  const handleManualSave = async (payload: ManualSavePayload) => {
    if (!user?.id) return
    const optimistic = buildOptimisticEntry({
      meal: payload.meal as MealType,
      food_labels: payload.food_labels,
      calories: payload.calories,
      macros: payload.macros,
      note: payload.note,
      journal_mode: payload.journal_mode,
    })
    if (optimistic) setOptimisticEntries((prev) => [optimistic, ...prev])
    try {
      await insertFoodEntry({
        user_id: user.id,
        date,
        meal: payload.meal as MealType,
        food_labels: payload.food_labels,
        calories: payload.calories,
        macros: payload.macros,
        note: payload.note,
        journal_mode: payload.journal_mode,
      })
      setSelectedMeal(null)
      toast.success('Food logged successfully!', {
        description: `${payload.food_labels.join(', ')}${payload.calories ? ` (${payload.calories} cal)` : ''}`,
      })
      await refetch()
      if (optimistic) removeOptimistic(optimistic.id)
    } catch (error) {
      if (optimistic) removeOptimistic(optimistic.id)
      console.error('Error saving manual entry:', error)
      toast.error('Error saving food entry', {
        description: 'There was a problem saving your food entry. Please try again.',
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
    if (!window.confirm('Are you sure you want to delete this entry?')) return
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

  const closeEditor = () => setEditingEntry(null)

  return {
    // shared data
    date,
    user,
    data,
    loading,
    refetch,
    summary,
    displayedDailyEntries,

    // mood
    selectedMood,
    currentMood,
    handleMoodSelect,

    // food selection
    selectedMeal,
    setSelectedMeal,

    // food handlers
    handlePhotoAnalysis,
    handleVoiceAnalysis,
    handleTextAnalysis,
    handleManualSave,

    // edit/delete
    editingEntry,
    editForm,
    setEditForm,
    handleEditEntry,
    handleSaveEdit,
    handleDeleteEntry,
    closeEditor,
  }
}
