import React, { type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from './categories'
import { CATEGORY_ACCENT } from './categories'

interface CategoryHeaderProps {
  category: Category
  title: string
  primary: { value: string; unit?: string }
  delta?: { value: string; trend: 'up' | 'down' | 'flat'; label?: string }
  description?: ReactNode
  back?: { href: string; label?: string }
  action?: ReactNode
  className?: string
  sticky?: boolean
}

const TREND_META = {
  up: { Icon: ArrowUpRight, color: 'text-emerald-600 dark:text-emerald-400' },
  down: { Icon: ArrowDownRight, color: 'text-red-600 dark:text-red-400' },
  flat: { Icon: Minus, color: 'text-muted-foreground' },
} as const

export function CategoryHeader({
  category,
  title,
  primary,
  delta,
  description,
  back,
  action,
  className,
  sticky = true,
}: CategoryHeaderProps) {
  const accent = CATEGORY_ACCENT[category]

  return (
    <header
      className={cn(
        '-mx-4 px-4 pb-3 pt-3',
        sticky && 'sticky top-14 z-30 bg-background/85 backdrop-blur',
        className,
      )}
    >
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {back.label ?? 'Back'}
        </Link>
      )}

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="font-display text-xs font-medium uppercase tracking-widest"
            style={{ color: accent }}
          >
            {title}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">
              {primary.value}
            </span>
            {primary.unit && (
              <span className="text-base text-muted-foreground">{primary.unit}</span>
            )}
            {delta && <DeltaChip trend={delta.trend} value={delta.value} label={delta.label} />}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}

function DeltaChip({ trend, value, label }: NonNullable<CategoryHeaderProps['delta']>) {
  const { Icon, color } = TREND_META[trend]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium tabular-nums',
        color,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {value}
      {label && <span className="text-muted-foreground"> {label}</span>}
    </span>
  )
}
