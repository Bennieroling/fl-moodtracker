import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MetricTileProps {
  label: string
  value: string | number | null | undefined
  unit?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  progress?: { current: number; target: number }
  size?: 'sm' | 'md' | 'lg'
  pending?: boolean
  className?: string
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'string') return value
  return value.toLocaleString()
}

export function MetricTile({
  label,
  value,
  unit,
  icon,
  trend,
  progress,
  size = 'md',
  pending,
  className,
}: MetricTileProps) {
  const displayValue = pending ? 'Pending' : formatValue(value)

  const valueSizeClass = {
    sm: 'text-xl font-bold',
    md: 'text-3xl font-bold',
    lg: 'text-4xl font-bold leading-none',
  }[size]

  const progressPct = progress
    ? Math.min((progress.current / progress.target) * 100, 100)
    : null

  return (
    <div className={cn('rounded-2xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <p className={valueSizeClass}>{displayValue}</p>
        {unit && value != null && !pending && (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
        {trend && trend !== 'neutral' && (
          <span className={cn(
            'text-xs font-medium',
            trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}>
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
      {progressPct !== null && (
        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progress && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Goal: {progress.target.toLocaleString()}{unit ? ` ${unit}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
