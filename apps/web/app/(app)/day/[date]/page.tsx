'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Edit2, Trash2, Save, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'

interface FoodEntry {
  id: string
  meal: string
  food_labels: string[]
  calories: number | null
  macros: { protein: number; carbs: number; fat: number } | null
  note: string | null
  created_at: string
}

interface MoodEntry {
  id: string
  mood_score: number
  note: string | null
  created_at: string
}

const moodEmojis = [
  { score: 1, emoji: '😢', label: 'Very Bad' },
  { score: 2, emoji: '😞', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😄', label: 'Great' },
]

// Mock data removed - now using real Supabase data

export default function DayDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const dateParam = params.date as string

  const [date, setDate] = useState<Date | null>(null)
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([])
  const [moodEntry, setMoodEntry] = useState<MoodEntry | null>(null)
  const [editingMood, setEditingMood] = useState(false)
  const [moodNote, setMoodNote] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        const parsedDate = parseISO(dateParam)
        setDate(parsedDate)
        
        if (!user) return

        const supabase = createClient()
        
        // Load food entries for this date
        const { data: foodData, error: foodError } = await supabase
          .from('food_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', dateParam)
          .order('created_at', { ascending: true })

        if (foodError) {
          console.error('Error loading food entries:', foodError)
          toast.error('Failed to load food entries')
        } else {
          setFoodEntries(foodData || [])
        }

        // Load mood entry for this date
        const { data: moodData, error: moodError } = await supabase
          .from('mood_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', dateParam)
          .single()

        if (moodError && moodError.code !== 'PGRST116') {
          console.error('Error loading mood entry:', moodError)
          toast.error('Failed to load mood entry')
        } else if (moodData) {
          setMoodEntry(moodData)
          setMoodNote((moodData as { note?: string }).note || '')
        }
        
      } catch {
        console.error('Invalid date:', dateParam)
        router.push('/calendar')
      }
    }

    loadData()
  }, [dateParam, router, user])

  if (!date) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const totalCalories = foodEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0)
  const totalMacros = foodEntries.reduce(
    (acc, entry) => ({
      protein: acc.protein + (entry.macros?.protein || 0),
      carbs: acc.carbs + (entry.macros?.carbs || 0),
      fat: acc.fat + (entry.macros?.fat || 0),
    }),
    { protein: 0, carbs: 0, fat: 0 }
  )

  const handleMoodSave = async () => {
    if (!user || !moodEntry) return
    
    try {
      const supabase = createClient()
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('mood_entries')
        .update({ note: moodNote })
        .eq('id', moodEntry.id)
      
      if (error) {
        console.error('Error saving mood note:', error)
        toast.error('Failed to save mood note')
      } else {
        toast.success('Mood note saved!')
        setMoodEntry({ ...moodEntry, note: moodNote })
        setEditingMood(false)
      }
    } catch (error) {
      console.error('Error saving mood:', error)
      toast.error('Failed to save mood note')
    }
  }

  const handleDeleteFoodEntry = async (entryId: string) => {
    if (!user) return
    
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('food_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', user.id)
      
      if (error) {
        console.error('Error deleting food entry:', error)
        toast.error('Failed to delete food entry')
      } else {
        toast.success('Food entry deleted!')
        setFoodEntries(prev => prev.filter(entry => entry.id !== entryId))
      }
    } catch (error) {
      console.error('Error deleting food entry:', error)
      toast.error('Failed to delete food entry')
    }
  }

  const getMoodEmoji = (score: number) => {
    return moodEmojis.find(m => m.score === score)?.emoji || ''
  }

  const getMoodLabel = (score: number) => {
    return moodEmojis.find(m => m.score === score)?.label || ''
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{format(date, 'EEEE, MMMM d')}</h1>
          <p className="text-muted-foreground">{format(date, 'yyyy')}</p>
        </div>
      </div>

      {/* Daily Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{totalCalories}</div>
              <div className="text-sm text-muted-foreground">Total Calories</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{foodEntries.length}</div>
              <div className="text-sm text-muted-foreground">Meals Logged</div>
            </div>
            <div className="text-center">
              <div className="text-2xl">
                {moodEntry ? getMoodEmoji(moodEntry.mood_score) : '—'}
              </div>
              <div className="text-sm text-muted-foreground">Mood</div>
            </div>
            <div className="text-center">
              <div className="text-xs space-y-1">
                <div>Protein: {Math.round(totalMacros.protein)}g</div>
                <div>Carbs: {Math.round(totalMacros.carbs)}g</div>
                <div>Fat: {Math.round(totalMacros.fat)}g</div>
              </div>
              <div className="text-sm text-muted-foreground">Macros</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mood Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Mood</CardTitle>
          {moodEntry && !editingMood && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setEditingMood(true)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {moodEntry ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <span className="text-3xl">{getMoodEmoji(moodEntry.mood_score)}</span>
                <div>
                  <div className="font-medium">{getMoodLabel(moodEntry.mood_score)}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(parseISO(moodEntry.created_at), 'h:mm a')}
                  </div>
                </div>
              </div>

              {editingMood ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="mood-note">Note</Label>
                    <Textarea
                      id="mood-note"
                      value={moodNote}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMoodNote(e.target.value)}
                      placeholder="How are you feeling? What influenced your mood today?"
                      rows={3}
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button onClick={handleMoodSave} size="sm">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingMood(false)
                        setMoodNote(moodEntry.note || '')
                      }}
                      size="sm"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                moodEntry.note && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm">{moodEntry.note}</p>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No mood logged for this day
            </div>
          )}
        </CardContent>
      </Card>

      {/* Food Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Food Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {foodEntries.length > 0 ? (
            <div className="space-y-4">
              {foodEntries.map((entry, index) => (
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
                          {entry.food_labels.join(', ')}
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
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled
                        title="Food editing coming soon"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDeleteFoodEntry(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {index < foodEntries.length - 1 && <Separator className="my-4" />}
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
  )
}