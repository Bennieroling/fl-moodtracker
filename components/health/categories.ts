export type Category = 'activity' | 'sleep' | 'mood' | 'vitals' | 'body' | 'readiness' | 'nutrition'

export const CATEGORY_ACCENT: Record<Category, string> = {
  activity: 'var(--accent-activity)',
  sleep: 'var(--accent-sleep)',
  mood: 'var(--accent-mood)',
  vitals: 'var(--accent-vitals)',
  body: 'var(--accent-body)',
  readiness: 'var(--accent-readiness)',
  nutrition: 'var(--accent-nutrition)',
}

export const CATEGORY_SPARK: Record<Category, string> = {
  activity: 'var(--spark-activity)',
  sleep: 'var(--spark-sleep)',
  mood: 'var(--spark-mood)',
  vitals: 'var(--spark-vitals)',
  body: 'var(--spark-body)',
  readiness: 'var(--spark-readiness)',
  nutrition: 'var(--spark-nutrition)',
}
