// Live ingestion for a hosted (serverless) deployment. Nothing here keeps state in memory between requests: the cache, the contract index, the
// published projects and their vectors all live in a Store (Vercel Blob). A run is driven by the browser, which asks for "the next step"
// until the answer is done. Each step runs the pipeline with a time budget; the pipeline stops at a safe point when the budget is spent and the
// next step continues from the cache. The functions in api/ are thin adapters over this file (bundled into api/_lib/ingest.mjs).
import { createHash, timingSafeEqual } from 'node:crypto'
import type { AssistantDb } from '../packages/data/src/assistant'
import { isProjectId, type IngestEvent, type ProjectCandidate } from '../packages/data/src/ingestEvents'
import { unpackVectors } from '../packages/data/src/vectors'
import { contractSourceFromStore, readIndexMeta } from './contractIndex'
import { findProjects } from './discover'
import { carryOver, embeddingManifest, embeddingNote, labelWithProject, mergeSnapshot, type EmbeddingManifest, type Snapshot } from './merge'
import { EMBED_DIMENSIONS, EMBED_MODEL, embedWith, nodeIo, openAiEmbedder } from './nodeIo'
import { ingestProject, Paused, type PipelineResult } from './pipeline'
import { blobStore, getJson, putJson, storeCache, type BlobSdk, type Store } from './store'

export type Env = Record<string, string | undefined>

/** True when a Blob store is connected: a read-write token, or a store id (the newer sign-in, used with Vercel's short-lived token). */
export const hasBlobStore = (env: Env) => Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID)

/** Vercel Blob as a Store when a Blob store is connected to the project, otherwise null. */
export async function blobStoreFromEnv(env: Env): Promise<Store | null> {
  if (!hasBlobStore(env)) return null
  const token = env.BLOB_READ_WRITE_TOKEN
  const blob = await import('@vercel/blob')
  // Assigned without a cast, so the compiler checks the SDK against the parts of it this code relies on.
  const sdk: BlobSdk = { put: blob.put, get: blob.get, list: blob.list }
  return blobStore(sdk, token, env.INGEST_BLOB_ACCESS === 'public' ? 'public' : 'private')
}

// ------------------------------------------------------------------ published projects in the store

const SNAPSHOT = (id: string) => `ingested/${id}.json`
const EMB_JSON = (id: string) => `embeddings/${id}.json`
const EMB_BIN = (id: string) => `embeddings/${id}.bin`

/** Writes a finished run to the store. The snapshot goes last: its presence is what makes a project count as published. */
export async function publishToStore(store: Store, result: PipelineResult): Promise<void> {
  const id = result.summary.projectId
  const snapshot = result.snapshot as unknown as Snapshot
  const old = await getJson<Snapshot>(store, SNAPSHOT(id))
  if (old) carryOver(snapshot, old)
  if (result.embeddings) {
    snapshot.manifest.embedding = embeddingNote(result.embeddings)
    await store.put(EMB_BIN(id), result.embeddings.bytes)
    await putJson(store, EMB_JSON(id), embeddingManifest(id, result.embeddings, result.summary.map))
  }
  await putJson(store, SNAPSHOT(id), snapshot)
}

/** The stored vectors of one project, or null when it has none (or the two files disagree). */
export async function loadEmbeddingsFromStore(store: Store, id: string) {
  const manifest = await getJson<EmbeddingManifest>(store, EMB_JSON(id))
  const bin = manifest && await store.get(EMB_BIN(id))
  if (!manifest || !bin) return null
  try { return { manifest, vectors: unpackVectors(bin, manifest.count, manifest.dimensions) } } catch { return null }
}

/** Ids of the projects that have vectors in the store. */
export async function indexedProjectsInStore(store: Store): Promise<string[]> {
  return (await store.list('embeddings/')).map((e) => /^embeddings\/(P\d{6})\.bin$/.exec(e.key)?.[1]).filter((x): x is string => Boolean(x))
}

/**
 * Keeps an in-memory db up to date with the projects published to the store, for the functions that answer from a copy of db.json. A project is
 * merged again when its snapshot was uploaded again. The store is asked at most once per `ttlMs`, so a burst of requests costs one listing.
 */
