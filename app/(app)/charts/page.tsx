'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Sparkles, TrendingUp, Calendar, Brain, BarChart3, Heart } from 'lucide-react'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SummarySkeleton } from '@/components/skeletons/summary-skeleton'
import { InsightsChartsSkeleton } from '@/components/skeletons/insights-charts-skeleton'
import { useAuth } from '@/lib/auth-context'
import { defaultInsightsData, useInsightsData } from '@/hooks/useInsightsData'
import { CategoryHeader, HighlightCard, MotionFade, RangeTabs } from '@/components/health'
import { RangeControls } from '@/components/range-controls'
import { StandardCardHeader } from '@/components/ui/standard-card-header'

export default function InsightsPage() {
  const { user } = useAuth()
  const { data, loading, error, refetch, range, setRangeMode, setAnchorDate, shiftRange } =
    useInsightsData()
  const { startDate, endDate, dayCount, label: rangeLabel } = range
  const [generatingInsights, setGeneratingInsights] = useState(false)

  const insights = data ?? defaultInsightsData
  const {
    weeklyMetrics,
    weeklyData,
    aiSummary,
    aiTips,
    aiReport,
    lastGenerated,
    valenceTrend,
    topLabels,
    topAssociations,
  } = insights
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
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`,
        )
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
          <StandardCardHeader
            title="Error Loading Insights"
            description="We could not fetch your weekly analytics right now."
          />
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
    <MotionFade className="space-y-6">
      <CategoryHeader
        category="mood"
        title="Insights"
        primary={{
          value: weeklyMetrics.avgMood ? weeklyMetrics.avgMood.toFixed(1) : '—',
          unit: weeklyMetrics.avgMood ? '/5 mood' : undefined,
        }}
        description={`Analytics for ${rangeLabel}`}
        back={{ href: '/dashboard' }}
        action={
          <Button onClick={generateAIInsights} disabled={generatingInsights || !user} size="sm">
            {generatingInsights ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        }
      />

      <RangeTabs
        mode={range.mode}
        onModeChange={setRangeMode}
        rangeLabel={rangeLabel}
        onShift={shiftRange}
      />

      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Custom range
        </summary>
        <div className="mt-3">
          <RangeControls
            mode={range.mode}
            anchorDate={range.anchorDate}
            rangeLabel={rangeLabel}
            rangeStartDate={startDate}
            rangeEndDate={endDate}
            onModeChange={setRangeMode}
            onAnchorDateChange={setAnchorDate}
            onShift={shiftRange}
            description="Choose the date granularity and anchor date for analytics."
          />
        </div>
      </details>

      {/* Summary Cards */}
      {loading ? (
        <SummarySkeleton cards={4} className="grid-cols-1 md:grid-cols-4" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <HighlightCard
            title="Average Mood"
            category="mood"
            icon={<TrendingUp className="h-4 w-4" />}
            primary={{ value: weeklyMetrics.avgMood.toFixed(1), unit: '/5' }}
            secondary={{ value: `From ${weeklyMetrics.moodEntries} logged moods` }}
          />
          <HighlightCard
            title="Total Calories"
            category="nutrition"
            icon={<Calendar className="h-4 w-4" />}
            primary={{ value: weeklyMetrics.kcalTotal.toLocaleString() }}
            secondary={{
              value: `Avg ${Math.round(weeklyMetrics.kcalTotal / Math.max(dayCount, 1))} kcal/day`,
            }}
          />
          <HighlightCard
            title="Meals Logged"
            category="nutrition"
            icon={<BarChart3 className="h-4 w-4" />}
            primary={{ value: weeklyMetrics.foodEntries }}
            secondary={{
              value: `${(
                Math.round((weeklyMetrics.foodEntries / Math.max(dayCount, 1)) * 10) / 10
              ).toFixed(1)} meals/day`,
            }}
          />
          <HighlightCard
            title="Top Foods"
            category="mood"
            icon={<Brain className="h-4 w-4" />}
            primary={{ value: weeklyMetrics.topFoods.length }}
            secondary={{ value: 'Distinct frequent foods this period' }}
          />
        </div>
      )}

      {/* Charts Section - Visual Representation */}
      {loading ? (
        <InsightsChartsSkeleton />
      ) : (
        <Card>
          <StandardCardHeader
            title={
              <span className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Mood & Calories Trend
              </span>
            }
            description="Daily mood and calories across this period."
          />
          <CardContent className="h-72">
            {weeklyData.length > 0 && weeklyData.some((day) => day.mood > 0 || day.calories > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis
                    yAxisId="mood"
                    domain={[0, 5]}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                  />
                  <YAxis
                    yAxisId="calories"
                    orientation="right"
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                  />
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    yAxisId="mood"
                    type="monotone"
                    dataKey="mood"
                    name="Mood"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="calories"
                    type="monotone"
                    dataKey="calories"
                    name="Calories"
                    stroke="var(--chart-2)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground py-16 space-y-3">
                <p>No data available for this period</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/log">Log a meal</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Foods */}
      {loading ? (
        <Card>
          <StandardCardHeader
            title="Most Frequent Foods"
            description="Top foods ranked by repeat frequency."
          />
          <CardContent>
            <div className="h-64">
              <SummarySkeleton cards={1} className="grid-cols-1" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <StandardCardHeader
            title={
              <span className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Most Frequent Foods
              </span>
            }
            description="Foods you logged most often in this date range."
          />
          <CardContent className="h-72">
            {topFoodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topFoodChartData}
                  layout="vertical"
                  margin={{ left: 12, right: 12 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                  />
                  <Tooltip formatter={(value) => [`Rank score ${value}`, 'Frequency']} />
                  <Bar dataKey="value" fill="var(--chart-3)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground py-16 space-y-3">
                <p>No food data available for this period</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/log">Log your first meal</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* State of Mind Trends */}
      {!loading && (valenceTrend.length > 0 || topLabels.length > 0) && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Heart className="h-5 w-5" />
            State of Mind
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {valenceTrend.length > 0 && (
              <Card>
                <StandardCardHeader
                  title="Valence Over Time"
                  description="Daily average emotional valence (-1 negative to +1 positive)."
                />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={valenceTrend}>
                      <XAxis
                        dataKey="date"
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickFormatter={(v) => v.slice(5)}
                      />
                      <YAxis domain={[-1, 1]} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip
                        formatter={(value) => [Number(value).toFixed(2), 'Valence']}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="avg_valence"
                        stroke="#10B981"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Valence"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {topLabels.length > 0 && (
              <Card>
                <StandardCardHeader
                  title="Most Frequent Emotions"
                  description="Top emotion labels from State of Mind entries."
                />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topLabels} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="label"
                        type="category"
                        width={100}
                        tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                      />
                      <Tooltip formatter={(value) => [`${value} entries`, 'Count']} />
                      <Bar dataKey="count" fill="#34D399" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {topAssociations.length > 0 && (
            <Card>
              <StandardCardHeader
                title="Top Life Associations"
                description="What you associated your moods with most often."
              />
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topAssociations}
                    layout="vertical"
                    margin={{ left: 12, right: 12 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="association"
                      type="category"
                      width={100}
                      tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    />
                    <Tooltip formatter={(value) => [`${value} entries`, 'Count']} />
                    <Bar dataKey="count" fill="#6366F1" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* AI-Generated Insights */}
      {(aiReport || aiSummary || aiTips) && (
        <div className="space-y-4">
          {aiReport && (
            <Card>
              <StandardCardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI Report
                  </span>
                }
                description="Narrative report cross-referencing nutrition, sleep, activity, mood, and recovery."
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
                  <div className="text-sm leading-relaxed whitespace-pre-line">{aiReport}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {aiSummary && (
            <Card>
              <StandardCardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    AI Summary
                  </span>
                }
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
                  <p className="text-sm leading-relaxed whitespace-pre-line">{aiSummary}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {aiTips && (
            <Card>
              <StandardCardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Personalized Tips
                  </span>
                }
                description="Actionable suggestions generated from your logged data."
              />
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <div className="text-sm leading-relaxed whitespace-pre-line">{aiTips}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </MotionFade>
  )
}
