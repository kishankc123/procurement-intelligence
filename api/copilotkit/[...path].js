// The CopilotKit runtime on Vercel: the same runtime as server/index.ts, at /api/copilotkit/*.
// Plain CommonJS. The runtime is api/_lib/copilot.js, generated from server/copilot.ts (pnpm build:chat).
// It exists only when OPENAI_API_KEY is set in the Vercel project; without it every call answers 404 and the page keeps the rule-based chat.
// It reads the seed file mock/db.json (bundled with the function), like api/chat.js.
const fs = require('node:fs')
const path = require('node:path')

let db = null
const loadDb = () => (db ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mock', 'db.json'), 'utf8')))

let listener
module.exports = function handler(req, res) {
  try {
    // Required inside the try so that a problem loading the runtime is reported as a message instead of a bare 500.
    listener ??= require('./../_lib/copilot').createCopilotListener(loadDb)
    if (!listener) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'The model is not configured (no OPENAI_API_KEY).' })) }
    return listener(req, res)
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'unknown error'
    console.error('api/copilotkit failed', e)
    res.statusCode = 500; res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'The CopilotKit function failed.', detail }))
  }
}
