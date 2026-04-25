import { NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-handler'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  AIInsightsRequestSchema,
  AIInsightsResponseSchema,
  WeeklyMetricsSchema
} from '@/lib/validations'
import { DEFAULT_DAILY_TARGETS } from '@/lib/types/database'

// ── Context types ───────────────────────────────────────────────────
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

interface SleepContext {
  nightsTracked: number
  avgTotalHours: number | null
  avgRemHours: number | null
  avgDeepHours: number | null
  avgWristTemperature: number | null
}

interface WorkoutContext {
  count: number
  totalMinutes: number | null
  topTypes: string[]
  avgHeartRate: number | null
  totalActiveEnergy: number | null
}

interface AlertsContext {
  heartRateAlertCount: number
  heartRateAlertTypes: string[]
  ecgClassifications: string[]
}

interface PeriodMetrics {
  avgMood: number
  kcalTotal: number
  topFoods: string[]
  moodEntries: number
  foodEntries: number
}

interface PeriodContext {
  periodStart: string
  periodEnd: string
  metrics: PeriodMetrics
  health: HealthContext
  body: BodyContext
  som: StateOfMindContext
  sleep: SleepContext
  workouts: WorkoutContext
  alerts: AlertsContext
}

interface DailyTargets {
  steps: number
  exercise_minutes: number
  calorie_intake: number
  active_energy: number
}

// ── Helpers ─────────────────────────────────────────────────────────
const sum = (arr: Array<Record<string, unknown>>, key: string) => {
  const vals = arr.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null
}
const avg = (arr: Array<Record<string, unknown>>, key: string) => {
  const vals = arr.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
  return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
}

