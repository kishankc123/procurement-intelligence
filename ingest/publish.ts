// Writes an ingestion result to disk and makes it visible to the app: the snapshot (mock/ingested/<id>.json), the vectors (mock/embeddings/<id>.*)
// and the merge into mock/db.json, which json-server serves. The merge is the same one `pnpm reset-db` does, and running it again for the same
// project replaces that project's rows instead of adding them twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unpackVectors } from '../packages/data/src/vectors'
import { carryOver, embeddingManifest, embeddingNote, labelWithProject, mergeSnapshot, type EmbeddingManifest, type Snapshot } from './merge'
import type { EmbeddedSet, PipelineResult } from './pipeline'
import { ROOT } from './nodeIo'

export { mergeSnapshot, type EmbeddingManifest, type Snapshot }

export interface Dirs { snapshots: string; embeddings: string; db: string }
export const DEFAULT_DIRS: Dirs = { snapshots: join(ROOT, 'mock', 'ingested'), embeddings: join(ROOT, 'mock', 'embeddings'), db: join(ROOT, 'mock', 'db.json') }

/** Writes the files and, unless `merge` is false, merges into db.json. Returns the paths written. */
export function publishResult(result: PipelineResult, opts: { merge?: boolean; dirs?: Partial<Dirs> } = {}): string[] {
  const dirs = { ...DEFAULT_DIRS, ...opts.dirs }
  const id = result.summary.projectId
  const written: string[] = []
  const snapshot = result.snapshot as unknown as Snapshot
  const file = join(dirs.snapshots, `${id}.json`)
  if (existsSync(file)) {
    carryOver(snapshot, JSON.parse(readFileSync(file, 'utf8')) as Snapshot)
  }
  mkdirSync(dirs.snapshots, { recursive: true })
  if (result.embeddings) snapshot.manifest.embedding = embeddingNote(result.embeddings)
  writeFileSync(file, JSON.stringify(snapshot, null, 1)); written.push(file)
  if (result.embeddings) written.push(...writeEmbeddings(id, result.embeddings, result.summary.map, dirs.embeddings))
  if (opts.merge !== false && existsSync(dirs.db)) {
    const db = JSON.parse(readFileSync(dirs.db, 'utf8'))
    mergeSnapshot(db, snapshot)
    labelWithProject(db, id)
    writeFileSync(dirs.db, JSON.stringify(db, null, 2)); written.push(dirs.db)
  }
  return written
}

export function writeEmbeddings(projectId: string, set: EmbeddedSet, map: EmbeddingManifest['map'], dir = DEFAULT_DIRS.embeddings): string[] {
  mkdirSync(dir, { recursive: true })
  const manifest = embeddingManifest(projectId, set, map)
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
