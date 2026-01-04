'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface FilterQueryOptions<T> {
  enabled?: boolean
  initialData?: T
}

interface FilterQueryState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<T | null>
}

export function useFilterQuery<T>(
  queryKey: unknown[],
  fetcher: () => Promise<T>,
  options?: FilterQueryOptions<T>
): FilterQueryState<T> {
  const { enabled = true, initialData = null } = options ?? {}
  const serializedKey = useMemo(() => JSON.stringify(queryKey), [queryKey])
  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const latestFetch = useRef(0)

  const executeFetch = useCallback(async () => {
    const fetchId = Date.now()
    latestFetch.current = fetchId
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (latestFetch.current === fetchId) {
        setData(result)
        setLoading(false)
      }
      return result
    } catch (err) {
      if (latestFetch.current === fetchId) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
      throw err
    }
  }, [fetcher])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    executeFetch().catch(() => {
      // errors already handled in executeFetch
    })
  }, [serializedKey, enabled, executeFetch])

  const refetch = useCallback(async () => {
    if (!enabled) return null
    return executeFetch()
  }, [enabled, executeFetch])

  return { data, loading, error, refetch }
}
