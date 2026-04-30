import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/sync/route'
import { createServerSupabaseClient } from '@/lib/supabase-server'

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

const makeSupabase = (user: { id: string } | null, rpcResult = { data: 'ok', error: null }) =>
  ({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user }, error: user ? null : new Error('no session') }),
    },
    rpc: vi.fn().mockResolvedValue(rpcResult),
  }) as never

describe('POST /api/sync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabase(null))
    const res = await POST()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('calls sync_hae_to_production and returns ok', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ id: 'user-1' }, { data: 'synced', error: null }),
    )
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.message).toBe('synced')
  })

  it('returns 500 when rpc fails', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabase({ id: 'user-1' }, { data: 'synced', error: { message: 'db error' } as never }),
    )
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('sync_failed')
    expect(body.detail).toBe('db error')
  })
})
