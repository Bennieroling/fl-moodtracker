'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { format, subDays } from 'date-fns'

export default function SeedDataPage() {
  const { user } = useAuth()
  const [seeding, setSeeding] = useState(false)

  const seedTestData = async () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }

    setSeeding(true)
    try {
      const supabase = createClient()
      
      // Create mood entries for the past week
      const moodEntries = []
      for (let i = 0; i < 7; i++) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
        moodEntries.push({
          user_id: user.id,
          date,
          mood_score: Math.floor(Math.random() * 5) + 1,
          note: i === 0 ? 'Feeling great today!' : null
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: moodError } = await (supabase as any)
        .from('mood_entries')
        .upsert(moodEntries, { onConflict: 'user_id,date' })

      if (moodError) {
        console.error('Error seeding mood data:', moodError)
        throw new Error('Failed to seed mood data')
      }

      // Create food entries
      const foods = [
        { name: 'Oatmeal with Berries', calories: 300, protein: 8, carbs: 55, fat: 6 },
        { name: 'Grilled Chicken Salad', calories: 450, protein: 35, carbs: 15, fat: 25 },
        { name: 'Salmon with Rice', calories: 520, protein: 30, carbs: 45, fat: 18 },
        { name: 'Greek Yogurt', calories: 150, protein: 15, carbs: 12, fat: 8 },
        { name: 'Apple with Almond Butter', calories: 200, protein: 6, carbs: 25, fat: 12 }
      ]

      const meals = ['breakfast', 'lunch', 'dinner', 'snack']
      const foodEntries = []

      for (let i = 0; i < 7; i++) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
        
        // Add 2-4 meals per day
        const mealsCount = Math.floor(Math.random() * 3) + 2
        for (let j = 0; j < mealsCount; j++) {
          const food = foods[Math.floor(Math.random() * foods.length)]
          foodEntries.push({
            user_id: user.id,
            date,
            meal: meals[j % meals.length],
            food_labels: [food.name],
            calories: food.calories,
            macros: {
              protein: food.protein,
              carbs: food.carbs,
              fat: food.fat
            },
            journal_mode: false
          })
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: foodError } = await (supabase as any)
        .from('food_entries')
        .insert(foodEntries)

      if (foodError) {
        console.error('Error seeding food data:', foodError)
        throw new Error('Failed to seed food data')
      }

      toast.success('Test data seeded successfully! Check your dashboard and insights.')
    } catch (error) {
      console.error('Error seeding data:', error)
      toast.error('Failed to seed test data')
    } finally {
      setSeeding(false)
    }
  }

  const clearData = async () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }

    setSeeding(true)
    try {
      const supabase = createClient()
      
      await supabase.from('mood_entries').delete().eq('user_id', user.id)
      await supabase.from('food_entries').delete().eq('user_id', user.id)
      await supabase.from('insights').delete().eq('user_id', user.id)
      
      toast.success('All data cleared successfully!')
    } catch (error) {
      console.error('Error clearing data:', error)
      toast.error('Failed to clear data')
    } finally {
      setSeeding(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Please sign in to seed test data
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Seed Test Data</h1>
        <p className="text-muted-foreground">
          Add sample data to test the application features
        </p>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Add Test Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create sample mood entries and food logs for the past 7 days to test the insights and dashboard features.
            </p>
            <Button 
              onClick={seedTestData} 
              disabled={seeding}
              className="w-full"
            >
              {seeding ? 'Seeding...' : 'Seed Test Data'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clear Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Remove all your mood entries, food logs, and insights.
            </p>
            <Button 
              onClick={clearData} 
              disabled={seeding}
              variant="destructive"
              className="w-full"
            >
              {seeding ? 'Clearing...' : 'Clear All Data'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}