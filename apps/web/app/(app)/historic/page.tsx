'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { Calendar as CalendarIcon, Loader2, Edit, Trash2, MoreHorizontal } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PhotoUploader, ManualFoodEntry, VoiceRecorder } from '@/components/upload'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { getDashboardSummary, upsertMoodEntry, insertFoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import { MealType, FoodEntry } from '@/lib/types/database'

const moodEmojis = [
  { score: 1, emoji: '😢', label: 'Very Bad' },
  { score: 2, emoji: '😞', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😄', label: 'Great' },
]

interface MoodPickerProps {
  selectedMood: number | null
  onMoodSelect: (mood: number) => void
}

function MoodPicker({ selectedMood, onMoodSelect }: MoodPickerProps) {
  return (
    <div className="flex justify-center space-x-4">
      {moodEmojis.map((mood) => (
        <button
          key={mood.score}
          onClick={() => onMoodSelect(mood.score)}
          className={`p-3 rounded-full transition-all ${
            selectedMood === mood.score
              ? 'bg-primary text-primary-foreground scale-110'
              : 'hover:bg-muted hover:scale-105'
          }`}
          title={mood.label}
        >
          <span className="text-2xl">{mood.emoji}</span>
        </button>
      ))}
    </div>
  )
}

const mealTypes = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
]

interface MealSelectorProps {
  selectedMeal: string | null
  onMealSelect: (meal: string) => void
}

function MealSelector({ selectedMeal, onMealSelect }: MealSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {mealTypes.map((meal) => (
        <Button
          key={meal.id}
          variant={selectedMeal === meal.id ? 'default' : 'outline'}
          onClick={() => onMealSelect(meal.id)}
          className="flex flex-col items-center p-4 h-auto"
        >
          <span className="text-lg mb-1">{meal.icon}</span>
          <span className="text-xs">{meal.label}</span>
        </Button>
      ))}
    </div>
  )
}

