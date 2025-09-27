import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { 
  SignedURLRequestSchema, 
  SignedURLResponseSchema 
} from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    console.log('Storage API: Starting request processing')
    
    // Parse and validate request
    const body = await request.json()
    console.log('Storage API: Request body parsed')
    const validatedRequest = SignedURLRequestSchema.parse(body)
    console.log('Storage API: Request validated')

    // Verify authentication
    console.log('Storage API: Creating Supabase client')
    const supabase = await createServerSupabaseClient()
    console.log('Storage API: Getting user')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('Storage API: Auth error', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('Storage API: User authenticated, generating signed URL')

    // Validate bucket name
    const allowedBuckets = ['food-photos', 'voice-notes']
    if (!allowedBuckets.includes(validatedRequest.bucket)) {
      return NextResponse.json(
        { error: 'Invalid bucket name' },
        { status: 400 }
      )
    }

    // Ensure the path is user-specific (security measure)
    const userPrefix = `${user.id}/`
    const safePath = validatedRequest.path.startsWith(userPrefix) 
      ? validatedRequest.path 
      : userPrefix + validatedRequest.path

    // Generate signed URL for upload
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(validatedRequest.bucket)
      .createSignedUploadUrl(safePath, {
        upsert: true
      })

    if (signedUrlError) {
      console.error('Supabase signed URL error:', signedUrlError)
      return NextResponse.json(
        { error: 'Failed to generate signed URL' },
        { status: 500 }
      )
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + validatedRequest.expiresIn * 1000).toISOString()

    const response = SignedURLResponseSchema.parse({
      signedUrl: signedUrlData.signedUrl,
      expiresAt
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('Storage Sign API error:', error)
    
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

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket')
    const path = searchParams.get('path')
    const expiresIn = searchParams.get('expiresIn')

    if (!bucket || !path) {
      return NextResponse.json(
        { error: 'Missing required parameters: bucket, path' },
        { status: 400 }
      )
    }

    // Validate parameters using schema
    const validatedRequest = SignedURLRequestSchema.parse({
      bucket,
      path,
      expiresIn: expiresIn ? parseInt(expiresIn) : 3600
    })

    // Verify authentication
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Ensure the path is user-specific (security measure)
    const userPrefix = `${user.id}/`
    if (!validatedRequest.path.startsWith(userPrefix)) {
      return NextResponse.json(
        { error: 'Access denied - invalid path' },
        { status: 403 }
      )
    }

    // Generate signed URL for download
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(validatedRequest.bucket)
      .createSignedUrl(validatedRequest.path, validatedRequest.expiresIn)

    if (signedUrlError) {
      console.error('Supabase signed URL error:', signedUrlError)
      return NextResponse.json(
        { error: 'Failed to generate signed URL' },
        { status: 500 }
      )
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + validatedRequest.expiresIn * 1000).toISOString()

    const response = SignedURLResponseSchema.parse({
      signedUrl: signedUrlData.signedUrl,
      expiresAt
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('Storage Sign API error:', error)
    
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

// Handle file upload directly to Supabase Storage
export async function PUT(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket')
    const path = searchParams.get('path')

    if (!bucket || !path) {
      return NextResponse.json(
        { error: 'Missing required parameters: bucket, path' },
        { status: 400 }
      )
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

    // Ensure the path is user-specific
    const userPrefix = `${user.id}/`
    const safePath = path.startsWith(userPrefix) ? path : userPrefix + path

    // Get file from request body
    const file = await request.blob()
    
    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(safePath, file, {
        upsert: true,
        contentType: file.type
      })

    if (uploadError) {
      console.error('Supabase upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Generate a signed URL for accessing the uploaded file
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(uploadData.path, 3600) // 1 hour expiry

    if (signedUrlError) {
      console.warn('Failed to generate signed URL after upload:', signedUrlError)
    }

    return NextResponse.json({
      success: true,
      path: uploadData.path,
      signedUrl: signedUrlData?.signedUrl || null,
      fullPath: uploadData.fullPath
    })

  } catch (error) {
    console.error('Storage Upload API error:', error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}