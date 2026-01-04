'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Sparkles, TrendingUp, Calendar, Brain, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { defaultInsightsData, useInsightsData } from '@/hooks/useInsightsData'

export default function InsightsPage() {
  const { user } = useAuth()
  const { filters } = useFilters()
  const { startDate, endDate } = filters.insights
  const startDateObj = useMemo(() => parseISO(startDate), [startDate])
  const endDateObj = useMemo(() => parseISO(endDate), [endDate])
  const { data, loading, error, refetch } = useInsightsData()
  const [generatingInsights, setGeneratingInsights] = useState(false)

  const insights = data ?? defaultInsightsData
  const { weeklyMetrics, weeklyData, macroData, aiSummary, aiTips, lastGenerated } = insights

  const generateAIInsights = async () => {
    if (!user) return

    setGeneratingInsights(true)
    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          periodStart: startDate,
          periodEnd: endDate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`)
      }

      await response.json()
      toast.success('AI insights generated successfully!')
      await refetch()
    } catch (err) {
      console.error('Error generating insights:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed to generate AI insights: ${errorMessage}`)
    } finally {
      setGeneratingInsights(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader>
            <CardTitle className="text-center">Error Loading Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">{error.message}</p>
            <Button onClick={() => refetch()} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Insights</h1>
          <p className="text-muted-foreground">
            Weekly analytics for {format(startDateObj, 'MMM d')} - {format(endDateObj, 'MMM d')}
          </p>
        </div>
        <Button onClick={generateAIInsights} disabled={generatingInsights || !user}>
          {generatingInsights ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate AI Insights
            </>
          )}
        </Button>
      </div>

      {/* Weekly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Mood</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyMetrics.avgMood.toFixed(1)}/5</div>
            <p className="text-xs text-muted-foreground">
              +0.3 from last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calories</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyMetrics.kcalTotal.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Avg {Math.round(weeklyMetrics.kcalTotal / 7)} per day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meals Logged</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyMetrics.foodEntries}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round(weeklyMetrics.foodEntries / 7 * 10) / 10} per day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracking Streak</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground">
              Days in a row
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section - Visual Representation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood vs Calories Data */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Weekly Mood & Calories Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length > 0 && weeklyData.some((day) => day.mood > 0 || day.calories > 0) ? (
              <div className="space-y-4">
                {weeklyData.map((day, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium w-12">{day.date}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <div
                            key={star}
                            className={`w-3 h-3 rounded-full ${
                              star <= day.mood ? 'bg-blue-500' : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {day.calories > 0 ? `${day.calories} cal` : 'No data'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No data available for this week</p>
                <p className="text-sm">Start tracking to see trends</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Macro Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Macro Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {macroData.some((macro) => macro.value > 0) ? (
                macroData.map((macro) => (
                  <div key={macro.name}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{macro.name}</span>
                      <span className="text-sm text-muted-foreground">{macro.value}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${macro.value}%`, 
                          backgroundColor: macro.color 
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No nutrition data available</p>
                  <p className="text-sm">Log meals to see macro distribution</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Foods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Most Frequent Foods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {weeklyMetrics.topFoods.slice(0, 5).map((food, index) => (
              <div key={food} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">
                    {index + 1}
                  </span>
                  <span className="font-medium">{food}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(20, (5 - index) * 20)}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-8">
                    Top {index + 1}
                  </span>
                </div>
              </div>
            ))}
            {weeklyMetrics.topFoods.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No food data available for this week
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI-Generated Insights */}
      {(aiSummary || aiTips) && (
        <div className="space-y-4">
          {aiSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Summary
                </CardTitle>
                {lastGenerated && (
                  <p className="text-sm text-muted-foreground">
                    Generated {format(lastGenerated, 'MMM d, h:mm a')}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {aiSummary}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {aiTips && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Personalized Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <div className="text-sm leading-relaxed whitespace-pre-line">
                    {aiTips}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
