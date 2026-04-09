'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Sparkles, TrendingUp, Calendar, Brain, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SummarySkeleton } from '@/components/skeletons/summary-skeleton'
import { InsightsChartsSkeleton } from '@/components/skeletons/insights-charts-skeleton'
import { useAuth } from '@/lib/auth-context'
import { useFilters } from '@/lib/filter-context'
import { defaultInsightsData, useInsightsData } from '@/hooks/useInsightsData'
import { PageHeader } from '@/components/page-header'
import { StandardCardHeader } from '@/components/ui/standard-card-header'

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
  const topFoodChartData = weeklyMetrics.topFoods.slice(0, 5).map((food, index) => ({
    name: food,
    value: 5 - index,
  }))

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

  if (error && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <StandardCardHeader title="Error Loading Insights" description="We could not fetch your weekly analytics right now." />
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
      <PageHeader
        title="Insights"
        description={`Weekly analytics for ${format(startDateObj, 'MMM d')} - ${format(endDateObj, 'MMM d')}`}
        action={(
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
        )}
      />

      {/* Weekly Summary Cards */}
      {loading ? (
        <SummarySkeleton cards={4} className="grid-cols-1 md:grid-cols-4" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-background dark:from-blue-400/10">
            <StandardCardHeader title="Average Mood" description="Weekly mood average" action={<TrendingUp className="h-4 w-4 text-muted-foreground" />} className="pb-2" />
            <CardContent>
              <div className="text-4xl font-bold">{weeklyMetrics.avgMood.toFixed(1)}<span className="text-base text-muted-foreground">/5</span></div>
              <p className="text-xs text-muted-foreground">From {weeklyMetrics.moodEntries} logged moods</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/10 to-background dark:from-emerald-400/10">
            <StandardCardHeader title="Total Calories" description="Weekly intake total" action={<Calendar className="h-4 w-4 text-muted-foreground" />} className="pb-2" />
            <CardContent>
              <div className="text-4xl font-bold">{weeklyMetrics.kcalTotal.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg {Math.round(weeklyMetrics.kcalTotal / 7)} kcal per day
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-background dark:from-orange-400/10">
            <StandardCardHeader title="Meals Logged" description="Meal count this week" action={<BarChart3 className="h-4 w-4 text-muted-foreground" />} className="pb-2" />
            <CardContent>
              <div className="text-4xl font-bold">{weeklyMetrics.foodEntries}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((weeklyMetrics.foodEntries / 7) * 10) / 10} meals/day
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500/10 to-background dark:from-violet-400/10">
            <StandardCardHeader title="Top Foods" description="Most frequent items logged" action={<Brain className="h-4 w-4 text-muted-foreground" />} className="pb-2" />
            <CardContent>
              <div className="text-4xl font-bold">{weeklyMetrics.topFoods.length}</div>
              <p className="text-xs text-muted-foreground">
                Distinct frequent foods this week
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section - Visual Representation */}
      {loading ? (
        <InsightsChartsSkeleton />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <StandardCardHeader title={<span className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Weekly Mood & Calories Trend</span>} description="Daily mood and calories across this period." />
            <CardContent className="h-72">
              {weeklyData.length > 0 && weeklyData.some((day) => day.mood > 0 || day.calories > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis yAxisId="mood" domain={[0, 5]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis yAxisId="calories" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip />
                    <Line yAxisId="mood" type="monotone" dataKey="mood" name="Mood" stroke="hsl(var(--chart-1))" strokeWidth={3} dot={{ r: 4 }} />
                    <Line yAxisId="calories" type="monotone" dataKey="calories" name="Calories" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-16 space-y-3">
                  <p>No data available for this week</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard">Log a meal</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <StandardCardHeader title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Macro Distribution</span>} description="Protein, carbs, and fat share for the selected window." />
            <CardContent className="h-72">
              {macroData.some((macro) => macro.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={macroData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
                      {macroData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={`hsl(var(--chart-${index + 1}))`} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}%`, 'Share']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground py-16 space-y-3">
                  <p>No nutrition data available</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard">Start logging</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Foods */}
      {loading ? (
        <Card>
          <StandardCardHeader title="Most Frequent Foods" description="Top foods ranked by repeat frequency." />
          <CardContent>
            <div className="h-64">
              <SummarySkeleton cards={1} className="grid-cols-1" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <StandardCardHeader title={<span className="flex items-center gap-2"><Brain className="h-5 w-5" />Most Frequent Foods</span>} description="Foods you logged most often in this date range." />
          <CardContent className="h-72">
            {topFoodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFoodChartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                  <Tooltip formatter={(value) => [`Rank score ${value}`, 'Frequency']} />
                  <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground py-16 space-y-3">
                <p>No food data available for this week</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard">Log your first meal</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI-Generated Insights */}
      {(aiSummary || aiTips) && (
        <div className="space-y-4">
          {aiSummary && (
            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-background dark:from-primary/20">
              <StandardCardHeader
                title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5" />AI Summary</span>}
                description="Machine-generated interpretation of your recent patterns."
                action={
                  lastGenerated ? (
                    <p className="text-xs text-muted-foreground">
                      Generated {format(lastGenerated, 'MMM d, h:mm a')}
                    </p>
                  ) : null
                }
              />
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
            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-background dark:from-primary/20">
              <StandardCardHeader
                title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Personalized Tips</span>}
                description="Actionable suggestions generated from your logged data."
              />
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
