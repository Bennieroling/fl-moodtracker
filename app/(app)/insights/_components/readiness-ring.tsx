'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ReadinessRingProps {
  score: number
  band: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const SIZE_CLASSES: Record<NonNullable<ReadinessRingProps['size']>, string> = {
  sm: 'h-36 w-36',
  md: 'h-48 w-48',
  lg: 'h-64 w-64',
}

const SCORE_TEXT: Record<NonNullable<ReadinessRingProps['size']>, string> = {
  sm: 'text-3xl',
  md: 'text-5xl',
  lg: 'text-6xl',
}

export function ReadinessRing({ score, band, size = 'lg', className }: ReadinessRingProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const id = window.setTimeout(() => setProgress(score), 80)
    return () => window.clearTimeout(id)
  }, [score])

  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, progress)) / 100)

  return (
    <div className={cn('relative mx-auto', SIZE_CLASSES[size], className)}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="var(--chart-3)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-bold leading-none tracking-tight tabular-nums', SCORE_TEXT[size])}
        >
          {Math.round(score)}
        </span>
        <span className="mt-2 text-caption text-[color:var(--chart-3)]">{band}</span>
      </div>
    </div>
  )
}
