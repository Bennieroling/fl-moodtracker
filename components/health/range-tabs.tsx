'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { RangeMode } from '@/lib/range-utils'

interface RangeTabsProps {
  mode: RangeMode
  onModeChange: (mode: RangeMode) => void
  rangeLabel: string
  onShift?: (direction: -1 | 1) => void
  className?: string
}

const MODES: { value: RangeMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export function RangeTabs({ mode, onModeChange, rangeLabel, onShift, className }: RangeTabsProps) {
  return (
    <div className={cn('flex flex-col items-stretch gap-2', className)}>
      <Tabs value={mode} onValueChange={(v) => onModeChange(v as RangeMode)}>
        <TabsList className="h-11 w-full">
          {MODES.map((m) => (
            <TabsTrigger key={m.value} value={m.value} className="flex-1">
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {onShift ? (
          <button
            type="button"
            onClick={() => onShift(-1)}
            aria-label="Previous range"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
        <span className="font-medium tabular-nums">{rangeLabel}</span>
        {onShift ? (
          <button
            type="button"
            onClick={() => onShift(1)}
            aria-label="Next range"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
