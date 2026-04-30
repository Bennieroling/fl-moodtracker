'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { StandardCardHeader } from '@/components/ui/standard-card-header'
import { useFilters } from '@/lib/filter-context'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import {
  MoodPicker,
  LogFoodCard,
  RecentEntriesList,
  EntryEditorDialog,
  DateStepper,
} from '@/components/entry'
import { PageHeader } from '@/components/page-header'
import { useLogEntries } from '@/hooks/useLogEntries'

export default function LogPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { filters, setDashboardFilters } = useFilters()
  const date = filters.dashboard.date
  const dateObj = useMemo(() => parseISO(date), [date])
  const isViewingToday = isToday(dateObj)
  const dateLabel = format(dateObj, 'EEEE, MMMM d')

  const log = useLogEntries()
  const {
    selectedMood,
    currentMood,
    handleMoodSelect,
    selectedMeal,
    setSelectedMeal,
    handlePhotoAnalysis,
    handleVoiceAnalysis,
    handleTextAnalysis,
    handleManualSave,
    handleEditEntry,
    handleSaveEdit,
    handleDeleteEntry,
    editingEntry,
    editForm,
    setEditForm,
    closeEditor,
    displayedDailyEntries,
    loading,
  } = log

  const handleDateChange = (value: string) => {
    if (!value) return
    setDashboardFilters((prev) => ({ ...prev, date: value }))
  }

  // Onboarding redirect: first-time users with no entries land on /onboarding.
  // Lifted from the old dashboard — /log is the more accurate trigger point
  // since it's where the user is preparing to capture their first meal.
  useEffect(() => {
    if (!user?.id) return
    const storageKey = `pulse:onboarding:completed:${user.id}`
    if (window.localStorage.getItem(storageKey)) return

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log"
        description={dateLabel}
        action={<DateStepper date={date} onDateChange={handleDateChange} />}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <StandardCardHeader
            title={
              isViewingToday
                ? 'How are you feeling today?'
                : `How were you feeling on ${format(dateObj, 'MMM d')}?`
            }
            description="Track your mood to see patterns with your food."
          />
          <CardContent>
            <MoodPicker
              selectedMood={selectedMood ?? currentMood}
              onMoodSelect={handleMoodSelect}
            />
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
            date={date}
            onPhotoAnalysis={handlePhotoAnalysis}
            onVoiceAnalysis={handleVoiceAnalysis}
            onTextAnalysis={handleTextAnalysis}
            onManualSave={handleManualSave}
          />
        </div>
      </section>

      <RecentEntriesList
        title={`Entries for ${dateLabel}`}
        description="Review anything already logged on this day."
        entries={displayedDailyEntries}
        loading={loading}
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
        onClose={closeEditor}
      />
    </div>
  )
}
