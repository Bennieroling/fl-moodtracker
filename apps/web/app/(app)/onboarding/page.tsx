'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Camera, Mic, Sparkles, Type, Check } from 'lucide-react'
import { format } from 'date-fns'

import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase-browser'
import { StandardCardHeader } from '@/components/ui/standard-card-header'

const LOGGING_METHODS = ['photo', 'voice', 'text', 'manual'] as const
type LoggingMethod = (typeof LOGGING_METHODS)[number]

export default function OnboardingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState(1)
  const [preferredMethod, setPreferredMethod] = useState<LoggingMethod>('photo')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [loading, setLoading] = useState(false)

  const finishOnboarding = async () => {
    if (!user?.id) return
    setLoading(true)
    const storageKey = `sofi:onboarding:completed:${user.id}`
    const payload = {
      completedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx"),
      preferredMethod,
      reminderTime,
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            onboarding_completed: true,
            onboarding_preferred_method: preferredMethod,
            onboarding_completed_at: new Date().toISOString(),
            reminder_time: reminderTime,
            reminder_enabled: true,
          },
          { onConflict: 'user_id' }
        )
      if (error) throw error
      // Cache hint so the dashboard redirect check can skip a round-trip.
      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch (err) {
      console.error('Failed to persist onboarding completion', err)
    } finally {
      setLoading(false)
      router.replace('/dashboard')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome to Sofi"
        description="Quick setup to personalize logging and reminders."
      />

      <Card>
        <StandardCardHeader
          title={`Step ${step} of 3`}
          description={
            step === 1
              ? 'Choose your preferred way to log meals.'
              : step === 2
                ? 'Set a reminder time for consistent tracking.'
                : 'Log your first meal to complete onboarding.'
          }
        />
        <CardContent className="space-y-6">
          {step === 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant={preferredMethod === 'photo' ? 'default' : 'outline'} className="justify-start" onClick={() => setPreferredMethod('photo')}>
                <Camera className="h-4 w-4 mr-2" />
                Photo
              </Button>
              <Button variant={preferredMethod === 'voice' ? 'default' : 'outline'} className="justify-start" onClick={() => setPreferredMethod('voice')}>
                <Mic className="h-4 w-4 mr-2" />
                Voice
              </Button>
              <Button variant={preferredMethod === 'text' ? 'default' : 'outline'} className="justify-start" onClick={() => setPreferredMethod('text')}>
                <Type className="h-4 w-4 mr-2" />
                Text
              </Button>
              <Button variant={preferredMethod === 'manual' ? 'default' : 'outline'} className="justify-start" onClick={() => setPreferredMethod('manual')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Manual
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <Label htmlFor="reminder-time">Daily reminder time</Label>
              <Input
                id="reminder-time"
                type="time"
                value={reminderTime}
                onChange={(event) => setReminderTime(event.target.value)}
                className="max-w-xs"
              />
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Bell className="h-4 w-4" />
                You can change this later in Profile.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You are ready. The next screen opens Dashboard so you can log your first meal immediately.
              </p>
              <Button type="button" variant="secondary" onClick={() => router.push('/dashboard')}>
                <Check className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" disabled={step === 1} onClick={() => setStep((prev) => Math.max(1, prev - 1))}>
              Back
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={() => setStep((prev) => Math.min(3, prev + 1))}>
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={finishOnboarding} disabled={loading}>
                {loading ? 'Saving...' : 'Finish'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
