// Search by meaning over the embedded chunks of ingested projects, blended with the keyword search the assistant already has.
// The question is embedded with the same model as the chunks; chunks are ranked by cosine similarity (vectors are unit length, so a dot product);
// the two rankings are fused (reciprocal rank). A chunk with no keyword hit must still reach MIN_SIMILARITY to be returned, so a question the
// documents do not answer gives "No supporting evidence found" instead of the nearest unrelated passage.
import { readdirSync } from 'node:fs'
import type { AssistantDb } from '../packages/data/src/assistant'
import { searchDocuments } from '../packages/data/src/assistantData'
import { fuseRanks, normalise, topK } from '../packages/data/src/vectors'
import { DEFAULT_DIRS, loadEmbeddings, type EmbeddingIndex } from '../ingest/publish'

/** Cosine similarity a chunk needs when no keyword backs it up. A starting value for text-embedding-3-small, not a measured one: tune it on real questions. */
export const MIN_SIMILARITY = 0.3

export interface SemanticDeps {
  /** Embeds the question; throws when the model cannot be reached. */
  embedQuery: (text: string) => Promise<number[]>
  loadIndex?: (projectId: string) => EmbeddingIndex | null
  /** Projects that have vectors on disk. */
  indexedProjects?: () => string[]
  minSimilarity?: number
}

export const indexedProjectIds = (dir = DEFAULT_DIRS.embeddings): string[] => {
  try { return readdirSync(dir).filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)) } catch { return [] }
}

export interface SemanticResult {
  results: { chunk_id: string; document: string; document_type: string; date: string; page: number; section: string; snippet: string; similarity?: number | null; matched_by?: ('meaning' | 'keywords')[] }[] | string
  method: 'meaning+keywords' | 'keywords only'
  /** Why meaning search was not used, when it was not. */
  note?: string
}

export async function semanticSearch(db: AssistantDb, query: string, deps: SemanticDeps, projectId?: string, limit = 5): Promise<SemanticResult> {
  const keyword = searchDocuments(db, query, projectId, limit * 3)
  const keywordHits = typeof keyword.results === 'string' ? [] : keyword.results
  const load = deps.loadIndex ?? ((id: string) => loadEmbeddings(id))
  const candidates = projectId ? [projectId] : (deps.indexedProjects ?? indexedProjectIds)().filter((id) => db.projects.some((p) => p.project_id === id))
  const indexes = candidates.map((id) => ({ id, index: load(id) })).filter((x): x is { id: string; index: EmbeddingIndex } => x.index !== null)

  if (indexes.length === 0) {
    return { results: keyword.results, method: 'keywords only', note: projectId ? `${projectId} has no embedded chunks, so only keywords were used.` : 'No project has embedded chunks yet, so only keywords were used.' }
  }
  let q: Float32Array
  try { q = normalise(await deps.embedQuery(query)) } catch (e) {
    return { results: keyword.results, method: 'keywords only', note: `The question could not be embedded (${e instanceof Error ? e.message : e}), so only keywords were used.` }
  }
  const min = deps.minSimilarity ?? MIN_SIMILARITY
  const similarity = new Map<string, number>()
  for (const { index } of indexes) {
    if (index.manifest.dimensions !== q.length) continue
    for (const hit of topK(q, index.vectors, limit * 3)) similarity.set(index.manifest.chunk_ids[hit.index]!, hit.score)
  }
  const byMeaning = [...similarity].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const byKeywords = keywordHits.map((h) => h.chunk_id)
  const keywordSet = new Set(byKeywords)
  const fused = fuseRanks([byMeaning, byKeywords]).filter(({ id }) => keywordSet.has(id) || (similarity.get(id) ?? 0) >= min).slice(0, Math.min(Math.max(limit, 1), 8))
  if (fused.length === 0) return { results: 'No supporting evidence found in the ingested documents.', method: 'meaning+keywords' }

  const chunks = new Map(db.chunks.map((c) => [c.chunk_id, c]))
  const docs = new Map(db.documents.map((d) => [d.doc_id, d]))
  const snippets = new Map(keywordHits.map((h) => [h.chunk_id, h.snippet]))
  return {
    method: 'meaning+keywords',
    results: fused.flatMap(({ id }) => {
      const c = chunks.get(id), d = c && docs.get(c.doc_id)
      if (!c || !d) return []
      const sim = similarity.get(id)
      return [{
        chunk_id: id, document: d.title, document_type: d.type, date: d.date, page: c.page, section: c.section_path, snippet: snippets.get(id) ?? c.text.slice(0, 400),
        similarity: sim === undefined ? null : Math.round(sim * 1000) / 1000,
        matched_by: [...(sim !== undefined && sim >= min ? ['meaning' as const] : []), ...(keywordSet.has(id) ? ['keywords' as const] : [])],
      }]
    }),
  }
}
