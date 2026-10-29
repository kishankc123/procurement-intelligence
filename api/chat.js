// The assistant on Vercel: the same logic as server/index.ts, as a serverless function at POST /api/chat.
// Plain CommonJS like api/[...path].js. The logic is api/_lib/assistant.js, generated from packages/data/src/assistant.ts (pnpm build:chat).
// It answers from the seed file mock/db.json (bundled with the function). The json-server function keeps the live,
// editable copy in its own memory, so counts such as saved drafts and feedback here come from the seed, not from edits made on the site.
const fs = require('node:fs')
const path = require('node:path')

let db = null
const loadDb = () => (db ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mock', 'db.json'), 'utf8')))

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with { "message": "..." }.' })
    // Required inside the try so that a problem loading the logic is reported as a message instead of a bare 500.
    const { AssistantRequest, answer } = require('./_lib/assistant')
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
    const parsed = AssistantRequest.safeParse(body)
    if (!parsed.success) return res.status(400).json({ error: 'Send { "message": "..." } with a message of 1 to 2000 characters.' })
    return res.status(200).json(answer(loadDb(), parsed.data.message, parsed.data.projectId))
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'unknown error'
    console.error('api/chat failed', e)
    return res.status(500).json({ error: 'The assistant function failed.', detail })
  }
}
