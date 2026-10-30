// The CopilotKit runtime on Vercel: the same runtime as server/index.ts, at /api/copilotkit/*.
// An ES module on purpose: CopilotKit depends on ES-only packages, and import() loads them on any Node version where require() would not.
// The runtime is api/_lib/copilot.mjs, generated from server/copilot.ts (pnpm build:chat).
// It exists only when OPENAI_API_KEY is set in the Vercel project; without it every call answers 404 and the page keeps the rule-based chat.
// It reads the seed file mock/db.json (bundled with the function), like api/chat.js.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let db = null
const loadDb = () => (db ??= JSON.parse(readFileSync(join(process.cwd(), 'mock', 'db.json'), 'utf8')))

let listener
export default async function handler(req, res) {
  try {
    // Imported inside the try so that a problem loading the runtime is reported as a message instead of a bare 500.
    // vercel.json rewrites /api/copilotkit/<anything> to /api/copilotkit?path=<anything>. Whether Vercel then shows the function the original URL or the
    // rewritten one, put the full path back so the runtime sees /api/copilotkit/<anything>.
    const url = new URL(req.url ?? '/', 'http://localhost')
    const rest = url.searchParams.get('path')
    if (rest !== null && url.pathname.replace(/\/$/, '') === '/api/copilotkit') {
      url.searchParams.delete('path')
      req.url = `/api/copilotkit/${rest}${url.search}`
    }
    // Projects ingested on the hosted site live in the Blob store; they are merged into this copy of the data before each call (at most every few seconds),
    // and the chat gets the project search and the search by meaning that use the same store.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const ingest = await import('../_lib/ingest.mjs')
      await ingest.dbWithIngested(loadDb())
      listener ??= (await import('../_lib/copilot.mjs')).createCopilotListener(loadDb, ingest.getHosted(process.env).copilotExtras())
    }
    listener ??= (await import('../_lib/copilot.mjs')).createCopilotListener(loadDb)
    if (!listener) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'The model is not configured (no OPENAI_API_KEY).' })) }
    return listener(req, res)
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : 'unknown error'
    console.error('api/copilotkit failed', e)
    res.statusCode = 500; res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'The CopilotKit function failed.', detail }))
  }
}
