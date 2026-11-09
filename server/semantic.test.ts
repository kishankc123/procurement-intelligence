// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssistantDb } from '../packages/data/src/assistant'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from '../ingest/fixtures'
import { ingestProject } from '../ingest/pipeline'
import { loadEmbeddings, mergeSnapshot, publishResult, type Snapshot } from '../ingest/publish'
import { semanticSearch } from './semantic'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

async function world(embedder = fakeEmbedder(32)) {
  const d = mkdtempSync(join(tmpdir(), 'pi-sem-')); dirs.push(d)
  const result = await ingestProject(FIXTURE_ID, { io: fixtureIo(), embedder })
  const embDir = join(d, 'e')
  publishResult(result, { merge: false, dirs: { snapshots: join(d, 's'), embeddings: embDir, db: join(d, 'db.json') } })
  const db: Record<string, any> = { meta: {}, projects: [], contracts: [], documents: [], chunks: [], sources: [] }
  mergeSnapshot(db, result.snapshot as unknown as Snapshot)
  return { db: db as unknown as AssistantDb, embDir, embedder }
}

describe('semanticSearch', () => {
  it('finds a chunk by words it shares with the question, reports similarity, and marks how it matched', async () => {
    const { db, embDir, embedder } = await world()
    const deps = { embedQuery: async (t: string) => (await embedder.embed([t])).vectors[0]!, loadIndex: (id: string) => loadEmbeddings(id, embDir), indexedProjects: () => [FIXTURE_ID] }
    const out = await semanticSearch(db, 'works procured supervised paid', deps, FIXTURE_ID, 3)
    expect(out.method).toBe('meaning+keywords')
    const rs = out.results as Exclude<typeof out.results, string>
    expect(rs.length).toBeGreaterThan(0)
    expect(rs[0]!.chunk_id).toMatch(/^CH-WB-/)
    expect(rs[0]!.matched_by).toContain('meaning')
    expect(rs[0]!.similarity).toBeGreaterThan(0.3)
  })

  it('says no evidence when nothing matches by keyword and nothing reaches the similarity floor', async () => {
    const { db, embDir, embedder } = await world()
    const deps = { embedQuery: async (t: string) => (await embedder.embed([t])).vectors[0]!, loadIndex: (id: string) => loadEmbeddings(id, embDir), indexedProjects: () => [FIXTURE_ID], minSimilarity: 0.99 }
    const out = await semanticSearch(db, 'zzqq xyzzy', deps, FIXTURE_ID)
    expect(out.results).toBe('No supporting evidence found in the ingested documents.')
  })

  it('falls back to keywords, with a reason, when the project has no vectors or the question cannot be embedded', async () => {
    const { db, embDir } = await world()
    const none = await semanticSearch(db, 'works', { embedQuery: async () => [1], loadIndex: () => null, indexedProjects: () => [] }, FIXTURE_ID)
    expect(none).toMatchObject({ method: 'keywords only' })
    expect(none.note).toContain('no embedded chunks')
    const down = await semanticSearch(db, 'works', { embedQuery: async () => { throw new Error('offline') }, loadIndex: (id) => loadEmbeddings(id, embDir), indexedProjects: () => [FIXTURE_ID] }, FIXTURE_ID)
    expect(down).toMatchObject({ method: 'keywords only' })
    expect(down.note).toContain('offline')
  })

  it('searches every indexed project when none is named, and ignores an index of another size', async () => {
    const { db, embDir, embedder } = await world()
    const deps = { embedQuery: async (t: string) => (await embedder.embed([t])).vectors[0]!, loadIndex: (id: string) => loadEmbeddings(id, embDir), indexedProjects: () => [FIXTURE_ID, 'P000000'] }
    const out = await semanticSearch(db, 'works procured', deps)
    expect(Array.isArray(out.results)).toBe(true)
    const wrongSize = await semanticSearch(db, 'zzqq', { ...deps, embedQuery: async () => [1, 2, 3] })
    expect(wrongSize.results).toBe('No supporting evidence found in the ingested documents.')
  })
})
