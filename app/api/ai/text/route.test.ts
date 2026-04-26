import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/text/route'
import { createServerSupabaseClient } from '@/lib/supabase-server'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const UUID = '00000000-0000-4000-8000-000000000001'
const TEXT = 'I had oatmeal with banana and coffee for breakfast'

const makeSupabase = (userId: string | null) =>
  ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error('no session'),
      }),
    },
  }) as never

const makeRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/ai/text', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

const openAIResponse = {
  meal: 'breakfast',
  foods: [{ label: 'oatmeal', confidence: 0.95, quantity: '1 bowl' }],
  nutrition: { calories: 350, macros: { protein: 10, carbs: 60, fat: 7 } },
  normalized_text: 'Oatmeal with banana and coffee',
}

describe('POST /api/ai/text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(null))
    const req = makeRequest({ text: TEXT, userId: UUID })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 400 on invalid request body', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(UUID))
    const req = makeRequest({ text: 'short', userId: UUID }) // text too short
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_input')
  })

  it('returns 403 when userId does not match authenticated user', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase('different-user-id'))
    const req = makeRequest({ text: TEXT, userId: UUID })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 200 with analysis on success', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(UUID))
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(openAIResponse) } }],
      }),
    } as never)

    const req = makeRequest({ text: TEXT, userId: UUID })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.meal).toBe('breakfast')
    expect(body.provider).toBe('openai')

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
