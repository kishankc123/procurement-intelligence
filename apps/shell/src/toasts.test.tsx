import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToasts, dismissToast, getToasts, notify, ToastHost } from './toasts'

beforeEach(() => { vi.useFakeTimers(); clearToasts() })
afterEach(() => { cleanup(); clearToasts(); vi.useRealTimers() })

describe('alerts', () => {
  it('shows an alert in a live region, and closes it with its button', () => {
    render(<ToastHost />)
    act(() => { notify({ tone: 'success', title: 'Some Road is ready', text: 'Its details are available.' }) })
    expect(screen.getByRole('status', { name: 'Notifications' }).textContent).toContain('Some Road is ready')
    expect(screen.getByText('Its details are available.')).toBeTruthy()
    act(() => { screen.getByRole('button', { name: 'Dismiss: Some Road is ready' }).click() })
    expect(getToasts()).toEqual([])
    expect(screen.queryByText('Some Road is ready')).toBeNull()
  })
  it('goes away by itself: after 9 seconds for good news, 15 for an error', () => {
    render(<ToastHost />)
    act(() => { notify({ tone: 'success', title: 'Fine' }); notify({ tone: 'error', title: 'Broken' }) })
    act(() => { vi.advanceTimersByTime(9_100) })
    expect(screen.queryByText('Fine')).toBeNull()
    expect(screen.getByText('Broken')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6_000) })
    expect(screen.queryByText('Broken')).toBeNull()
  })
  it('keeps at most the four newest, and gives each its own id', () => {
    const ids = [1, 2, 3, 4, 5].map((n) => notify({ tone: 'success', title: `T${n}` }))
    expect(new Set(ids).size).toBe(5)
    expect(getToasts().map((t) => t.title)).toEqual(['T2', 'T3', 'T4', 'T5'])
    dismissToast(ids[4]!); expect(getToasts()).toHaveLength(3)
    dismissToast(9999); expect(getToasts()).toHaveLength(3) // an unknown id changes nothing
  })
})
