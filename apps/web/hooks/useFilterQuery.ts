'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
  const serializedKey = JSON.stringify(queryKey)
  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const latestFetch = useRef(0)
  const fetcherRef = useRef(fetcher)
  const prevKeyRef = useRef(serializedKey)

  // Keep fetcher ref up to date without causing re-renders
  fetcherRef.current = fetcher

  const executeFetch = useCallback(async () => {
    const fetchId = Date.now()
    latestFetch.current = fetchId
    setLoading(true)
    setError(null)
    try {
      const result = await fetcherRef.current()
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
  }, []) // stable — uses ref for fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    // Only re-fetch when the serialized key actually changes by value
    if (prevKeyRef.current !== serializedKey) {
      prevKeyRef.current = serializedKey
    }
    executeFetch().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedKey, enabled])

  const refetch = useCallback(async () => {
    if (!enabled) return null
    return executeFetch()
  }, [enabled, executeFetch])

  return { data, loading, error, refetch }
}
