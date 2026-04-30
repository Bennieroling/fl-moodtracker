'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MoodPicker, LogFoodCard } from '@/components/entry'
import { useLogEntries } from '@/hooks/useLogEntries'
import { cn } from '@/lib/utils'

interface LogFabProps {
  className?: string
}

export function LogFab({ className }: LogFabProps) {
  const [open, setOpen] = useState(false)
  const log = useLogEntries()
  const {
    selectedMood,
    currentMood,
    handleMoodSelect,
    selectedMeal,
    setSelectedMeal,
    handlePhotoAnalysis,
    handleVoiceAnalysis,
    handleTextAnalysis,
    handleManualSave,
    date,
  } = log

  const wrap =
    <T,>(fn: (arg: T) => Promise<void>) =>
    async (arg: T) => {
      await fn(arg)
      setOpen(false)
    }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Quick log entry"
          className={cn(
            'fixed right-4 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-card-lg ring-1 ring-foreground/10',
            'transition-transform hover:scale-105 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
            'md:right-6 md:bottom-6',
            className,
          )}
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Quick log</DialogTitle>
          <DialogDescription>Capture a mood or a meal in a few taps.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="font-display text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Mood
          </h3>
          <MoodPicker
            selectedMood={selectedMood ?? currentMood}
            onMoodSelect={wrap(handleMoodSelect)}
          />
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Food
          </h3>
          <LogFoodCard
            title="Log a meal"
            description="Photo, voice, or manual — close on save."
            selectedMeal={selectedMeal}
            onMealSelect={setSelectedMeal}
            date={date}
            onPhotoAnalysis={wrap(handlePhotoAnalysis)}
            onVoiceAnalysis={wrap(handleVoiceAnalysis)}
            onTextAnalysis={wrap(handleTextAnalysis)}
            onManualSave={wrap(handleManualSave)}
          />
        </section>

        <div className="flex items-center justify-end pt-2">
          <Link
            href="/log"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Open full log
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