function computePreviousPeriod(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00Z`)
  const end = new Date(`${periodEnd}T00:00:00Z`)
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const prevEnd = new Date(start.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { prevStart: iso(prevStart), prevEnd: iso(prevEnd), days }
}

// ── Period context gathering ────────────────────────────────────────
async function gatherContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PeriodContext> {
  const sb = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string | boolean) => {
          gte: (c: string, v: string) => { lte: (c: string, v: string) => Promise<{ data: unknown }> }
          eq?: (c: string, v: string | boolean) => { gte: (c: string, v: string) => { lte: (c: string, v: string) => Promise<{ data: unknown }> } }
        }
      }
    }
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  }

  // Core metrics via RPC
  const { data: metricsResult } = await sb.rpc('calculate_weekly_metrics', {
    user_uuid: userId,
    start_date: periodStart,
    end_date: periodEnd,
  })
  const metrics: PeriodMetrics = metricsResult
    ? WeeklyMetricsSchema.parse(metricsResult)
    : { avgMood: 0, kcalTotal: 0, topFoods: [], moodEntries: 0, foodEntries: 0 }

  // Parallel fetch of everything else, each guarded
  const [
    healthRowsRes,
    bodyRowRes,
    somRowsRes,
    sleepRowsRes,
    workoutRowsRes,
    hrAlertRowsRes,
    ecgRowsRes,
  ] = await Promise.all([
    (supabase as any).from('health_metrics_daily')
      .select('steps, exercise_time_minutes, active_energy_kcal, resting_heart_rate, hrv, vo2max')
      .eq('user_id', userId).gte('date', periodStart).lte('date', periodEnd)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('health_metrics_body')
      .select('weight_kg, body_fat_pct')
      .eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle()
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('state_of_mind')
      .select('valence, labels')
      .eq('user_id', userId)
      .gte('recorded_at', `${periodStart}T00:00:00`)
      .lte('recorded_at', `${periodEnd}T23:59:59`)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('sleep_events')
      .select('total_sleep_hours, rem_hours, deep_hours, wrist_temperature')
      .eq('user_id', userId).gte('date', periodStart).lte('date', periodEnd)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('exercise_events')
      .select('workout_type, total_minutes, duration_seconds, avg_heart_rate, active_energy_kcal, started_at, workout_date')
      .eq('user_id', userId)
      .gte('workout_date', periodStart).lte('workout_date', periodEnd)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('heart_rate_notifications')
      .select('notification_type')
      .eq('user_id', userId)
      .gte('recorded_at', `${periodStart}T00:00:00`)
      .lte('recorded_at', `${periodEnd}T23:59:59`)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
    (supabase as any).from('ecg_readings')
      .select('classification')
      .eq('user_id', userId)
      .gte('recorded_at', `${periodStart}T00:00:00`)
      .lte('recorded_at', `${periodEnd}T23:59:59`)
      .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
  ])

  // Health
  let health: HealthContext = {
    totalSteps: null, exerciseMinutes: null, activeCalories: null,
    restingHR: null, hrv: null, vo2max: null,
  }
  const healthRows = (healthRowsRes.data as Array<Record<string, unknown>>) || []
  if (healthRows.length > 0) {
    const stepSum = sum(healthRows, 'steps')
    const exSum = sum(healthRows, 'exercise_time_minutes')
    const energySum = sum(healthRows, 'active_energy_kcal')
    health = {
      totalSteps: stepSum,
      exerciseMinutes: exSum != null ? Math.round(exSum) : null,
      activeCalories: energySum != null ? Math.round(energySum) : null,
      restingHR: avg(healthRows, 'resting_heart_rate'),
      hrv: avg(healthRows, 'hrv'),
      vo2max: avg(healthRows, 'vo2max'),
    }
  }

  // Body (latest snapshot — doesn't scope to period)
  let body: BodyContext = { weight: null, bodyFat: null }
  const bodyRow = bodyRowRes.data as { weight_kg?: number | null; body_fat_pct?: number | null } | null
  if (bodyRow) {
    body = {
      weight: bodyRow.weight_kg != null ? Math.round(bodyRow.weight_kg * 10) / 10 : null,
      bodyFat: bodyRow.body_fat_pct != null ? Math.round(bodyRow.body_fat_pct * 10) / 10 : null,
    }
  }

  // State of Mind
  let som: StateOfMindContext = { avgValence: null, topLabels: [] }
  const somRows = (somRowsRes.data as Array<{ valence?: number | null; labels?: string[] | null }>) || []
  if (somRows.length > 0) {
    const valences = somRows.map((r) => r.valence).filter((v): v is number => typeof v === 'number')
    const avgValence = valences.length > 0
      ? Math.round((valences.reduce((a, b) => a + b, 0) / valences.length) * 100) / 100
      : null
    const labelCounts: Record<string, number> = {}
    for (const row of somRows) {
      if (Array.isArray(row.labels)) {
        for (const label of row.labels) labelCounts[label] = (labelCounts[label] || 0) + 1
      }
    }
    const topLabels = Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label]) => label)
    som = { avgValence, topLabels }
  }

  // Sleep
  let sleep: SleepContext = {
    nightsTracked: 0, avgTotalHours: null, avgRemHours: null, avgDeepHours: null, avgWristTemperature: null,
  }
  const sleepRows = (sleepRowsRes.data as Array<Record<string, unknown>>) || []
  if (sleepRows.length > 0) {
    sleep = {
      nightsTracked: sleepRows.length,
      avgTotalHours: avg(sleepRows, 'total_sleep_hours'),
      avgRemHours: avg(sleepRows, 'rem_hours'),
      avgDeepHours: avg(sleepRows, 'deep_hours'),
      avgWristTemperature: avg(sleepRows, 'wrist_temperature'),
    }
  }

  // Workouts
  let workouts: WorkoutContext = {
    count: 0, totalMinutes: null, topTypes: [], avgHeartRate: null, totalActiveEnergy: null,
  }
  const workoutRows = (workoutRowsRes.data as Array<{
    workout_type?: string | null
    total_minutes?: number | null
    duration_seconds?: number | null
    avg_heart_rate?: number | null
    active_energy_kcal?: number | null
  }>) || []
  if (workoutRows.length > 0) {
    const typeCounts: Record<string, number> = {}
    let minutesTotal = 0
    let minutesCount = 0
    let energyTotal = 0
    let energyCount = 0
    let hrTotal = 0
    let hrCount = 0
    for (const w of workoutRows) {
      const type = w.workout_type || 'unknown'
      typeCounts[type] = (typeCounts[type] || 0) + 1
      const minutes = w.total_minutes ?? (w.duration_seconds != null ? Math.round(w.duration_seconds / 60) : null)
      if (minutes != null) { minutesTotal += minutes; minutesCount++ }
      if (w.active_energy_kcal != null) { energyTotal += Number(w.active_energy_kcal); energyCount++ }
      if (w.avg_heart_rate != null) { hrTotal += Number(w.avg_heart_rate); hrCount++ }
    }
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${t}×${c}`)
    workouts = {
      count: workoutRows.length,
      totalMinutes: minutesCount > 0 ? minutesTotal : null,
      topTypes,
      avgHeartRate: hrCount > 0 ? Math.round(hrTotal / hrCount) : null,
      totalActiveEnergy: energyCount > 0 ? Math.round(energyTotal) : null,
    }
  }

  // Alerts (HR + ECG)
  const hrAlertRows = (hrAlertRowsRes.data as Array<{ notification_type?: string | null }>) || []
  const ecgRows = (ecgRowsRes.data as Array<{ classification?: string | null }>) || []
  const hrAlertTypeCounts: Record<string, number> = {}
  for (const r of hrAlertRows) {
    const k = r.notification_type || 'unknown'
    hrAlertTypeCounts[k] = (hrAlertTypeCounts[k] || 0) + 1
  }
  const ecgTypeCounts: Record<string, number> = {}
  for (const r of ecgRows) {
    const k = r.classification || 'unknown'
    ecgTypeCounts[k] = (ecgTypeCounts[k] || 0) + 1
  }
  const alerts: AlertsContext = {
    heartRateAlertCount: hrAlertRows.length,
    heartRateAlertTypes: Object.entries(hrAlertTypeCounts).map(([t, c]) => `${t}×${c}`),
    ecgClassifications: Object.entries(ecgTypeCounts).map(([t, c]) => `${t}×${c}`),
  }

  return { periodStart, periodEnd, metrics, health, body, som, sleep, workouts, alerts }
}

