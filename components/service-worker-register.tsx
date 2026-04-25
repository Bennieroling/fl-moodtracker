'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(buildId)}`, { scope: '/' })
        .then((reg) => console.log('SW registered:', reg.scope))
        .catch((err) => console.error('SW registration failed:', err))
    }
  }, [])

  return null
}
