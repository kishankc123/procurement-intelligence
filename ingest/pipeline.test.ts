// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { IngestEvent } from '../packages/data/src/ingestEvents'
import { applyEvent, emptyRun } from '../packages/data/src/ingestEvents'
import { unpackVectors } from '../packages/data/src/vectors'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from './fixtures'
import { Cancelled, ingestProject, Paused } from './pipeline'
import { memoryStore, storeCache } from './store'

const run = async (over: Partial<Parameters<typeof ingestProject>[1]> = {}) => {
  const events: IngestEvent[] = []
  const io = fixtureIo()
  const result = await ingestProject(FIXTURE_ID, { io, onEvent: (e) => events.push(e), ...over })
  return { events, io, result }
}

describe('ingestProject on fixtures', () => {
  it('reads the project, keeps only its contracts across all pages, parses reports and chunks the texts', async () => {
    const { result } = await run()
    const c = result.snapshot.collections
    expect(c.projects).toHaveLength(1)
    expect((c.projects![0] as { project_name: string }).project_name).toBe('Fixture Road Project')
    expect(c.contracts!.map((r) => (r as { borrower_contract_reference_number: string }).borrower_contract_reference_number)).toEqual([`REF-${FIXTURE_ID}-1`, `REF-${FIXTURE_ID}-3`, `REF-${FIXTURE_ID}-5`])
    expect(c.supervision_reports).toHaveLength(3) // the unreadable one is left out and noted
    expect((result.snapshot.manifest.supervision_reports_unparsed as unknown[]).length).toBe(1)
    expect(result.summary.counts.documents_with_text).toBe(6) // 4 supervision reports, the completion report and the latest plan
  })

  it('emits the stages in order, each running before it is done, and ends with the embed stage skipped when there is no embedder', async () => {
    const { events, result } = await run({ noEmbedderReason: 'no key' })
    const seq = events.filter((e): e is Extract<IngestEvent, { type: 'stage' }> => e.type === 'stage')
    const order = seq.filter((e) => e.status === 'running').map((e) => e.stage)
    // embed is skipped, so it never runs; publish starts last and the caller finishes it after writing the files
    expect(order).toEqual(['find', 'project', 'contracts', 'documents', 'texts', 'parse', 'chunk', 'publish'])
    expect(seq.find((e) => e.stage === 'embed')).toMatchObject({ status: 'skipped', detail: 'no key' })
    expect(result.summary.embedding).toEqual({ status: 'skipped', reason: 'no key' })
    expect(result.embeddings).toBeNull()
    expect(result.summary.map).toBeNull()
    expect(result.summary.sample).toBeNull()
    expect(result.snapshot.collections.chunks!.every((ch) => (ch as { embedding_status: string }).embedding_status === 'none')).toBe(true)
  })

  it('reports contract page progress that ends at the last page with the right count', async () => {
    const { events } = await run()
    const p = events.filter((e): e is Extract<IngestEvent, { type: 'progress' }> => e.type === 'progress' && e.stage === 'contracts')
    expect(p.at(-1)).toMatchObject({ done: 3, total: 3, found: 3 })
    expect(p.map((x) => x.done)).toEqual([...p.map((x) => x.done)].sort((a, b) => a - b))
  })

  it('embeds in batches, marks chunks embedded, builds a 2D map and counts tokens and cost', async () => {
    const embedder = fakeEmbedder(16)
    const { result, events } = await run({ embedder, embedBatch: 3 })
    const n = result.snapshot.collections.chunks!.length
    expect(n).toBeGreaterThan(6)
    expect(embedder.calls.reduce((a, b) => a + b, 0)).toBe(n)
    expect(Math.max(...embedder.calls)).toBe(3)
    expect(result.embeddings!.chunk_ids).toHaveLength(n)
    expect(unpackVectors(result.embeddings!.bytes, n, 16)).toHaveLength(n)
    expect(result.snapshot.collections.chunks!.every((ch) => (ch as { embedding_status: string }).embedding_status === 'embedded')).toBe(true)
    expect(result.summary.map).toHaveLength(n)
    expect(result.summary.sample).toMatchObject({ chunk_id: result.embeddings!.chunk_ids[0], total: 16 })
    expect(result.summary.sample!.values).toHaveLength(16)
    expect(result.summary.embedding).toMatchObject({ status: 'done', model: 'fake-embedding', vectors: n, reused: 0 })
    expect(result.summary.embedding!.costUsd).toBeCloseTo((result.summary.embedding!.tokens! / 1e6) * 0.02, 10)
    const last = events.filter((e) => e.type === 'progress' && e.stage === 'embed').at(-1)
    expect(last).toMatchObject({ done: Math.ceil(n / 3), total: Math.ceil(n / 3) })
  })

  it('does not pay again for chunks whose text is unchanged', async () => {
    const first = await run({ embedder: fakeEmbedder(16) })
    const previous = new Map(first.result.embeddings!.chunk_ids.map((id, i) => [id, { hash: first.result.embeddings!.hashes[i]!, vector: Array.from(unpackVectors(first.result.embeddings!.bytes, first.result.embeddings!.chunk_ids.length, 16)[i]!) }]))
    const embedder = fakeEmbedder(16)
    const second = await run({ embedder, previous })
    expect(embedder.calls).toEqual([])
    expect(second.result.summary.embedding).toMatchObject({ reused: first.result.embeddings!.chunk_ids.length, tokens: 0 })
  })

  it('caps the chunks sent to the embedding model and says so', async () => {
    const { result } = await run({ embedder: fakeEmbedder(16), maxEmbedChunks: 4 })
    expect(result.embeddings!.chunk_ids).toHaveLength(4)
    expect((result.snapshot.manifest.notes as string[]).some((n) => n.includes('Only the first 4'))).toBe(true)
  })

  it('uses the cache on a second run: no repeat network calls for texts, documents or contract pages', async () => {
    const io = fixtureIo()
    await ingestProject(FIXTURE_ID, { io })
    const calls = io.calls.length
    await ingestProject(FIXTURE_ID, { io })
    expect(io.calls.length).toBe(calls)
  })

  it('stops with a cancelled error when the signal is aborted', async () => {
    const ctl = new AbortController()
    const events: IngestEvent[] = []
    const p = ingestProject(FIXTURE_ID, { io: fixtureIo(), signal: ctl.signal, onEvent: (e) => { events.push(e); if (e.type === 'stage' && e.stage === 'documents' && e.status === 'done') ctl.abort() } })
    await expect(p).rejects.toBeInstanceOf(Cancelled)
    expect(events.at(-1)).toMatchObject({ type: 'error', cancelled: true })
  })

  it('reports a failing source as an error on its stage, with nothing invented', async () => {
    const events: IngestEvent[] = []
    const io = fixtureIo({ fail: (u) => u.includes('apiservice') })
    await expect(ingestProject(FIXTURE_ID, { io, onEvent: (e) => events.push(e) })).rejects.toThrow('network down')
    expect(events.at(-1)).toMatchObject({ type: 'error', stage: 'contracts', message: 'network down' })
    const view = events.reduce(applyEvent, emptyRun())
    expect(view.stages.contracts.status).toBe('failed')
    expect(view.summary).toBeNull()
  })

  it('refuses an id that is not a World Bank project id', async () => {
    await expect(ingestProject('../etc/passwd', { io: fixtureIo() })).rejects.toThrow('not a World Bank project id')
  })
})

