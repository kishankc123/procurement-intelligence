// @vitest-environment node
// Loads the real Vercel function files (api/ingest and api/[...path].js) and the generated bundle behind them, over plain HTTP, to catch wiring and
// import mistakes the unit tests cannot see. No Blob store or network is involved: the functions are called with the environment of an unconfigured deployment.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
let ingest: Server, data: Server, ingestBase = '', dataBase = ''

/** Vercel hands a function a request whose JSON body is already parsed; this does the same. */
const serve = (handler: (req: any, res: any) => unknown) => new Promise<{ server: Server; base: string }>((resolve) => {
  const server = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (c) => parts.push(c))
    req.on('end', () => {
      const text = Buffer.concat(parts).toString('utf8')
      try { (req as any).body = text ? JSON.parse(text) : undefined } catch { (req as any).body = text }
      void handler(req, res)
    })
  }).listen(0, () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }))
})

beforeAll(async () => {
  delete process.env.INGEST_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_STORE_ID
  const ingestHandler = (await import(pathToFileURL(root + 'api/ingest/[...path].mjs').href)).default
  const jsonHandler = createRequire(import.meta.url)(root + 'api/[...path].js')
  ;({ server: ingest, base: ingestBase } = await serve(ingestHandler))
  ;({ server: data, base: dataBase } = await serve(jsonHandler))
})
afterAll(async () => { await Promise.all([ingest, data].map((s) => new Promise((r) => s.close(r)))) })

describe('api/ingest on an unconfigured deployment', () => {
  it('says live ingestion is off and why', async () => {
    const res = await fetch(`${ingestBase}/api/ingest/config`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ mode: 'steps', enabled: false, storage: false, tokenRequired: true, reason: 'INGEST_TOKEN is not set.' })
  })
  it('refuses to start or step while it is switched off, and 404s other paths', async () => {
    for (const path of ['start', 'step']) {
      const res = await fetch(`${ingestBase}/api/ingest/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'P158504' }) })
      expect(res.status, path).toBe(403)
      expect((await res.json() as { error: string }).error).toContain('INGEST_TOKEN')
    }
    expect((await fetch(`${ingestBase}/api/ingest/nope`)).status).toBe(404)
  })
})

describe('api/[...path].js (the data API)', () => {
  it('still serves the stored projects when no Blob store is connected', async () => {
    const res = await fetch(`${dataBase}/api/projects`)
    expect(res.status).toBe(200)
    const projects = await res.json() as { project_id: string }[]
    expect(projects.length).toBeGreaterThan(1)
    expect(projects.some((p) => p.project_id === 'P158504')).toBe(true)
  })
})
