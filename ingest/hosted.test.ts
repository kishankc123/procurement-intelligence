// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { IngestEvent } from '../packages/data/src/ingestEvents'
import { buildContractIndex } from './contractIndex'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from './fixtures'
import { blobStoreFromEnv, createHosted, createIngestedSync, hasBlobStore, indexedProjectsInStore, loadEmbeddingsFromStore, type HostedResponse } from './hosted'
import { memoryStore, putJson, type Store } from './store'

const TOKEN = 'secret-token'

/** A memory store that counts writes, and a clock that moves one second per write: so "time" passes only when work is done. */
function world(over: { env?: Record<string, string | undefined>; noIndex?: boolean; embedder?: boolean; failDocs?: boolean } = {}) {
  let writes = 0
  const mem = memoryStore(() => writes)
  const store: Store = { ...mem, put: async (k, d) => { writes++; await mem.put(k, d) } }
  const io = fixtureIo({ fail: over.failDocs ? (u) => u.includes('/api/v3/wds') : undefined })
  const env = { INGEST_TOKEN: TOKEN, INGEST_STEP_BUDGET_MS: '2000', INGEST_DAILY_LIMIT: '3', ...over.env }
  const hosted = createHosted({
    env, store: async () => store, now: () => writes * 1000, io,
    embedder: over.embedder === false ? { embedder: null, reason: 'no key' } : { embedder: fakeEmbedder(16) },
  })
  /** `token: null` sends no token at all. */
  const req = (method: string, path: string, body?: unknown, token: string | null = TOKEN) => hosted.handle({ method, path, headers: token === null ? {} : { 'x-ingest-token': token }, body })
  const ready = async () => { await buildContractIndex({ io: fixtureIo(), store }) }
  return { hosted, store, mem, req, io, ready, env }
}
const events = (r: HostedResponse) => (r.body as { events: IngestEvent[] }).events
const status = (r: HostedResponse) => (r.body as { status: string }).status

async function runToEnd(w: ReturnType<typeof world>, id = FIXTURE_ID) {
  const all: IngestEvent[] = []
  const statuses: string[] = []
  for (let i = 0; i < 60; i++) {
    const r = await w.req('POST', 'step', { projectId: id })
    statuses.push(status(r)); all.push(...events(r))
    if (status(r) === 'done' || status(r) === 'failed') return { all, statuses }
  }
  throw new Error('never finished: ' + statuses.join(','))
}

describe('hosted ingestion: config and access', () => {
  it('is off without a token, and says why; on with a token, a store and an index', async () => {
    const off = world({ env: { INGEST_TOKEN: undefined } })
    expect((await off.req('GET', 'config')).body).toMatchObject({ enabled: false, reason: 'INGEST_TOKEN is not set.' })
    const noIndex = world()
    expect((await noIndex.req('GET', 'config')).body).toMatchObject({ enabled: true, storage: true, index: null, reason: expect.stringContaining('contract index') })
    const ok = world(); await ok.ready()
    expect((await ok.req('GET', 'config')).body).toMatchObject({ mode: 'steps', enabled: true, tokenRequired: true, index: { projects: 3, records: 5 }, embedding: { available: true }, dailyLimit: 3 })
    expect((await ok.req('GET', 'config')).body).not.toHaveProperty('reason', expect.anything())
  })
  it('says there is no store when none is connected', async () => {
    const hosted = createHosted({ env: { INGEST_TOKEN: TOKEN }, store: async () => null })
    expect((await hosted.handle({ method: 'GET', path: 'config', headers: {}, body: null })).body).toMatchObject({ enabled: false, storage: false })
    expect((await hosted.handle({ method: 'POST', path: 'start', headers: { 'x-ingest-token': TOKEN }, body: { projectId: FIXTURE_ID } })).status).toBe(503)
  })
  it('refuses start and step without the right token, with a bad id, and unknown routes', async () => {
    const w = world(); await w.ready()
    expect((await w.req('POST', 'start', { projectId: FIXTURE_ID }, null)).status).toBe(401)
    expect((await w.req('POST', 'start', { projectId: FIXTURE_ID }, 'wrong')).status).toBe(401)
    expect((await w.req('POST', 'step', { projectId: FIXTURE_ID }, 'wrong')).status).toBe(401)
    expect((await w.req('POST', 'start', { projectId: '../x' })).status).toBe(400)
    expect((await w.req('POST', 'step', { projectId: 5 })).status).toBe(400)
    expect((await w.req('GET', 'nope')).status).toBe(404)
    const off = world({ env: { INGEST_TOKEN: undefined } })
    expect((await off.req('POST', 'start', { projectId: FIXTURE_ID }, 'anything')).status).toBe(403)
  })
  it('will not start without the contract index, and stops at the daily limit', async () => {
    const w = world()
    expect((await w.req('POST', 'start', { projectId: FIXTURE_ID })).status).toBe(409)
    await w.ready()
    for (const left of [2, 1, 0]) expect((await w.req('POST', 'start', { projectId: FIXTURE_ID })).body).toMatchObject({ remainingToday: left })
    const over = await w.req('POST', 'start', { projectId: FIXTURE_ID })
    expect(over.status).toBe(429)
    expect(JSON.stringify(over.body)).toContain('daily limit of 3')
  })
})

