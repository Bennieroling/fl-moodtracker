import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ApiError'
  }
}

export interface ApiContext {
  requestId: string
}

type JsonHandler<T> = (
  request: NextRequest,
  parsed: T,
  context: ApiContext,
) => Promise<Response>

export function jsonError(
  status: number,
  error: string,
  requestId: string,
  init?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error, requestId, ...init },
    { status },
  )
}

export function captureApiException(error: unknown, requestId: string) {
  console.error(`[${requestId}]`, error)
}

export function handleApiError(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      captureApiException(error, requestId)
    }
    return jsonError(error.status, error.code, requestId)
  }

  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return jsonError(400, 'invalid_input', requestId)
  }

  captureApiException(error, requestId)
  return jsonError(500, 'internal_error', requestId)
}

export async function parseJsonBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>,
) {
  const body = await request.json()
  return schema.parse(body)
}

export function apiHandler<T>(
  schema: z.ZodSchema<T>,
  handler: JsonHandler<T>,
) {
  return async (request: NextRequest) => {
    const requestId = crypto.randomUUID()

    try {
      const parsed = await parseJsonBody(request, schema)
      return await handler(request, parsed, { requestId })
    } catch (error) {
      return handleApiError(error, requestId)
    }
  }
}
