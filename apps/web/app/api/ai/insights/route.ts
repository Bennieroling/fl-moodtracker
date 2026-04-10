import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  AIInsightsRequestSchema,
  AIInsightsResponseSchema,
  WeeklyMetricsSchema
} from '@/lib/validations'
import { Database } from '@/lib/types/database'
import { DEFAULT_DAILY_TARGETS } from '@/lib/types/database'

type MoodEntry = Database['public']['Tables']['mood_entries']['Row']
type FoodEntry = Database['public']['Tables']['food_entries']['Row']

// ── Additional context types ────────────────────────────────────────
interface HealthContext {
  totalSteps: number | null
  exerciseMinutes: number | null
  activeCalories: number | null
  restingHR: number | null
  hrv: number | null
  vo2max: number | null
}

interface BodyContext {
  weight: number | null
  bodyFat: number | null
}

interface StateOfMindContext {
  avgValence: number | null
  topLabels: string[]
}

interface DailyTargets {
  steps: number
  exercise_minutes: number
  calorie_intake: number
  active_energy: number
}

// ── Prompt builders ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a concise wellness analyst. Analyze the user's health data and produce a JSON response:
{
  "summary_md": "3-4 sentence summary referencing specific numbers and trends",
  "tips_md": "3-5 bullet points — each must reference a specific metric or observation from the data"
}
Rules:
- Every sentence must cite a number from the data (e.g. "your HRV averaged 42ms")
- Compare to targets when provided
- Flag anomalies (unusual HR, large calorie swings, mood drops)
- Never give generic advice like "keep tracking" or "stay consistent"
- If data is missing for a category, skip it — don't speculate`

function buildUserPrompt(
  periodStart: string,
  periodEnd: string,
  metrics: Record<string, unknown>,
  health: HealthContext,
  body: BodyContext,
  som: StateOfMindContext,
  targets: DailyTargets,
) {
  const sections: string[] = []

  sections.push(`Analyze this period (${periodStart} to ${periodEnd}):`)

  // Nutrition
  sections.push(`
NUTRITION
- Total calories: ${metrics.kcalTotal} (target: ${targets.calorie_intake}/day)
- Meals logged: ${metrics.foodEntries}
- Top foods: ${(metrics.topFoods as string[]).join(', ') || 'none'}`)

  // Mood
  sections.push(`
MOOD
- Average mood: ${metrics.avgMood}/5 from ${metrics.moodEntries} entries`)

  // Activity
  sections.push(`
ACTIVITY
- Steps: ${health.totalSteps ?? 'no data'} (target: ${targets.steps}/day)
- Exercise: ${health.exerciseMinutes ?? 'no data'} min (target: ${targets.exercise_minutes}/day)
- Active calories: ${health.activeCalories ?? 'no data'} kcal (target: ${targets.active_energy}/day)
- Avg resting HR: ${health.restingHR ?? 'no data'} bpm
- Avg HRV: ${health.hrv ?? 'no data'} ms
- Avg VO2 max: ${health.vo2max ?? 'no data'}`)

  // Body
  if (body.weight != null || body.bodyFat != null) {
    sections.push(`
BODY (latest)
- Weight: ${body.weight ?? 'no data'} kg
- Body fat: ${body.bodyFat ?? 'no data'}%`)
  }

  // State of Mind
  if (som.avgValence != null || som.topLabels.length > 0) {
    sections.push(`
STATE OF MIND
- Valence trend: ${som.avgValence ?? 'no data'}
- Top emotions: ${som.topLabels.length > 0 ? som.topLabels.join(', ') : 'none'}`)
  }

  sections.push(`
Provide specific, data-driven insights. No filler.`)

  return sections.join('\n')
}

// ── AI provider calls ───────────────────────────────────────────────
async function generateWithOpenAI(userMessage: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.5,
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No content returned from OpenAI')
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Failed to parse OpenAI response as JSON')
  }
}

