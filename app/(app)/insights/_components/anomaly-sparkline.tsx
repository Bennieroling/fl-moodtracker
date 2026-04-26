'use client'

import { cn } from '@/lib/utils'

interface AnomalySparklineProps {
  values: (number | null)[]
  /** index of the highlighted (anomalous) point in `values` */
  highlightIndex: number
  /** baseline mean to draw a dashed mid-line */
  baseline: number
  /** ± half-width of the band shown around the baseline (e.g. 1σ) */
  bandHalfWidth: number
  kind: 'alert' | 'positive'
  className?: string
}

const WIDTH = 300
const HEIGHT = 80
const PADDING_Y = 6
const PADDING_X = 14

export function AnomalySparkline({
  values,
  highlightIndex,
  baseline,
  bandHalfWidth,
  kind,
  className,
}: AnomalySparklineProps) {
  const numeric = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null)

  if (numeric.length < 2) {
    return (
      <div
        className={cn(
          'flex h-20 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground',
          className,
        )}
      >
        Not enough data to draw
      </div>
    )
  }

  const min = Math.min(...numeric.map((p) => p.v), baseline - bandHalfWidth)
  const max = Math.max(...numeric.map((p) => p.v), baseline + bandHalfWidth)
  const range = max - min || 1

  const xFor = (i: number) =>
    values.length === 1
      ? WIDTH / 2
      : PADDING_X + (i / (values.length - 1)) * (WIDTH - 2 * PADDING_X)
  const yFor = (v: number) => HEIGHT - PADDING_Y - ((v - min) / range) * (HEIGHT - PADDING_Y * 2)

  const linePoints = numeric.map((p) => `${xFor(p.i)},${yFor(p.v)}`).join(' ')

  const bandTopY = yFor(baseline + bandHalfWidth)
  const bandBottomY = yFor(baseline - bandHalfWidth)
  const baselineY = yFor(baseline)

  const highlight = numeric.find((p) => p.i === highlightIndex)
  const dotStroke = kind === 'alert' ? 'var(--destructive)' : 'oklch(0.72 0.14 170)'

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('h-20 w-full', className)}
      aria-hidden
    >
      <rect
        x={0}
        y={Math.min(bandTopY, bandBottomY)}
        width={WIDTH}
        height={Math.abs(bandBottomY - bandTopY)}
        fill="var(--muted)"
        opacity={0.6}
      />
      <line
        x1={0}
        x2={WIDTH}
        y1={baselineY}
        y2={baselineY}
        stroke="var(--border)"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {highlight && (
        <circle
          cx={xFor(highlight.i)}
          cy={yFor(highlight.v)}
          r={5}
          fill="var(--card)"
          stroke={dotStroke}
          strokeWidth={2}
        />
      )}
    </svg>
  )
}
