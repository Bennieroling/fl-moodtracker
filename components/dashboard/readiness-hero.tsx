'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ReadinessRing } from '@/app/(app)/insights/_components/readiness-ring'
import { useReadiness } from '@/hooks/useReadiness'

interface PillProps {
  label: string
  value: string
  unit?: string
}

function Pill({ label, value, unit }: PillProps) {
  return (
    <div className="rounded-2xl border bg-card/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold leading-none tracking-tight">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}

function loadLabel(minutes: number): string {
  if (minutes === 0) return 'Rest'
  if (minutes < 30) return 'Light'
  if (minutes < 60) return 'Steady'
  return 'Heavy'
}

function bandLabel(band: string): string {
  return band.charAt(0).toUpperCase() + band.slice(1)
}

export function ReadinessHero() {
  const { latest, loading, buildingBaseline, baselineDaysRemaining } = useReadiness(0)

  if (loading) return null

  if (!latest || buildingBaseline) {
    return (
      <Card>
        <div className="px-6 py-2">
          <p className="text-caption">Readiness</p>
          <p className="mt-3 text-lg font-semibold tracking-tight">Building your baseline</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {baselineDaysRemaining > 0
              ? `${baselineDaysRemaining} more day${baselineDaysRemaining === 1 ? '' : 's'} of HRV / resting HR data needed before scoring kicks in.`
              : 'Waiting for tonight’s detection run to write the first score.'}
          </p>
        </div>
      </Card>
    )
  }

  const { score, band, caption, components } = latest
  const sleep = components.sleep_hours
  const hrv = components.hrv
  const rhr = components.rhr
  const exerciseMins = components.exercise_minutes

  return (
    <Card className="relative overflow-hidden">
      <div className="grid grid-cols-1 gap-4 px-6 sm:grid-cols-[auto_1fr] sm:gap-6">
        <div className="flex justify-center sm:block">
          <ReadinessRing score={score} band={bandLabel(band)} size="md" className="mx-0 sm:mx-0" />
        </div>
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-caption">Readiness</p>
              {!components.has_data && (
                <Badge variant="outline" className="text-[10px]">
                  Sparse data
                </Badge>
              )}
            </div>
            <p className="mt-2 text-base italic text-muted-foreground leading-snug">{caption}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Pill
              label="Sleep"
              value={sleep != null ? sleep.toFixed(1) : '—'}
              unit={sleep != null ? 'h' : undefined}
            />
            <Pill
              label="HRV"
              value={hrv != null ? hrv.toFixed(0) : '—'}
              unit={hrv != null ? 'ms' : undefined}
            />
            <Pill
              label="Resting HR"
              value={rhr != null ? rhr.toFixed(0) : '—'}
              unit={rhr != null ? 'bpm' : undefined}
            />
            <Pill label="Load" value={loadLabel(exerciseMins)} />
          </div>

          <Link
            href="/insights?tab=readiness"
            className={cn(
              'inline-flex items-center gap-1.5 self-start font-mono text-[10px] uppercase',
              'tracking-wider text-[color:var(--chart-3)] hover:underline',
            )}
          >
            See full readiness
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </Card>
  )
}