describe('a run split over several requests', () => {
  const FIXED = () => new Date('2026-01-02T03:04:05Z')
  const strip = (r: Awaited<ReturnType<typeof ingestProject>>) => JSON.parse(JSON.stringify(r.snapshot))

  /**
   * Runs again and again, as the hosted function does, until the run finishes. The budget is "new work": a run may write `budget` cache entries
   * (downloads, batches) and then stops at the next safe point. Time is not modelled by counting safe points, because a resumed run passes through
   * many safe points on cached stages in no time at all.
   */
  async function inPieces(budget: number, io = fixtureIo(), extra: Partial<Parameters<typeof ingestProject>[1]> = {}) {
    let pieces = 0, puts = 0
    const real = io.cache.put.bind(io.cache)
    const counted = { ...io, cache: { get: io.cache.get.bind(io.cache), put: async (k: string, v: unknown) => { puts++; await real(k, v) } } }
    while (pieces < 80) {
      pieces++; puts = 0
      try { return { result: await ingestProject(FIXTURE_ID, { io: counted as typeof io, now: FIXED, shouldPause: () => puts >= budget, ...extra }), pieces, io } } catch (e) { if (!(e instanceof Paused)) throw e }
    }
    throw new Error('never finished')
  }

  it('finishes with the same data as one uninterrupted run, however small the budget', async () => {
    const whole = await ingestProject(FIXTURE_ID, { io: fixtureIo(), now: FIXED, embedder: fakeEmbedder(16) })
    for (const checks of [1, 3, 6]) {
      const split = await inPieces(checks, fixtureIo(), { embedder: fakeEmbedder(16), embedBatch: 4 })
      expect(split.pieces, `budget ${checks}`).toBeGreaterThan(1)
      expect(strip(split.result)).toEqual(strip(whole))
      expect([...split.result.embeddings!.bytes]).toEqual([...whole.embeddings!.bytes])
    }
  })

  it('does not repeat a download or a paid embedding batch in a later piece', async () => {
    const embedder = fakeEmbedder(16)
    const { io } = await inPieces(2, fixtureIo(), { embedder, embedBatch: 4 })
    const texts = io.calls.filter((c) => c.includes('/t/'))
    expect(new Set(texts).size).toBe(texts.length)
    const total = embedder.calls.reduce((a, b) => a + b, 0)
    const whole = await ingestProject(FIXTURE_ID, { io: fixtureIo(), embedder: fakeEmbedder(16) })
    expect(total).toBe(whole.embeddings!.chunk_ids.length)
  })

  it('works with an async cache (the hosted store)', async () => {
    const io = fixtureIo()
    const store = memoryStore()
    const asyncIo = { ...io, cache: storeCache(store) }
    const { result, pieces } = await inPieces(2, asyncIo as never)
    expect(pieces).toBeGreaterThan(1)
    expect(result.snapshot.collections.contracts).toHaveLength(3)
    expect([...store.data.keys()].some((k) => k.startsWith('cache/text-'))).toBe(true)
  })

  it('is not an error event when it pauses', async () => {
    const events: IngestEvent[] = []
    await expect(ingestProject(FIXTURE_ID, { io: fixtureIo(), shouldPause: () => true, onEvent: (e) => events.push(e) })).rejects.toBeInstanceOf(Paused)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })

  it('uses a contract index when given one, scans nothing, and says where the awards came from, also when resumed', async () => {
    const rows = [{ ...contractRowForTest(1) }, { ...contractRowForTest(2) }]
    const source = { forProject: async () => ({ rows, builtAt: '2026-05-06T00:00:00Z' }) }
    const { result, io } = await inPieces(2, fixtureIo(), { contractSource: source })
    expect(io.calls.some((c) => c.includes('apiservice'))).toBe(false)
    expect(result.snapshot.collections.contracts).toHaveLength(2)
    expect((result.snapshot.manifest.notes as string[]).some((n) => n.includes('index of the public contract list built on 2026-05-06'))).toBe(true)
  })

  it('treats an index that has no entry for the project as a scan', async () => {
    const { result, io } = await inPieces(50, fixtureIo(), { contractSource: { forProject: async () => null } })
    expect(io.calls.some((c) => c.includes('apiservice'))).toBe(true)
    expect(result.snapshot.collections.contracts).toHaveLength(3)
  })
})

const contractRowForTest = (n: number) => ({
  borrower_contract_reference_number: `IDX-${n}`, wb_contract_number: `WB-${n}`, project_id: FIXTURE_ID, supplier: 'Idx Co', supplier_id: `S${n}`, supplier_country: 'Laos',
  procurement_category: 'Works', procurement_method: 'Open', review_type: 'Prior', supplier_contract_amount_usd: 1000 * n, contract_signing_date: '10-Jan-2019', fiscal_year: 2019,
  contract_description: 'x', project_global_practice: 'Transport', borrower_country: 'Lao PDR', borrower_country_code: 'LA', region: 'EAP',
})
