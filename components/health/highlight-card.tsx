'use client'

import React, { type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'
import type { Category } from './categories'
import { CATEGORY_ACCENT, CATEGORY_SPARK } from './categories'

interface HighlightCardProps {
  title: string
  category: Category
  href?: string
  primary: { value: string | number; unit?: string }
  secondary?: { value: string; muted?: boolean }
  sparkline?: { values: number[]; baseline?: number }
  icon?: ReactNode
  loading?: boolean
  empty?: { label: string }
  className?: string
}

const CARD_BASE =
  'group relative flex flex-col gap-3 rounded-4xl bg-card p-5 text-card-foreground shadow-card ring-1 ring-foreground/5 transition-shadow dark:ring-foreground/10'

export function HighlightCard({
  title,
  category,
  href,
  primary,
  secondary,
  sparkline,
  icon,
  loading,
  empty,
  className,
}: HighlightCardProps) {
  const accent = CATEGORY_ACCENT[category]
  const sparkColor = CATEGORY_SPARK[category]

  if (loading) {
    return (
      <div className={cn(CARD_BASE, className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span style={{ color: accent }} aria-hidden>
              {icon}
            </span>
          )}
          <p
            className="font-display text-[11px] font-medium uppercase tracking-widest"
            style={{ color: accent }}
          >
            {title}
          </p>
        </div>
        {href && (
          <ChevronRight
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{empty.label}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold leading-none tracking-tight tabular-nums">
              {typeof primary.value === 'number' ? primary.value.toLocaleString() : primary.value}
            </span>
            {primary.unit && <span className="text-sm text-muted-foreground">{primary.unit}</span>}
          </div>
          {secondary && (
            <p
              className={cn(
                'text-xs',
                (secondary.muted ?? true) ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {secondary.value}
            </p>
          )}
          {sparkline && sparkline.values.length > 0 && (
            <Sparkline
              values={sparkline.values}
              baseline={sparkline.baseline}
              color={sparkColor}
              className="mt-1"
            />
          )}
        </>
      )}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        aria-label={title}
        className={cn(
          CARD_BASE,
          'hover:shadow-card-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
          className,
        )}
      >
        {inner}
      </Link>
    )
  }

  return <div className={cn(CARD_BASE, className)}>{inner}</div>
}