// ── Prompt builders ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a concise wellness analyst. Analyze the user's health data and produce a JSON response:
{
  "summary_md": "3-4 sentence headline summary referencing specific numbers",
  "tips_md": "3-5 actionable bullet points — each must reference a specific metric or observation",
  "report_md": "300-500 word narrative report. Must cross-reference datasets (mood vs sleep, HRV vs workouts, calories vs mood, etc.) and call out changes from the previous period with specific deltas."
}
Rules:
- Every sentence must cite a number from the data (e.g. "your HRV averaged 42ms, up from 38ms").
- Every cross-dataset claim in report_md must name both sides (e.g. "sleep fell to 5.8h on the two days active calories exceeded 800").
- Compare to targets when provided.
- Flag anomalies (unusual HR, large calorie swings, mood drops, ECG non-sinus classifications, HR alerts).
- Do not repeat content between summary_md, tips_md, and report_md. Summary is the headline, tips are actions, report is the narrative.
- Never give generic advice like "keep tracking" or "stay consistent".
- If a category has no data for this or the previous period, skip it — don't speculate or fill it with placeholder text.`

function renderPeriodBlock(label: string, c: PeriodContext, targets: DailyTargets) {
  const lines: string[] = [`${label} (${c.periodStart} to ${c.periodEnd}):`]

  lines.push(`\nNUTRITION
- Total calories: ${c.metrics.kcalTotal} (target: ${targets.calorie_intake}/day)
- Meals logged: ${c.metrics.foodEntries}
- Top foods: ${c.metrics.topFoods.join(', ') || 'none'}`)

  lines.push(`\nMOOD
- Average mood: ${c.metrics.avgMood}/5 from ${c.metrics.moodEntries} entries`)

  lines.push(`\nACTIVITY
- Steps: ${c.health.totalSteps ?? 'no data'} (target: ${targets.steps}/day)
- Exercise: ${c.health.exerciseMinutes ?? 'no data'} min (target: ${targets.exercise_minutes}/day)
- Active calories: ${c.health.activeCalories ?? 'no data'} kcal (target: ${targets.active_energy}/day)
- Avg resting HR: ${c.health.restingHR ?? 'no data'} bpm
- Avg HRV: ${c.health.hrv ?? 'no data'} ms
- Avg VO2 max: ${c.health.vo2max ?? 'no data'}`)

  if (c.workouts.count > 0) {
    lines.push(`\nWORKOUTS
- Count: ${c.workouts.count}
- Total minutes: ${c.workouts.totalMinutes ?? 'no data'}
- Top types: ${c.workouts.topTypes.join(', ') || 'none'}
- Avg workout HR: ${c.workouts.avgHeartRate ?? 'no data'} bpm
- Active energy from workouts: ${c.workouts.totalActiveEnergy ?? 'no data'} kcal`)
  }

  if (c.sleep.nightsTracked > 0) {
    lines.push(`\nSLEEP
- Nights tracked: ${c.sleep.nightsTracked}
- Avg total: ${c.sleep.avgTotalHours ?? 'no data'} h
- Avg REM: ${c.sleep.avgRemHours ?? 'no data'} h
- Avg deep: ${c.sleep.avgDeepHours ?? 'no data'} h
- Avg wrist temperature: ${c.sleep.avgWristTemperature ?? 'no data'} °C`)
  }

  if (c.alerts.heartRateAlertCount > 0 || c.alerts.ecgClassifications.length > 0) {
    lines.push(`\nHEART ALERTS & ECG
- HR alerts: ${c.alerts.heartRateAlertCount} (${c.alerts.heartRateAlertTypes.join(', ') || 'none'})
- ECG classifications: ${c.alerts.ecgClassifications.join(', ') || 'none'}`)
  }

  if (c.body.weight != null || c.body.bodyFat != null) {
    lines.push(`\nBODY (latest)
- Weight: ${c.body.weight ?? 'no data'} kg
- Body fat: ${c.body.bodyFat ?? 'no data'}%`)
  }

  if (c.som.avgValence != null || c.som.topLabels.length > 0) {
    lines.push(`\nSTATE OF MIND
- Valence trend: ${c.som.avgValence ?? 'no data'}
- Top emotions: ${c.som.topLabels.length > 0 ? c.som.topLabels.join(', ') : 'none'}`)
  }

  return lines.join('\n')
}

