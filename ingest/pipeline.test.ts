// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { IngestEvent } from '../packages/data/src/ingestEvents'
import { applyEvent, emptyRun } from '../packages/data/src/ingestEvents'
import { unpackVectors } from '../packages/data/src/vectors'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from './fixtures'
import { Cancelled, ingestProject } from './pipeline'

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