async function generateWithGemini(userMessage: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${SYSTEM_PROMPT}\n\n${userMessage}`
        }]
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 800
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    throw new Error('No content returned from Gemini')
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response')
    }
    return JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Failed to parse Gemini response as JSON')
  }
}

// ── Route handler ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedRequest = AIInsightsRequestSchema.parse(body)

    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.id !== validatedRequest.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const periodStart = validatedRequest.periodStart
    const periodEnd = validatedRequest.periodEnd

    // ── Core data (mood + food + metrics) ───────────────────────────
    const { data: moodEntries, error: moodError } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', periodStart)
      .lte('date', periodEnd)

    const { data: foodEntries, error: foodError } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('journal_mode', false)
      .gte('date', periodStart)
      .lte('date', periodEnd)

    if (moodError || foodError) {
      console.error('Database query error:', { moodError, foodError })
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    const { data: metricsResult, error: metricsError } = await (supabase as any)
      .rpc('calculate_weekly_metrics', {
        user_uuid: user.id,
        start_date: periodStart,
        end_date: periodEnd
      })

    if (metricsError) {
      console.error('Metrics calculation error:', metricsError)
      return NextResponse.json({ error: 'Failed to calculate metrics' }, { status: 500 })
    }

    const metrics = WeeklyMetricsSchema.parse(metricsResult)

    // ── Additional context (each query independently guarded) ───────

    // 1a. Health metrics
    let healthContext: HealthContext = {
      totalSteps: null, exerciseMinutes: null, activeCalories: null,
      restingHR: null, hrv: null, vo2max: null,
    }
    try {
      const { data: healthRows } = await (supabase as any)
        .from('health_metrics_daily')
        .select('steps, exercise_time_minutes, active_energy_kcal, resting_heart_rate, hrv, vo2max')
        .eq('user_id', user.id)
        .gte('date', periodStart)
        .lte('date', periodEnd)

      if (healthRows && healthRows.length > 0) {
        const sum = (arr: any[], key: string) => {
          const vals = arr.map(r => r[key]).filter((v: any) => v != null)
          return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) : null
        }
        const avg = (arr: any[], key: string) => {
          const vals = arr.map(r => r[key]).filter((v: any) => v != null)
          return vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null
        }
        healthContext = {
          totalSteps: sum(healthRows, 'steps'),
          exerciseMinutes: sum(healthRows, 'exercise_time_minutes') != null ? Math.round(sum(healthRows, 'exercise_time_minutes')!) : null,
          activeCalories: sum(healthRows, 'active_energy_kcal') != null ? Math.round(sum(healthRows, 'active_energy_kcal')!) : null,
          restingHR: avg(healthRows, 'resting_heart_rate'),
          hrv: avg(healthRows, 'hrv'),
          vo2max: avg(healthRows, 'vo2max'),
        }
      }
    } catch (e) {
      console.warn('Failed to fetch health metrics:', e)
    }

    // 1b. Body metrics (latest row)
    let bodyContext: BodyContext = { weight: null, bodyFat: null }
    try {
      const { data: bodyRow } = await (supabase as any)
        .from('health_metrics_body')
        .select('weight_kg, body_fat_pct')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (bodyRow) {
        bodyContext = {
          weight: bodyRow.weight_kg != null ? Math.round(bodyRow.weight_kg * 10) / 10 : null,
          bodyFat: bodyRow.body_fat_pct != null ? Math.round(bodyRow.body_fat_pct * 10) / 10 : null,
        }
      }
    } catch (e) {
      console.warn('Failed to fetch body metrics:', e)
    }

    // 1c. State of mind
    let somContext: StateOfMindContext = { avgValence: null, topLabels: [] }
    try {
      const { data: somRows } = await (supabase as any)
        .from('state_of_mind')
        .select('valence, labels')
        .eq('user_id', user.id)
        .gte('recorded_at', `${periodStart}T00:00:00`)
        .lte('recorded_at', `${periodEnd}T23:59:59`)

      if (somRows && somRows.length > 0) {
        const valences = somRows.map((r: any) => r.valence).filter((v: any) => v != null)
        const avgValence = valences.length > 0
          ? Math.round((valences.reduce((a: number, b: number) => a + b, 0) / valences.length) * 100) / 100
          : null

        const labelCounts: Record<string, number> = {}
        for (const row of somRows) {
          if (row.labels && Array.isArray(row.labels)) {
            for (const label of row.labels) {
              labelCounts[label] = (labelCounts[label] || 0) + 1
            }
          }
        }
        const topLabels = Object.entries(labelCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([label]) => label)

        somContext = { avgValence, topLabels }
      }
    } catch (e) {
      console.warn('Failed to fetch state of mind:', e)
    }

    // 1d. User targets
    let targets: DailyTargets = { ...DEFAULT_DAILY_TARGETS }
    try {
      const { data: prefsRow } = await (supabase as any)
        .from('user_preferences')
        .select('daily_targets')
        .eq('user_id', user.id)
        .maybeSingle()

      if (prefsRow?.daily_targets) {
        targets = { ...DEFAULT_DAILY_TARGETS, ...prefsRow.daily_targets }
      }
    } catch (e) {
      console.warn('Failed to fetch user targets:', e)
    }

    // ── Build prompt and call AI ────────────────────────────────────
    const userMessage = buildUserPrompt(
      periodStart, periodEnd, metrics, healthContext, bodyContext, somContext, targets,
    )

    let aiResponse
    let provider: 'openai' | 'gemini' = 'openai'

    try {
      if (process.env.OPENAI_API_KEY) {
        aiResponse = await generateWithOpenAI(userMessage)
        provider = 'openai'
      } else {
        throw new Error('OpenAI API key not available')
      }
    } catch (openaiError) {
      console.warn('OpenAI failed, trying Gemini:', openaiError)

      try {
        if (process.env.GEMINI_API_KEY) {
          aiResponse = await generateWithGemini(userMessage)
          provider = 'gemini'
        } else {
          throw new Error('Gemini API key not available')
        }
      } catch (geminiError) {
        console.error('Both AI providers failed:', { openaiError, geminiError })
        return NextResponse.json({ error: 'AI insights generation failed' }, { status: 500 })
      }
    }

    console.log('Raw AI response:', JSON.stringify(aiResponse, null, 2))

    const cleanedResponse = {
      summary_md: typeof aiResponse.summary_md === 'string'
        ? aiResponse.summary_md.substring(0, 1000).trim()
        : 'AI generated insights based on your weekly data.',
      tips_md: typeof aiResponse.tips_md === 'string'
        ? aiResponse.tips_md.substring(0, 500).trim()
        : '• Continue tracking your daily habits\n• Focus on consistent logging\n• Review your patterns weekly',
      metrics,
      provider,
      raw: aiResponse
    }

    console.log('Cleaned response:', JSON.stringify(cleanedResponse, null, 2))

    const response = AIInsightsResponseSchema.parse(cleanedResponse)

    const { error: insertError } = await (supabase as any)
      .from('insights')
      .insert({
        user_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        summary_md: response.summary_md,
        tips_md: response.tips_md,
        metrics: response.metrics
      })

    if (insertError) {
      console.warn('Failed to store insights in database:', insertError)
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('AI Insights API error:', error)

    if (error instanceof Error && error.message.includes('ZodError')) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
