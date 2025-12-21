import type { DailyActivity } from '@/lib/database'

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const getTotalBurnedCalories = (activity?: DailyActivity | null) => {
  if (!activity) {
    return null
  }

  const { total_energy_kcal, active_energy_kcal, resting_energy_kcal } = activity

  if (isFiniteNumber(total_energy_kcal)) {
    return total_energy_kcal
  }

  const hasActive = isFiniteNumber(active_energy_kcal)
  const hasResting = isFiniteNumber(resting_energy_kcal)

  if (!hasActive && !hasResting) {
    return null
  }

  return (hasActive ? active_energy_kcal : 0) + (hasResting ? resting_energy_kcal : 0)
}
