// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { blobStore, checkKey, fileStore, getJson, memoryStore, putJson, storeCache, type BlobSdk, type Store } from './store'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'pi-store-')); dirs.push(d); return d }

/** The same behaviour from every backend. */
const backends: [string, () => Store][] = [['memory', () => memoryStore()], ['files', () => fileStore(tmp())]]
describe.each(backends)('%s store', (_n, make) => {
  it('returns what was put, null for a missing key, and replaces on a second put', async () => {
    const s = make()
    expect(await s.get('a/b.json')).toBeNull()
    await s.put('a/b.json', 'one'); await s.put('a/b.json', 'two')
    expect(new TextDecoder().decode((await s.get('a/b.json'))!)).toBe('two')
    await putJson(s, 'a/c.json', { x: 1 })
    expect(await getJson(s, 'a/c.json')).toEqual({ x: 1 })
  })
  it('lists by prefix with size and time', async () => {
    const s = make()
    await s.put('ingested/P1.json', 'abc'); await s.put('ingested/P2.json', 'de'); await s.put('cache/x.json.gz', new Uint8Array([1, 2, 3, 4]))
    const l = await s.list('ingested/')
    expect(l.map((e) => e.key).sort()).toEqual(['ingested/P1.json', 'ingested/P2.json'])
    expect(l.find((e) => e.key === 'ingested/P1.json')!.size).toBe(3)
    expect(l[0]!.uploadedAt).toBeGreaterThan(0)
    expect(await s.list('nothing/')).toEqual([])
  })
  it('keeps bytes exactly', async () => {
    const s = make(); const data = new Uint8Array([0, 255, 127, 128, 1])
    await s.put('bin/x.bin', data)
    expect([...(await s.get('bin/x.bin'))!]).toEqual([...data])
  })
})

describe('checkKey', () => {
  it('refuses keys that could leave the store or are malformed', () => {
    for (const bad of ['../x', 'a/../b', '/abs', 'a//b', 'a b', '', 'a\\b', 'x'.repeat(300)]) expect(() => checkKey(bad), bad).toThrow('Invalid store key')
    expect(checkKey('contracts-index/07.json.gz')).toBe('contracts-index/07.json.gz')
  })
  it('is enforced by every backend', async () => {
    await expect(memoryStore().put('../x', 'y')).rejects.toThrow('Invalid store key')
    await expect(fileStore(tmp()).get('../x')).rejects.toThrow('Invalid store key')
  })
})

describe('storeCache', () => {
  it('round-trips JSON values, gzipped, under its prefix', async () => {
    const s = memoryStore(); const c = storeCache(s)
    expect(await c.get('project-P1')).toBeUndefined()
    await c.put('project-P1', { name: 'x', rows: [1, 2, 3] })
    expect(await c.get('project-P1')).toEqual({ name: 'x', rows: [1, 2, 3] })
    expect([...s.data.keys()]).toEqual(['cache/project-P1.json.gz'])
    expect([...s.data.values()][0]!.bytes[0]).toBe(0x1f) // gzip magic number
  })
})

describe('blobStore (against a fake SDK)', () => {
  function fake() {
    const blobs = new Map<string, { body: Uint8Array; at: Date }>()
    const calls: { fn: string; args: unknown[] }[] = []
    const sdk: BlobSdk = {
      async put(path, body, opts) { calls.push({ fn: 'put', args: [path, opts] }); blobs.set(path, { body: typeof body === 'string' ? new TextEncoder().encode(body) : body, at: new Date(1000 + blobs.size) }); return { url: `https://store.test/${path}` } },
      async head(path) { calls.push({ fn: 'head', args: [path] }); if (!blobs.has(path)) { const e = new Error('The requested blob does not exist'); e.name = 'BlobNotFoundError'; throw e } return { url: `https://store.test/${path}` } },
      async list(opts) {
        const all = [...blobs].filter(([p]) => p.startsWith(String(opts.prefix))).map(([pathname, v]) => ({ pathname, size: v.body.length, uploadedAt: v.at }))
        const from = opts.cursor ? Number(opts.cursor) : 0, size = 2
        return { blobs: all.slice(from, from + size), hasMore: from + size < all.length, cursor: String(from + size) }
      },
    }
    const fetched: string[] = []
    const fetchFn = (async (url: string) => { fetched.push(url); const path = new URL(url).pathname.slice(1); const b = blobs.get(path); return b ? new Response(b.body as BodyInit) : new Response('', { status: 404 }) }) as unknown as typeof fetch
    return { sdk, calls, fetched, fetchFn, blobs }
  }
  it('writes at the exact key, overwriting, and reads back through head and a cache-busted URL', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok', f.fetchFn, () => 42)
    await s.put('ingested/P1.json', '{"a":1}'); await s.put('ingested/P1.json', '{"a":2}')
    expect(f.calls[0]).toMatchObject({ fn: 'put', args: ['ingested/P1.json', expect.objectContaining({ token: 'tok', access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' })] })
    expect(await getJson(s, 'ingested/P1.json')).toEqual({ a: 2 })
    expect(f.fetched).toEqual(['https://store.test/ingested/P1.json?t=42'])
  })
  it('returns null for a blob that does not exist, and passes other errors on', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok', f.fetchFn)
    expect(await s.get('nope.json')).toBeNull()
    f.sdk.head = async () => { throw new Error('rate limited') }
    await expect(s.get('x.json')).rejects.toThrow('rate limited')
  })
  it('lists across pages', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok', f.fetchFn)
    for (const n of [1, 2, 3, 4, 5]) await s.put(`ingested/P${n}.json`, 'x')
    await s.put('cache/other.json.gz', 'x')
    const l = await s.list('ingested/')
    expect(l.map((e) => e.key).sort()).toEqual(['ingested/P1.json', 'ingested/P2.json', 'ingested/P3.json', 'ingested/P4.json', 'ingested/P5.json'])
    expect(l[0]!.uploadedAt).toBeGreaterThan(0)
  })
})
