'use client'

import { format, parseISO } from 'date-fns'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RangeMode } from '@/lib/range-utils'

interface RangeControlsProps {
  mode: RangeMode
  anchorDate: string
  rangeLabel: string
  rangeStartDate: string
  rangeEndDate: string
  onModeChange: (mode: RangeMode) => void
  onAnchorDateChange: (date: Date) => void
  onShift: (direction: number) => void
  title?: string
  description?: string
}

export function RangeControls({
  mode,
  anchorDate,
  rangeLabel,
  rangeStartDate,
  rangeEndDate,
  onModeChange,
  onAnchorDateChange,
  onShift,
  title = 'Data Controls',
  description = 'Choose the date granularity and anchor date.',
}: RangeControlsProps) {
  const anchorDateObj = parseISO(anchorDate)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const rangeIncludesToday = todayStr >= rangeStartDate && todayStr <= rangeEndDate

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(value) => onModeChange(value as RangeMode)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onShift(-1)}
            aria-label="Previous range"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4" />
                <span>{rangeLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-0">
              <Calendar
                mode="single"
                selected={anchorDateObj}
                onSelect={(date) => date && onAnchorDateChange(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => onShift(1)} aria-label="Next range">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!rangeIncludesToday && (
            <Button variant="outline" onClick={() => onAnchorDateChange(new Date())}>
              Today
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
