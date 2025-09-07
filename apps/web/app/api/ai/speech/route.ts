import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { 
  AISpeechRequestSchema, 
  AISpeechResponseSchema,
  MealTypeSchema,
  FoodItemSchema,
  MacrosSchema 
} from '@/lib/validations'

// OpenAI Whisper transcription and GPT analysis (from File)
async function processWithOpenAIFile(audioFile: File) {
  // Step 1: Transcribe audio with Whisper
  const formData = new FormData()
  formData.append('file', audioFile)
  formData.append('model', 'whisper-1')

  const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData
  })

  if (!transcriptionResponse.ok) {
    throw new Error(`Whisper API error: ${transcriptionResponse.status}`)
  }

  const transcriptionData = await transcriptionResponse.json()
  const transcript = transcriptionData.text

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('No transcription text received')
  }

  // Step 2: Analyze transcript with GPT for food information
  const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
          content: `You are a nutrition expert. Analyze voice transcripts about meals and return a JSON response with:
          {
            "meal": "breakfast|lunch|dinner|snack",
            "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
            "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
          }
          
          Determine the meal type from context clues (time, food types, etc.). Be accurate with food identification and calorie estimates.`
        },
        {
          role: 'user',
          content: `Analyze this meal description: "${transcript}"`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  })

  if (!analysisResponse.ok) {
    throw new Error(`OpenAI analysis API error: ${analysisResponse.status}`)
  }

  const analysisData = await analysisResponse.json()
  const content = analysisData.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No analysis content returned from OpenAI')
  }

  try {
    const parsed = JSON.parse(content)
    return {
      transcript,
      analysis: parsed
    }
  } catch {
    throw new Error('Failed to parse OpenAI analysis response as JSON')
  }
}

// OpenAI Whisper transcription and GPT analysis (from URL)
async function processWithOpenAI(audioUrl: string) {
  // Step 1: Transcribe audio with Whisper
  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error('Failed to fetch audio file')
  }

  const audioBlob = await audioResponse.blob()
  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.webm')
  formData.append('model', 'whisper-1')

  const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData
  })

  if (!transcriptionResponse.ok) {
    throw new Error(`Whisper API error: ${transcriptionResponse.status}`)
  }

  const transcriptionData = await transcriptionResponse.json()
  const transcript = transcriptionData.text

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('No transcription text received')
  }

  // Step 2: Analyze transcript with GPT for food information
  const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
          content: `You are a nutrition expert. Analyze voice transcripts about meals and return a JSON response with:
          {
            "meal": "breakfast|lunch|dinner|snack",
            "foods": [{"label": "food name", "confidence": 0.9, "quantity": "estimated portion"}],
            "nutrition": {"calories": 500, "macros": {"protein": 25, "carbs": 60, "fat": 15}}
          }
          
          Determine the meal type from context clues (time, food types, etc.). Be accurate with food identification and calorie estimates.`
        },
        {
          role: 'user',
          content: `Analyze this meal description: "${transcript}"`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  })

  if (!analysisResponse.ok) {
    throw new Error(`OpenAI analysis API error: ${analysisResponse.status}`)
  }

  const analysisData = await analysisResponse.json()
  const content = analysisData.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No analysis content returned from OpenAI')
  }

  try {
    const parsed = JSON.parse(content)
    return {
      transcript,
      analysis: parsed
    }
  } catch {
    throw new Error('Failed to parse OpenAI analysis response as JSON')
  }
}

// Gemini speech processing (transcription + analysis)
// Note: Not implemented - Gemini doesn't support direct audio processing
// In production, you'd want to use a separate transcription service

export async function POST(request: NextRequest) {
  try {
    // Check content type
    const contentType = request.headers.get('content-type')
    let validatedRequest: {
      audioFile?: File
      audioUrl?: string
      userId: string
      date?: string
    }
    
    if (contentType?.includes('multipart/form-data')) {
      // Handle FormData from voice recorder
      const formData = await request.formData()
      const audioFile = formData.get('audio') as File
      const userId = formData.get('userId') as string
      const date = formData.get('date') as string
      
      if (!audioFile || !userId) {
        return NextResponse.json(
          { error: 'Missing audio file or user ID' },
          { status: 400 }
        )
      }

      // Convert the FormData to our request structure
      validatedRequest = {
        audioFile: audioFile,
        userId: userId,
        date: date
      }
    } else {
      // Handle JSON request (existing flow)
      const body = await request.json()
      validatedRequest = AISpeechRequestSchema.parse(body)
    }

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
    const requestUserId = validatedRequest.audioFile ? validatedRequest.userId : validatedRequest.userId
    if (user.id !== requestUserId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Process audio with AI provider (primarily OpenAI for Whisper)
    let result
    let provider: 'openai' | 'gemini' = 'openai'

    try {
      if (process.env.OPENAI_API_KEY) {
        // Handle FormData (direct file upload) vs JSON (with URL)
        if (validatedRequest.audioFile) {
          result = await processWithOpenAIFile(validatedRequest.audioFile)
        } else if (validatedRequest.audioUrl) {
          result = await processWithOpenAI(validatedRequest.audioUrl)
        } else {
          throw new Error('No audio file or URL provided')
        }
        provider = 'openai'
      } else {
        throw new Error('OpenAI API key not available')
      }
    } catch (openaiError) {
      console.warn('OpenAI failed:', openaiError)
      
      // Gemini fallback is limited for audio processing
      return NextResponse.json(
        { error: 'Speech processing failed - OpenAI Whisper required for audio transcription' },
        { status: 500 }
      )
    }

    // Validate and structure the response
    const meal = MealTypeSchema.parse(result.analysis.meal)
    
    const foods = result.analysis.foods?.map((food: unknown) => {
      try {
        return FoodItemSchema.parse(food)
      } catch {
        console.warn('Invalid food item, skipping:', food)
        return null
      }
    }).filter(Boolean) || []

    const nutrition = {
      calories: result.analysis.nutrition?.calories || 0,
      macros: MacrosSchema.parse(result.analysis.nutrition?.macros || { protein: 0, carbs: 0, fat: 0 })
    }

    const response = AISpeechResponseSchema.parse({
      meal,
      foods,
      nutrition,
      transcript: result.transcript,
      provider,
      raw: result.analysis
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('AI Speech API error:', error)
    
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