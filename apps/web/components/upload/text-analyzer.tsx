'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MealType } from '@/lib/types/database'
import { Loader2 } from 'lucide-react'
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
        const { error: message } = await response.json().catch(() => ({ error: 'Failed to analyze text' }))
        throw new Error(message)
      }

      const data = await response.json()
      setAnalysis(data)
      setMealOverride(data.meal)
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
      foods: analysis.foods,
      nutrition: analysis.nutrition,
    })
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
            <div>
              <p className="text-sm font-medium text-muted-foreground">AI summary</p>
              <p className="text-sm">{analysis.normalized_text}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Foods detected</p>
              <ul className="text-sm list-disc pl-5">
                {analysis.foods.map((food, idx) => (
                  <li key={`${food.label}-${idx}`}>
                    {food.label} ({Math.round(food.confidence * 100)}%)
                    {food.quantity ? ` – ${food.quantity}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-sm">
              <p className="font-medium text-muted-foreground">Estimated nutrition</p>
              <p>{analysis.nutrition.calories} cal</p>
              <p>
                Protein {analysis.nutrition.macros.protein}g • Carbs {analysis.nutrition.macros.carbs}g • Fat {analysis.nutrition.macros.fat}g
              </p>
            </div>
            <Button onClick={handleLog} className="w-full" variant="secondary">
              Log this meal
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
