'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function HomePage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const hasRedirected = useRef(false)

  const target = useMemo(() => {
    if (loading) return null
    return user ? '/dashboard' : '/login'
  }, [loading, user])

  useEffect(() => {
    if (!target || hasRedirected.current) return
    hasRedirected.current = true
    router.replace(target)
  }, [target, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
      <div className="text-center space-y-1">
        <p className="font-medium">
          {loading
            ? 'Checking your session...'
            : `Redirecting to ${target === '/dashboard' ? 'your dashboard' : 'login'}...`}
        </p>
        {!loading && (
          <p className="text-sm text-muted-foreground">
            If this takes too long, please refresh the page.
          </p>
        )}
      </div>
    </div>
  )
}