export default function HistoricPage() {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null)
  const [selectedDaySummary, setSelectedDaySummary] = useState({
    mood: null as number | null,
    totalCalories: 0,
    mealsLogged: 0,
    macros: { protein: 0, carbs: 0, fat: 0 },
  })
  const [dailyEntries, setDailyEntries] = useState<FoodEntry[]>([])
  const [loading, setLoading] = useState({
    summary: false,
    mood: false,
    entries: false,
  })
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState({
    meal: '',
    food_labels: [] as string[],
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    note: '',
  })

  const todayString = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const selectedDateString = format(selectedDate, 'yyyy-MM-dd')
  const selectedDateLabel = format(selectedDate, 'EEEE, MMMM d')

  const loadSelectedDateData = useCallback(async () => {
    if (!user?.id) return
    setLoading((prev) => ({ ...prev, summary: true, entries: true }))

    try {
      const summaryData = await getDashboardSummary(user.id, selectedDateString)
      setSelectedDaySummary({
        mood: summaryData.mood,
        totalCalories: summaryData.totalCalories,
        mealsLogged: summaryData.mealsLogged,
        macros: summaryData.macros,
      })
      setDailyEntries(summaryData.foodEntries || [])
      setSelectedMood(null)
      setSelectedMeal(null)
    } catch (error) {
      console.error('Error loading historic data:', error)
      toast({
        title: 'Error loading data',
        description: 'There was a problem loading this day. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading((prev) => ({ ...prev, summary: false, entries: false }))
    }
  }, [user?.id, selectedDateString])

  useEffect(() => {
    loadSelectedDateData()
  }, [loadSelectedDateData])

  const handleDateChange = (value: string) => {
    if (!value) return
    const parsed = new Date(`${value}T00:00:00`)
    setSelectedDate(parsed)
  }

  const shiftDate = (days: number) => {
    setSelectedDate((prev) => {
      const next = addDays(prev, days)
      const today = new Date()
      if (days > 0 && next > today) {
        return prev
      }
      return next
    })
  }

  const handleMoodSave = async () => {
    if (!selectedMood || !user?.id) return

    setLoading((prev) => ({ ...prev, mood: true }))

    try {
      await upsertMoodEntry({
        user_id: user.id,
        date: selectedDateString,
        mood_score: selectedMood,
      })

      toast({
        title: 'Mood saved!',
        description: `Your mood for ${selectedDateLabel} has been recorded.`,
      })

      await loadSelectedDateData()
    } catch (error) {
      console.error('Error saving mood:', error)
      toast({
        title: 'Error saving mood',
        description: 'There was a problem saving your mood. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading((prev) => ({ ...prev, mood: false }))
    }
  }

  const handlePhotoAnalysis = async (result: {
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    photoUrl: string
  }) => {
    if (!user?.id || !selectedMeal) return

    try {
      await insertFoodEntry({
        user_id: user.id,
        date: selectedDateString,
        meal: selectedMeal as MealType,
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

      await loadSelectedDateData()
    } catch (error) {
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

      await loadSelectedDateData()
    } catch (error) {
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

      await loadSelectedDateData()
    } catch (error) {
      console.error('Error saving manual entry:', error)
      toast({
        title: 'Error saving food entry',
        description: 'There was a problem saving your food entry. Please try again.',
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

      toast({
        title: 'Entry updated!',
        description: 'Your food entry has been successfully updated.',
      })

      setEditingEntry(null)
      await loadSelectedDateData()
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

      await loadSelectedDateData()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast({
        title: 'Error deleting entry',
        description: 'There was a problem deleting your entry. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const isNextDisabled = selectedDateString === todayString

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Historic Log</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          {selectedDateLabel}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select a Date</CardTitle>
          <CardDescription>Review or add entries for any day in the past.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="historic-date">Date</Label>
            <Input
              id="historic-date"
              type="date"
              value={selectedDateString}
              max={todayString}
              onChange={(event) => handleDateChange(event.target.value)}
              className="w-52"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => shiftDate(-1)}>
              Previous Day
            </Button>
            <Button variant="outline" onClick={() => shiftDate(1)} disabled={isNextDisabled}>
              Next Day
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected Day Summary</CardTitle>
          <CardDescription>Your wellness overview for {selectedDateLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{selectedDaySummary.totalCalories}</div>
              <div className="text-sm text-muted-foreground">Calories</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{selectedDaySummary.mealsLogged}</div>
              <div className="text-sm text-muted-foreground">Meals Logged</div>
            </div>
            <div className="text-center">
              <div className="text-2xl">
                {selectedDaySummary.mood ? moodEmojis.find((m) => m.score === selectedDaySummary.mood)?.emoji : '—'}
              </div>
              <div className="text-sm text-muted-foreground">Mood</div>
            </div>
            <div className="text-center">
              <div className="text-xs space-y-1">
                <div>Protein: {selectedDaySummary.macros.protein}g</div>
                <div>Carbs: {selectedDaySummary.macros.carbs}g</div>
                <div>Fat: {selectedDaySummary.macros.fat}g</div>
              </div>
              <div className="text-sm text-muted-foreground">Macros</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How were you feeling?</CardTitle>
          <CardDescription>Track your mood for {selectedDateLabel}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MoodPicker selectedMood={selectedMood} onMoodSelect={setSelectedMood} />
          {selectedMood && (
            <div className="flex justify-center">
              <Button onClick={handleMoodSave} disabled={loading.mood}>
                {loading.mood ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Mood'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log Your Food</CardTitle>
          <CardDescription>Backfill a meal for {selectedDateLabel} with any method.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-medium">Select Meal Type</h4>
            <MealSelector selectedMeal={selectedMeal} onMealSelect={setSelectedMeal} />
          </div>

          {selectedMeal && (
            <div className="space-y-4">
              <h4 className="font-medium">How would you like to log this meal?</h4>

              <Tabs defaultValue="photo" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="photo">Photo</TabsTrigger>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>

                <TabsContent value="photo" className="space-y-4">
                  <PhotoUploader meal={selectedMeal} date={selectedDateString} onAnalysisComplete={handlePhotoAnalysis} />
                </TabsContent>

                <TabsContent value="voice" className="space-y-4">
                  <VoiceRecorder date={selectedDateString} selectedMeal={selectedMeal} onAnalysisComplete={handleVoiceAnalysis} />
                </TabsContent>

                <TabsContent value="manual" className="space-y-4">
                  <ManualFoodEntry meal={selectedMeal} onSave={handleManualSave} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries for {selectedDateLabel}</CardTitle>
          <CardDescription>Review anything already logged on this day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading.entries ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading entries...</span>
              </div>
            ) : dailyEntries.length > 0 ? (
              dailyEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">{entry.food_labels?.[0] ? '🍽️' : '📝'}</span>
                    <div>
                      <div className="font-medium">{entry.food_labels?.join(', ') || 'Food entry'}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.meal} • {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{entry.calories ? `${entry.calories} cal` : 'No cal data'}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditEntry(entry)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteEntry(entry)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <span className="text-4xl block mb-4">🍽️</span>
                <p>No entries logged for this date</p>
                <p className="text-sm">Use the tools above to backfill meals or moods.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Food Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-meal">Meal Type</Label>
              <Select value={editForm.meal} onValueChange={(value) => setEditForm((prev) => ({ ...prev, meal: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">🌅 Breakfast</SelectItem>
                  <SelectItem value="lunch">☀️ Lunch</SelectItem>
                  <SelectItem value="dinner">🌙 Dinner</SelectItem>
                  <SelectItem value="snack">🍎 Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-foods">Food Items</Label>
              <Input
                id="edit-foods"
                value={editForm.food_labels.join(', ')}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    food_labels: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="Separate items with commas"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-calories">Calories</Label>
                <Input
                  id="edit-calories"
                  type="number"
                  value={editForm.calories || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, calories: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-protein">Protein (g)</Label>
                <Input
                  id="edit-protein"
                  type="number"
                  value={editForm.protein || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, protein: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-carbs">Carbs (g)</Label>
                <Input
                  id="edit-carbs"
                  type="number"
                  value={editForm.carbs || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, carbs: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fat">Fat (g)</Label>
                <Input
                  id="edit-fat"
                  type="number"
                  value={editForm.fat || ''}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, fat: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">Note (optional)</Label>
              <Input
                id="edit-note"
                value={editForm.note}
                onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Add any additional notes"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSaveEdit} className="flex-1">
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
