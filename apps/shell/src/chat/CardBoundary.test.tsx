import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardBoundary } from './CardBoundary'

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('missing data')
  return <p>card content</p>
}

afterEach(cleanup)

describe('CardBoundary', () => {
  it('replaces a crashing card with a missing-information note and keeps its neighbours', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<><p>other card</p><CardBoundary name="Suppliers"><Boom explode /></CardBoundary></>)
    expect(screen.getByText('other card')).toBeTruthy()
    expect(screen.getByText('Missing information')).toBeTruthy()
    expect(screen.getByText(/could not be shown/)).toBeTruthy()
    expect(screen.queryByText('card content')).toBeNull()
  })
  it('shows the card when nothing is wrong, and "Try again" draws it again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let explode = true
    function Sometimes() { return <Boom explode={explode} /> }
    render(<CardBoundary name="Contracts"><Sometimes /></CardBoundary>)
    expect(screen.getByText('Missing information')).toBeTruthy()
    explode = false
    fireEvent.click(screen.getByText('Try again'))
    expect(screen.getByText('card content')).toBeTruthy()
  })
})
