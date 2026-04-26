import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, handleApiError, jsonError, parseJsonBody } from '@/lib/api-handler'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

describe('ApiError', () => {
  it('stores status and code', () => {
    const err = new ApiError(404, 'not_found')
    expect(err.status).toBe(404)
    expect(err.code).toBe('not_found')
    expect(err.name).toBe('ApiError')
  })

  it('uses custom message when provided', () => {
    const err = new ApiError(400, 'bad', 'custom message')
    expect(err.message).toBe('custom message')
  })

  it('falls back to code as message', () => {
    const err = new ApiError(401, 'unauthorized')
    expect(err.message).toBe('unauthorized')
  })
})

describe('jsonError', () => {
  it('returns response with correct status and body', async () => {
    const res = jsonError(400, 'invalid_input', 'req-1')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'invalid_input', requestId: 'req-1' })
  })

  it('merges extra init fields into body', async () => {
    const res = jsonError(422, 'unprocessable', 'req-2', { detail: 'field x' })
    const body = await res.json()
    expect(body.detail).toBe('field x')
  })
})

describe('handleApiError', () => {
  it('returns ApiError status for client errors', async () => {
    const err = new ApiError(403, 'forbidden')
    const res = handleApiError(err, 'req-1')
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  it('returns 400 for ZodError', async () => {
    const schema = z.object({ name: z.string() })
    let zodErr: unknown
    try {
      schema.parse({ name: 42 })
    } catch (e) {
      zodErr = e
    }
    const res = handleApiError(zodErr, 'req-2')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_input')
  })

  it('returns 400 for SyntaxError', async () => {
    const res = handleApiError(new SyntaxError('bad json'), 'req-3')
    expect(res.status).toBe(400)
  })

  it('returns 500 for unknown errors', async () => {
    const res = handleApiError(new Error('unexpected'), 'req-4')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal_error')
  })
})

describe('parseJsonBody', () => {
  const schema = z.object({ value: z.number() })

  it('parses valid JSON body', async () => {
    const req = new NextRequest('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({ value: 42 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const result = await parseJsonBody(req, schema)
    expect(result.value).toBe(42)
  })

  it('throws ZodError on invalid body shape', async () => {
    const req = new NextRequest('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify({ value: 'not-a-number' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(parseJsonBody(req, schema)).rejects.toThrow(z.ZodError)
  })
})
