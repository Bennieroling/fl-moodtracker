import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  AITextRequestSchema,
  AITextResponseSchema,
} from '@/lib/validations'

async function analyzeTextWithOpenAI(text: string, mealHint?: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You are a nutrition expert. Given a free-form meal description, respond ONLY with JSON:
{
  "meal": "breakfast|lunch|dinner|snack",
  "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
  "nutrition": {"calories": number, "macros": {"protein": number, "carbs": number, "fat": number}},
  "normalized_text": "cleaned up summary"
}
Use the provided meal hint if it makes sense; otherwise infer meal type from context. Confidence range is 0-1.`,
        },
        mealHint
          ? { role: 'user', content: `Meal hint: ${mealHint}. Description: ${text}` }
          : { role: 'user', content: text },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI text analysis failed: ${response.status} ${errText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned no content')
  const clean = content.replace(/```json\s*/g, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}

async function analyzeTextWithGemini(text: string, mealHint?: string) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API key missing')
  const prompt = `You are a nutrition expert. Return JSON with keys meal, foods, nutrition, normalized_text.
${mealHint ? `Meal hint: ${mealHint}.` : ''}
Description: ${text}`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini text analysis failed: ${response.status} ${errText}`)
  }

  const data = await response.json()
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textContent) throw new Error('Gemini returned no content')
  const jsonMatch = textContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Gemini response missing JSON block')
  return JSON.parse(jsonMatch[0])
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, userId, meal } = AITextRequestSchema.parse(body)

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let analysis
    let provider: 'openai' | 'gemini' = 'openai'

    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('Missing OpenAI key')
      analysis = await analyzeTextWithOpenAI(text, meal)
      provider = 'openai'
    } catch (error) {
      console.warn('OpenAI text analysis failed, attempting Gemini', error)
      analysis = await analyzeTextWithGemini(text, meal)
      provider = 'gemini'
    }

    const validated = AITextResponseSchema.parse({
      ...analysis,
      provider,
    })

    return NextResponse.json(validated)
  } catch (error) {
    console.error('AI text analysis error:', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