export function createIngestedSync(store: () => Promise<Store | null>, ttlMs = 5000, now: () => number = Date.now) {
  const seen = new Map<string, number>()
  let checked = -Infinity
  let pending: Promise<string[]> | null = null
  const run = async (db: Record<string, any>): Promise<string[]> => {
    const s = await store()
    if (!s) return []
    const merged: string[] = []
    for (const entry of await s.list('ingested/')) {
      if (seen.get(entry.key) === entry.uploadedAt) continue
      const snap = await getJson<Snapshot>(s, entry.key)
      if (!snap?.manifest?.project_id || !isProjectId(snap.manifest.project_id)) continue
      mergeSnapshot(db, snap)
      labelWithProject(db, snap.manifest.project_id)
      seen.set(entry.key, entry.uploadedAt)
      merged.push(snap.manifest.project_id)
    }
    return merged
  }
  return {
    /** Merges what is new. Never throws: a store that cannot be read leaves the db as it was. */
    async sync(db: Record<string, any>): Promise<string[]> {
      if (pending) return pending
      if (now() - checked < ttlMs) return []
      checked = now()
      pending = run(db).catch((e) => { checked = -Infinity; console.error('Could not read the ingested projects from the store', e); return [] }).finally(() => { pending = null })
      return pending
    },
    /** Forget when the store was last asked, so the next sync looks again at once. */
    refresh() { checked = -Infinity },
  }
}

// ------------------------------------------------------------------ requests

export interface HostedRequest { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: unknown }
export interface HostedResponse { status: number; body: unknown }

export interface HostedDeps {
  env: Env
  store: () => Promise<Store | null>
  now?: () => number
  /** Replaces the network and model access (tests). */
  io?: ReturnType<typeof nodeIo>
  embedder?: ReturnType<typeof openAiEmbedder>
}

const sha = (s: string) => createHash('sha256').update(s).digest()
const header = (h: HostedRequest['headers'], name: string) => { const v = h[name]; return Array.isArray(v) ? v[0] : v }
const today = (now: number) => new Date(now).toISOString().slice(0, 10)

