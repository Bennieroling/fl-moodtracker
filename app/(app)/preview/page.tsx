'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePreviewData } from '@/hooks/usePreviewData'
import { ReadinessView } from './_components/readiness-view'
import { WhatChangedView } from './_components/what-changed-view'
import { AnomaliesView } from './_components/anomalies-view'

const VALID_TABS = ['readiness', 'changed', 'anomalies'] as const
type TabValue = (typeof VALID_TABS)[number]

function isTabValue(value: string | null): value is TabValue {
  return value !== null && (VALID_TABS as readonly string[]).includes(value)
}

function PreviewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = useMemo<TabValue>(() => {
    const param = searchParams.get('tab')
    return isTabValue(param) ? param : 'readiness'
  }, [searchParams])
  const [tab, setTab] = useState<TabValue>(initialTab)

  // Keep tab state in sync if the URL changes (e.g. user back-navigates).
  useEffect(() => {
    if (initialTab !== tab) setTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab])

  const handleTabChange = (next: string) => {
    if (!isTabValue(next)) return
    setTab(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'readiness') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(`/preview${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  const { data, loading, error } = usePreviewData()

  return (
    <div className="space-y-6 px-4 md:px-0">
      <div className="space-y-1">
        <p className="text-caption">Feature preview</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Three ideas, in Pulse&apos;s style
        </h1>
        <p className="text-sm text-muted-foreground">
          Mockups wired to your real data where it&apos;s easy. Flip between the tabs to compare.
          None of these are shipped yet.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="changed">What Changed</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-16">
              <div
                className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"
                aria-hidden
              />
              <p className="text-sm text-muted-foreground">Pulling your last 60 days…</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
              Couldn&apos;t load preview data: {error.message}
            </div>
          ) : (
            <>
              <TabsContent value="readiness">
                <ReadinessView />
              </TabsContent>
              <TabsContent value="changed">
                <WhatChangedView data={data} />
              </TabsContent>
              <TabsContent value="anomalies">
                <AnomaliesView data={data} />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center space-y-3 py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"
            aria-hidden
          />
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  )
}
