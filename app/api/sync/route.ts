import { NextResponse } from 'next/server'
import { ApiError, handleApiError } from '@/lib/api-handler'
import { logger } from '@/lib/logger'
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
      // Surface the SQL error detail to the client. Personal-use single-user
      // app — the visibility tradeoff is fine, and the alternative (generic
      // 500) makes debugging the manual sync button impossible without
      // server-log access.
      logger.error('sync_hae_to_production rpc failed', {
        requestId,
        message: error.message,
        details: error.details ?? null,
        hint: error.hint ?? null,
        code: error.code ?? null,
      })
      return NextResponse.json(
        {
          error: 'sync_failed',
          requestId,
          detail: error.message,
          code: error.code ?? null,
          hint: error.hint ?? null,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, message: data })
  } catch (error) {
    return handleApiError(error, requestId)
  }
}
