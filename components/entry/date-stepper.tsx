'use client'

import { addDays, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DateStepperProps {
  date: string
  onDateChange: (value: string) => void
  maxDate?: string
}

export function DateStepper({
  date,
  onDateChange,
  maxDate = format(new Date(), 'yyyy-MM-dd'),
}: DateStepperProps) {
  const selectedDate = parseISO(date)
  const isInvalidDate = Number.isNaN(selectedDate.getTime())
  const isNextDisabled = date >= maxDate

  const shiftDate = (days: number) => {
    if (isInvalidDate) return
    const nextDate = format(addDays(selectedDate, days), 'yyyy-MM-dd')
    if (nextDate > maxDate) return
    onDateChange(nextDate)
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => shiftDate(-1)}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={date}
        max={maxDate}
        onChange={(event) => onDateChange(event.target.value)}
        className="w-full sm:w-44"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => shiftDate(1)}
        disabled={isNextDisabled}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => onDateChange(maxDate)}
        disabled={date === maxDate}
      >
        Today
      </Button>
    </div>
  )
}