export function createHosted(deps: HostedDeps) {
  const now = deps.now ?? Date.now
  const env = deps.env
  const budgetMs = Number(env.INGEST_STEP_BUDGET_MS) || 40_000
  const dailyLimit = Number(env.INGEST_DAILY_LIMIT ?? 5)
  const maxChunks = Number(env.INGEST_MAX_CHUNKS) || 3000
  const inFlight = new Set<string>()
  const embedderInfo = () => deps.embedder ?? openAiEmbedder(env)
  const sync = createIngestedSync(deps.store)

  /** Where the project search goes: the public Projects API, with short waits so a slow answer does not use up the request. */
  const searchIo = deps.io ?? nodeIo({ tries: 2, timeoutMs: 15_000, cache: { get: () => undefined, put: () => undefined } })

  const authorise = (req: HostedRequest): HostedResponse | null => {
    if (!env.INGEST_TOKEN) return { status: 403, body: { error: 'Live ingestion is switched off on this deployment. Set INGEST_TOKEN in the Vercel project settings to turn it on.' } }
    const given = header(req.headers, 'x-ingest-token') ?? ''
    // Digests of equal length, compared in constant time, so neither the length nor the content of the token leaks through timing.
    if (!timingSafeEqual(sha(given), sha(env.INGEST_TOKEN))) return { status: 401, body: { error: 'The ingest token is missing or wrong.' } }
    return null
  }

  async function config(): Promise<HostedResponse> {
    const store = await deps.store()
    const { embedder, reason } = embedderInfo()
    const index = store ? await readIndexMeta(store).catch(() => null) : null
    return { status: 200, body: {
      mode: 'steps', enabled: Boolean(env.INGEST_TOKEN && store), tokenRequired: true,
      storage: Boolean(store), index: index ? { built_at: index.built_at, projects: index.projects, records: index.records } : null,
      dailyLimit,
      embedding: embedder ? { available: true, model: EMBED_MODEL, dimensions: EMBED_DIMENSIONS } : { available: false, reason },
      reason: !env.INGEST_TOKEN ? 'INGEST_TOKEN is not set.' : !store ? 'No Blob store is connected (neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID is set).' : !index ? 'The contract index has not been built (run pnpm ingest:index).' : undefined,
    } }
  }

  async function start(req: HostedRequest): Promise<HostedResponse> {
    const denied = authorise(req)
    if (denied) return denied
    const projectId = (req.body as { projectId?: unknown } | null)?.projectId
    if (typeof projectId !== 'string' || !isProjectId(projectId)) return { status: 400, body: { error: 'A World Bank project id looks like P158504 (the letter P and six digits).' } }
    const store = await deps.store()
    if (!store) return { status: 503, body: { error: 'No Blob store is connected to this deployment (neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID is set).' } }
    if (!(await readIndexMeta(store))) return { status: 409, body: { error: 'The contract index has not been built, so a project cannot be ingested here yet. Run `pnpm ingest:index` with the Blob token.' } }
    // A soft daily limit on runs started. Two starts at the same moment can both pass; the cap on chunks per project bounds what a run costs.
    const key = `quota/${today(now())}.json`
    const used = (await getJson<{ started: number }>(store, key))?.started ?? 0
    if (used >= dailyLimit) return { status: 429, body: { error: `The daily limit of ${dailyLimit} ingestions has been reached. It resets at midnight UTC, or raise INGEST_DAILY_LIMIT.` } }
    await putJson(store, key, { started: used + 1 })
    return { status: 200, body: { projectId, remainingToday: dailyLimit - used - 1 } }
  }

  async function step(req: HostedRequest): Promise<HostedResponse> {
    const denied = authorise(req)
    if (denied) return denied
    const projectId = (req.body as { projectId?: unknown } | null)?.projectId
    if (typeof projectId !== 'string' || !isProjectId(projectId)) return { status: 400, body: { error: 'A World Bank project id looks like P158504 (the letter P and six digits).' } }
    const store = await deps.store()
    if (!store) return { status: 503, body: { error: 'No Blob store is connected to this deployment.' } }
    // One step per project at a time in this instance; the browser asks again a moment later. (Another instance could still run the same step: the cache makes that harmless.)
    if (inFlight.has(projectId)) return { status: 200, body: { status: 'busy', events: [] } }
    inFlight.add(projectId)
    const events: IngestEvent[] = []
    const started = now()
    try {
      const { embedder, reason } = embedderInfo()
      const io = { ...(deps.io ?? nodeIo({ tries: 2, timeoutMs: 20_000 })), cache: storeCache(store) }
      const result = await ingestProject(projectId, {
        io, contractSource: contractSourceFromStore(store), embedder, noEmbedderReason: reason, maxEmbedChunks: maxChunks,
        shouldPause: () => now() - started > budgetMs,
        previous: await previousFromStore(store, projectId),
        onEvent: (e) => { if (events.length < 2000) events.push(e) },
      })
      try { await publishToStore(store, result) } catch (e) {
        events.push({ type: 'error', stage: 'publish', message: `The result could not be saved to the store: ${e instanceof Error ? e.message : e}` })
        return { status: 200, body: { status: 'failed', events } }
      }
      sync.refresh()
      events.push({ type: 'stage', stage: 'publish', status: 'done', detail: 'Added to the app' }, { type: 'done', summary: result.summary })
      return { status: 200, body: { status: 'done', events } }
    } catch (e) {
      if (e instanceof Paused) return { status: 200, body: { status: 'paused', events } }
      // The pipeline reports its own failures as an error event; anything else is reported here.
      if (!events.some((x) => x.type === 'error')) events.push({ type: 'error', stage: null, message: e instanceof Error ? e.message : String(e) })
      return { status: 200, body: { status: 'failed', events } }
    } finally { inFlight.delete(projectId) }
  }

  return {
    async handle(req: HostedRequest): Promise<HostedResponse> {
      try {
        const route = req.path.replace(/^\/+|\/+$/g, '')
        if (req.method === 'GET' && route === 'config') return await config()
        if (req.method === 'POST' && route === 'start') return await start(req)
        if (req.method === 'POST' && route === 'step') return await step(req)
        return { status: 404, body: { error: 'Not found' } }
      } catch (e) {
        console.error('ingest failed', e)
        return { status: 500, body: { error: `The ingest function failed: ${e instanceof Error ? e.message : e}`.slice(0, 400) } }
      }
    },
    /** Merges newly published projects into an in-memory db. */
    syncIngested: (db: Record<string, any>) => sync.sync(db),
    /** What the chat function needs: the project search and the search by meaning over the store. */
    copilotExtras() {
      return {
        findProjects: (q: string): Promise<ProjectCandidate[]> => findProjects(q, searchIo),
        semantic: {
          embedQuery: async (text: string) => {
            if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
            return (await embedWith(env.OPENAI_API_KEY, [text])).vectors[0]!
          },
          loadIndex: async (id: string) => { const s = await deps.store(); return s ? loadEmbeddingsFromStore(s, id) : null },
          indexedProjects: async () => { const s = await deps.store(); return s ? indexedProjectsInStore(s) : [] },
        },
      }
    },
  }
}

async function previousFromStore(store: Store, id: string) {
  const index = await loadEmbeddingsFromStore(store, id)
  if (!index) return undefined
  return new Map(index.manifest.chunk_ids.map((cid, i) => [cid, { hash: index.manifest.hashes[i]!, vector: Array.from(index.vectors[i]!) }]))
}

/** One instance per set of environment values, so a warm function keeps its sync state and its store handle between requests. */
let shared: ReturnType<typeof createHosted> | null = null
export function getHosted(env: Env = process.env) {
  shared ??= createHosted({ env, store: (() => { let s: Promise<Store | null> | null = null; return () => (s ??= blobStoreFromEnv(env)) })() })
  return shared
}

/** The same db shape the assistant reads, merged for a single call: used by the chat function before it answers. */
export async function dbWithIngested(db: AssistantDb, env: Env = process.env): Promise<AssistantDb> {
  await getHosted(env).syncIngested(db as unknown as Record<string, any>)
  return db
}
