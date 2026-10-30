// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IngestEvent } from '../packages/data/src/ingestEvents'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from '../ingest/fixtures'
import { createJobRunner } from '../ingest/jobs'
import { createIngestRoutes } from './ingestRoutes'

let server: Server, base: string, dir: string
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pi-routes-'))
  writeFileSync(join(dir, 'db.json'), JSON.stringify({ meta: { dataset_label: '' }, projects: [], contracts: [], documents: [], chunks: [], sources: [] }))
  const base_io = fixtureIo()
  // A run on fixtures would end before the next request; a short delay per call keeps it observably in progress.
  const io = { ...base_io, getJson: async (u: string) => { await new Promise((r) => setTimeout(r, 40)); return base_io.getJson(u) } }
  const wb = { async getJson(url: string) { return url.includes('qterm') ? { projects: { P999001: { id: 'P999001', project_name: 'Fixture Road Project', countryname: ['Lao PDR'], status: 'Closed' }, P158504: { id: 'P158504', project_name: 'Stored one', countryname: ['Lao PDR'], status: 'Closed' } } } : io.getJson(url) } }
  const handle = createIngestRoutes({
    runner: createJobRunner({ io: () => io, embedder: () => ({ embedder: fakeEmbedder(16) }), dirs: { snapshots: join(dir, 's'), embeddings: join(dir, 'e'), db: join(dir, 'db.json') } }),
    io: wb, storedProjectIds: () => new Set(['P158504']), embeddingInfo: () => ({ available: true, model: 'fake', dimensions: 16 }), searchesPerMinute: 3,
  })
  server = createServer(async (req, res) => { if (!(await handle(req, res, new URL(req.url ?? '/', 'http://x')))) { res.writeHead(404); res.end() } })
  await new Promise<void>((r) => server.listen(0, r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { await new Promise((r) => server.close(r)); rmSync(dir, { recursive: true, force: true }) })

const post = (path: string, body?: unknown) => fetch(base + path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const sse = async (id: string, from = 0) => {
  const text = await (await fetch(`${base}/ingest/${id}/events?from=${from}`)).text()
  return text.split('\n\n').filter((b) => b.startsWith('id:')).map((b) => ({ index: Number(/^id: (\d+)/.exec(b)![1]), event: JSON.parse(/data: (.*)$/m.exec(b)![1]!) as IngestEvent }))
}

describe('ingest routes', () => {
  it('reports whether embedding is available', async () => {
    expect(await (await fetch(`${base}/ingest/config`)).json()).toEqual({ mode: 'stream', enabled: true, embedding: { available: true, model: 'fake', dimensions: 16 } })
  })

  it('finds candidates and marks the ones already stored', async () => {
    const body = await (await fetch(`${base}/ingest/find?q=road`)).json() as { candidates: { project_id: string; stored: boolean }[] }
    expect(body.candidates.map((c) => [c.project_id, c.stored])).toEqual([['P999001', false], ['P158504', true]])
  })

  it('limits searches per minute', async () => {
    for (let i = 0; i < 3; i++) expect((await fetch(`${base}/ingest/find?q=road`)).status).toBe(200)
    expect((await fetch(`${base}/ingest/find?q=road`)).status).toBe(429)
  })

  it('starts a run, streams every event to the end, and replays it from an index', async () => {
    const start = await post('/ingest/start', { projectId: FIXTURE_ID })
    expect(start.status).toBe(202)
    const { jobId } = await start.json() as { jobId: string }
    const all = await sse(jobId)
    expect(all.map((e) => e.index)).toEqual(all.map((_, i) => i))
    expect(all[0]!.event.type).toBe('job')
    expect(all.at(-1)!.event.type).toBe('done')
    const tail = await sse(jobId, all.length - 1)
    expect(tail).toHaveLength(1)
    expect(tail[0]!.event.type).toBe('done')
  })

  it('refuses a bad id, bad JSON, a second project while one runs, and unknown jobs', async () => {
    expect((await post('/ingest/start', { projectId: '../x' })).status).toBe(400)
    expect((await post('/ingest/start', { projectId: 12 })).status).toBe(400)
    expect((await fetch(base + '/ingest/start', { method: 'POST', body: '{nope' })).status).toBe(400)
    expect((await post('/ingest/start', { projectId: FIXTURE_ID })).status).toBe(202)
    expect((await post('/ingest/start', { projectId: 'P000001' })).status).toBe(409)
    expect((await fetch(`${base}/ingest/00000000-0000-0000-0000-000000000000/events`)).status).toBe(404)
    expect((await post('/ingest/00000000-0000-0000-0000-000000000000/cancel')).status).toBe(404)
  })

  it('cancels a running job', async () => {
    const { jobId } = await (await post('/ingest/start', { projectId: FIXTURE_ID })).json() as { jobId: string }
    expect((await post(`/ingest/${jobId}/cancel`)).status).toBe(200)
    expect((await sse(jobId)).at(-1)!.event).toMatchObject({ type: 'error', cancelled: true })
  })

  it('does not handle paths that are not its own', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(404)
  })
})
