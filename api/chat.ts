// The assistant on Vercel: the same logic as server/index.ts, as a serverless function at POST /api/chat.
// It answers from the seed file mock/db.json (bundled with the function). The json-server function keeps the live,
// editable copy in its own memory, so counts such as saved drafts and feedback here come from the seed, not from edits made on the site.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Req { method?: string; body?: unknown }
interface Res { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

let db: unknown = null
const loadDb = () => (db ??= JSON.parse(readFileSync(join(process.cwd(), 'mock', 'db.json'), 'utf8')))

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with { "message": "..." }.' })
    // Loaded inside the try so that a problem loading the shared logic is reported as a message instead of a bare 500.
    const { AssistantRequest, answer } = await import('../packages/data/src/assistant')
    let body: unknown = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
    const parsed = AssistantRequest.safeParse(body)
    if (!parsed.success) return res.status(400).json({ error: 'Send { "message": "..." } with a message of 1 to 2000 characters.' })
    return res.status(200).json(answer(loadDb() as Parameters<typeof answer>[0], parsed.data.message, parsed.data.projectId))
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : 'unknown error'
    console.error('api/chat failed', e)
    return res.status(500).json({ error: 'The assistant function failed.', detail })
  }
}
