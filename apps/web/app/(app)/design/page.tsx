'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'

import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { StandardCardHeader } from '@/components/ui/standard-card-header'
import { MacroDisplay } from '@/components/macro-display'
import { DateStepper, MealSelector, MoodPicker, moodEmojis } from '@/components/entry'
import type { MealType } from '@/lib/types/database'

export default function DesignSystemPage() {
  const [selectedMood, setSelectedMood] = useState<number | null>(4)
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>('lunch')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const selectedMoodLabel = useMemo(() => {
    if (!selectedMood) return 'Not selected'
    return moodEmojis.find((entry) => entry.score === selectedMood)?.label ?? 'Not selected'
  }, [selectedMood])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design System"
        description="Reference implementations for shared Sofi UI components."
        action={<DateStepper date={date} onDateChange={setDate} />}
      />

      <Card>
        <StandardCardHeader
          title="Typography Scale"
          description="Canonical headline, metric, and caption utilities used across app pages."
        />
        <CardContent className="space-y-4">
          <p className="text-display">Daily nutrition overview</p>
          <p className="text-metric">1,845</p>
          <p className="text-caption">Calories consumed today</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <StandardCardHeader title="Mood Picker" description="Interactive mood selection component with optimistic feedback styling." />
          <CardContent className="space-y-3">
            <MoodPicker selectedMood={selectedMood} onMoodSelect={setSelectedMood} />
            <p className="text-sm text-muted-foreground">Selected mood: {selectedMoodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <StandardCardHeader title="Meal Selector" description="Consistent meal type selector used by Dashboard and Historic entry flows." />
          <CardContent className="space-y-3">
            <MealSelector selectedMeal={selectedMeal} onMealSelect={setSelectedMeal} />
            <p className="text-sm text-muted-foreground">Selected meal: {selectedMeal ?? 'None'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <StandardCardHeader title="Macro Display" description="Shared macro summary with dark-mode-safe chart token colors." />
        <CardContent className="space-y-4">
          <MacroDisplay macros={{ protein: 145, carbs: 210, fat: 70 }} showBar />
          <MacroDisplay macros={{ protein: 145, carbs: 210, fat: 70 }} compact />
        </CardContent>
      </Card>
    </div>
  )
}
