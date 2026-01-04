'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar as CalendarIcon, Loader2, Edit, Trash2, MoreHorizontal } from 'lucide-react'
import { PhotoUploader, ManualFoodEntry, VoiceRecorder, TextAnalyzer } from '@/components/upload'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format, parseISO } from 'date-fns'
import { toast } from '@/hooks/use-toast'
import { upsertMoodEntry, insertFoodEntry, updateFoodEntry, deleteFoodEntry } from '@/lib/database'
import { MealType, FoodEntry } from '@/lib/types/database'
import { useDashboardData } from '@/hooks/useDashboardData'

// Mood picker component
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

// Meal type selector
const mealTypes = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
]

const DEFAULT_DASHBOARD_SUMMARY = {
  mood: null as number | null,
  totalCalories: 0,
  mealsLogged: 0,
  macros: { protein: 0, carbs: 0, fat: 0 },
  foodEntries: [] as FoodEntry[],
}

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
          variant={selectedMeal === meal.id ? "default" : "outline"}
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

export default function DashboardPage() {
  const { user } = useAuth()
  const { filters } = useFilters()
  const dashboardDate = useMemo(() => parseISO(filters.dashboard.date), [filters.dashboard.date])
  const dashboardDateString = filters.dashboard.date
  const [selectedMood, setSelectedMood] = useState<number | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null)
  const [loading, setLoading] = useState({
    mood: false,
  })
  const { data, loading: dataLoading, refetch } = useDashboardData()
  const summary = data?.summary ?? DEFAULT_DASHBOARD_SUMMARY
  const recentEntries = data?.recentEntries ?? []
  
  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null)
  const [editForm, setEditForm] = useState({
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

  const handleMoodSave = async () => {
    console.log('handleMoodSave called with:', {
      selectedMood,
      userId: user?.id,
      date: todayString,
      userObject: user
    })

    if (!selectedMood || !user?.id) {
      console.error('Missing required data for mood save:', {
        selectedMood,
        userId: user?.id,
        date: todayString
      })
      return
    }
    
    setLoading(prev => ({ ...prev, mood: true }))
    
    const moodEntryData = {
      user_id: user.id,
      date: todayString,
      mood_score: selectedMood
    }

    console.log('About to call upsertMoodEntry with:', moodEntryData)
    
    try {
      await upsertMoodEntry(moodEntryData)
      
      await refetch()
      setSelectedMood(null)
      
      toast({
        title: 'Mood saved!',
        description: `Your mood (${moodEmojis.find(m => m.score === selectedMood)?.emoji}) has been recorded for today.`
      })
    } catch (error) {
      console.error('Error saving mood:', error)
      toast({
        title: 'Error saving mood',
        description: 'There was a problem saving your mood. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setLoading(prev => ({ ...prev, mood: false }))
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
        date: todayString,
        meal: selectedMeal as MealType,
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
    } catch (error) {
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
      
      setSelectedMeal(result.meal)
      
      toast({
        title: 'Food logged successfully!',
        description: `${result.foods.map(f => f.label).join(', ')} (${result.nutrition.calories} cal)`
      })
      
      await refetch()
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          {todayLabel}
        </p>
      </div>


      {/* Today's Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Summary</CardTitle>
          <CardDescription>Your wellness overview for today</CardDescription>
        </CardHeader>
        <CardContent>
          {dataLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{summary.totalCalories.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Calories</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{summary.mealsLogged}</div>
                <div className="text-sm text-muted-foreground">Meals Logged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl">
                  {summary.mood ? moodEmojis.find(m => m.score === summary.mood)?.emoji : '—'}
                </div>
                <div className="text-sm text-muted-foreground">Mood</div>
              </div>
              <div className="text-center">
                <div className="text-xs space-y-1">
                  <div>Protein: {summary.macros.protein}g</div>
                  <div>Carbs: {summary.macros.carbs}g</div>
                  <div>Fat: {summary.macros.fat}g</div>
                </div>
                <div className="text-sm text-muted-foreground">Macros</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mood Tracking */}
      <Card>
        <CardHeader>
          <CardTitle>How are you feeling today?</CardTitle>
          <CardDescription>Track your mood to see patterns with your food</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MoodPicker selectedMood={selectedMood} onMoodSelect={setSelectedMood} />
          {selectedMood && (
            <div className="flex justify-center">
              <Button onClick={handleMoodSave} disabled={loading.mood}>
                {loading.mood ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Mood
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Food Entry */}
      <Card>
        <CardHeader>
          <CardTitle>Log Your Food</CardTitle>
          <CardDescription>Track what you eat with photos, voice, or manual entry</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Meal Type Selection */}
          <div className="space-y-2">
            <h4 className="font-medium">Select Meal Type</h4>
            <MealSelector selectedMeal={selectedMeal} onMealSelect={setSelectedMeal} />
          </div>

          {/* Entry Methods */}
          {selectedMeal && (
            <div className="space-y-4">
              <h4 className="font-medium">How would you like to log this meal?</h4>
              
              <Tabs defaultValue="photo" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="photo">Photo</TabsTrigger>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>
                
                <TabsContent value="photo" className="space-y-4">
                  <PhotoUploader
                    meal={selectedMeal}
                    date={todayString}
                    onAnalysisComplete={handlePhotoAnalysis}
                  />
                </TabsContent>
                
                <TabsContent value="voice" className="space-y-4">
                  <VoiceRecorder
                    date={todayString}
                    selectedMeal={selectedMeal}
                    onAnalysisComplete={handleVoiceAnalysis}
                  />
                </TabsContent>

                <TabsContent value="text" className="space-y-4">
                  <TextAnalyzer
                    selectedMeal={selectedMeal}
                    date={todayString}
                    onAnalysisComplete={handleTextAnalysis}
                  />
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4">
                  <ManualFoodEntry
                    meal={selectedMeal}
                    onSave={handleManualSave}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Entries</CardTitle>
          <CardDescription>Your latest food and mood entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dataLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading recent entries...</span>
              </div>
            ) : recentEntries.length > 0 ? (
              recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">
                      {entry.food_labels?.[0] ? '🍽️' : '📝'}
                    </span>
                    <div>
                      <div className="font-medium">
                        {entry.food_labels?.join(', ') || 'Food entry'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.meal} • {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {entry.calories ? `${entry.calories} cal` : 'No cal data'}
                    </Badge>
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
                        <DropdownMenuItem 
                          onClick={() => handleDeleteEntry(entry)}
                          className="text-destructive"
                        >
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
                <p>No recent entries</p>
                <p className="text-sm">Start logging food above to see your entries here</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Food Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-meal">Meal Type</Label>
              <Select value={editForm.meal} onValueChange={(value) => setEditForm(prev => ({ ...prev, meal: value }))}>
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
                onChange={(e) => setEditForm(prev => ({ 
                  ...prev, 
                  food_labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                }))}
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
                  onChange={(e) => setEditForm(prev => ({ ...prev, calories: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-protein">Protein (g)</Label>
                <Input
                  id="edit-protein"
                  type="number"
                  value={editForm.protein || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, protein: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-carbs">Carbs (g)</Label>
                <Input
                  id="edit-carbs"
                  type="number"
                  value={editForm.carbs || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, carbs: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fat">Fat (g)</Label>
                <Input
                  id="edit-fat"
                  type="number"
                  value={editForm.fat || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fat: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">Note (optional)</Label>
              <Input
                id="edit-note"
                value={editForm.note}
                onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
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
