'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReadinessRing } from '@/app/(app)/insights/_components/readiness-ring'
import { RingHero } from '@/components/health'
import { useReadiness } from '@/hooks/useReadiness'

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
          <p className="font-display text-xs font-medium uppercase tracking-widest text-[color:var(--accent-readiness)]">
            Readiness
          </p>
          <p className="mt-3 font-display text-lg font-semibold tracking-tight">
            Building your baseline
          </p>
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
    <RingHero
      title="Readiness"
      category="readiness"
      ring={<ReadinessRing score={score} band={bandLabel(band)} size="md" />}
      caption={caption}
      badge={
        !components.has_data ? (
          <Badge variant="outline" className="text-[10px]">
            Sparse data
          </Badge>
        ) : undefined
      }
      pills={[
        {
          label: 'Sleep',
          value: sleep != null ? sleep.toFixed(1) : '—',
          unit: sleep != null ? 'h' : undefined,
        },
        {
          label: 'HRV',
          value: hrv != null ? hrv.toFixed(0) : '—',
          unit: hrv != null ? 'ms' : undefined,
        },
        {
          label: 'Resting HR',
          value: rhr != null ? rhr.toFixed(0) : '—',
          unit: rhr != null ? 'bpm' : undefined,
        },
        { label: 'Load', value: loadLabel(exerciseMins) },
      ]}
      href="/insights?tab=readiness"
      hrefLabel="See full readiness"
    />
  )
}
