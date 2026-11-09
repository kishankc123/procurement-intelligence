import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLoadFailure, RemoteBoundary } from './RemoteBoundary'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

let broken: Error | null = null
function Child() { if (broken) throw broken; return <p>Monitoring is fine</p> }

describe('isLoadFailure', () => {
  it('tells a failed fetch of the remote from an error while drawing', () => {
    for (const m of ['Failed to fetch dynamically imported module: http://localhost:5175/remoteEntry.js', 'TypeError: Failed to fetch', 'error loading dynamically imported module', 'Loading chunk 42 failed', '[ Federation Runtime ]: Failed to get remoteEntry', 'RUNTIME-008: Failed to get remote']) expect(isLoadFailure(new Error(m)), m).toBe(true)
    for (const m of ["Cannot read properties of undefined (reading 'map')", 'Invalid time value', 'x is not a function']) expect(isLoadFailure(new Error(m)), m).toBe(false)
  })
})

describe('RemoteBoundary', () => {
  it('draws the remote when it works', () => {
    broken = null
    render(<RemoteBoundary name="Monitoring"><Child /></RemoteBoundary>)
    expect(screen.getByText('Monitoring is fine')).toBeTruthy()
  })
  it('says the app could not be fetched, and offers a reload, when the files cannot be loaded', () => {
    broken = new Error('Failed to fetch dynamically imported module: http://localhost:5175/remoteEntry.js')
    render(<RemoteBoundary name="Monitoring"><Child /></RemoteBoundary>)
    expect(screen.getByText('Monitoring could not load')).toBeTruthy()
    expect(screen.getByText(/could not be fetched/).textContent).toMatch(/pnpm dev.*hosted site, reload/s)
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
  it('does not call a crash while drawing "not reachable": it says the app loaded and shows what went wrong, with Try again', () => {
    broken = new TypeError("Cannot read properties of undefined (reading 'map')")
    render(<RemoteBoundary name="Monitoring"><Child /></RemoteBoundary>)
    expect(screen.getByText(/was loaded, but it hit an error while drawing/)).toBeTruthy()
    expect(screen.queryByText(/not reachable/)).toBeNull()
    expect(screen.getByText(/Cannot read properties of undefined/)).toBeTruthy()
    // Try again draws it afresh: once the cause is gone, it works
    broken = null
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Monitoring is fine')).toBeTruthy()
    expect(screen.queryByText('Monitoring could not load')).toBeNull()
  })
})
