import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { IngestCandidates } from './IngestCard'

const draw = (result: string | undefined) => render(<QueryClientProvider client={new QueryClient()}><IngestCandidates result={result} onSend={vi.fn()} /></QueryClientProvider>)
const cand = (over: object) => ({ project_id: 'P111111', project_name: 'Some Road', country: 'Peru', status: 'Active', approval_date: '2020-01-01', sector: 'Transport', stored: false, ...over })

describe('IngestCandidates', () => {
  it('offers the Ingest button only for projects that are not stored, and Show lifecycle for stored ones', () => {
    draw(JSON.stringify({ query: 'road', candidates: [cand({}), cand({ project_id: 'P222222', project_name: 'Stored Road', stored: true })] }))
    expect(screen.getAllByRole('button', { name: 'Ingest this project' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Show lifecycle' })).toHaveLength(1)
    expect(screen.getByText('Already stored')).toBeTruthy()
  })
  it('says so when nothing matched, and shows a tool error instead of a card', () => {
    draw(JSON.stringify({ query: 'zzz', candidates: [], note: 'No World Bank project matched.' }))
    expect(screen.getByRole('status').textContent).toContain('No World Bank project matched')
  })
  it('draws nothing for a result it cannot read, and the error for one that failed', () => {
    const { container } = draw('not json')
    expect(container.textContent).toBe('')
    draw(JSON.stringify({ error: 'The tool failed.' }))
    expect(screen.getByRole('alert').textContent).toBe('The tool failed.')
  })
})
