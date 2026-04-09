import { cn } from '@/lib/utils'

interface MacroValues {
  protein: number
  carbs: number
  fat: number
}

interface MacroDisplayProps {
  macros: MacroValues
  className?: string
  showBar?: boolean
  compact?: boolean
}

export function MacroDisplay({ macros, className, showBar = false, compact = false }: MacroDisplayProps) {
  const total = macros.protein + macros.carbs + macros.fat
  const proteinPct = total > 0 ? Math.round((macros.protein / total) * 100) : 0
  const carbsPct = total > 0 ? Math.round((macros.carbs / total) * 100) : 0
  const fatPct = total > 0 ? Math.round((macros.fat / total) * 100) : 0

  return (
    <div className={cn('space-y-2', className)}>
      {showBar ? (
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div className="transition-all" style={{ width: `${proteinPct}%`, backgroundColor: 'hsl(var(--chart-1))' }} />
            <div className="transition-all" style={{ width: `${carbsPct}%`, backgroundColor: 'hsl(var(--chart-2))' }} />
            <div className="transition-all" style={{ width: `${fatPct}%`, backgroundColor: 'hsl(var(--chart-3))' }} />
          </div>
        </div>
      ) : null}
      <div className={cn('text-xs text-muted-foreground', compact ? 'space-y-1' : 'flex flex-wrap gap-x-3')}>
        <span>P {macros.protein}g{showBar ? ` (${proteinPct}%)` : ''}</span>
        <span>C {macros.carbs}g{showBar ? ` (${carbsPct}%)` : ''}</span>
        <span>F {macros.fat}g{showBar ? ` (${fatPct}%)` : ''}</span>
      </div>
    </div>
  )
}
