import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BodyStatTileProps {
  label: string
  icon?: ReactNode
  value: number | string | null | undefined
  unit?: string
  decimals?: number
}

export function BodyStatTile({ label, icon, value, unit, decimals }: BodyStatTileProps) {
  const hasValue = value !== null && value !== undefined
  const formatted = hasValue ? `${formatNumber(value, { decimals })}${unit ? ` ${unit}` : ''}` : '--'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatted}</div>
      </CardContent>
    </Card>
  )
}

function formatNumber(
  value: number | string | null | undefined,
  opts: { decimals?: number } = {}
) {
  if (value === null || value === undefined) return '--'
  const decimals = opts.decimals ?? 0
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '--'
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
