// The pure part of publishing, with no file or network access: merging a snapshot into a db object, carrying over what the model scripts added,
// and the shape of the embedding manifest. Shared by the local file publisher (publish.ts) and the hosted one (hosted.ts).

export type Rows = Record<string, unknown>[]
export interface Snapshot { manifest: Record<string, any>; collections: Record<string, Rows> }

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

/** Notes the dataset label with a project's id (once). */
export function labelWithProject(db: Record<string, any>, id: string): void {
  const label = String(db.meta?.dataset_label ?? '')
  if (db.meta && !label.includes(id)) db.meta.dataset_label = label.includes('ingested snapshot') ? `${label}, ${id}` : `${label} · Real World Bank data, ingested snapshot: ${id}`
}

/** Copies plan packages and tender notices from an earlier snapshot of the same project into a new one that lacks them. */
export function carryOver(fresh: Snapshot, old: Snapshot): void {
  for (const k of KEPT) {
    if (!old.collections[k.collection]?.length || fresh.collections[k.collection]) continue
    fresh.collections[k.collection] = old.collections[k.collection]!
    fresh.manifest.counts[k.collection] = old.manifest.counts?.[k.collection] ?? old.collections[k.collection]!.length
    fresh.manifest.sources = [...(fresh.manifest.sources as { name: string }[]).filter((s) => !String(s.name).startsWith(k.source)), ...(old.manifest.sources as { name: string }[]).filter((s) => String(s.name).startsWith(k.source))]
  }
}

export interface EmbeddingManifest { project_id: string; model: string; dimensions: number; count: number; created_at: string; tokens: number; cost_usd: number; chunk_ids: string[]; hashes: string[]; map: { chunk_id: string; doc_type: string; x: number; y: number }[] | null }

export function embeddingManifest(projectId: string, set: { model: string; dimensions: number; chunk_ids: string[]; hashes: string[]; tokens: number; costUsd: number }, map: EmbeddingManifest['map'], now = new Date()): EmbeddingManifest {
  return { project_id: projectId, model: set.model, dimensions: set.dimensions, count: set.chunk_ids.length, created_at: now.toISOString(), tokens: set.tokens, cost_usd: set.costUsd, chunk_ids: set.chunk_ids, hashes: set.hashes, map }
}

/** What the snapshot's manifest records about its embeddings. */
export const embeddingNote = (set: { model: string; dimensions: number; chunk_ids: string[]; tokens: number; costUsd: number }) =>
  ({ model: set.model, dimensions: set.dimensions, vectors: set.chunk_ids.length, tokens: set.tokens, cost_usd: set.costUsd })
