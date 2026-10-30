// Writes an ingestion result to disk and makes it visible to the app: the snapshot (mock/ingested/<id>.json), the vectors (mock/embeddings/<id>.*)
// and the merge into mock/db.json, which json-server serves. The merge is the same one `pnpm reset-db` does, and running it again for the same
// project replaces that project's rows instead of adding them twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unpackVectors } from '../packages/data/src/vectors'
import type { EmbeddedSet, PipelineResult } from './pipeline'
import { ROOT } from './nodeIo'

type Rows = Record<string, unknown>[]
export interface Snapshot { manifest: Record<string, any>; collections: Record<string, Rows> }
export interface Dirs { snapshots: string; embeddings: string; db: string }
export const DEFAULT_DIRS: Dirs = { snapshots: join(ROOT, 'mock', 'ingested'), embeddings: join(ROOT, 'mock', 'embeddings'), db: join(ROOT, 'mock', 'db.json') }

/** Collections written by the later model steps (pnpm ingest:plans, ingest:notices). A fresh ingest does not redo them, so it keeps what is there. */
const KEPT = [{ collection: 'plan_packages', source: 'Procurement Plan document' }, { collection: 'tender_notices', source: 'Procurement Notices API' }]

/** Adds a snapshot's rows to a db object in place. Rows of the same project already there are removed first, and a source id is never added twice. */
export function mergeSnapshot(db: Record<string, any>, snapshot: Snapshot): void {
  const id = snapshot.manifest.project_id as string
  const docIds = new Set((db.documents as { doc_id: string; project_id: string }[] ?? []).filter((d) => d.project_id === id).map((d) => d.doc_id))
  for (const [name, rows] of Object.entries(snapshot.collections)) {
    if (!Array.isArray(db[name])) db[name] = []
    let target = db[name] as Rows
    if (name === 'chunks') target = (db[name] = target.filter((c) => !docIds.has(String(c.doc_id))))
    else if (name !== 'sources') target = (db[name] = target.filter((r) => r.project_id !== id))
    const known = new Set(target.map((r) => r.id))
    target.push(...rows.filter((r) => name !== 'sources' || !known.has(r.id)))
  }
}

/** Writes the files and, unless `merge` is false, merges into db.json. Returns the paths written. */
export function publishResult(result: PipelineResult, opts: { merge?: boolean; dirs?: Partial<Dirs> } = {}): string[] {
  const dirs = { ...DEFAULT_DIRS, ...opts.dirs }
  const id = result.summary.projectId
  const written: string[] = []
  const snapshot = result.snapshot as unknown as Snapshot
  const file = join(dirs.snapshots, `${id}.json`)
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
    for (const k of KEPT) {
      if (!old.collections[k.collection]?.length || snapshot.collections[k.collection]) continue
      snapshot.collections[k.collection] = old.collections[k.collection]!
      snapshot.manifest.counts[k.collection] = old.manifest.counts?.[k.collection] ?? old.collections[k.collection]!.length
      snapshot.manifest.sources.push(...(old.manifest.sources as { name: string }[]).filter((s) => String(s.name).startsWith(k.source)))
    }
  }
  mkdirSync(dirs.snapshots, { recursive: true })
  if (result.embeddings) snapshot.manifest.embedding = { model: result.embeddings.model, dimensions: result.embeddings.dimensions, vectors: result.embeddings.chunk_ids.length, tokens: result.embeddings.tokens, cost_usd: result.embeddings.costUsd }
  writeFileSync(file, JSON.stringify(snapshot, null, 1)); written.push(file)
  if (result.embeddings) written.push(...writeEmbeddings(id, result.embeddings, result.summary.map, dirs.embeddings))
  if (opts.merge !== false && existsSync(dirs.db)) {
    const db = JSON.parse(readFileSync(dirs.db, 'utf8'))
    mergeSnapshot(db, snapshot)
    const label = String(db.meta?.dataset_label ?? '')
    if (db.meta && !label.includes(id)) db.meta.dataset_label = label.includes('ingested snapshot') ? `${label}, ${id}` : `${label} · Real World Bank data, ingested snapshot: ${id}`
    writeFileSync(dirs.db, JSON.stringify(db, null, 2)); written.push(dirs.db)
  }
  return written
}

export interface EmbeddingManifest { project_id: string; model: string; dimensions: number; count: number; created_at: string; tokens: number; cost_usd: number; chunk_ids: string[]; hashes: string[]; map: { chunk_id: string; doc_type: string; x: number; y: number }[] | null }

export function writeEmbeddings(projectId: string, set: EmbeddedSet, map: EmbeddingManifest['map'], dir = DEFAULT_DIRS.embeddings): string[] {
  mkdirSync(dir, { recursive: true })
  const manifest: EmbeddingManifest = { project_id: projectId, model: set.model, dimensions: set.dimensions, count: set.chunk_ids.length, created_at: new Date().toISOString(), tokens: set.tokens, cost_usd: set.costUsd, chunk_ids: set.chunk_ids, hashes: set.hashes, map }
  const json = join(dir, `${projectId}.json`), bin = join(dir, `${projectId}.bin`)
  writeFileSync(bin, set.bytes)
  writeFileSync(json, JSON.stringify(manifest))
  return [json, bin]
}

export interface EmbeddingIndex { manifest: EmbeddingManifest; vectors: Float32Array[] }

/** The stored vectors of one project, or null when it has none (or the files do not agree). */
export function loadEmbeddings(projectId: string, dir = DEFAULT_DIRS.embeddings): EmbeddingIndex | null {
  const json = join(dir, `${projectId}.json`), bin = join(dir, `${projectId}.bin`)
  if (!existsSync(json) || !existsSync(bin)) return null
  try {
    const manifest = JSON.parse(readFileSync(json, 'utf8')) as EmbeddingManifest
    return { manifest, vectors: unpackVectors(new Uint8Array(readFileSync(bin)), manifest.count, manifest.dimensions) }
  } catch { return null }
}

/** Earlier vectors by chunk id, so a second run only pays for chunks whose text changed. */
export function previousVectors(projectId: string, dir = DEFAULT_DIRS.embeddings): Map<string, { hash: string; vector: number[] }> | undefined {
  const index = loadEmbeddings(projectId, dir)
  if (!index) return undefined
  return new Map(index.manifest.chunk_ids.map((id, i) => [id, { hash: index.manifest.hashes[i]!, vector: Array.from(index.vectors[i]!) }]))
}
