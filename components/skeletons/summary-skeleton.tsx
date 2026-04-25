import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SummarySkeletonProps {
  cards?: number
  className?: string
}

export function SummarySkeleton({ cards = 4, className }: SummarySkeletonProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="mx-auto h-8 w-16" />
          <Skeleton className="mx-auto h-3 w-24" />
        </div>
      ))}
    </div>
  )
}
