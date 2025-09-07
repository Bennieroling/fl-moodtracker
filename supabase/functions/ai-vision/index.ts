import { createSupabaseClient, corsHeaders, verifyUser, callOpenAIVision, callGeminiVision } from '../_shared/utils.ts'

interface VisionRequest {
  imageUrl: string
  userId: string
  date: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

interface FoodItem {
  label: string
  confidence: number
  quantity?: string
}

interface NutritionData {
  calories: number
  macros: {
    protein: number
    carbs: number
    fat: number
  }
}

interface VisionResponse {
  foods: FoodItem[]
  nutrition: NutritionData
  provider: 'openai' | 'gemini'
  raw: any
}

const VISION_PROMPT = `Analyze this food image and provide a JSON response with the following structure:
{
  "foods": [
    {
      "label": "food name",
      "confidence": 0.95,
      "quantity": "1 cup" (optional)
    }
  ],
  "nutrition": {
    "calories": 350,
    "macros": {
      "protein": 20,
      "carbs": 45,
      "fat": 12
    }
  }
}

Instructions:
- Identify all visible food items in the image
- Provide confidence scores (0-1) for each identification
- Estimate nutritional content based on visible portions
- Use common serving sizes for quantity estimates
- If nutrition cannot be estimated, provide reasonable defaults
- Return only valid JSON, no additional text`

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  try {
    // Verify request method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Parse request body
    const body: VisionRequest = await req.json()
    const { imageUrl, userId, date, meal } = body

    // Validate required fields
    if (!imageUrl || !userId || !date || !meal) {
      throw new Error('Missing required fields: imageUrl, userId, date, meal')
    }

    // Create Supabase client and verify user
    const supabase = createSupabaseClient(req)
    const user = await verifyUser(supabase)

    // Verify user matches request
    if (user.id !== userId) {
      throw new Error('User ID mismatch')
    }

    let result: VisionResponse
    let provider: 'openai' | 'gemini'

    // Try OpenAI first, fallback to Gemini
    try {
      console.log('Attempting OpenAI Vision API...')
      const openAIResponse = await callOpenAIVision(imageUrl, VISION_PROMPT)
      
      // Parse OpenAI response
      const content = openAIResponse.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI response')
      }

      const parsedContent = JSON.parse(content)
      
      result = {
        foods: parsedContent.foods || [],
        nutrition: parsedContent.nutrition || { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } },
        provider: 'openai',
        raw: openAIResponse
      }
      provider = 'openai'
      
      console.log('OpenAI Vision API succeeded')
    } catch (openAIError) {
      console.log('OpenAI Vision API failed, trying Gemini...', openAIError)
      
      try {
        const geminiResponse = await callGeminiVision(imageUrl, VISION_PROMPT)
        
        // Parse Gemini response
        const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text
        if (!content) {
          throw new Error('No content in Gemini response')
        }

        const parsedContent = JSON.parse(content)
        
        result = {
          foods: parsedContent.foods || [],
          nutrition: parsedContent.nutrition || { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } },
          provider: 'gemini',
          raw: geminiResponse
        }
        provider = 'gemini'
        
        console.log('Gemini Vision API succeeded')
      } catch (geminiError) {
        console.error('Both vision APIs failed:', { openAIError, geminiError })
        
        // Return fallback response
        result = {
          foods: [{ label: 'Unknown food item', confidence: 0.5 }],
          nutrition: { calories: 250, macros: { protein: 10, carbs: 30, fat: 10 } },
          provider: 'openai',
          raw: { error: 'Both APIs failed, using fallback' }
        }
        provider = 'openai'
      }
    }

    // Save to food_entries table
    const foodEntry = {
      user_id: userId,
      date,
      meal,
      photo_url: imageUrl,
      voice_url: null,
      ai_raw: result.raw,
      food_labels: result.foods.map(f => f.label),
      calories: result.nutrition.calories,
      macros: result.nutrition.macros,
      note: null,
      journal_mode: false
    }

    const { data: savedEntry, error: saveError } = await supabase
      .from('food_entries')
      .insert(foodEntry)
      .select()
      .single()

    if (saveError) {
      console.error('Error saving food entry:', saveError)
      // Continue without throwing - we still want to return the AI result
    }

    console.log(`Vision analysis completed using ${provider}`)

    return new Response(JSON.stringify(result), {
      headers: { 
        ...corsHeaders(), 
        'Content-Type': 'application/json' 
      },
    })

  } catch (error) {
    console.error('Vision function error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        provider: 'none'
      }),
      {
        status: 500,
        headers: { 
          ...corsHeaders(), 
          'Content-Type': 'application/json' 
        },
      }
    )
  }
})