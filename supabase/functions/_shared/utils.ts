// Shared utilities for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

export interface Database {
  public: {
    Tables: {
      mood_entries: {
        Row: {
          id: string
          user_id: string
          date: string
          mood_score: number
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          mood_score: number
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          mood_score?: number
          note?: string | null
          updated_at?: string
        }
      }
      food_entries: {
        Row: {
          id: string
          user_id: string
          date: string
          meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          photo_url: string | null
          voice_url: string | null
          ai_raw: any | null
          food_labels: string[] | null
          calories: number | null
          macros: {
            protein: number
            carbs: number
            fat: number
          } | null
          note: string | null
          journal_mode: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          photo_url?: string | null
          voice_url?: string | null
          ai_raw?: any | null
          food_labels?: string[] | null
          calories?: number | null
          macros?: {
            protein: number
            carbs: number
            fat: number
          } | null
          note?: string | null
          journal_mode?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
          photo_url?: string | null
          voice_url?: string | null
          ai_raw?: any | null
          food_labels?: string[] | null
          calories?: number | null
          macros?: {
            protein: number
            carbs: number
            fat: number
          } | null
          note?: string | null
          journal_mode?: boolean
          updated_at?: string
        }
      }
      insights: {
        Row: {
          id: string
          user_id: string
          period_start: string
          period_end: string
          summary_md: string | null
          tips_md: string | null
          metrics: {
            avgMood: number
            kcalTotal: number
            topFoods: string[]
            moodEntries: number
            foodEntries: number
          } | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          period_start: string
          period_end: string
          summary_md?: string | null
          tips_md?: string | null
          metrics?: {
            avgMood: number
            kcalTotal: number
            topFoods: string[]
            moodEntries: number
            foodEntries: number
          } | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          period_start?: string
          period_end?: string
          summary_md?: string | null
          tips_md?: string | null
          metrics?: {
            avgMood: number
            kcalTotal: number
            topFoods: string[]
            moodEntries: number
            foodEntries: number
          } | null
        }
      }
    }
  }
}

export function createSupabaseClient(req: Request) {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

export async function verifyUser(supabase: ReturnType<typeof createSupabaseClient>) {
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Unauthorized')
  }
  
  return user
}

export interface AIProvider {
  name: 'openai' | 'gemini'
  vision?: {
    model: string
    endpoint: string
  }
  speech?: {
    model: string
    endpoint: string
  }
  chat?: {
    model: string
    endpoint: string
  }
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  openai: {
    name: 'openai',
    vision: {
      model: 'gpt-4-vision-preview',
      endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    speech: {
      model: 'whisper-1',
      endpoint: 'https://api.openai.com/v1/audio/transcriptions'
    },
    chat: {
      model: 'gpt-4o-mini',
      endpoint: 'https://api.openai.com/v1/chat/completions'
    }
  },
  gemini: {
    name: 'gemini',
    vision: {
      model: 'gemini-1.5-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    },
    chat: {
      model: 'gemini-1.5-flash',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    }
  }
}

export async function callOpenAIVision(imageUrl: string, prompt: string): Promise<any> {
  const response = await fetch(AI_PROVIDERS.openai.vision!.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_PROVIDERS.openai.vision!.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  return await response.json()
}

export async function callGeminiVision(imageUrl: string, prompt: string): Promise<any> {
  // First, fetch the image and convert to base64
  const imageResponse = await fetch(imageUrl)
  const imageBuffer = await imageResponse.arrayBuffer()
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))

  const response = await fetch(`${AI_PROVIDERS.gemini.vision!.endpoint}?key=${Deno.env.get('GEMINI_API_KEY')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  return await response.json()
}

export async function callOpenAISpeech(audioUrl: string): Promise<any> {
  // Fetch the audio file
  const audioResponse = await fetch(audioUrl)
  const audioBlob = await audioResponse.blob()

  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.m4a')
  formData.append('model', AI_PROVIDERS.openai.speech!.model)

  const response = await fetch(AI_PROVIDERS.openai.speech!.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    body: formData
  })

  if (!response.ok) {
    throw new Error(`OpenAI Whisper API error: ${response.status}`)
  }

  return await response.json()
}

export async function callOpenAIChat(prompt: string): Promise<any> {
  const response = await fetch(AI_PROVIDERS.openai.chat!.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_PROVIDERS.openai.chat!.model,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI Chat API error: ${response.status}`)
  }

  return await response.json()
}

export async function callGeminiChat(prompt: string): Promise<any> {
  const response = await fetch(`${AI_PROVIDERS.gemini.chat!.endpoint}?key=${Deno.env.get('GEMINI_API_KEY')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  return await response.json()
}