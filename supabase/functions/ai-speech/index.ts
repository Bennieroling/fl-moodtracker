import { createSupabaseClient, corsHeaders, verifyUser, callOpenAISpeech, callOpenAIChat, callGeminiChat } from '../_shared/utils.ts'

interface SpeechRequest {
  audioUrl: string
  userId: string
  date?: string
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

interface SpeechResponse {
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foods: FoodItem[]
  nutrition: NutritionData
  transcript: string
  provider: 'openai' | 'gemini'
  raw: any
}

const FOOD_PARSING_PROMPT = (transcript: string) => `
Analyze this food description and extract structured information. Return only valid JSON with this structure:
{
  "meal": "breakfast|lunch|dinner|snack",
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

Transcript: "${transcript}"

Instructions:
- Determine the most likely meal type based on foods mentioned and context
- Extract all food items mentioned
- Provide confidence scores (0-1) for each food identification
- Estimate nutritional content based on described portions
- Use reasonable defaults if nutrition cannot be estimated
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
    const body: SpeechRequest = await req.json()
    const { audioUrl, userId, date } = body

    // Validate required fields
    if (!audioUrl || !userId) {
      throw new Error('Missing required fields: audioUrl, userId')
    }

    // Create Supabase client and verify user
    const supabase = createSupabaseClient(req)
    const user = await verifyUser(supabase)

    // Verify user matches request
    if (user.id !== userId) {
      throw new Error('User ID mismatch')
    }

    // Step 1: Transcribe audio using OpenAI Whisper
    console.log('Transcribing audio with OpenAI Whisper...')
    let transcript: string
    let transcriptionRaw: any

    try {
      const whisperResponse = await callOpenAISpeech(audioUrl)
      transcript = whisperResponse.text || ''
      transcriptionRaw = whisperResponse
      
      if (!transcript.trim()) {
        throw new Error('Empty transcription result')
      }
      
      console.log('Audio transcription succeeded:', transcript.substring(0, 100) + '...')
    } catch (transcriptionError) {
      console.error('Audio transcription failed:', transcriptionError)
      throw new Error('Failed to transcribe audio')
    }

    // Step 2: Parse transcript for food information
    console.log('Parsing transcript for food information...')
    let result: SpeechResponse
    let provider: 'openai' | 'gemini'

    // Try OpenAI first, fallback to Gemini
    try {
      console.log('Attempting OpenAI Chat API for food parsing...')
      const openAIResponse = await callOpenAIChat(FOOD_PARSING_PROMPT(transcript))
      
      // Parse OpenAI response
      const content = openAIResponse.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI response')
      }

      const parsedContent = JSON.parse(content)
      
      result = {
        meal: parsedContent.meal || 'snack',
        foods: parsedContent.foods || [],
        nutrition: parsedContent.nutrition || { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } },
        transcript,
        provider: 'openai',
        raw: {
          transcription: transcriptionRaw,
          parsing: openAIResponse
        }
      }
      provider = 'openai'
      
      console.log('OpenAI food parsing succeeded')
    } catch (openAIError) {
      console.log('OpenAI food parsing failed, trying Gemini...', openAIError)
      
      try {
        const geminiResponse = await callGeminiChat(FOOD_PARSING_PROMPT(transcript))
        
        // Parse Gemini response
        const content = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text
        if (!content) {
          throw new Error('No content in Gemini response')
        }

        const parsedContent = JSON.parse(content)
        
        result = {
          meal: parsedContent.meal || 'snack',
          foods: parsedContent.foods || [],
          nutrition: parsedContent.nutrition || { calories: 0, macros: { protein: 0, carbs: 0, fat: 0 } },
          transcript,
          provider: 'gemini',
          raw: {
            transcription: transcriptionRaw,
            parsing: geminiResponse
          }
        }
        provider = 'gemini'
        
        console.log('Gemini food parsing succeeded')
      } catch (geminiError) {
        console.error('Both parsing APIs failed:', { openAIError, geminiError })
        
        // Return fallback response with transcript
        result = {
          meal: 'snack',
          foods: [{ label: 'Voice note', confidence: 0.5 }],
          nutrition: { calories: 250, macros: { protein: 10, carbs: 30, fat: 10 } },
          transcript,
          provider: 'openai',
          raw: {
            transcription: transcriptionRaw,
            parsing: { error: 'Both APIs failed, using fallback' }
          }
        }
        provider = 'openai'
      }
    }

    // Save to food_entries table if date is provided
    if (date) {
      const foodEntry = {
        user_id: userId,
        date,
        meal: result.meal,
        photo_url: null,
        voice_url: audioUrl,
        ai_raw: result.raw,
        food_labels: result.foods.map(f => f.label),
        calories: result.nutrition.calories,
        macros: result.nutrition.macros,
        note: transcript,
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
    }

    console.log(`Speech analysis completed using ${provider}`)

    return new Response(JSON.stringify(result), {
      headers: { 
        ...corsHeaders(), 
        'Content-Type': 'application/json' 
      },
    })

  } catch (error) {
    console.error('Speech function error:', error)
    
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