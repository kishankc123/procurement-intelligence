// An index of the public contract-awards list, grouped by project, so that ingesting one project reads one small file instead of scanning every
// page of the list. Built once (pnpm ingest:index, run on a computer with network access) and kept in a Store: Vercel Blob when hosted.
// The list is cut into 100 shards by the last two digits of the project id; a shard holds every contract row of the projects that fall in it.
import { gunzipSync, gzipSync } from 'node:zlib'
import { isProjectId } from '../packages/data/src/ingestEvents'
import type { ContractSource, PipelineIo, RawContract } from './pipeline'
import { getJson, putJson, type Store } from './store'

export const INDEX_PREFIX = 'contracts-index/'
const shardKey = (shard: string) => `${INDEX_PREFIX}${shard}.json.gz`
export const shardOf = (projectId: string) => projectId.slice(-2)

export interface IndexMeta { built_at: string; records: number; projects: number; pages: number; source: string }

const CONTRACTS_API = 'https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005&resourceId=RS00005&type=json'

export interface BuildOptions {
  io: Pick<PipelineIo, 'getJson'> & Partial<Pick<PipelineIo, 'cache'>>
  store: Store
  pageSize?: number
  concurrency?: number
  onProgress?: (done: number, total: number) => void
  now?: () => Date
}

/** Reads every page of the public contract list and writes the index. Memory use is the whole list (a few hundred MB), so run it on a computer, not in a function. */
export async function buildContractIndex(opts: BuildOptions): Promise<IndexMeta> {
  const pageSize = opts.pageSize ?? 1000
  const url = (skip: number) => `${CONTRACTS_API}&top=${pageSize}&skip=${skip}`
  const cacheKey = (n: number) => `contracts-page-${pageSize}-${n}`
  const readPage = async (n: number): Promise<{ count?: number; data: RawContract[] }> => {
    const hit = await opts.io.cache?.get<{ count?: number; data: RawContract[] }>(cacheKey(n))
    if (hit && (n > 0 || hit.count !== undefined)) return hit
    const body = await opts.io.getJson(url(n * pageSize))
    const page = { count: Number(body.count), data: body.data as RawContract[] }
    await opts.io.cache?.put(cacheKey(n), page)
    return page
  }
  const first = await readPage(0)
  const pages = Math.max(1, Math.ceil(Number(first.count) / pageSize))
  const shards = new Map<string, Map<string, RawContract[]>>()
  let records = 0
  const take = (rows: RawContract[]) => {
    for (const r of rows) {
      if (!isProjectId(String(r.project_id))) continue
      const shard = shards.get(shardOf(r.project_id)) ?? new Map<string, RawContract[]>()
      shards.set(shardOf(r.project_id), shard)
      const list = shard.get(r.project_id) ?? []
      shard.set(r.project_id, list)
      list.push(r); records++
    }
  }
  take(first.data)
  let next = 1, done = 1
  opts.onProgress?.(done, pages)
  // Pages are read a few at a time, but their rows are taken in page order so the index does not depend on which page finished first.
  const rowsOf = new Map<number, RawContract[]>()
  let taken = 1
  const worker = async () => {
    while (next < pages) {
      const n = next++
      rowsOf.set(n, (await readPage(n)).data)
      for (; rowsOf.has(taken); taken++) { take(rowsOf.get(taken)!); rowsOf.delete(taken) }
      opts.onProgress?.(++done, pages)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 5, pages) }, worker))

  let projects = 0
  for (const [shard, map] of shards) {
    projects += map.size
    await opts.store.put(shardKey(shard), new Uint8Array(gzipSync(JSON.stringify(Object.fromEntries(map)))))
  }
  const meta: IndexMeta = { built_at: (opts.now ?? (() => new Date()))().toISOString(), records, projects, pages, source: CONTRACTS_API.replace(/&.*$/, '') }
  await putJson(opts.store, `${INDEX_PREFIX}meta.json`, meta)
  return meta
}

export const readIndexMeta = (store: Store) => getJson<IndexMeta>(store, `${INDEX_PREFIX}meta.json`)

/** A ContractSource over a built index. Null for every project when there is no index (the caller then scans or reports it). */
export function contractSourceFromStore(store: Store): ContractSource {
  let meta: Promise<IndexMeta | null> | null = null
  let last: { shard: string; rows: Record<string, RawContract[]> } | null = null
  return {
    async forProject(projectId) {
      meta ??= readIndexMeta(store)
      const m = await meta
      if (!m) { meta = null; return null }
      const shard = shardOf(projectId)
      if (last?.shard !== shard) {
        const bytes = await store.get(shardKey(shard))
        last = { shard, rows: bytes ? JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as Record<string, RawContract[]> : {} }
      }
      // The index covers the whole list, so a project with no entry has no contract awards (as with P102398), which is an answer, not a gap.
      return { rows: last.rows[projectId] ?? [], builtAt: m.built_at }
    },
  }
}
