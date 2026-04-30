'use client'

import React, { type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { MetricChip } from './metric-chip'
import type { Category } from './categories'
import { CATEGORY_ACCENT } from './categories'

interface RingHeroPill {
  label: string
  value: string
  unit?: string
}

interface RingHeroProps {
  title: string
  category?: Category
  ring: ReactNode
  caption?: ReactNode
  badge?: ReactNode
  pills: RingHeroPill[]
  href?: string
  hrefLabel?: string
  className?: string
}

export function RingHero({
  title,
  category = 'readiness',
  ring,
  caption,
  badge,
  pills,
  href,
  hrefLabel = 'See details',
  className,
}: RingHeroProps) {
  const accent = CATEGORY_ACCENT[category]

  return (
    <Card className={cn('relative overflow-hidden shadow-card', className)}>
      <div className="grid grid-cols-1 gap-4 px-6 sm:grid-cols-[auto_1fr] sm:gap-6">
        <div className="flex justify-center sm:block">{ring}</div>
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p
                className="font-display text-xs font-medium uppercase tracking-widest"
                style={{ color: accent }}
              >
                {title}
              </p>
              {badge}
            </div>
            {caption && (
              <p className="mt-2 text-base italic leading-snug text-muted-foreground">{caption}</p>
            )}
          </div>

          {pills.length > 0 && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {pills.map((p) => (
                <MetricChip key={p.label} label={p.label} value={p.value} unit={p.unit} />
              ))}
            </div>
          )}

          {href && (
            <Link
              href={href}
              className={cn(
                'inline-flex items-center gap-1.5 self-start font-display text-[10px] uppercase tracking-wider',
                'hover:underline',
              )}
              style={{ color: accent }}
            >
              {hrefLabel}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}
