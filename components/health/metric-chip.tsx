import React from 'react'
import type { Category } from './categories'
import { CATEGORY_ACCENT } from './categories'
import { cn } from '@/lib/utils'

interface MetricChipProps {
  label: string
  value: string
  unit?: string
  tone?: 'default' | 'muted' | Category
  className?: string
}

export function MetricChip({ label, value, unit, tone = 'default', className }: MetricChipProps) {
  const isCategory = tone !== 'default' && tone !== 'muted'
  const labelColor = isCategory ? { color: CATEGORY_ACCENT[tone as Category] } : undefined

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card/40 px-3 py-2',
        tone === 'muted' && 'bg-muted/40',
        className,
      )}
    >
      <p
        className={cn(
          'font-display text-[10px] uppercase tracking-wider',
          !isCategory && 'text-muted-foreground',
        )}
        style={labelColor}
      >
        {label}
      </p>
      <p className="mt-1 text-base font-semibold leading-none tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}
