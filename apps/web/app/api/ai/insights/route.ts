import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { 
  AIInsightsRequestSchema, 
  AIInsightsResponseSchema,
  WeeklyMetricsSchema
} from '@/lib/validations'
import { Database } from '@/lib/types/database'

type MoodEntry = Database['public']['Tables']['mood_entries']['Row']
type FoodEntry = Database['public']['Tables']['food_entries']['Row']

// Generate insights with OpenAI
async function generateWithOpenAI(metrics: Record<string, unknown>, userEntries: Record<string, unknown>[]) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a wellness coach and nutrition expert. Generate personalized insights based on user's mood and food data.

          Return a JSON response with:
          {
            "summary_md": "80-150 word summary of the week's patterns and trends",
            "tips_md": "3-5 bullet points with actionable wellness tips in markdown format"
          }
          
          Be encouraging, specific, and focus on actionable advice. Reference the data patterns you observe.`
        },
        {
          role: 'user',
          content: `Analyze this week's data and provide insights:
          
          Metrics:
          - Average mood: ${metrics.avgMood}/5
          - Total calories: ${metrics.kcalTotal}
          - Mood entries: ${metrics.moodEntries}
          - Food entries: ${metrics.foodEntries}
          - Top foods: ${(metrics.topFoods as string[]).join(', ')}
          
          Recent entries context: ${userEntries.length} entries tracked this week.
          
          Generate personalized insights and tips based on this data.`
        }
      ],
      max_tokens: 600,
      temperature: 0.7
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

// Generate insights with Gemini
async function generateWithGemini(metrics: Record<string, unknown>, userEntries: Record<string, unknown>[]) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are a wellness coach and nutrition expert. Generate personalized insights based on user's mood and food data.

          Return a JSON response with:
          {
            "summary_md": "80-150 word summary of the week's patterns and trends",
            "tips_md": "3-5 bullet points with actionable wellness tips in markdown format"
          }
          
          Analyze this week's data:
          - Average mood: ${metrics.avgMood}/5
          - Total calories: ${metrics.kcalTotal}
          - Mood entries: ${metrics.moodEntries}
          - Food entries: ${metrics.foodEntries}
          - Top foods: ${(metrics.topFoods as string[]).join(', ')}
          
          Recent entries: ${userEntries.length} entries this week.
          
          Be encouraging, specific, and focus on actionable advice. Return only valid JSON.`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600
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
    // Clean the response to extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response')
    }
    return JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Failed to parse Gemini response as JSON')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json()
    const validatedRequest = AIInsightsRequestSchema.parse(body)

    // Verify authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user matches request
    if (user.id !== validatedRequest.userId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Fetch user data from database for the specified period
    const { data: moodEntries, error: moodError } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', validatedRequest.periodStart)
      .lte('date', validatedRequest.periodEnd)

    const { data: foodEntries, error: foodError } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('journal_mode', false) // Exclude private entries
      .gte('date', validatedRequest.periodStart)
      .lte('date', validatedRequest.periodEnd)

    if (moodError || foodError) {
      console.error('Database query error:', { moodError, foodError })
      return NextResponse.json(
        { error: 'Failed to fetch user data' },
        { status: 500 }
      )
    }

    // Calculate metrics using the database function
    // Workaround for typing issue with RPC function
    const { data: metricsResult, error: metricsError } = await (supabase as any)
      .rpc('calculate_weekly_metrics', {
        user_uuid: user.id,
        start_date: validatedRequest.periodStart,
        end_date: validatedRequest.periodEnd
      })

    if (metricsError) {
      console.error('Metrics calculation error:', metricsError)
      return NextResponse.json(
        { error: 'Failed to calculate metrics' },
        { status: 500 }
      )
    }

    const metrics = WeeklyMetricsSchema.parse(metricsResult)

    // Combine all entries for context
    const allEntries = [
      ...(moodEntries || []).map((e: MoodEntry) => ({ type: 'mood' as const, ...e })),
      ...(foodEntries || []).map((e: FoodEntry) => ({ type: 'food' as const, ...e }))
    ]

    // Generate insights with AI provider (with fallback)
    let aiResponse
    let provider: 'openai' | 'gemini' = 'openai'

    try {
      // Try OpenAI first
      if (process.env.OPENAI_API_KEY) {
        aiResponse = await generateWithOpenAI(metrics, allEntries)
        provider = 'openai'
      } else {
        throw new Error('OpenAI API key not available')
      }
    } catch (openaiError) {
      console.warn('OpenAI failed, trying Gemini:', openaiError)
      
      try {
        if (process.env.GEMINI_API_KEY) {
          aiResponse = await generateWithGemini(metrics, allEntries)
          provider = 'gemini'
        } else {
          throw new Error('Gemini API key not available')
        }
      } catch (geminiError) {
        console.error('Both AI providers failed:', { openaiError, geminiError })
        return NextResponse.json(
          { error: 'AI insights generation failed' },
          { status: 500 }
        )
      }
    }

    // Log the raw AI response for debugging
    console.log('Raw AI response:', JSON.stringify(aiResponse, null, 2))

    // Clean and validate the AI response
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

    // Validate and structure the response
    const response = AIInsightsResponseSchema.parse(cleanedResponse)

    // Optionally store the insights in the database
    // Workaround for typing issue with insert
    const { error: insertError } = await (supabase as any)
      .from('insights')
      .insert({
        user_id: user.id,
        period_start: validatedRequest.periodStart,
        period_end: validatedRequest.periodEnd,
        summary_md: response.summary_md,
        tips_md: response.tips_md,
        metrics: response.metrics
      })

    if (insertError) {
      console.warn('Failed to store insights in database:', insertError)
      // Don't fail the request, just log the warning
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('AI Insights API error:', error)
    
    if (error instanceof Error && error.message.includes('ZodError')) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}