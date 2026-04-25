'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { MealType } from '@/lib/types/database'
import { Check, Edit, Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'

interface TextAnalyzerProps {
  selectedMeal: string
  date: string
  onAnalysisComplete?: (result: {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
  }) => void
}

export function TextAnalyzer({ selectedMeal, date, onAnalysisComplete }: TextAnalyzerProps) {
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [mealOverride, setMealOverride] = useState<string>(selectedMeal)
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<null | {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    normalized_text: string
  }>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedFoods, setEditedFoods] = useState<
    Array<{ label: string; confidence: number; quantity?: string }>
  >([])
  const [editedCalories, setEditedCalories] = useState(0)
  const [editedProtein, setEditedProtein] = useState(0)
  const [editedCarbs, setEditedCarbs] = useState(0)
  const [editedFat, setEditedFat] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!user) {
      toast.error('Please log in to use AI analysis')
      return
    }

    if (input.trim().length < 10) {
      setError('Please describe the meal in a full sentence so the AI can analyze it.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/ai/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input.trim(),
          userId: user.id,
          date,
          meal: mealOverride as MealType,
        }),
      })

      if (!response.ok) {
        const { error: message } = await response
          .json()
          .catch(() => ({ error: 'Failed to analyze text' }))
        throw new Error(message)
      }

      const data = await response.json()
      setAnalysis(data)
      setMealOverride(data.meal)
      setEditedFoods(data.foods)
      setEditedCalories(data.nutrition.calories)
      setEditedProtein(data.nutrition.macros.protein)
      setEditedCarbs(data.nutrition.macros.carbs)
      setEditedFat(data.nutrition.macros.fat)
      setIsEditing(false)
      toast.success('AI analysis complete. Review and log below.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze text'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleLog = () => {
    if (!analysis || !onAnalysisComplete) return
    onAnalysisComplete({
      meal: mealOverride,
      foods: editedFoods
        .map((food) => ({ ...food, label: food.label.trim() }))
        .filter((food) => food.label.length > 0),
      nutrition: {
        calories: editedCalories,
        macros: {
          protein: editedProtein,
          carbs: editedCarbs,
          fat: editedFat,
        },
      },
    })
  }

  const cancelEditing = () => {
    if (!analysis) return
    setEditedFoods(analysis.foods)
    setEditedCalories(analysis.nutrition.calories)
    setEditedProtein(analysis.nutrition.macros.protein)
    setEditedCarbs(analysis.nutrition.macros.carbs)
    setEditedFat(analysis.nutrition.macros.fat)
    setIsEditing(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Describe your meal</label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: At lunch I had grilled chicken breast with quinoa, roasted veggies, and a small cookie."
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Meal type</label>
          <Select value={mealOverride} onValueChange={setMealOverride}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="breakfast">Breakfast</SelectItem>
              <SelectItem value="lunch">Lunch</SelectItem>
              <SelectItem value="dinner">Dinner</SelectItem>
              <SelectItem value="snack">Snack</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleAnalyze} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze with AI'
          )}
        </Button>

        {analysis && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Review before save</p>
              {!isEditing ? (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setIsEditing(false)}>
                    <Check className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEditing}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">AI summary</p>
              <p className="text-sm">{analysis.normalized_text}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Foods detected</p>
              {isEditing ? (
                <div className="space-y-2">
                  {editedFoods.map((food, index) => (
                    <div key={`${food.label}-${index}`} className="flex items-center gap-2">
                      <Input
                        value={food.label}
                        onChange={(e) =>
                          setEditedFoods((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Badge variant="outline">{Math.round(food.confidence * 100)}%</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEditedFoods((prev) =>
                            prev.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label="Remove detected food"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditedFoods((prev) => [...prev, { label: '', confidence: 1 }])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Food
                  </Button>
                </div>
              ) : (
                <ul className="text-sm list-disc pl-5">
                  {editedFoods.map((food, idx) => (
                    <li key={`${food.label}-${idx}`}>
                      {food.label} ({Math.round(food.confidence * 100)}%)
                      {food.quantity ? ` – ${food.quantity}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-sm">
              <p className="font-medium text-muted-foreground">Estimated nutrition</p>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Input
                    type="number"
                    value={editedCalories}
                    onChange={(e) => setEditedCalories(Number(e.target.value))}
                    placeholder="Calories"
                  />
                  <Input
                    type="number"
                    value={editedProtein}
                    onChange={(e) => setEditedProtein(Number(e.target.value))}
                    placeholder="Protein"
                  />
                  <Input
                    type="number"
                    value={editedCarbs}
                    onChange={(e) => setEditedCarbs(Number(e.target.value))}
                    placeholder="Carbs"
                  />
                  <Input
                    type="number"
                    value={editedFat}
                    onChange={(e) => setEditedFat(Number(e.target.value))}
                    placeholder="Fat"
                  />
                </div>
              ) : (
                <>
                  <p>{editedCalories} cal</p>
                  <p>
                    Protein {editedProtein}g • Carbs {editedCarbs}g • Fat {editedFat}g
                  </p>
                </>
              )}
            </div>
            <Button onClick={handleLog} className="w-full" variant="secondary">
              Confirm & Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
