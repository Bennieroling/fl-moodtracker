'use client'

import React, { useId } from 'react'
import { cn } from '@/lib/utils'

interface SparklineProps {
  values: number[]
  color: string
  baseline?: number
  height?: number
  className?: string
}

const WIDTH = 200
const PADDING = 2

export function Sparkline({ values, color, baseline, height = 36, className }: SparklineProps) {
  const gradientId = useId()

  if (values.length < 2) {
    return (
      <div
        className={cn(
          'flex w-full items-center justify-center rounded-md text-[10px] text-muted-foreground/60',
          className,
        )}
        style={{ height }}
      >
        no data
      </div>
    )
  }

  const min = Math.min(...values, baseline ?? Number.POSITIVE_INFINITY)
  const max = Math.max(...values, baseline ?? Number.NEGATIVE_INFINITY)
  const range = max - min || 1

  const xFor = (i: number) => PADDING + (i / (values.length - 1)) * (WIDTH - 2 * PADDING)
  const yFor = (v: number) => height - PADDING - ((v - min) / range) * (height - 2 * PADDING)

  const linePoints = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ')
  const areaPoints = `${PADDING},${height} ${linePoints} ${WIDTH - PADDING},${height}`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-9 w-full', className)}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      {baseline !== undefined && (
        <line
          x1={0}
          x2={WIDTH}
          y1={yFor(baseline)}
          y2={yFor(baseline)}
          stroke="var(--border)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