describe('hosted ingestion: a run over several requests', () => {
  it('pauses when the budget is spent, continues, and ends with the project published to the store', async () => {
    const w = world(); await w.ready()
    const { all, statuses } = await runToEnd(w)
    expect(statuses.filter((s) => s === 'paused').length).toBeGreaterThan(0)
    expect(statuses.at(-1)).toBe('done')
    expect(all.some((e) => e.type === 'error')).toBe(false)
    const done = all.find((e) => e.type === 'done')!
    expect(done).toMatchObject({ type: 'done', summary: { projectId: FIXTURE_ID, counts: { contracts: 3, supervision_reports: 3 }, embedding: { status: 'done', model: 'fake-embedding' } } })
    expect([...w.mem.data.keys()]).toEqual(expect.arrayContaining([`ingested/${FIXTURE_ID}.json`, `embeddings/${FIXTURE_ID}.json`, `embeddings/${FIXTURE_ID}.bin`]))
    expect(w.io.calls.some((c) => c.includes('apiservice'))).toBe(false) // the index was used, no scan
    const texts = w.io.calls.filter((c) => c.includes('/t/'))
    expect(new Set(texts).size).toBe(texts.length) // no download repeated across steps
  })

  it('gives the same published data however the run is split', async () => {
    const a = world({ env: { INGEST_STEP_BUDGET_MS: '1000' } }); await a.ready(); await runToEnd(a)
    const b = world({ env: { INGEST_STEP_BUDGET_MS: '600000' } }); await b.ready()
    const { statuses } = await runToEnd(b)
    expect(statuses).toEqual(['done'])
    const snap = (w: ReturnType<typeof world>) => JSON.parse(new TextDecoder().decode(w.mem.data.get(`ingested/${FIXTURE_ID}.json`)!.bytes))
    const strip = (s: any) => ({ ...s, manifest: { ...s.manifest, ingested_at: 'x' } })
    expect(strip(snap(a))).toEqual(strip(snap(b)))
    expect([...a.mem.data.get(`embeddings/${FIXTURE_ID}.bin`)!.bytes]).toEqual([...b.mem.data.get(`embeddings/${FIXTURE_ID}.bin`)!.bytes])
  })

  it('answers busy to a second step for the same project while one is running, and never publishes twice at once', async () => {
    const w = world({ env: { INGEST_STEP_BUDGET_MS: '600000' } }); await w.ready()
    const [first, second] = await Promise.all([w.req('POST', 'step', { projectId: FIXTURE_ID }), w.req('POST', 'step', { projectId: FIXTURE_ID })])
    expect([status(first), status(second)].sort()).toEqual(['busy', 'done'])
  })

  it('finishes with embedding skipped (and says why) when there is no model', async () => {
    const w = world({ embedder: false }); await w.ready()
    const { all } = await runToEnd(w)
    expect(all.find((e) => e.type === 'done')).toMatchObject({ summary: { embedding: { status: 'skipped', reason: 'no key' }, map: null } })
    expect(w.mem.data.has(`embeddings/${FIXTURE_ID}.bin`)).toBe(false)
  })

  it('reports a failing source once, publishes nothing, and can be tried again', async () => {
    const w = world({ failDocs: true }); await w.ready()
    const { all, statuses } = await runToEnd(w)
    expect(statuses.at(-1)).toBe('failed')
    expect(all.filter((e) => e.type === 'error')).toHaveLength(1)
    expect(all.find((e) => e.type === 'error')).toMatchObject({ stage: 'documents', message: 'network down' })
    expect(w.mem.data.has(`ingested/${FIXTURE_ID}.json`)).toBe(false)
    expect(status(await w.req('POST', 'step', { projectId: FIXTURE_ID }))).toBe('failed') // not stuck "busy"
  })

  it('caps the chunks that are embedded', async () => {
    const w = world({ env: { INGEST_MAX_CHUNKS: '4', INGEST_STEP_BUDGET_MS: '600000' } }); await w.ready()
    const { all } = await runToEnd(w)
    expect(all.find((e) => e.type === 'done')).toMatchObject({ summary: { embedding: { vectors: 4 } } })
  })

  it('reuses the stored vectors when the same project is ingested again', async () => {
    const w = world({ env: { INGEST_STEP_BUDGET_MS: '600000' } }); await w.ready()
    await runToEnd(w)
    const again = await runToEnd(w)
    const done = again.all.find((e) => e.type === 'done') as Extract<IngestEvent, { type: 'done' }>
    expect(done.summary.embedding).toMatchObject({ status: 'done', reused: done.summary.embedding!.vectors, tokens: 0 })
  })
})

