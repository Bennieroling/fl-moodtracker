import { NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-handler'
import { logger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { WhatChangedRequestSchema, WhatChangedResponseSchema } from '@/lib/validations'

type Provider = 'openai' | 'gemini'

interface DeltaInput {
  metric: string
  label: string
  unit?: string
  thisValue: number | null
  lastValue: number | null
  deltaPct: number | null
  goodDirection: 'up' | 'down' | 'neutral'
  goodOrBad: 'good' | 'bad' | 'neutral' | 'flat'
}

const SYSTEM_PROMPT = `You are a wellness analyst writing for someone tracking their own health.
You will receive week-over-week (or fortnight/month) deltas for a small set of metrics.
Reply with a JSON object: {"narrative": "<2-3 sentence observation>"}.

Rules for the narrative:
- Second person ("you", not "the user").
- Factual, warm, honest — describe what changed and suggest the most likely benign pattern tying the changes together.
- 2 to 3 sentences total. No more.
- Reference at least two metrics by name with their numbers.
- No medical advice, no diagnosis, no speculation about disease.
- No emoji, no hedging filler ("just", "perhaps maybe"), no generic prompts ("keep tracking").
- Don't repeat the deltas verbatim — synthesise.`

function buildUserMessage(input: {
  windowKey: '7' | '14' | '30'
  windowStart: string
  deltas: DeltaInput[]
}): string {
  const windowLabel =
    input.windowKey === '7' ? '7 days' : input.windowKey === '14' ? '14 days' : '30 days'

  const lines = [`Window: last ${windowLabel} starting ${input.windowStart}.`, '', 'Deltas:']

  for (const d of input.deltas) {
    const fmtVal = (v: number | null) => (v === null ? 'no data' : Number(v.toFixed(2)))
    const pct =
      d.deltaPct !== null ? `${d.deltaPct > 0 ? '+' : ''}${(d.deltaPct * 100).toFixed(0)}%` : '—'
    const unit = d.unit ? ` ${d.unit}` : ''
    lines.push(
      `- ${d.label}: ${fmtVal(d.lastValue)}${unit} → ${fmtVal(d.thisValue)}${unit} (${pct}, good_direction=${d.goodDirection}, change=${d.goodOrBad})`,
    )
  }

  lines.push(
    '',
    'Write a 2-3 sentence narrative summarising what shifted and the most plausible benign pattern.',
  )
  return lines.join('\n')
}

async function generateWithOpenAI(userMessage: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI API error: ${response.status} ${detail.slice(0, 500)}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('No content returned from OpenAI')
  try {
    return { json: JSON.parse(content), model: 'gpt-4o-mini' }
  } catch {
    throw new Error('Failed to parse OpenAI response as JSON')
  }
}

async function generateWithGemini(userMessage: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${detail.slice(0, 500)}`)
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) throw new Error('No content returned from Gemini')

  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON found in Gemini response')
  try {
    return { json: JSON.parse(match[0]), model: 'gemini-1.5-flash' }
  } catch {
    throw new Error('Failed to parse Gemini response as JSON')
  }
}

export const POST = apiHandler(WhatChangedRequestSchema, async (_request, validated) => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new ApiError(401, 'unauthorized')
  }
  if (user.id !== validated.userId) {
    throw new ApiError(403, 'forbidden')
  }

  const cacheKey = `what-changed:${validated.windowKey}d:${validated.windowStart}`

  // Cache hit?
  const { data: cached, error: cacheReadError } = await supabase
    .from('narrative_cache')
    .select('narrative, generated_at, model')
    .eq('user_id', user.id)
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (cacheReadError) {
    logger.warn('narrative_cache read failed', { error: String(cacheReadError) })
  }

  if (cached) {
    return NextResponse.json(
      WhatChangedResponseSchema.parse({
        narrative: cached.narrative,
        cached: true,
        generated_at: cached.generated_at,
        model: cached.model,
      }),
    )
  }

  // Cache miss — call LLM
  const userMessage = buildUserMessage({
    windowKey: validated.windowKey,
    windowStart: validated.windowStart,
    deltas: validated.deltas,
  })

  let aiResponse: { json: { narrative?: unknown }; model: string } | null = null
  let provider: Provider = 'openai'

  try {
    if (process.env.OPENAI_API_KEY) {
      aiResponse = await generateWithOpenAI(userMessage)
      provider = 'openai'
    } else {
      throw new Error('OpenAI API key not available')
    }
  } catch (openaiError) {
    logger.warn('OpenAI failed, trying Gemini', { error: String(openaiError) })
    try {
      if (process.env.GEMINI_API_KEY) {
        aiResponse = await generateWithGemini(userMessage)
        provider = 'gemini'
      } else {
        throw new Error('Gemini API key not available')
      }
    } catch (geminiError) {
      throw new ApiError(
        500,
        'internal_error',
        JSON.stringify({ openaiError: String(openaiError), geminiError: String(geminiError) }),
      )
    }
  }

  if (!aiResponse) {
    throw new ApiError(500, 'internal_error', 'No LLM response')
  }

  const rawNarrative =
    typeof aiResponse.json.narrative === 'string' ? aiResponse.json.narrative.trim() : ''
  if (!rawNarrative) {
    throw new ApiError(500, 'internal_error', 'Empty narrative from LLM')
  }
  const narrative = rawNarrative.slice(0, 800)
  const generated_at = new Date().toISOString()

  // Store via service-role on the server side. Note: RLS allows the user to
  // SELECT but not INSERT — the server-side supabase client (using the user's
  // session) is permitted because RLS WITH CHECK is satisfied via auth.uid().
  // We let the server's session write here since it carries the user JWT.
  const { error: upsertError } = await supabase.from('narrative_cache').upsert(
    {
      user_id: user.id,
      cache_key: cacheKey,
      narrative,
      inputs: {
        deltas: validated.deltas,
        windowKey: validated.windowKey,
        windowStart: validated.windowStart,
      },
      model: aiResponse.model,
      generated_at,
    },
    { onConflict: 'user_id,cache_key' },
  )

  if (upsertError) {
    logger.warn('narrative_cache upsert failed', { error: String(upsertError), provider })
  }

  return NextResponse.json(
    WhatChangedResponseSchema.parse({
      narrative,
      cached: false,
      generated_at,
      model: aiResponse.model,
    }),
  )
})
