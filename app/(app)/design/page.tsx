'use client'

import { useState } from 'react'
import { Activity, Footprints, HeartPulse, Moon, Scale, Smile, UtensilsCrossed } from 'lucide-react'
import {
  CategoryHeader,
  DrillDownLink,
  HighlightCard,
  MetricChip,
  MotionFade,
  RangeTabs,
  RingHero,
  Sparkline,
} from '@/components/health'
import { ReadinessRing } from '@/app/(app)/insights/_components/readiness-ring'
import { PageHeader } from '@/components/page-header'
import type { RangeMode } from '@/lib/range-utils'

export default function DesignPreviewPage() {
  const [mode, setMode] = useState<RangeMode>('week')

  return (
    <div className="container mx-auto space-y-10 py-6">
      <PageHeader
        title="Design"
        description="Visual sandbox for the components/health primitives. Not part of the production app surface."
      />

      <Section title="HighlightCard">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <HighlightCard
            title="Activity"
            category="activity"
            href="/exercise"
            icon={<Footprints className="h-4 w-4" />}
            primary={{ value: 8432, unit: 'steps' }}
            secondary={{ value: '42 min · 8.2 km' }}
            sparkline={{ values: [4500, 6100, 9300, 7200, 11000, 7500, 8432] }}
          />
          <HighlightCard
            title="Sleep"
            category="sleep"
            href="/health#sleep"
            icon={<Moon className="h-4 w-4" />}
            primary={{ value: '7h 12m' }}
            secondary={{ value: 'Deep 1h 18m · REM 1h 32m' }}
            sparkline={{ values: [6.5, 7.0, 7.4, 6.8, 7.2, 6.5, 7.2] }}
          />
          <HighlightCard
            title="Mood & State"
            category="mood"
            href="/charts"
            icon={<Smile className="h-4 w-4" />}
            primary={{ value: 'Calm' }}
            secondary={{ value: 'Valence +0.4' }}
            sparkline={{ values: [3, 4, 4, 3, 5, 4, 4] }}
          />
          <HighlightCard
            title="Body"
            category="body"
            href="/health#body"
            icon={<Scale className="h-4 w-4" />}
            primary={{ value: 81.4, unit: 'kg' }}
            secondary={{ value: 'BF 18% · BMI 23.1' }}
            sparkline={{ values: [82.1, 82.0, 81.8, 81.6, 81.5, 81.5, 81.4] }}
          />
          <HighlightCard
            title="Nutrition"
            category="nutrition"
            href="/log"
            icon={<UtensilsCrossed className="h-4 w-4" />}
            primary={{ value: 1840, unit: 'kcal' }}
            secondary={{ value: 'Goal 2300, 460 left' }}
            sparkline={{ values: [2100, 1800, 2200, 1950, 1700, 2050, 1840] }}
          />
          <HighlightCard
            title="Vitals"
            category="vitals"
            icon={<HeartPulse className="h-4 w-4" />}
            primary={{ value: '—' }}
            empty={{ label: 'No vitals recorded today' }}
          />
        </div>
      </Section>

      <Section title="HighlightCard — loading state">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <HighlightCard title="Activity" category="activity" primary={{ value: '—' }} loading />
          <HighlightCard title="Sleep" category="sleep" primary={{ value: '—' }} loading />
          <HighlightCard title="Vitals" category="vitals" primary={{ value: '—' }} loading />
        </div>
      </Section>

      <Section title="RingHero">
        <RingHero
          title="Readiness"
          category="readiness"
          ring={<ReadinessRing score={78} band="Steady" size="md" />}
          caption="You're holding a steady baseline — sleep is the main lever today."
          pills={[
            { label: 'Sleep', value: '7.2', unit: 'h' },
            { label: 'HRV', value: '54', unit: 'ms' },
            { label: 'Resting HR', value: '58', unit: 'bpm' },
            { label: 'Load', value: 'Steady' },
          ]}
          href="/insights?tab=readiness"
          hrefLabel="See full readiness"
        />
      </Section>

      <Section title="CategoryHeader">
        <CategoryHeader
          category="activity"
          title="Activity"
          primary={{ value: '8,432', unit: 'steps' }}
          delta={{ value: '+12%', trend: 'up', label: 'vs last week' }}
          description="42 minutes of exercise · 8.2 km moved"
          back={{ href: '/dashboard', label: 'Back' }}
          sticky={false}
        />
      </Section>

      <Section title="RangeTabs">
        <RangeTabs
          mode={mode}
          onModeChange={setMode}
          rangeLabel={mode === 'day' ? 'Apr 30, 2026' : 'Apr 24 – Apr 30, 2026'}
          onShift={() => undefined}
        />
      </Section>

      <Section title="MetricChip">
        <div className="flex flex-wrap gap-2">
          <MetricChip label="Sleep" value="7.2" unit="h" />
          <MetricChip label="HRV" value="54" unit="ms" tone="vitals" />
          <MetricChip label="Mood" value="Calm" tone="mood" />
          <MetricChip label="Steps" value="8,432" tone="activity" />
          <MetricChip label="Idle" value="—" tone="muted" />
        </div>
      </Section>

      <Section title="Sparkline">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PreviewBox label="activity">
            <Sparkline
              values={[4500, 6100, 9300, 7200, 11000, 7500, 8432]}
              color="var(--spark-activity)"
            />
          </PreviewBox>
          <PreviewBox label="sleep">
            <Sparkline
              values={[6.5, 7, 7.4, 6.8, 7.2, 6.5, 7.2]}
              color="var(--spark-sleep)"
              baseline={7}
            />
          </PreviewBox>
          <PreviewBox label="empty">
            <Sparkline values={[]} color="var(--spark-mood)" />
          </PreviewBox>
        </div>
      </Section>

      <Section title="DrillDownLink">
        <div className="grid grid-cols-1 gap-2 rounded-2xl border bg-card p-2 md:grid-cols-2">
          <DrillDownLink
            href="/exercise"
            label="Activity"
            description="Workouts, HR zones, trends"
            icon={<Activity className="h-4 w-4" />}
            category="activity"
          />
          <DrillDownLink
            href="/health"
            label="Vitals & body"
            description="Sleep, HRV, body composition"
            icon={<HeartPulse className="h-4 w-4" />}
            category="vitals"
          />
        </div>
      </Section>

      <Section title="MotionFade">
        <MotionFade>
          <div className="rounded-4xl bg-card p-6 shadow-card ring-1 ring-foreground/5 dark:ring-foreground/10">
            <p className="font-display text-lg font-semibold">Fades in on mount</p>
            <p className="text-sm text-muted-foreground">
              No-op when prefers-reduced-motion is set.
            </p>
          </div>
        </MotionFade>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function PreviewBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
