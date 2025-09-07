'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, TrendingUp, Calendar, Brain, BarChart3 } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { Database } from '@/lib/types/database'
import { WeeklyMetrics } from '@/lib/validations'

interface DailyData {
  date: string
  mood: number
  calories: number
}

interface MacroData {
  name: string
  value: number
  color: string
}

type MoodEntry = Database['public']['Tables']['mood_entries']['Row']
type FoodEntry = Database['public']['Tables']['food_entries']['Row']
type Insight = Database['public']['Tables']['insights']['Row']

export default function InsightsPage() {
  const { user } = useAuth()
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetrics>({
    avgMood: 0,
    kcalTotal: 0,
    topFoods: [],
    moodEntries: 0,
    foodEntries: 0
  })
  const [weeklyData, setWeeklyData] = useState<DailyData[]>([])
  const [macroData, setMacroData] = useState<MacroData[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiTips, setAiTips] = useState<string | null>(null)
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use useMemo to ensure these values don't change on every render
  const { startDate, endDate } = useMemo(() => {
    const endDate = new Date()
    const startDate = subDays(endDate, 6)
    return { startDate, endDate }
  }, [])

  // Calculate macro distribution from food data
  const calculateMacroDistribution = (foodData: FoodEntry[]) => {
    const totalMacros = foodData.reduce(
      (sum, food) => {
        const macros = food.macros || { protein: 0, carbs: 0, fat: 0 }
        return {
          protein: sum.protein + macros.protein,
          carbs: sum.carbs + macros.carbs,
          fat: sum.fat + macros.fat
        }
      },
      { protein: 0, carbs: 0, fat: 0 }
    )

    const total = totalMacros.protein + totalMacros.carbs + totalMacros.fat
    
    if (total === 0) {
      // Return default distribution when no data
      return [
        { name: 'Protein', value: 0, color: '#3B82F6' },
        { name: 'Carbs', value: 0, color: '#10B981' },
        { name: 'Fat', value: 0, color: '#F59E0B' },
      ]
    }

    return [
      { 
        name: 'Protein', 
        value: Math.round((totalMacros.protein / total) * 100), 
        color: '#3B82F6' 
      },
      { 
        name: 'Carbs', 
        value: Math.round((totalMacros.carbs / total) * 100), 
        color: '#10B981' 
      },
      { 
        name: 'Fat', 
        value: Math.round((totalMacros.fat / total) * 100), 
        color: '#F59E0B' 
      },
    ]
  }

  useEffect(() => {
    const loadWeeklyData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setError(null)
        const supabase = createClient()
        
        // Get date range for the past week
        const startDateStr = format(startDate, 'yyyy-MM-dd')
        const endDateStr = format(endDate, 'yyyy-MM-dd')

        // Load weekly metrics from database function
        // Workaround for typing issue with RPC function
        const { data: metricsData, error: metricsError } = await (supabase as any)
          .rpc('calculate_weekly_metrics', {
            user_uuid: user.id,
            start_date: startDateStr,
            end_date: endDateStr
          })

        if (metricsError) {
          console.error('Error loading metrics:', metricsError)
          setError(`Failed to load weekly metrics: ${metricsError.message}`)
          toast.error('Failed to load weekly metrics')
        } else if (metricsData) {
          setWeeklyMetrics(metricsData as WeeklyMetrics)
        }

        // Load daily data for charts
        const { data: moodData, error: moodError } = await supabase
          .from('mood_entries')
          .select('date, mood_score')
          .eq('user_id', user.id)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date')

        const { data: foodData, error: foodError } = await supabase
          .from('food_entries')
          .select('date, calories, macros')
          .eq('user_id', user.id)
          .gte('date', startDateStr)
          .lte('date', endDateStr)

        if (moodError || foodError) {
          const errorMessage = `Failed to load daily data: ${moodError?.message || foodError?.message}`
          console.error('Error loading daily data:', { moodError, foodError })
          setError(errorMessage)
          toast.error('Failed to load daily data')
        } else {
          // Combine mood and food data by date
          const combinedData: DailyData[] = []
          
          for (let i = 0; i < 7; i++) {
            const currentDate = subDays(endDate, 6 - i)
            const dateStr = format(currentDate, 'yyyy-MM-dd')
            const shortDateStr = format(currentDate, 'M/d')
            
            const moodEntry = (moodData as MoodEntry[] | null)?.find((m) => m.date === dateStr)
            const dayCalories = (foodData as FoodEntry[] | null)?.filter((f) => f.date === dateStr)
              .reduce((sum: number, f) => sum + (f.calories || 0), 0) || 0
              
            combinedData.push({
              date: shortDateStr,
              mood: moodEntry?.mood_score || 0,
              calories: dayCalories
            })
          }
          
          setWeeklyData(combinedData)
          
          // Calculate and set macro distribution
          const calculatedMacros = calculateMacroDistribution((foodData as FoodEntry[]) || [])
          setMacroData(calculatedMacros)
        }

        // Check for existing insights
        const { data: existingInsights, error: insightsError } = await supabase
          .from('insights')
          .select('*')
          .eq('user_id', user.id)
          .eq('period_start', startDateStr)
          .eq('period_end', endDateStr)
          .single()

        if (insightsError && insightsError.code !== 'PGRST116') {
          // PGRST116 is "no rows found" which is expected
          console.error('Error loading existing insights:', insightsError)
          setError(`Failed to load existing insights: ${insightsError.message}`)
        } else if (existingInsights) {
          setAiSummary((existingInsights as Insight).summary_md || null)
          setAiTips((existingInsights as Insight).tips_md || null)
          setLastGenerated((existingInsights as Insight).created_at ? new Date((existingInsights as Insight).created_at) : null)
        }

      } catch (error) {
        console.error('Error loading insights data:', error)
        setError(`Failed to load insights: ${error instanceof Error ? error.message : 'Unknown error'}`)
        toast.error('Failed to load insights')
      } finally {
        setLoading(false)
      }
    }

    loadWeeklyData()
  }, [user, startDate, endDate])

  const generateAIInsights = async () => {
    if (!user) return
    
    setGeneratingInsights(true)
    setError(null)
    try {
      const startDateStr = format(startDate, 'yyyy-MM-dd')
      const endDateStr = format(endDate, 'yyyy-MM-dd')

      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          periodStart: startDateStr,
          periodEnd: endDateStr,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`)
      }

      const data = await response.json()
      
      setAiSummary(data.summary_md)
      setAiTips(data.tips_md)
      setLastGenerated(new Date())
      
      toast.success('AI insights generated successfully!')
    } catch (error) {
      console.error('Error generating insights:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Failed to generate AI insights: ${errorMessage}`)
      toast.error('Failed to generate AI insights. Please try again.')
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
            <p className="text-center text-muted-foreground">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full"
            >
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
            Weekly analytics for {format(startDate, 'MMM d')} - {format(endDate, 'MMM d')}
          </p>
        </div>
        <Button onClick={generateAIInsights} disabled={generatingInsights}>
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
            {weeklyData.length > 0 && weeklyData.some(day => day.mood > 0 || day.calories > 0) ? (
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
              {macroData.some(macro => macro.value > 0) ? (
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