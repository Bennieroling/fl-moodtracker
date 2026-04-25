'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { FoodEntry } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mealTypes } from '@/components/entry/meal-selector'

export interface EntryEditForm {
  meal: string
  food_labels: string[]
  calories: number
  protein: number
  carbs: number
  fat: number
  note: string
}

interface EntryEditorDialogProps {
  entry: FoodEntry | null
  form: EntryEditForm
  setForm: Dispatch<SetStateAction<EntryEditForm>>
  onSave: () => void | Promise<void>
  onClose: () => void
}

export function EntryEditorDialog({ entry, form, setForm, onSave, onClose }: EntryEditorDialogProps) {
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Food Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-meal">Meal Type</Label>
            <Select value={form.meal} onValueChange={(value) => setForm((prev) => ({ ...prev, meal: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mealTypes.map((meal) => (
                  <SelectItem key={meal.id} value={meal.id}>
                    {meal.icon} {meal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-foods">Food Items</Label>
            <Input
              id="edit-foods"
              value={form.food_labels.join(', ')}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  food_labels: e.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Separate items with commas"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-calories">Calories</Label>
              <Input
                id="edit-calories"
                type="number"
                value={form.calories || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, calories: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-protein">Protein (g)</Label>
              <Input
                id="edit-protein"
                type="number"
                value={form.protein || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, protein: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-carbs">Carbs (g)</Label>
              <Input
                id="edit-carbs"
                type="number"
                value={form.carbs || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, carbs: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-fat">Fat (g)</Label>
              <Input
                id="edit-fat"
                type="number"
                value={form.fat || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, fat: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-note">Note (optional)</Label>
            <Input
              id="edit-note"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Add any additional notes"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={onSave} className="flex-1">
              Save Changes
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
