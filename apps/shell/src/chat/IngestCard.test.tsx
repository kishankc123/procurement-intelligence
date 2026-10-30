import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IngestCandidates } from './IngestCard'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })
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

describe('IngestCandidates on a hosted site (steps mode)', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const summary = { projectId: 'P111111', projectName: 'Some Road', counts: { contracts: 3, documents: 2, documents_with_text: 2, chunks: 9, supervision_reports: 1 }, embedding: { status: 'skipped', reason: 'no key' }, map: null, sample: null, notes: [], durationMs: 1000 }

  function hosted(over: { enabled?: boolean; reason?: string; goodToken?: string } = {}) {
    const calls: string[] = []
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://x').pathname.split('/ingest/')[1]!
      calls.push(path)
      if (path === 'config') return json(200, { mode: 'steps', enabled: over.enabled ?? true, reason: over.reason, tokenRequired: true, dailyLimit: 5, index: { built_at: '2026-05-06T00:00:00Z', projects: 9, records: 90 }, embedding: { available: false, reason: 'no key' } })
      if (new Headers(init?.headers).get('x-ingest-token') !== (over.goodToken ?? 'good')) return json(401, { error: 'The ingest token is missing or wrong.' })
      if (path === 'start') return json(200, { projectId: 'P111111' })
      const n = calls.filter((c) => c === 'step').length
      return json(200, n < 2 ? { status: 'paused', events: [{ type: 'stage', stage: 'texts', status: 'running' }] } : { status: 'done', events: [{ type: 'stage', stage: 'publish', status: 'done' }, { type: 'done', summary }] })
    })
    vi.stubGlobal('fetch', fetchFn)
    return { calls }
  }

  it('asks for the token, runs the steps, and ends on the Ready panel', async () => {
    const { calls } = hosted()
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ingest this project' }))
    const input = await screen.findByLabelText(/Enter the ingest token/)
    fireEvent.change(input, { target: { value: 'good' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use token and ingest' }))
    expect(await screen.findByText(/Ready to explore/, undefined, { timeout: 4000 })).toBeTruthy()
    expect(calls.filter((c) => c === 'step')).toHaveLength(2)
    expect(sessionStorage.getItem('pi.ingestToken')).toBe('good')
  })

  it('asks again when the token is wrong, and forgets the wrong one', async () => {
    hosted({ goodToken: 'other' })
    sessionStorage.setItem('pi.ingestToken', 'stale')
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ingest this project' }))
    expect(await screen.findByLabelText(/token is missing or wrong/)).toBeTruthy()
    expect(sessionStorage.getItem('pi.ingestToken')).toBeNull()
  })

  it('does not offer to ingest, and says why, when the site has it switched off', async () => {
    hosted({ enabled: false, reason: 'INGEST_TOKEN is not set.' })
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    expect(await screen.findByText(/Live ingestion is not available on this site: INGEST_TOKEN is not set\./)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Ingest this project' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
