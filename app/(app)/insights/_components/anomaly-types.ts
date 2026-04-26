// View-model types and static catalog for the Anomalies view. The actual
// detection runs nightly in `detect_anomalies()` (PL/pgSQL); these are the
// shape definitions and labels the UI uses to render rows from the
// `anomalies` table plus a sample fallback for empty accounts.

export type GoodDirection = 'up' | 'down' | 'neutral'

export interface MetricSource {
  id: string
  label: string
  unit: string
  goodDirection: GoodDirection
  format: (n: number) => string
}

export const ANOMALY_SOURCES: MetricSource[] = [
  {
    id: 'hrv',
    label: 'HRV',
    unit: 'ms',
    goodDirection: 'up',
    format: (n) => n.toFixed(0),
  },
  {
    id: 'rhr',
    label: 'Resting HR',
    unit: 'bpm',
    goodDirection: 'down',
    format: (n) => n.toFixed(0),
  },
  {
    id: 'sleep',
    label: 'Sleep Duration',
    unit: 'h',
    goodDirection: 'up',
    format: (n) => n.toFixed(1),
  },
  {
    id: 'deep_sleep',
    label: 'Deep Sleep',
    unit: 'min',
    goodDirection: 'up',
    format: (n) => Math.round(n).toString(),
  },
]

export interface Anomaly {
  metricId: string
  label: string
  unit: string
  date: string
  value: number
  baseline: number
  std: number
  z: number
  direction: 'high' | 'low'
  kind: 'alert' | 'positive'
  isSample?: boolean
  series: (number | null)[]
  highlightIndex: number
  bandHalfWidth: number
  format: (n: number) => string
  hint: string | null
}

export const SAMPLE_ANOMALIES: Anomaly[] = [
  {
    metricId: 'sample-rhr',
    label: 'Resting HR',
    unit: 'bpm',
    date: '2026-04-15',
    value: 67,
    baseline: 54,
    std: 4.6,
    z: 2.8,
    direction: 'high',
    kind: 'alert',
    isSample: true,
    series: [
      52, 53, 54, 55, 53, 54, 55, 53, 54, 56, 53, 54, 55, 53, 52, 54, 55, 53, 54, 55, 54, 53, 67,
      54, 55, 53, 54, 53, 54, 55,
    ],
    highlightIndex: 22,
    bandHalfWidth: 4.6,
    format: (n) => n.toFixed(0),
    hint: 'Correlates with short sleep',
  },
  {
    metricId: 'sample-deep',
    label: 'Deep Sleep',
    unit: 'min',
    date: '2026-04-07',
    value: 108,
    baseline: 62,
    std: 14,
    z: 3.1,
    direction: 'high',
    kind: 'positive',
    isSample: true,
    series: [
      54, 58, 52, 50, 55, 48, 52, 55, 50, 60, 52, 50, 60, 108, 52, 48, 54, 50, 53, 51, 55, 52, 54,
      50, 49, 52, 50, 53, 51, 54,
    ],
    highlightIndex: 13,
    bandHalfWidth: 14,
    format: (n) => Math.round(n).toString(),
    hint: 'Came after an early bedtime',
  },
]
