import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/storage/sign/route'
import { createServerSupabaseClient } from '@/lib/supabase-server'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const makeSupabase = ({
  userId = 'user-1',
  authed = true,
  uploadUrl = 'https://example.supabase.co/upload',
  readUrl = 'https://example.supabase.co/read',
  storageError = null as null | { message: string },
} = {}) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: authed ? { id: userId } : null },
      error: authed ? null : new Error('no session'),
    }),
  },
  storage: {
    from: vi.fn().mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: storageError ? null : { signedUrl: uploadUrl },
        error: storageError,
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: storageError ? null : { signedUrl: readUrl },
        error: storageError,
      }),
    }),
  },
})

const postRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/storage/sign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

describe('POST /api/storage/sign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a signed upload URL for a user-scoped path', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const req = postRequest({
      bucket: 'food-photos',
      path: 'user-1/meals/lunch.jpg',
      expiresIn: 600,
    })
    const res = await POST(req)
    const payload = await res.json()
    expect(res.status).toBe(200)
    expect(payload.signedUrl).toBe('https://example.supabase.co/upload')
    expect(payload.expiresAt).toBeTypeOf('string')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ authed: false }) as never,
    )
    const req = postRequest({ bucket: 'food-photos', path: 'user-1/photo.jpg' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when path does not start with user-id', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const req = postRequest({ bucket: 'food-photos', path: 'other-user/photo.jpg' })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 on invalid request body', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const req = postRequest({ bucket: 'unknown-bucket', path: 'user-1/x.jpg' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when storage returns an error', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ storageError: { message: 'storage failure' } }) as never,
    )
    const req = postRequest({ bucket: 'food-photos', path: 'user-1/photo.jpg' })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('GET /api/storage/sign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a signed read URL for a user-scoped path', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase() as never)
    const req = new NextRequest(
      'http://localhost/api/storage/sign?bucket=food-photos&path=user-1/photo.jpg&expiresIn=600',
    )
    const res = await GET(req)
    const payload = await res.json()
    expect(res.status).toBe(200)
    expect(payload.signedUrl).toBe('https://example.supabase.co/read')
  })

  it('returns 401 for unauthenticated GET', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ authed: false }) as never,
    )
    const req = new NextRequest(
      'http://localhost/api/storage/sign?bucket=food-photos&path=user-1/photo.jpg',
    )
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
