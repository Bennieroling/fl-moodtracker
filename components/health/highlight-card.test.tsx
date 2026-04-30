import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HighlightCard } from './highlight-card'

describe('HighlightCard', () => {
  it('renders title, primary value, unit and chevron when href is set', () => {
    render(
      <HighlightCard
        title="Activity"
        category="activity"
        href="/exercise"
        primary={{ value: 8432, unit: 'steps' }}
        secondary={{ value: '42 min · 8.2 km' }}
      />,
    )

    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('8,432')).toBeInTheDocument()
    expect(screen.getByText('steps')).toBeInTheDocument()
    expect(screen.getByText('42 min · 8.2 km')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/exercise')
  })

  it('renders without a link wrapper when href is omitted', () => {
    render(<HighlightCard title="Sleep" category="sleep" primary={{ value: '7h 12m' }} />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('7h 12m')).toBeInTheDocument()
  })

  it('renders skeleton placeholders when loading', () => {
    const { container } = render(
      <HighlightCard title="Mood" category="mood" primary={{ value: '—' }} loading />,
    )

    // Loading state hides primary value
    expect(screen.queryByText('—')).toBeNull()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows the empty label instead of the primary value', () => {
    render(
      <HighlightCard
        title="Vitals"
        category="vitals"
        primary={{ value: 0 }}
        empty={{ label: 'No vitals recorded today' }}
      />,
    )

    expect(screen.getByText('No vitals recorded today')).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })
})
