'use client'

import type { MealType } from '@/lib/types/database'
import { useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PhotoUploader, ManualFoodEntry, VoiceRecorder, TextAnalyzer } from '@/components/upload'
import { MealSelector } from '@/components/entry/meal-selector'
import { useAuth } from '@/lib/auth-context'

type PhotoAnalysisResult = {
  foods: Array<{ label: string; confidence: number; quantity?: string }>
  nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
  photoUrl: string
}

type VoiceAnalysisResult = {
  meal: string
  foods: Array<{ label: string; confidence: number; quantity?: string }>
  nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
  transcript: string
  voiceUrl: string
}

type TextAnalysisResult = {
  meal: string
  foods: Array<{ label: string; confidence: number; quantity?: string }>
  nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
}

type ManualEntryResult = {
  meal: string
  food_labels: string[]
  calories?: number
  macros?: { protein: number; carbs: number; fat: number }
  note?: string
  journal_mode: boolean
}

interface LogFoodCardProps {
  title: string
  description: string
  selectedMeal: MealType | null
  date: string
  onMealSelect: (meal: MealType) => void
  onPhotoAnalysis: (result: PhotoAnalysisResult) => void | Promise<void>
  onVoiceAnalysis: (result: VoiceAnalysisResult) => void | Promise<void>
  onTextAnalysis: (result: TextAnalysisResult) => void | Promise<void>
  onManualSave: (result: ManualEntryResult) => void | Promise<void>
}

export function LogFoodCard({
  title,
  description,
  selectedMeal,
  date,
  onMealSelect,
  onPhotoAnalysis,
  onVoiceAnalysis,
  onTextAnalysis,
  onManualSave,
}: LogFoodCardProps) {
  const { user } = useAuth()
  const [guideVisible, setGuideVisible] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const guideItems = useMemo(
    () => [
      { label: 'Photo', text: 'Snap a meal for AI food detection.' },
      { label: 'Voice', text: 'Speak naturally and let AI parse foods/macros.' },
      { label: 'Text', text: 'Paste or type your meal description.' },
      { label: 'Manual', text: 'Enter exact values when precision matters.' },
    ],
    []
  )

  useEffect(() => {
    if (!user?.id) return
    const storageKey = `pulse:log-guide:dismissed:${user.id}`
    const dismissed = window.localStorage.getItem(storageKey) === '1'
    setGuideVisible(!dismissed)
  }, [user?.id])

  const dismissGuide = () => {
    if (user?.id) {
      window.localStorage.setItem(`pulse:log-guide:dismissed:${user.id}`, '1')
    }
    setGuideVisible(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h4 className="font-medium">Select Meal Type</h4>
          <MealSelector selectedMeal={selectedMeal} onMealSelect={onMealSelect} />
        </div>

        {selectedMeal && (
          <div className="space-y-4">
            <h4 className="font-medium">How would you like to log this meal?</h4>
            {guideVisible ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium flex items-center gap-1">
                      <Info className="h-4 w-4" />
                      {guideItems[guideStep].label}
                    </span>
                    <span className="text-muted-foreground">{guideItems[guideStep].text}</span>
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={dismissGuide}>
                    Dismiss
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={guideStep === 0}
                    onClick={() => setGuideStep((prev) => Math.max(0, prev - 1))}
                  >
                    Back
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {guideStep + 1} / {guideItems.length}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setGuideStep((prev) => {
                        if (prev >= guideItems.length - 1) {
                          dismissGuide()
                          return prev
                        }
                        return prev + 1
                      })
                    }
                  >
                    {guideStep >= guideItems.length - 1 ? 'Done' : 'Next'}
                  </Button>
                </div>
              </div>
            ) : null}

            <Tabs defaultValue="photo" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                <TabsTrigger value="photo">Photo</TabsTrigger>
                <TabsTrigger value="voice">Voice</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="manual">Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="photo" className="space-y-4">
                <PhotoUploader meal={selectedMeal} date={date} onAnalysisComplete={onPhotoAnalysis} />
              </TabsContent>

              <TabsContent value="voice" className="space-y-4">
                <VoiceRecorder date={date} selectedMeal={selectedMeal} onAnalysisComplete={onVoiceAnalysis} />
              </TabsContent>

              <TabsContent value="text" className="space-y-4">
                <TextAnalyzer selectedMeal={selectedMeal} date={date} onAnalysisComplete={onTextAnalysis} />
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                <ManualFoodEntry meal={selectedMeal} onSave={onManualSave} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
