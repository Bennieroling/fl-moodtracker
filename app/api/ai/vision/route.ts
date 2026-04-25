import { NextResponse } from 'next/server'
import { ApiError, apiHandler } from '@/lib/api-handler'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  AIVisionRequestSchema,
  AIVisionResponseSchema,
  FoodItemSchema,
  MacrosSchema,
} from '@/lib/validations'

function validateSupabaseStorageUrl(imageUrl: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }

  const url = new URL(imageUrl)
  const allowedHost = new URL(supabaseUrl).host
  const isAllowedPath =
    url.pathname.startsWith('/storage/v1/object/sign/food-photos/') ||
    url.pathname.startsWith('/storage/v1/object/public/food-photos/')

  if (url.protocol !== 'https:') {
    return { error: 'https_required' as const }
  }

  if (url.host !== allowedHost || !isAllowedPath) {
    return { error: 'unauthorized_host' as const }
  }

  return { url }
}

// OpenAI vision analysis
async function analyzeWithOpenAI(imageUrl: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a nutrition expert. Analyze food images and return a JSON response with:
          {
            "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
            "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
          }
          
          Be accurate with calorie estimates and include confidence scores (0-1). Focus on main food items visible.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this food image and provide nutrition information.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No content returned from OpenAI')
  }

  try {
    const cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    return JSON.parse(cleanContent)
  } catch (parseError) {
    throw new Error(`Failed to parse OpenAI response as JSON: ${parseError}`)
  }
}

// Gemini vision analysis
async function analyzeWithGemini(imageUrl: string) {
  // First, fetch the image to convert to base64
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error('Failed to fetch image for Gemini analysis')
  }

  const imageBuffer = await imageResponse.arrayBuffer()
  const base64Image = Buffer.from(imageBuffer).toString('base64')
  const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Analyze this food image and return a JSON response with:
            {
              "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
              "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
            }
            
            Be accurate with calorie estimates and include confidence scores (0-1). Focus on main food items visible. Return only valid JSON.`,
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    throw new Error('No content returned from Gemini')
  }

  try {
    // Clean the response to extract JSON (Gemini sometimes adds markdown formatting)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response')
    }
    return JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Failed to parse Gemini response as JSON')
  }
}

export const POST = apiHandler(AIVisionRequestSchema, async (_request, validatedRequest) => {
  // Verify authentication
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new ApiError(401, 'unauthorized')
  }

  // Verify user matches request
  if (user.id !== validatedRequest.userId) {
    throw new ApiError(403, 'forbidden')
  }

  const imageUrlResult = validateSupabaseStorageUrl(validatedRequest.imageUrl)
  if ('error' in imageUrlResult) {
    const errorCode = imageUrlResult.error ?? 'invalid_input'
    throw new ApiError(400, errorCode)
  }

  // Determine which AI provider to use (default to OpenAI, fallback to Gemini)
  let aiResponse
  let provider: 'openai' | 'gemini' = 'openai'

  try {
    // Try OpenAI first
    if (process.env.OPENAI_API_KEY) {
      aiResponse = await analyzeWithOpenAI(imageUrlResult.url.toString())
      provider = 'openai'
    } else {
      throw new Error('OpenAI API key not available')
    }
  } catch (openaiError) {
    console.warn('AI Vision: OpenAI failed, trying Gemini', openaiError)

    try {
      if (process.env.GEMINI_API_KEY) {
        aiResponse = await analyzeWithGemini(imageUrlResult.url.toString())
        provider = 'gemini'
      } else {
        throw new Error('Gemini API key not available')
      }
    } catch (geminiError) {
      throw new ApiError(500, 'internal_error', JSON.stringify({ openaiError, geminiError }))
    }
  }

  // Validate and structure the response
  const foods =
    aiResponse.foods
      ?.map((food: unknown) => {
        try {
          return FoodItemSchema.parse(food)
        } catch {
          console.warn('Invalid food item, skipping:', food)
          return null
        }
      })
      .filter(Boolean) || []

  const nutrition = {
    calories: aiResponse.nutrition?.calories || 0,
    macros: MacrosSchema.parse(aiResponse.nutrition?.macros || { protein: 0, carbs: 0, fat: 0 }),
  }

  const response = AIVisionResponseSchema.parse({
    foods,
    nutrition,
    provider,
    raw: aiResponse,
  })

  return NextResponse.json(response)
})
