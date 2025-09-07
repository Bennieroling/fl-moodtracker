'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Plus, X, Save } from 'lucide-react'
import { ManualFoodEntrySchema } from '@/lib/validations'
import { toast } from 'sonner'

interface ManualFoodEntryProps {
  meal: string
  onSave?: (data: {
    meal: string
    food_labels: string[]
    calories?: number
    macros?: { protein: number; carbs: number; fat: number }
    note?: string
    journal_mode: boolean
  }) => void
  className?: string
}

export function ManualFoodEntry({ meal, onSave, className }: ManualFoodEntryProps) {
  const [foods, setFoods] = useState<string[]>([''])
  const [calories, setCalories] = useState<string>('')
  const [protein, setProtein] = useState<string>('')
  const [carbs, setCarbs] = useState<string>('')
  const [fat, setFat] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [journalMode, setJournalMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Add new food input
  const addFoodInput = () => {
    setFoods([...foods, ''])
  }

  // Remove food input
  const removeFoodInput = (index: number) => {
    if (foods.length > 1) {
      setFoods(foods.filter((_, i) => i !== index))
    }
  }

  // Update food input
  const updateFood = (index: number, value: string) => {
    const updated = [...foods]
    updated[index] = value
    setFoods(updated)
  }

  // Validate and save
  const handleSave = async () => {
    setError(null)
    setIsLoading(true)

    try {
      // Filter out empty food entries
      const foodLabels = foods.filter(food => food.trim() !== '')
      
      if (foodLabels.length === 0) {
        setError('Please add at least one food item')
        return
      }

      // Prepare data
      const data = {
        meal,
        food_labels: foodLabels,
        calories: calories ? parseFloat(calories) : undefined,
        macros: (protein || carbs || fat) ? {
          protein: parseFloat(protein) || 0,
          carbs: parseFloat(carbs) || 0,
          fat: parseFloat(fat) || 0,
        } : undefined,
        note: note || undefined,
        journal_mode: journalMode,
      }

      // Validate with schema
      const validatedData = ManualFoodEntrySchema.parse(data)

      // Call save callback
      if (onSave) {
        await onSave(validatedData)
      }

      toast.success('Food entry saved successfully!')
      
      // Reset form
      setFoods([''])
      setCalories('')
      setProtein('')
      setCarbs('')
      setFat('')
      setNote('')
      setJournalMode(false)

    } catch (err) {
      console.error('Manual entry error:', err)
      if (err instanceof Error && err.message.includes('ZodError')) {
        setError('Please check your input values')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save entry')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate total macros for reference
  const totalMacros = {
    protein: parseFloat(protein) || 0,
    carbs: parseFloat(carbs) || 0,
    fat: parseFloat(fat) || 0,
  }
  const calculatedCalories = (totalMacros.protein * 4) + (totalMacros.carbs * 4) + (totalMacros.fat * 9)

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle>Manual Food Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Food Items */}
          <div className="space-y-3">
            <Label>Food Items</Label>
            {foods.map((food, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  placeholder="e.g., Greek yogurt with berries"
                  value={food}
                  onChange={(e) => updateFood(index, e.target.value)}
                  className="flex-1"
                />
                {foods.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFoodInput(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFoodInput}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Food
            </Button>
          </div>

          <Separator />

          {/* Nutrition Information (Optional) */}
          <div className="space-y-4">
            <Label>Nutrition Information (Optional)</Label>
            
            {/* Calories */}
            <div className="space-y-2">
              <Label htmlFor="calories" className="text-sm">Total Calories</Label>
              <Input
                id="calories"
                type="number"
                min="0"
                step="1"
                placeholder="e.g., 350"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
            </div>

            {/* Macros */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="protein" className="text-sm">Protein (g)</Label>
                <Input
                  id="protein"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carbs" className="text-sm">Carbs (g)</Label>
                <Input
                  id="carbs"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fat" className="text-sm">Fat (g)</Label>
                <Input
                  id="fat"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
              </div>
            </div>

            {/* Calculated calories hint */}
            {(protein || carbs || fat) && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                <strong>Calculated from macros:</strong> ~{Math.round(calculatedCalories)} calories
                {calories && Math.abs(calculatedCalories - parseFloat(calories)) > 50 && (
                  <span className="text-orange-600 ml-2">
                    (differs from entered calories)
                  </span>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="note">Notes (Optional)</Label>
            <Input
              id="note"
              placeholder="e.g., Homemade, eaten at restaurant, portion size..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Journal Mode */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="space-y-1">
              <Label>Private Mode</Label>
              <p className="text-xs text-muted-foreground">
                Keep this entry private (won&apos;t be included in insights)
              </p>
            </div>
            <Button
              type="button"
              variant={journalMode ? "default" : "outline"}
              size="sm"
              onClick={() => setJournalMode(!journalMode)}
            >
              {journalMode ? 'Private' : 'Public'}
            </Button>
          </div>

          {/* Summary */}
          {foods.some(f => f.trim()) && (
            <div className="p-3 bg-muted rounded-md space-y-2">
              <h4 className="text-sm font-medium">Entry Summary:</h4>
              <div className="space-y-1">
                <Badge variant="outline" className="capitalize">{meal}</Badge>
                <div className="text-sm">
                  <strong>Foods:</strong> {foods.filter(f => f.trim()).join(', ')}
                </div>
                {calories && (
                  <div className="text-sm">
                    <strong>Calories:</strong> {calories}
                  </div>
                )}
                {(protein || carbs || fat) && (
                  <div className="text-sm">
                    <strong>Macros:</strong> P: {protein || 0}g, C: {carbs || 0}g, F: {fat || 0}g
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={isLoading || !foods.some(f => f.trim())}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Food Entry'}
          </Button>

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}