function buildUserPrompt(current: PeriodContext, previous: PeriodContext, targets: DailyTargets) {
  return [
    renderPeriodBlock('CURRENT PERIOD', current, targets),
    '\n' + renderPeriodBlock('PREVIOUS PERIOD', previous, targets),
    '\nProvide specific, data-driven insights in the summary, tips, and narrative report. Call out deltas between the current and previous period. No filler.',
  ].join('\n')
}

// ── AI provider calls ───────────────────────────────────────────────
async function generateWithOpenAI(userMessage: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }
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
      response_format: { type: 'json_object' },
      max_tokens: 1800,
      temperature: 0.5,
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI API error: ${response.status} ${detail.slice(0, 500)}`)
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }
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
        maxOutputTokens: 1800
      }
    })
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${detail.slice(0, 500)}`)
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
export const POST = apiHandler(AIInsightsRequestSchema, async (_request, validatedRequest) => {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new ApiError(401, 'unauthorized')
    }

    if (user.id !== validatedRequest.userId) {
      throw new ApiError(403, 'forbidden')
    }

    const periodStart = validatedRequest.periodStart
    const periodEnd = validatedRequest.periodEnd
    const { prevStart, prevEnd } = computePreviousPeriod(periodStart, periodEnd)

    // Targets (shared across both periods)
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

    const [currentContext, previousContext] = await Promise.all([
      gatherContext(supabase, user.id, periodStart, periodEnd),
      gatherContext(supabase, user.id, prevStart, prevEnd),
    ])

    const userMessage = buildUserPrompt(currentContext, previousContext, targets)

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
        throw new ApiError(500, 'internal_error', JSON.stringify({ openaiError, geminiError }))
      }
    }

    const cleanedResponse = {
      summary_md: typeof aiResponse.summary_md === 'string'
        ? aiResponse.summary_md.substring(0, 1000).trim()
        : 'AI generated insights based on your data.',
      tips_md: typeof aiResponse.tips_md === 'string'
        ? aiResponse.tips_md.substring(0, 500).trim()
        : '• Continue tracking your daily habits\n• Focus on consistent logging\n• Review your patterns weekly',
      report_md: typeof aiResponse.report_md === 'string'
        ? aiResponse.report_md.substring(0, 4000).trim()
        : 'Not enough data to generate a full report for this period.',
      metrics: currentContext.metrics,
      provider,
      raw: aiResponse,
    }

    const response = AIInsightsResponseSchema.parse(cleanedResponse)

    const { error: upsertError } = await (supabase as any)
      .from('insights')
      .upsert({
        user_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        summary_md: response.summary_md,
        tips_md: response.tips_md,
        report_md: response.report_md,
        metrics: response.metrics,
      }, { onConflict: 'user_id,period_start,period_end' })

    if (upsertError) {
      console.warn('Failed to store insights in database:', upsertError)
    }

    return NextResponse.json(response)
})
