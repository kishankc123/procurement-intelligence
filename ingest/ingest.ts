// Pre-ingestion of one real World Bank project into a stored snapshot (mock/ingested/<project>.json), in the same shape as mock/db.json.
//   pnpm ingest P158504          fetch, parse, chunk, write the snapshot (reuses ingest/cache, so a second run is quick)
//   pnpm ingest P158504 --fresh  ignore the cache and fetch everything again
//   pnpm ingest P158504 --embed  also embed the chunks (needs OPENAI_API_KEY in .env.local) and write mock/embeddings/
// The steps live in pipeline.ts, which the chat's live ingestion shares; this file only logs them and writes the files.
import { join } from 'node:path'
import { isProjectId } from '../packages/data/src/ingestEvents'
import { nodeIo, openAiEmbedder, ROOT } from './nodeIo'
import { ingestProject } from './pipeline'
import { publishResult } from './publish'

try { process.loadEnvFile(join(ROOT, '.env.local')) } catch { /* no .env.local */ }
const args = process.argv.slice(2)
const projectId = args.find((a) => isProjectId(a))
if (!projectId) { console.error('Usage: pnpm ingest P158504 [--fresh] [--embed]'); process.exit(1) }
const { embedder, reason } = args.includes('--embed') ? openAiEmbedder() : { embedder: null, reason: 'Run with --embed to embed the chunks' }

const log = (msg: string) => console.log(`[ingest ${projectId}] ${msg}`)
ingestProject(projectId, {
  io: nodeIo({ fresh: args.includes('--fresh') }), embedder, noEmbedderReason: reason,
  onEvent: (e) => {
    if (e.type === 'stage' && e.status !== 'running') log(`${e.stage}: ${e.status}${e.detail ? ` (${e.detail})` : ''}`)
    else if (e.type === 'log') log(e.text)
    else if (e.type === 'progress' && e.done % 40 === 0) log(`  ${e.stage} ${e.done} of ${e.total}`)
  },
}).then((result) => {
  const files = publishResult(result, { merge: false })
  log(`wrote ${files.join(', ')}: ${JSON.stringify(result.summary.counts)}`)
}).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
