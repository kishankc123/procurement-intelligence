import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToasts, clearToasts } from '../toasts'
import { useUiStore } from '@pi/data'
import { IngestCandidates } from './IngestCard'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); clearToasts(); useUiStore.setState({ chatProjectId: null }) })
const draw = (result: string | undefined) => render(<QueryClientProvider client={new QueryClient()}><IngestCandidates result={result} onSend={vi.fn()} /></QueryClientProvider>)
const cand = (over: object) => ({ project_id: 'P111111', project_name: 'Some Road', country: 'Peru', status: 'Active', approval_date: '2020-01-01', sector: 'Transport', stored: false, ...over })

describe('IngestCandidates', () => {
  it('explains first that the project has to be ingested, offers Proceed only for projects that are not in the app, and Show details for those that are', () => {
    draw(JSON.stringify({ query: 'road', candidates: [cand({}), cand({ project_id: 'P222222', project_name: 'Stored Road', stored: true })] }))
    expect(screen.getByText(/is not in the app yet/).textContent).toMatch(/I need to ingest it.*project record, contracts, documents.*tenders and plan.*Proceed/s)
    expect(screen.getAllByRole('button', { name: 'Proceed' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Show details' })).toHaveLength(1)
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.queryByText(/Ingest this project/)).toBeNull()
  })
  it('says nothing about ingesting when every project found is already in the app', () => {
    draw(JSON.stringify({ query: 'road', candidates: [cand({ stored: true })] }))
    expect(screen.queryByText(/I need to ingest/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Proceed' })).toBeNull()
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
    fireEvent.click(await screen.findByRole('button', { name: 'Proceed' }))
    const input = await screen.findByLabelText(/Enter the ingest token/)
    fireEvent.change(input, { target: { value: 'good' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use token and ingest' }))
    expect(await screen.findByText(/is ready\. Its project details, contracts, documents, tenders and plan are available now/, undefined, { timeout: 4000 })).toBeTruthy()
    expect(calls.filter((c) => c === 'step')).toHaveLength(2)
    expect(sessionStorage.getItem('pi.ingestToken')).toBe('good')
  })

  it('asks again when the token is wrong, and forgets the wrong one', async () => {
    hosted({ goodToken: 'other' })
    sessionStorage.setItem('pi.ingestToken', 'stale')
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Proceed' }))
    expect(await screen.findByLabelText(/token is missing or wrong/)).toBeTruthy()
    expect(sessionStorage.getItem('pi.ingestToken')).toBeNull()
  })

  it('does not offer to ingest, and says why, when the site has it switched off', async () => {
    hosted({ enabled: false, reason: 'INGEST_TOKEN is not set.' })
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    expect(await screen.findByText(/Live ingestion is not available on this site: INGEST_TOKEN is not set\./)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Proceed' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('what the user sees while a project is ingested, and after', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const summary = { projectId: 'P111111', projectName: 'Some Road', counts: { contracts: 3, documents: 2, documents_with_text: 2, chunks: 9, supervision_reports: 1 }, embedding: { status: 'skipped', reason: 'no key' }, map: null, sample: null, notes: [], durationMs: 1000 }
  /** A hosted server whose steps can be held back, so the in-between state can be looked at. */
  function server(over: { fail?: boolean } = {}) {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => { release = r })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = new URL(url, 'http://x').pathname.split('/ingest/')[1]
      if (path === 'config') return json(200, { mode: 'steps', enabled: true, tokenRequired: true, embedding: { available: true, model: 'm', dimensions: 4 } })
      if (path === 'start') return json(200, { projectId: 'P111111' })
      if (path === 'step') {
        await gate
        return json(200, over.fail
          ? { status: 'failed', events: [{ type: 'stage', stage: 'texts', status: 'running' }, { type: 'error', stage: 'texts', message: 'The World Bank site did not answer.' }] }
          : { status: 'done', events: [{ type: 'stage', stage: 'contracts', status: 'done', detail: '3 contract awards' }, { type: 'done', summary }] })
      }
      return json(404, {})
    }))
    return { release }
  }
  const proceed = async () => { sessionStorage.setItem('pi.ingestToken', 'good'); fireEvent.click(await screen.findByRole('button', { name: 'Proceed' })) }

  it('shows one line of loading text while it runs, not the stages, and no Proceed button', async () => {
    const s = server()
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    await proceed()
    const loading = await screen.findByText(/Ingesting/)
    expect(loading.closest('[aria-busy="true"]')).toBeTruthy()
    expect(screen.getByText(/This can take a few minutes\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Proceed' })).toBeNull()
    expect(screen.queryByLabelText('Ingestion stages')).toBeNull()
    expect(screen.queryByText('Contract awards')).toBeNull()
    expect(getToasts()).toEqual([])
    s.release()
    await screen.findByText(/is ready\./)
  })

  it('when it is done: an alert says the details are available, the project becomes the one in context, and the stages are in a collapsed details', async () => {
    const s = server(); s.release()
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    await proceed()
    await screen.findByText(/is ready\./)
    await waitFor(() => expect(getToasts()).toHaveLength(1))
    expect(getToasts()[0]).toMatchObject({ tone: 'success', title: 'Some Road is ready', text: expect.stringContaining('project details, contracts, documents, tenders and plan are now available') })
    expect(useUiStore.getState().chatProjectId).toBe('P111111')
    const details = screen.getByText('Details of this ingestion').closest('details')!
    expect(details.open).toBe(false)
    expect(screen.getByRole('button', { name: 'Show details' })).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.queryByText(/is not in the app yet/)).toBeNull() // nothing left to ingest, so no explanation
  })

  it('when it fails: says why on the card, alerts once, and offers Try again', async () => {
    const s = server({ fail: true }); s.release()
    draw(JSON.stringify({ query: 'road', candidates: [cand({})] }))
    await proceed()
    expect((await screen.findAllByText(/The World Bank site did not answer/))[0]).toBeTruthy()
    await waitFor(() => expect(getToasts()).toHaveLength(1))
    expect(getToasts()[0]).toMatchObject({ tone: 'error', title: 'Some Road could not be ingested' })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(useUiStore.getState().chatProjectId).toBeNull()
  })
})
