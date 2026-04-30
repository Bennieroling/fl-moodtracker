import React, { type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from './categories'
import { CATEGORY_ACCENT } from './categories'

interface DrillDownLinkProps {
  href: string
  label: string
  description?: string
  icon?: ReactNode
  category?: Category
  className?: string
}

export function DrillDownLink({
  href,
  label,
  description,
  icon,
  category,
  className,
}: DrillDownLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'group flex min-h-11 items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
        'hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
        className,
      )}
    >
      <span className="flex items-center gap-3">
        {icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60"
            style={category ? { color: CATEGORY_ACCENT[category] } : undefined}
          >
            {icon}
          </span>
        )}
        <span className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  )
}
