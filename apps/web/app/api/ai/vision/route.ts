import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { 
  AIVisionRequestSchema, 
  AIVisionResponseSchema,
  FoodItemSchema,
  MacrosSchema 
} from '@/lib/validations'

// OpenAI vision analysis
async function analyzeWithOpenAI(imageUrl: string) {
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
          content: `You are a nutrition expert. Analyze food images and return a JSON response with:
          {
            "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
            "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
          }
          
          Be accurate with calorie estimates and include confidence scores (0-1). Focus on main food items visible.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this food image and provide nutrition information.'
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: `Analyze this food image and return a JSON response with:
            {
              "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
              "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
            }
            
            Be accurate with calorie estimates and include confidence scores (0-1). Focus on main food items visible. Return only valid JSON.`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500
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

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json()
    const validatedRequest = AIVisionRequestSchema.parse(body)

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

    // Determine which AI provider to use (default to OpenAI, fallback to Gemini)
    let aiResponse
    let provider: 'openai' | 'gemini' = 'openai'

    console.log('AI Vision: Starting analysis for image:', validatedRequest.imageUrl)
    console.log('AI Vision: OpenAI key available:', !!process.env.OPENAI_API_KEY)
    console.log('AI Vision: Gemini key available:', !!process.env.GEMINI_API_KEY)

    try {
      // Try OpenAI first
      if (process.env.OPENAI_API_KEY) {
        console.log('AI Vision: Trying OpenAI analysis')
        aiResponse = await analyzeWithOpenAI(validatedRequest.imageUrl)
        provider = 'openai'
        console.log('AI Vision: OpenAI analysis successful')
      } else {
        throw new Error('OpenAI API key not available')
      }
    } catch (openaiError) {
      console.warn('AI Vision: OpenAI failed, trying Gemini:', openaiError)
      
      try {
        if (process.env.GEMINI_API_KEY) {
          console.log('AI Vision: Trying Gemini analysis')
          aiResponse = await analyzeWithGemini(validatedRequest.imageUrl)
          provider = 'gemini'
          console.log('AI Vision: Gemini analysis successful')
        } else {
          throw new Error('Gemini API key not available')
        }
      } catch (geminiError) {
        console.error('AI Vision: Both AI providers failed:', { openaiError, geminiError })
        return NextResponse.json(
          { error: 'AI analysis failed' },
          { status: 500 }
        )
      }
    }

    // Validate and structure the response
    const foods = aiResponse.foods?.map((food: unknown) => {
      try {
        return FoodItemSchema.parse(food)
      } catch {
        console.warn('Invalid food item, skipping:', food)
        return null
      }
    }).filter(Boolean) || []

    const nutrition = {
      calories: aiResponse.nutrition?.calories || 0,
      macros: MacrosSchema.parse(aiResponse.nutrition?.macros || { protein: 0, carbs: 0, fat: 0 })
    }

    const response = AIVisionResponseSchema.parse({
      foods,
      nutrition,
      provider,
      raw: aiResponse
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('AI Vision API error:', error)
    
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