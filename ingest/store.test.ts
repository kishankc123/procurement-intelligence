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
      async put(path, body, opts) { calls.push({ fn: 'put', args: [path, opts] }); blobs.set(path, { body: typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body), at: new Date(1000 + blobs.size) }) },
      async get(path, opts) { calls.push({ fn: 'get', args: [path, opts] }); const b = blobs.get(path); return b ? { stream: new Response(b.body as BodyInit).body } : null },
      async list(opts) {
        calls.push({ fn: 'list', args: [opts] })
        const all = [...blobs].filter(([p]) => p.startsWith(String(opts.prefix))).map(([pathname, v]) => ({ pathname, size: v.body.length, uploadedAt: v.at }))
        const from = opts.cursor ? Number(opts.cursor) : 0, size = 2
        return { blobs: all.slice(from, from + size), hasMore: from + size < all.length, cursor: String(from + size) }
      },
    }
    return { sdk, calls, blobs }
  }
  it('writes at the exact key, overwriting, and reads the latest content with the CDN cache off', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok')
    await s.put('ingested/P1.json', '{"a":1}'); await s.put('ingested/P1.json', '{"a":2}')
    expect(f.calls[0]).toMatchObject({ fn: 'put', args: ['ingested/P1.json', expect.objectContaining({ token: 'tok', access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' })] })
    expect(await getJson(s, 'ingested/P1.json')).toEqual({ a: 2 })
    expect(f.calls.at(-1)).toMatchObject({ fn: 'get', args: ['ingested/P1.json', { token: 'tok', access: 'private', useCache: false }] })
  })
  it('sends no token when it has none, so the SDK signs in with the store id and Vercel\'s token', async () => {
    const f = fake(); const s = blobStore(f.sdk, undefined)
    await s.put('a.json', '1'); await s.get('a.json'); await s.list('a')
    for (const c of f.calls) expect(c.args[c.fn === 'list' ? 0 : 1]).not.toHaveProperty('token')
  })
  it('uses the access mode of the store it was given', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok', 'public')
    await s.put('a.json', '1'); await s.get('a.json')
    expect(f.calls.map((c) => (c.args[1] as { access: string }).access)).toEqual(['public', 'public'])
  })
  it('returns null for a blob that does not exist or has no body, and passes other errors on', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok')
    expect(await s.get('nope.json')).toBeNull()
    f.sdk.get = async () => ({ stream: null })
    expect(await s.get('x.json')).toBeNull()
    f.sdk.get = async () => { const e = new Error('The requested blob does not exist'); e.name = 'BlobNotFoundError'; throw e }
    expect(await s.get('x.json')).toBeNull()
    f.sdk.get = async () => { throw new Error('rate limited') }
    await expect(s.get('x.json')).rejects.toThrow('rate limited')
  })
  it('lists across pages', async () => {
    const f = fake(); const s = blobStore(f.sdk, 'tok')
    for (const n of [1, 2, 3, 4, 5]) await s.put(`ingested/P${n}.json`, 'x')
    await s.put('cache/other.json.gz', 'x')
    const l = await s.list('ingested/')
    expect(l.map((e) => e.key).sort()).toEqual(['ingested/P1.json', 'ingested/P2.json', 'ingested/P3.json', 'ingested/P4.json', 'ingested/P5.json'])
    expect(l[0]!.uploadedAt).toBeGreaterThan(0)
  })
})
