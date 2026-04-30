import type { ReactNode } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'warn' | 'alert' | 'info'

interface SoftBannerProps {
  tone?: Tone
  title: string
  description?: ReactNode
  onDismiss?: () => void
  className?: string
  icon?: ReactNode
}

const TONE_STYLES: Record<Tone, { bg: string; text: string; iconClass: string }> = {
  warn: {
    bg: 'bg-[color:var(--accent-nutrition)]/10 ring-[color:var(--accent-nutrition)]/30',
    text: 'text-foreground',
    iconClass: 'text-[color:var(--accent-nutrition)]',
  },
  alert: {
    bg: 'bg-[color:var(--accent-vitals)]/10 ring-[color:var(--accent-vitals)]/30',
    text: 'text-foreground',
    iconClass: 'text-[color:var(--accent-vitals)]',
  },
  info: {
    bg: 'bg-muted/40 ring-foreground/10',
    text: 'text-foreground',
    iconClass: 'text-muted-foreground',
  },
}

const TONE_ICONS: Record<Tone, ReactNode> = {
  warn: <AlertTriangle className="h-5 w-5" />,
  alert: <AlertTriangle className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
}

export function SoftBanner({
  tone = 'info',
  title,
  description,
  onDismiss,
  className,
  icon,
}: SoftBannerProps) {
  const style = TONE_STYLES[tone]
  return (
    <div
      role={tone === 'alert' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-2xl p-3 ring-1',
        style.bg,
        style.text,
        className,
      )}
    >
      <span className={cn('mt-0.5 shrink-0', style.iconClass)} aria-hidden>
        {icon ?? TONE_ICONS[tone]}
      </span>
      <div className="flex-1 text-sm">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
