'use client'

import type { MealType } from '@/lib/types/database'
import { Button } from '@/components/ui/button'

export const mealTypes: Array<{ id: MealType; label: string; icon: string }> = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '☀️' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
]

interface MealSelectorProps {
  selectedMeal: MealType | null
  onMealSelect: (meal: MealType) => void
}

export function MealSelector({ selectedMeal, onMealSelect }: MealSelectorProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {mealTypes.map((meal) => (
        <Button
          key={meal.id}
          variant={selectedMeal === meal.id ? 'default' : 'outline'}
          onClick={() => onMealSelect(meal.id)}
          className="flex flex-col items-center p-4 h-auto transition-transform duration-150 active:scale-95"
        >
          <span className="text-lg mb-1">{meal.icon}</span>
          <span className="text-xs">{meal.label}</span>
        </Button>
      ))}
    </div>
  )
}
