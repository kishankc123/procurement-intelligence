// HTTP routes for live ingestion, mounted by server/index.ts under /ingest:
//   GET  /ingest/config        what a run can do here (is there an embedding model?)
//   GET  /ingest/find?q=...    candidate World Bank projects for a name or id, each marked if already stored
//   POST /ingest/start         { projectId, fresh? } starts a background run (one at a time) and returns its job id
//   GET  /ingest/:id/events    the run as server-sent events; replays from the start, or from ?from=<n> / Last-Event-ID
//   POST /ingest/:id/cancel    stops a running job
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isProjectId, type IngestEvent, type ProjectCandidate } from '../packages/data/src/ingestEvents'
import { findProjects } from '../ingest/discover'
import type { JobRunner } from '../ingest/jobs'
import type { PipelineIo } from '../ingest/pipeline'

export interface IngestRouteDeps {
  runner: JobRunner
  /** Network access for the project search. */
  io: Pick<PipelineIo, 'getJson'>
  storedProjectIds: () => Set<string>
  embeddingInfo: () => { available: boolean; model?: string; dimensions?: number; reason?: string }
  /** Searches allowed per minute, so a page left open cannot hammer the World Bank API. */
  searchesPerMinute?: number
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(body)) }

function readBody(req: IncomingMessage, max = 2_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => { size += c.length; if (size > max) { reject(new Error('Request too large')); req.destroy() } else parts.push(c) })
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

export function createIngestRoutes(deps: IngestRouteDeps) {
  const hits: number[] = []
  const limit = deps.searchesPerMinute ?? 20

  /** Returns true when the request was handled here. */
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/ingest')) return false
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true }

    if (req.method === 'GET' && path === '/ingest/config') { json(res, 200, { mode: 'stream', enabled: true, embedding: deps.embeddingInfo() }); return true }

    if (req.method === 'GET' && path === '/ingest/find') {
      const now = Date.now()
      while (hits.length && now - hits[0]! > 60_000) hits.shift()
      if (hits.length >= limit) { json(res, 429, { error: 'Too many searches. Wait a minute and try again.' }); return true }
      hits.push(now)
      try {
        const stored = deps.storedProjectIds()
        const found = await findProjects(url.searchParams.get('q') ?? '', deps.io)
        json(res, 200, { candidates: found.map((c): ProjectCandidate => ({ ...c, stored: stored.has(c.project_id) })) })
      } catch (e) { json(res, 502, { error: `The World Bank Projects API could not be reached: ${e instanceof Error ? e.message : e}` }) }
      return true
    }

    if (req.method === 'POST' && path === '/ingest/start') {
      let body: { projectId?: unknown; fresh?: unknown }
      try { body = JSON.parse(await readBody(req)) } catch { json(res, 400, { error: 'Send JSON like { "projectId": "P158504" }.' }); return true }
      if (typeof body.projectId !== 'string' || !isProjectId(body.projectId)) { json(res, 400, { error: 'A World Bank project id looks like P158504 (the letter P and six digits).' }); return true }
      const started = deps.runner.start(body.projectId, { fresh: body.fresh === true })
      if (!started.ok) json(res, started.status, { error: started.message })
      else json(res, started.alreadyRunning ? 200 : 202, { jobId: started.job.id, projectId: started.job.projectId, alreadyRunning: started.alreadyRunning ?? false })
      return true
    }

    const m = /^\/ingest\/([0-9a-f-]{36})\/(events|cancel)$/.exec(path)
    if (m) {
      const [, id, action] = m as unknown as [string, string, string]
      if (action === 'cancel' && req.method === 'POST') { const ok = deps.runner.cancel(id); json(res, ok ? 200 : 404, { cancelled: ok }); return true }
      if (action === 'events' && req.method === 'GET') {
        const job = deps.runner.get(id)
        if (!job) { json(res, 404, { error: 'No such job. The server may have restarted.' }); return true }
        const from = Number(req.headers['last-event-id'] !== undefined ? Number(req.headers['last-event-id']) + 1 : url.searchParams.get('from') ?? 0) || 0
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS })
        const beat = setInterval(() => res.write(': keep-alive\n\n'), 15_000)
        let off: (() => void) | null = null
        const end = () => { clearInterval(beat); off?.(); if (!res.writableEnded) res.end() }
        off = deps.runner.subscribe(id, from, (e: IngestEvent, i: number) => {
          res.write(`id: ${i}\ndata: ${JSON.stringify(e)}\n\n`)
          if (e.type === 'done' || e.type === 'error') end()
        })
        // A finished run is replayed in full inside subscribe(); the listener must not outlive the closed response.
        if (res.writableEnded) off?.()
        req.on('close', end)
        return true
      }
    }
    json(res, 404, { error: 'Not found' })
    return true
  }
}
