import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/storage/sign/route'
import { createServerSupabaseClient } from '@/lib/supabase-server'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

describe('POST /api/storage/sign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a signed upload URL for a user-scoped path', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/upload' },
      error: null,
    })

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUploadUrl,
        }),
      },
    } as never)

    const request = new NextRequest('http://localhost/api/storage/sign', {
      method: 'POST',
      body: JSON.stringify({
        bucket: 'food-photos',
        path: 'user-1/meals/lunch.jpg',
        expiresIn: 600,
      }),
      headers: {
        'content-type': 'application/json',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.signedUrl).toBe('https://example.supabase.co/upload')
    expect(payload.expiresAt).toBeTypeOf('string')
    expect(createSignedUploadUrl).toHaveBeenCalledWith('user-1/meals/lunch.jpg')
  })
})
