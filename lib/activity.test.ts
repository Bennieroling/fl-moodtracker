import { describe, expect, it } from 'vitest'
import { getTotalBurnedCalories } from '@/lib/activity'
import type { DailyActivity } from '@/lib/database'

const base: DailyActivity = {
  user_id: 'u1',
  date: '2026-04-25',
  total_energy_kcal: null,
  active_energy_kcal: null,
  resting_energy_kcal: null,
  steps: null,
  exercise_time_minutes: null,
  move_time_minutes: null,
  stand_time_minutes: null,
  distance_km: null,
  exercise_kcal: null,
}

describe('getTotalBurnedCalories', () => {
  it('returns null when activity is null', () => {
    expect(getTotalBurnedCalories(null)).toBeNull()
  })

  it('returns null when activity is undefined', () => {
    expect(getTotalBurnedCalories(undefined)).toBeNull()
  })

  it('returns total_energy_kcal when present', () => {
    expect(getTotalBurnedCalories({ ...base, total_energy_kcal: 2000 })).toBe(2000)
  })

  it('sums active and resting when total is absent', () => {
    expect(
      getTotalBurnedCalories({ ...base, active_energy_kcal: 500, resting_energy_kcal: 1500 }),
    ).toBe(2000)
  })

  it('returns active alone when resting is absent', () => {
    expect(getTotalBurnedCalories({ ...base, active_energy_kcal: 600 })).toBe(600)
  })

  it('returns resting alone when active is absent', () => {
    expect(getTotalBurnedCalories({ ...base, resting_energy_kcal: 1400 })).toBe(1400)
  })

  it('returns null when all calorie fields are null', () => {
    expect(getTotalBurnedCalories(base)).toBeNull()
  })

  it('prefers total_energy_kcal over active+resting sum', () => {
    expect(
      getTotalBurnedCalories({
        ...base,
        total_energy_kcal: 2100,
        active_energy_kcal: 500,
        resting_energy_kcal: 1500,
      }),
    ).toBe(2100)
  })
})
