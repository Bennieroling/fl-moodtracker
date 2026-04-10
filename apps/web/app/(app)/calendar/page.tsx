'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { useCalendarMonthData, useCalendarDayData } from '@/hooks/useCalendarData'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, ChevronRight, Edit, Trash2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isBefore, addDays, subDays } from 'date-fns'
import { MoodEntry, FoodEntry, MealType, StateOfMind } from '@/lib/types/database'
import { toast } from '@/hooks/use-toast'
import { upsertMoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import { MoodPicker, EntryEditorDialog, type EntryEditForm } from '@/components/entry'
import { PageHeader } from '@/components/page-header'
import { MacroDisplay } from '@/components/macro-display'
import { StandardCardHeader } from '@/components/ui/standard-card-header'

const moodEmojis = [
  { score: 1, emoji: '😢', label: 'Very Bad', color: 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-200' },
  { score: 2, emoji: '😞', label: 'Bad', color: 'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-200' },
  { score: 3, emoji: '😐', label: 'Okay', color: 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200' },
  { score: 4, emoji: '🙂', label: 'Good', color: 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-200' },
  { score: 5, emoji: '😄', label: 'Great', color: 'bg-green-200 border-green-400 text-green-900 dark:bg-green-900/45 dark:border-green-600 dark:text-green-100' },
]

function getMoodEmoji(score: number | undefined): string {
  if (!score) return ''
  return moodEmojis.find(m => m.score === score)?.emoji || ''
}

function getMoodColor(score: number | undefined): string {
  if (!score) return ''
  return moodEmojis.find(m => m.score === score)?.color || ''
}

function getMoodLabel(score: number | undefined): string {
  if (!score) return 'No mood logged'
  return moodEmojis.find((m) => m.score === score)?.label ?? 'Mood logged'
}

const valenceColor = (classification: string) => {
  switch (classification) {
    case 'very_unpleasant': return '#EF4444'
    case 'slightly_unpleasant': return '#F59E0B'
    case 'neutral': return '#6B7280'
    case 'slightly_pleasant': return '#34D399'
    case 'very_pleasant': return '#10B981'
    default: return '#6B7280'
  }
}

function formatMetric(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString(undefined, options)
}

function calculateCurrentStreak(moodEntries: MoodEntry[]): number {
  if (moodEntries.length === 0) return 0
  
  // Sort entries by date descending (newest first)
  const sortedEntries = [...moodEntries].sort((a, b) => 
    isBefore(parseISO(a.date), parseISO(b.date)) ? 1 : -1
  )
  
  const today = new Date()
  const todayString = format(today, 'yyyy-MM-dd')
  
  // Check if today has an entry
  const hasTodayEntry = sortedEntries.some(entry => entry.date === todayString)
  
  // If today doesn't have an entry, streak is 0
  if (!hasTodayEntry) return 0
  
  let streak = 0
  let currentDate = today
  
  // Count consecutive days backward from today
  while (true) {
    const dateString = format(currentDate, 'yyyy-MM-dd')
    const hasEntry = sortedEntries.some(entry => entry.date === dateString)
    
    if (hasEntry) {
      streak++
      currentDate = subDays(currentDate, 1)
    } else {
      break
    }
  }
  
  return streak
}

function calculateBestStreak(moodEntries: MoodEntry[]): number {
  if (moodEntries.length === 0) return 0
  
  // Sort entries by date ascending (oldest first)
  const sortedEntries = [...moodEntries].sort((a, b) => 
    isBefore(parseISO(a.date), parseISO(b.date)) ? -1 : 1
  )
  
  let maxStreak = 0
  let currentStreak = 0
  let previousDate: Date | null = null
  
  for (const entry of sortedEntries) {
    const currentDate = parseISO(entry.date)
    
    if (previousDate === null) {
      // First entry
      currentStreak = 1
    } else {
      // Check if this entry is consecutive to the previous one
      const expectedDate = addDays(previousDate, 1)
      if (isSameDay(currentDate, expectedDate)) {
        currentStreak++
      } else {
        // Streak broken, reset
        maxStreak = Math.max(maxStreak, currentStreak)
        currentStreak = 1
      }
    }
    
    previousDate = currentDate
  }
  
  // Don't forget to check the final streak
  maxStreak = Math.max(maxStreak, currentStreak)
  
  return maxStreak
}

export default function CalendarPage() {
  const { user } = useAuth()
  const { filters, setCalendarFilters } = useFilters()
  const calendarFilters = filters.calendar
  const currentDate = useMemo(() => {
    const parsed = parseISO(calendarFilters.currentMonth)
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
  }, [calendarFilters.currentMonth])
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState<EntryEditForm>({
    meal: '',
    food_labels: [],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    note: '',
  })
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const { data: monthEntries, loading: monthLoading, refetch: refetchMonth } = useCalendarMonthData()
  const { data: dayData, loading: dayLoading, refetch: refetchDay } = useCalendarDayData()
  const moodEntries = monthEntries || []
  const dailyMoodEntry = dayData?.mood ?? null
  const dailyFoodEntries = dayData?.foodEntries ?? []
  const dailyActivity = dayData?.activity ?? null
  const dailyStateOfMind = dayData?.stateOfMind ?? []
  const selectedDate = calendarFilters.selectedDate
  const currentMood = selectedMood ?? dailyMoodEntry?.mood_score ?? null

  useEffect(() => {
    setSelectedMood(null)
  }, [selectedDate, dailySummaryOpen])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get the first day of the week to start the calendar
  const startDay = monthStart.getDay()
  const paddingDays = Array(startDay).fill(null)

  // Convert mood entries to a lookup map for easy access
  const moodData = moodEntries.reduce((acc, entry) => {
    acc[entry.date] = entry.mood_score
    return acc
  }, {} as Record<string, number>)

  const handleDayClick = (dateKey: string) => {
    if (!user) return
    
    setCalendarFilters((prev) => ({ ...prev, selectedDate: dateKey }))
    setDailySummaryOpen(true)
  }

  const handleDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, day: Date) => {
    let offset = 0
    if (event.key === 'ArrowLeft') offset = -1
    if (event.key === 'ArrowRight') offset = 1
    if (event.key === 'ArrowUp') offset = -7
    if (event.key === 'ArrowDown') offset = 7
    if (offset === 0) return

    event.preventDefault()
    const targetDate = format(addDays(day, offset), 'yyyy-MM-dd')
    const targetButton = document.querySelector<HTMLButtonElement>(`button[data-date="${targetDate}"]`)
    if (targetButton) {
      targetButton.focus()
    }
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    const nextDate = direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1)
    setCalendarFilters((prev) => ({
      ...prev,
      currentMonth: format(startOfMonth(nextDate), 'yyyy-MM-dd'),
    }))
  }

  const goToToday = () => {
    setCalendarFilters((prev) => ({
      ...prev,
      currentMonth: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    }))
  }

  const handleMoodSelect = async (moodScore: number) => {
    if (!user?.id || !selectedDate) return
    const previousMood = currentMood
    setSelectedMood(moodScore)

    try {
      await upsertMoodEntry({
        user_id: user.id,
        date: selectedDate,
        mood_score: moodScore,
      })
      await Promise.all([refetchDay(), refetchMonth()])
      setSelectedMood(null)
    } catch (error) {
      console.error('Error saving mood from calendar modal:', error)
      setSelectedMood(previousMood)
      toast({
        title: 'Error saving mood',
        description: 'There was a problem saving your mood. Please try again.',
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
      await refetchDay()
      toast({
        title: 'Entry updated',
        description: 'Your food entry was updated for this day.',
      })
    } catch (error) {
      console.error('Error updating calendar entry:', error)
      toast({
        title: 'Error updating entry',
        description: 'There was a problem updating this entry.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteEntry = async (entry: FoodEntry) => {
    if (!user?.id) return
    if (!confirm('Are you sure you want to delete this entry?')) return

    try {
      await deleteFoodEntry(entry.id)
      await refetchDay()
      toast({
        title: 'Entry deleted',
        description: 'The food entry was removed.',
      })
    } catch (error) {
      console.error('Error deleting calendar entry:', error)
      toast({
        title: 'Error deleting entry',
        description: 'There was a problem deleting this entry.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        action={(
          <Button onClick={goToToday} variant="outline">
            Today
          </Button>
        )}
      />

      {/* Calendar */}
      <Card>
        <StandardCardHeader
          title={format(currentDate, 'MMMM yyyy')}
          description="Select a day to review and edit food, mood, and activity details."
          action={
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('prev')}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('next')}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          }
        />
        <CardContent>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Padding days */}
            {paddingDays.map((_, index) => (
              <div key={`padding-${index}`} className="p-2 h-16"></div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd')
              const mood = moodData[dateKey]
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentDate)
              const moodColor = getMoodColor(mood)
              const moodLabel = getMoodLabel(mood)
              const ariaLabel = `${format(day, 'EEEE, MMMM d, yyyy')}. ${moodLabel}.`

              return (
                <button
                  type="button"
                  key={dateKey}
                  data-date={dateKey}
                  onClick={() => handleDayClick(dateKey)}
                  onKeyDown={(event) => handleDayKeyDown(event, day)}
                  aria-label={ariaLabel}
                  className={`
                    p-2 h-16 border rounded-lg transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${isToday ? 'ring-2 ring-primary' : ''}
                    ${!isCurrentMonth ? 'opacity-40' : ''}
                    ${mood ? moodColor : 'hover:bg-muted'}
                  `}
                >
                  <div className="flex flex-col items-center justify-center h-full space-y-1">
                    <span className={`text-sm ${isToday ? 'font-bold' : ''}`}>
                      {format(day, 'd')}
                    </span>
                    {mood && (
                      <span className="text-lg">
                        {getMoodEmoji(mood)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <StandardCardHeader title="Mood Legend" description="Color and emoji mapping used on calendar day cells." />
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {moodEmojis.map((mood) => (
              <div key={mood.score} className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${mood.color}`}>
                <span className="text-lg">{mood.emoji}</span>
                <span className="text-sm font-medium">{mood.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card>
        <StandardCardHeader
          title={monthLoading ? 'Loading...' : `${format(currentDate, 'MMMM yyyy')} Summary`}
          description="Monthly consistency and trend snapshot for mood logging."
        />
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {moodEntries.length}
              </div>
              <div className="text-sm text-muted-foreground">Days Logged</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {moodEntries.length > 0 
                  ? `${(moodEntries.reduce((sum, entry) => sum + entry.mood_score, 0) / moodEntries.length).toFixed(1)} ${getMoodEmoji(Math.round(moodEntries.reduce((sum, entry) => sum + entry.mood_score, 0) / moodEntries.length))}`
                  : '—'
                }
              </div>
              <div className="text-sm text-muted-foreground">Avg Mood</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {calculateCurrentStreak(moodEntries)}
              </div>
              <div className="text-sm text-muted-foreground">Current Streak</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {calculateBestStreak(moodEntries)}
              </div>
              <div className="text-sm text-muted-foreground">Best Streak</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Summary Dialog */}
      <Dialog
        open={dailySummaryOpen}
        onOpenChange={(open) => {
          setDailySummaryOpen(open)
          if (!open) {
            setCalendarFilters((prev) => ({ ...prev, selectedDate: null }))
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : 'Daily Summary'}
            </DialogTitle>
          </DialogHeader>
          
          {dayLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Daily Summary Stats */}
              <Card>
                <StandardCardHeader title="Daily Summary" description="Nutrition and mood totals for the selected date." />
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {dailyFoodEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Calories</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">{dailyFoodEntries.length}</div>
                      <div className="text-sm text-muted-foreground">Meals Logged</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl">
                        {dailyMoodEntry ? getMoodEmoji(dailyMoodEntry.mood_score) : '—'}
                      </div>
                      <div className="text-sm text-muted-foreground">Mood</div>
                    </div>
                    <div className="text-center">
                      {(() => {
                        const totalMacros = dailyFoodEntries.reduce(
                          (acc, entry) => ({
                            protein: acc.protein + (entry.macros?.protein || 0),
                            carbs: acc.carbs + (entry.macros?.carbs || 0),
                            fat: acc.fat + (entry.macros?.fat || 0),
                          }),
                          { protein: 0, carbs: 0, fat: 0 }
                        )
                        return <MacroDisplay macros={{
                          protein: Math.round(totalMacros.protein),
                          carbs: Math.round(totalMacros.carbs),
                          fat: Math.round(totalMacros.fat),
                        }} compact className="text-center" />
                      })()}
                      <div className="text-sm text-muted-foreground">Macros</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Exercise Summary */}
              <Card>
                <StandardCardHeader title="Exercise Summary" description="Imported movement and activity metrics for the day." />
                <CardContent>
                  {dailyActivity ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{formatMetric(dailyActivity.steps)}</div>
                        <div className="text-sm text-muted-foreground">Steps</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {formatMetric(dailyActivity.exercise_time_minutes)} min
                        </div>
                        <div className="text-sm text-muted-foreground">Exercise Time</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {formatMetric(dailyActivity.active_energy_kcal)} kcal
                        </div>
                        <div className="text-sm text-muted-foreground">Active Calories</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {formatMetric(dailyActivity.distance_km, { maximumFractionDigits: 2 })} km
                        </div>
                        <div className="text-sm text-muted-foreground">Distance</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      No exercise data recorded for this day.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Mood Section */}
              <Card>
                <StandardCardHeader title="Mood" description="Update or review how you felt on this day." />
                <CardContent className="space-y-4">
                  <MoodPicker selectedMood={currentMood} onMoodSelect={handleMoodSelect} />
                  {dailyMoodEntry ? (
                    <div className="text-center text-sm text-muted-foreground">
                      Last updated at {format(parseISO(dailyMoodEntry.created_at), 'h:mm a')}
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      No mood logged yet for this day.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* State of Mind */}
              <Card>
                <StandardCardHeader title="State of Mind" description="Apple Health mood entries for this date." />
                <CardContent>
                  {dailyStateOfMind.length > 0 ? (
                    <div className="space-y-3">
                      {dailyStateOfMind.map((som, i) => (
                        <div key={i} className="flex flex-col gap-1.5 rounded-lg border p-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: valenceColor(som.valence_classification) }}
                            />
                            <span className="text-sm font-medium capitalize">
                              {som.valence_classification.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {format(parseISO(som.recorded_at), 'h:mm a')}
                            </span>
                          </div>
                          {som.labels && som.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {som.labels.map((label) => (
                                <span key={label} className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          {som.associations && som.associations.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {som.associations.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">No State of Mind data</p>
                  )}
                </CardContent>
              </Card>

              {/* Food Entries */}
              <Card>
                <StandardCardHeader title="Food Entries" description="Meals and notes recorded for this date." />
                <CardContent>
                  {dailyFoodEntries.length > 0 ? (
                    <div className="space-y-4">
                      {dailyFoodEntries.map((entry, index) => (
                        <div key={entry.id}>
                          <div className="flex items-start justify-between p-4 border rounded-lg">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" className="capitalize">
                                  {entry.meal}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {format(parseISO(entry.created_at), 'h:mm a')}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <div className="font-medium">
                                  {(entry.food_labels || []).join(', ')}
                                </div>
                                {entry.note && (
                                  <p className="text-sm text-muted-foreground">{entry.note}</p>
                                )}
                              </div>

                              {entry.calories && (
                                <div className="flex space-x-4 text-sm">
                                  <span className="font-medium">{entry.calories} cal</span>
                                  {entry.macros && (
                                    <span className="text-muted-foreground">
                                      Protein:{entry.macros.protein}g Carbs:{entry.macros.carbs}g Fat:{entry.macros.fat}g
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-2">
                                <Button variant="ghost" size="icon" onClick={() => handleEditEntry(entry)} aria-label="Edit entry">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteEntry(entry)}
                                  aria-label="Delete entry"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {index < dailyFoodEntries.length - 1 && <Separator className="my-4" />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No food entries for this day
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          <EntryEditorDialog
            entry={editingEntry}
            form={editForm}
            setForm={setEditForm}
            onSave={handleSaveEdit}
            onClose={() => setEditingEntry(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
