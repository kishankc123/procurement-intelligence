// The assistant on Vercel: the same logic as server/index.ts, as a serverless function at POST /api/chat.
// It answers from the seed file mock/db.json (bundled with the function). The json-server function keeps the live,
// editable copy in its own memory, so counts such as saved drafts and feedback here come from the seed, not from edits made on the site.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AssistantRequest, answer, type AssistantDb } from '../packages/data/src/assistant'

interface Req { method?: string; body?: unknown }
interface Res { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

let db: AssistantDb | null = null
const loadDb = (): AssistantDb => (db ??= JSON.parse(readFileSync(join(process.cwd(), 'mock', 'db.json'), 'utf8')) as AssistantDb)

export default function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with { "message": "..." }.' })
  let body: unknown = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  const parsed = AssistantRequest.safeParse(body)
  if (!parsed.success) return res.status(400).json({ error: 'Send { "message": "..." } with a message of 1 to 2000 characters.' })
  return res.status(200).json(answer(loadDb(), parsed.data.message, parsed.data.projectId))
}
