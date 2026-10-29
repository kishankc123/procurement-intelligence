// The assistant's server. The React app sends a chat message here; this answers from mock/db.json, imitating the services a full system would call.
// Run with `pnpm server` (or ./run.sh). It reads db.json on every request, so `pnpm reset-db` shows up without a restart.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AssistantRequest, answer, type AssistantDb } from '../packages/data/src/assistant'

const PORT = Number(process.env.ASSISTANT_PORT ?? 3002)
const DB_PATH = fileURLToPath(new URL('../mock/db.json', import.meta.url))
const MAX_BODY = 100_000

const loadDb = (): AssistantDb => JSON.parse(readFileSync(DB_PATH, 'utf8')) as AssistantDb

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    // The demo app runs on another local port, so allow it to call this server.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, simulated: true })
  if (req.method === 'POST' && url.pathname === '/chat') {
    try {
      const parsed = AssistantRequest.safeParse(JSON.parse(await readBody(req)))
      if (!parsed.success) return send(res, 400, { error: 'Send { "message": "..." } with a message of 1 to 2000 characters.' })
      return send(res, 200, answer(loadDb(), parsed.data.message, parsed.data.projectId))
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : 'Bad request' })
    }
  }
  return send(res, 404, { error: 'Not found' })
}).listen(PORT, () => console.log(`Assistant server (simulated, rule-based) on http://localhost:${PORT}`))
