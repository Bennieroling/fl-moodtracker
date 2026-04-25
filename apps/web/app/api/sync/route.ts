import { NextResponse } from 'next/server'
import { ApiError, handleApiError } from '@/lib/api-handler'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST() {
  const requestId = crypto.randomUUID()

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new ApiError(401, 'unauthorized')
    }

    const { data, error } = await supabase.rpc('sync_hae_to_production')

    if (error) {
      throw new ApiError(500, 'internal_error', error.message)
    }

    return NextResponse.json({ ok: true, message: data })
  } catch (error) {
    return handleApiError(error, requestId)
  }
}