describe('what the rest of the app reads from the store', () => {
  it('merges a published project into an in-memory db once, again when it is re-published, and tolerates a broken store', async () => {
    const w = world({ env: { INGEST_STEP_BUDGET_MS: '600000' } }); await w.ready()
    await runToEnd(w)
    let t = 0
    const sync = createIngestedSync(async () => w.store, 100, () => t)
    const db: Record<string, any> = { meta: { dataset_label: 'x' }, projects: [], contracts: [], documents: [], chunks: [], sources: [], supervision_reports: [] }
    expect(await sync.sync(db)).toEqual([FIXTURE_ID])
    expect(db.contracts).toHaveLength(3)
    expect(db.meta.dataset_label).toContain(FIXTURE_ID)
    t = 50; expect(await sync.sync(db)).toEqual([]) // within the interval: the store is not asked
    t = 500; expect(await sync.sync(db)).toEqual([]) // asked, nothing new
    await runToEnd(w); t = 1000
    expect(await sync.sync(db)).toEqual([FIXTURE_ID]) // uploaded again: merged again, replacing, not adding
    expect(db.contracts).toHaveLength(3)
    expect(db.projects).toHaveLength(1)
    const broken = createIngestedSync(async () => ({ get: async () => null, put: async () => undefined, list: async () => { throw new Error('store down') } }), 0)
    expect(await broken.sync({})).toEqual([])
    expect(await createIngestedSync(async () => null).sync({})).toEqual([])
  })

  it('serves the stored vectors and lists the projects that have them, for search by meaning', async () => {
    const w = world({ env: { INGEST_STEP_BUDGET_MS: '600000' } }); await w.ready()
    await runToEnd(w)
    expect(await indexedProjectsInStore(w.store)).toEqual([FIXTURE_ID])
    const idx = await loadEmbeddingsFromStore(w.store, FIXTURE_ID)
    expect(idx!.vectors).toHaveLength(idx!.manifest.count)
    expect(await loadEmbeddingsFromStore(w.store, 'P000000')).toBeNull()
    await w.store.put(`embeddings/${FIXTURE_ID}.bin`, new Uint8Array(3)) // files that disagree
    expect(await loadEmbeddingsFromStore(w.store, FIXTURE_ID)).toBeNull()
    const extras = w.hosted.copilotExtras()
    expect(typeof extras.findProjects).toBe('function')
    await putJson(w.store, 'x/y.json', {})
    expect(await extras.semantic.indexedProjects()).toEqual([FIXTURE_ID])
  })
})

describe('which Blob credentials count as a connected store', () => {
  it('accepts a read-write token or a store id, and nothing else', async () => {
    expect(hasBlobStore({ BLOB_READ_WRITE_TOKEN: 'x' })).toBe(true)
    expect(hasBlobStore({ BLOB_STORE_ID: 'store_abc' })).toBe(true)
    expect(hasBlobStore({ BLOB_WEBHOOK_PUBLIC_KEY: 'k' })).toBe(false)
    expect(hasBlobStore({})).toBe(false)
    expect(await blobStoreFromEnv({})).toBeNull()
    expect(await blobStoreFromEnv({ BLOB_WEBHOOK_PUBLIC_KEY: 'k' })).toBeNull()
    expect(await blobStoreFromEnv({ BLOB_STORE_ID: 'store_abc' })).not.toBeNull() // built, no network call
    expect(await blobStoreFromEnv({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x', INGEST_BLOB_ACCESS: 'public' })).not.toBeNull()
  })
})
