import { NextRequest, NextResponse } from 'next/server'
import {
  ApiError,
  apiHandler,
  handleApiError,
  jsonError,
} from '@/lib/api-handler'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  SignedURLRequestSchema,
  SignedURLResponseSchema,
} from '@/lib/validations'

const ALLOWED_BUCKETS = ['food-photos', 'voice-notes'] as const

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new ApiError(401, 'unauthorized')
  }

  return { supabase, user }
}

function assertAllowedPath(path: string, userId: string) {
  const userPrefix = `${userId}/`
  if (!path.startsWith(userPrefix)) {
    throw new ApiError(403, 'forbidden')
  }
}

export const POST = apiHandler(SignedURLRequestSchema, async (_request, parsed) => {
  if (!ALLOWED_BUCKETS.includes(parsed.bucket)) {
    throw new ApiError(400, 'invalid_bucket')
  }

  const { supabase, user } = await getAuthenticatedUser()
  assertAllowedPath(parsed.path, user.id)

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUploadUrl(parsed.path)

  if (error) {
    throw new ApiError(500, 'internal_error', error.message)
  }

  const expiresAt = new Date(Date.now() + parsed.expiresIn * 1000).toISOString()

  return NextResponse.json(
    SignedURLResponseSchema.parse({
      signedUrl: data.signedUrl,
      expiresAt,
    }),
  )
})

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const { searchParams } = new URL(request.url)
    const parsed = SignedURLRequestSchema.parse({
      bucket: searchParams.get('bucket'),
      path: searchParams.get('path'),
      expiresIn: searchParams.get('expiresIn')
        ? Number.parseInt(searchParams.get('expiresIn')!, 10)
        : 3600,
    })

    const { supabase, user } = await getAuthenticatedUser()
    assertAllowedPath(parsed.path, user.id)

    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, parsed.expiresIn)

    if (error) {
      throw new ApiError(500, 'internal_error', error.message)
    }

    const expiresAt = new Date(Date.now() + parsed.expiresIn * 1000).toISOString()

    return NextResponse.json(
      SignedURLResponseSchema.parse({
        signedUrl: data.signedUrl,
        expiresAt,
      }),
    )
  } catch (error) {
    return handleApiError(error, requestId)
  }
}

export async function PUT(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket')
    const path = searchParams.get('path')

    if (!bucket || !path) {
      return jsonError(400, 'invalid_input', requestId)
    }

    const parsed = SignedURLRequestSchema.pick({ bucket: true, path: true }).parse({
      bucket,
      path,
    })

    const { supabase, user } = await getAuthenticatedUser()
    assertAllowedPath(parsed.path, user.id)

    const file = await request.blob()
    if (!file || file.size === 0) {
      return jsonError(400, 'invalid_input', requestId)
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(parsed.bucket)
      .upload(parsed.path, file, {
        upsert: true,
        contentType: file.type,
      })

    if (uploadError) {
      throw new ApiError(500, 'internal_error', uploadError.message)
    }

    const { data: signedUrlData } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(uploadData.path, 3600)

    return NextResponse.json({
      success: true,
      path: uploadData.path,
      signedUrl: signedUrlData?.signedUrl ?? null,
      fullPath: uploadData.fullPath,
    })
  } catch (error) {
    return handleApiError(error, requestId)
  }
}
