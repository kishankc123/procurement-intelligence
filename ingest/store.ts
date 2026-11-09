// A small key-value store for ingestion artifacts: cached API responses, the contract index, published snapshots and vectors.
// Three backends behind one interface: memory (tests), files (local), and Vercel Blob (hosted). Only blobStore talks to a vendor, and it
// takes the SDK as an argument, so tests use a fake and the vendor API is the one thing to check against the real service.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { PipelineIo } from './pipeline'

export interface StoreEntry { key: string; size: number; uploadedAt: number }
export interface Store {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, data: Uint8Array | string): Promise<void>
  /** Entries whose key starts with `prefix`, in no particular order. */
  list(prefix: string): Promise<StoreEntry[]>
}

/** Keys are built from validated ids and fixed prefixes; this stops anything else (a path walk, a space) from becoming a key. */
export function checkKey(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,200}$/.test(key) || key.includes('..') || key.includes('//')) throw new Error(`Invalid store key: ${key.slice(0, 60)}`)
  return key
}
const bytes = (d: Uint8Array | string) => (typeof d === 'string' ? new TextEncoder().encode(d) : d)

export const getText = async (s: Store, key: string) => { const b = await s.get(key); return b ? new TextDecoder().decode(b) : null }
export async function getJson<T>(s: Store, key: string): Promise<T | null> { const t = await getText(s, key); return t === null ? null : JSON.parse(t) as T }
export const putJson = (s: Store, key: string, value: unknown) => s.put(key, JSON.stringify(value))

export function memoryStore(now: () => number = Date.now): Store & { data: Map<string, { bytes: Uint8Array; uploadedAt: number }> } {
  const data = new Map<string, { bytes: Uint8Array; uploadedAt: number }>()
  return {
    data,
    async get(key) { return data.get(checkKey(key))?.bytes ?? null },
    async put(key, d) { data.set(checkKey(key), { bytes: bytes(d), uploadedAt: now() }) },
    async list(prefix) { return [...data].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.bytes.length, uploadedAt: v.uploadedAt })) },
  }
}

export function fileStore(root: string): Store {
  const path = (key: string) => join(root, checkKey(key))
  const walk = async (dir: string, base: string): Promise<StoreEntry[]> => {
    let names: string[]
    try { names = await readdir(dir) } catch { return [] }
    const out: StoreEntry[] = []
    for (const name of names) {
      const full = join(dir, name), s = await stat(full)
      if (s.isDirectory()) out.push(...await walk(full, `${base}${name}/`))
      else out.push({ key: `${base}${name}`, size: s.size, uploadedAt: s.mtimeMs })
    }
    return out
  }
  return {
    async get(key) { try { return new Uint8Array(await readFile(path(key))) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e } },
    async put(key, d) { const p = path(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, bytes(d)) },
    async list(prefix) { return (await walk(root, '')).filter((e) => e.key.startsWith(prefix)) },
  }
}

/** The parts of @vercel/blob (2.x) used here, with the options this code passes. The real SDK is assigned to this without a cast (see hosted.ts), so the compiler checks it. */
export interface BlobSdk {
  put(pathname: string, body: string | Buffer, opts: { token?: string; access: 'private' | 'public'; addRandomSuffix: boolean; allowOverwrite: boolean; cacheControlMaxAge: number; contentType: string }): Promise<unknown>
  /** Resolves to null when the blob does not exist. The stream is null when the server answers "not modified". */
  get(pathname: string, opts: { token?: string; access: 'private' | 'public'; useCache: boolean }): Promise<{ stream: ReadableStream<Uint8Array> | null } | null>
  list(opts: { token?: string; prefix: string; cursor?: string; limit: number }): Promise<{ blobs: { pathname: string; size: number; uploadedAt: Date | string }[]; cursor?: string; hasMore?: boolean }>
}

/**
 * Vercel Blob as a Store. Blobs are written at the exact key and overwritten in place, and read with the CDN cache off, so a blob that was just
 * overwritten (a job's cache entry, the index of ingested projects) is never read back stale. `access` must match how the Blob store was created in
 * the Vercel dashboard: a private store needs 'private' (the default here; nothing is world-readable), a public one needs 'public'.
 */
export function blobStore(sdk: BlobSdk, token: string | undefined, access: 'private' | 'public' = 'private'): Store {
  // With no token the SDK signs in with the store id (BLOB_STORE_ID) and Vercel's short-lived token, which a Vercel function gets by itself.
  const auth = token ? { token } : {}
  return {
    async get(key) {
      let r
      try { r = await sdk.get(checkKey(key), { ...auth, access, useCache: false }) } catch (e) {
        if (e instanceof Error && (e.name === 'BlobNotFoundError' || /not exist|not found/i.test(e.message))) return null
        throw e
      }
      if (!r?.stream) return null
      return new Uint8Array(await new Response(r.stream).arrayBuffer())
    },
    async put(key, data) {
      await sdk.put(checkKey(key), typeof data === 'string' ? data : Buffer.from(data), { ...auth, access, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: key.endsWith('.json') ? 'application/json' : 'application/octet-stream' })
    },
    async list(prefix) {
      const out: StoreEntry[] = []
      let cursor: string | undefined
      do {
        const page = await sdk.list({ ...auth, prefix, cursor, limit: 1000 })
        out.push(...page.blobs.map((b) => ({ key: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() })))
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return out
    },
  }
}

/** The pipeline's cache on a Store: gzipped JSON under a prefix. Used on Vercel, where a run is split over several requests and the cache is what carries the work between them. */
export function storeCache(store: Store, prefix = 'cache/'): PipelineIo['cache'] {
  const key = (k: string) => `${prefix}${k}.json.gz`
  return {
    async get<T>(k: string): Promise<T | undefined> {
      const b = await store.get(key(k))
      return b ? JSON.parse(new TextDecoder().decode(gunzipSync(b))) as T : undefined
    },
    async put(k: string, value: unknown) { await store.put(key(k), new Uint8Array(gzipSync(JSON.stringify(value)))) },
  }
}
