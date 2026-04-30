import React from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Sparkline } from './sparkline'

describe('Sparkline', () => {
  it('renders an svg with a polyline when given multiple values', () => {
    const { container } = render(<Sparkline values={[1, 3, 2, 5, 4]} color="oklch(0.7 0.1 200)" />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    expect(polyline?.getAttribute('points')?.split(' ').length).toBe(5)
  })

  it('renders a baseline reference line when baseline is provided', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} color="red" baseline={2} />)

    const line = container.querySelector('line')
    expect(line).not.toBeNull()
    expect(line?.getAttribute('stroke-dasharray')).toBe('3 3')
  })

  it('renders an empty state when fewer than two values are provided', () => {
    const { container } = render(<Sparkline values={[]} color="red" />)

    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toContain('no data')
  })
})
