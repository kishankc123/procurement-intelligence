// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeEmbedder, fixtureIo, FIXTURE_ID } from './fixtures'
import { ingestProject } from './pipeline'
import { loadEmbeddings, mergeSnapshot, previousVectors, publishResult, type Snapshot } from './publish'

const dirs: string[] = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'pi-')); dirs.push(d); return d }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const baseDb = () => ({
  meta: { dataset_label: 'Mock data' },
  projects: [{ project_id: 'P-MOCK-001', project_name: 'Mock' }], contracts: [{ project_id: 'P-MOCK-001', borrower_contract_reference_number: 'R1' }],
  documents: [{ doc_id: 'DOC-MOCK-1', project_id: 'P-MOCK-001' }], chunks: [{ chunk_id: 'CH-MOCK-1', doc_id: 'DOC-MOCK-1', text: 'mock' }],
  sources: [{ id: 'SRC-MOCK-1' }], supervision_reports: [],
})

describe('mergeSnapshot', () => {
  it('adds a project once and replaces its rows when it is merged again, leaving other projects alone', async () => {
    const { snapshot } = await ingestProject(FIXTURE_ID, { io: fixtureIo() })
    const db = baseDb() as Record<string, any>
    mergeSnapshot(db, snapshot as unknown as Snapshot)
    const after1 = JSON.stringify(db)
    mergeSnapshot(db, snapshot as unknown as Snapshot)
    expect(JSON.stringify(db)).toBe(after1)
    expect(db.projects.map((p: any) => p.project_id)).toEqual(['P-MOCK-001', FIXTURE_ID])
    expect(db.contracts.filter((c: any) => c.project_id === FIXTURE_ID)).toHaveLength(3)
    expect(db.contracts.filter((c: any) => c.project_id === 'P-MOCK-001')).toHaveLength(1)
    expect(db.chunks.some((c: any) => c.chunk_id === 'CH-MOCK-1')).toBe(true)
    expect(db.sources.map((s: any) => s.id)).toEqual(['SRC-MOCK-1', 'SRC-WB-PROJECTS', 'SRC-WB-CONTRACTS', 'SRC-WB-DOCUMENTS'])
  })
})

describe('publishResult', () => {
  it('writes the snapshot, the vectors and the merged db, and the vectors load back', async () => {
    const d = tmp()
    const dirsArg = { snapshots: join(d, 'ingested'), embeddings: join(d, 'embeddings'), db: join(d, 'db.json') }
    writeFileSync(dirsArg.db, JSON.stringify(baseDb()))
    const result = await ingestProject(FIXTURE_ID, { io: fixtureIo(), embedder: fakeEmbedder(16) })
    const files = publishResult(result, { dirs: dirsArg })
    expect(files.map((f) => f.replace(d, ''))).toEqual([`/ingested/${FIXTURE_ID}.json`, `/embeddings/${FIXTURE_ID}.json`, `/embeddings/${FIXTURE_ID}.bin`, '/db.json'])
    const db = JSON.parse(readFileSync(dirsArg.db, 'utf8'))
    expect(db.meta.dataset_label).toContain(FIXTURE_ID)
    expect(db.chunks.filter((c: any) => c.doc_id.startsWith('DOC-WB-')).every((c: any) => c.embedding_status === 'embedded')).toBe(true)
    const index = loadEmbeddings(FIXTURE_ID, dirsArg.embeddings)!
    expect(index.vectors).toHaveLength(result.embeddings!.chunk_ids.length)
    expect(index.manifest.map).toHaveLength(index.vectors.length)
    expect(previousVectors(FIXTURE_ID, dirsArg.embeddings)!.size).toBe(index.vectors.length)
    expect(previousVectors('P000000', dirsArg.embeddings)).toBeUndefined()
  })

  it('does not touch db.json when merge is false, and keeps plan packages from an earlier snapshot', async () => {
    const d = tmp()
    const dirsArg = { snapshots: join(d, 'ingested'), embeddings: join(d, 'embeddings'), db: join(d, 'db.json') }
    writeFileSync(dirsArg.db, JSON.stringify(baseDb()))
    const first = await ingestProject(FIXTURE_ID, { io: fixtureIo() })
    publishResult(first, { merge: false, dirs: dirsArg })
    expect(JSON.parse(readFileSync(dirsArg.db, 'utf8')).projects).toHaveLength(1)
    // a later model step added plan packages to the snapshot file
    const file = join(dirsArg.snapshots, `${FIXTURE_ID}.json`)
    const snap = JSON.parse(readFileSync(file, 'utf8'))
    snap.collections.plan_packages = [{ id: 'PP-1', project_id: FIXTURE_ID }]
    snap.manifest.counts.plan_packages = 1
    snap.manifest.sources.push({ name: 'Procurement Plan document (x)', url: 'u', records: 1 })
    writeFileSync(file, JSON.stringify(snap))
    publishResult(await ingestProject(FIXTURE_ID, { io: fixtureIo() }), { merge: false, dirs: dirsArg })
    const again = JSON.parse(readFileSync(file, 'utf8'))
    expect(again.collections.plan_packages).toEqual([{ id: 'PP-1', project_id: FIXTURE_ID }])
    expect(again.manifest.counts.plan_packages).toBe(1)
    expect(existsSync(join(dirsArg.embeddings, `${FIXTURE_ID}.bin`))).toBe(false)
  })

  it('loadEmbeddings returns null when the files disagree', async () => {
    const d = tmp()
    const result = await ingestProject(FIXTURE_ID, { io: fixtureIo(), embedder: fakeEmbedder(16) })
    publishResult(result, { merge: false, dirs: { snapshots: join(d, 's'), embeddings: join(d, 'e'), db: join(d, 'db.json') } })
    writeFileSync(join(d, 'e', `${FIXTURE_ID}.bin`), new Uint8Array(5))
    expect(loadEmbeddings(FIXTURE_ID, join(d, 'e'))).toBeNull()
  })
})

// The merge must give the same rows as the stored database holds for the real projects it was built from.
describe('mergeSnapshot against the stored database', () => {
  const dbPath = join(__dirname, '..', 'mock', 'db.json'), snapDir = join(__dirname, '..', 'mock', 'ingested')
  it.skipIf(!existsSync(dbPath) || !existsSync(join(snapDir, 'P158504.json')))('rebuilds the P158504 rows in db.json from its snapshot', () => {
    const db = JSON.parse(readFileSync(dbPath, 'utf8')) as Record<string, any[]>
    const snap = JSON.parse(readFileSync(join(snapDir, 'P158504.json'), 'utf8')) as Snapshot
    const id = 'P158504'
    const rowsOf = (d: Record<string, any[]>, name: string) => d[name]!.filter((r) => (name === 'chunks' ? String(r.doc_id).startsWith('DOC-WB-') && d.documents!.some((x) => x.doc_id === r.doc_id && x.project_id === id) : r.project_id === id))
    const stripped = structuredClone(db)
    for (const name of ['projects', 'contracts', 'documents', 'supervision_reports']) stripped[name] = stripped[name]!.filter((r) => r.project_id !== id)
    const docIds = new Set(db.documents!.filter((d) => d.project_id === id).map((d) => d.doc_id))
    stripped.chunks = stripped.chunks!.filter((c) => !docIds.has(c.doc_id))
    mergeSnapshot(stripped, snap)
    for (const name of ['projects', 'contracts', 'documents', 'supervision_reports', 'chunks']) expect(rowsOf(stripped, name), name).toEqual(rowsOf(db, name))
  })
})
