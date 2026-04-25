import type { ReactNode } from 'react'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StandardCardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function StandardCardHeader({
  title,
  description,
  action,
  className,
}: StandardCardHeaderProps) {
  return (
    <CardHeader className={cn('space-y-1', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </CardHeader>
  )
}
