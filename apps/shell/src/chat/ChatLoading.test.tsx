import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatLoading } from './ChatLoading'

describe('ChatLoading', () => {
  it('is announced as a busy status with the donut, and offers nothing to press', () => {
    render(<ChatLoading />)
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByLabelText('Loading the assistant')).toBeTruthy()
    expect(screen.getByText(/Getting the assistant ready/)).toBeTruthy()
  })
})
