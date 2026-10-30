// Adds the tender notices of a project to its stored snapshot (mock/ingested/<project>.json).
//   pnpm ingest:notices P158504 P163730 ...     (reuses ingest/cache, so a second run is quick; add --fresh to fetch again)
// Source: the public World Bank Procurement Notices API. Only "Invitation for Bids" notices (the tenders) are kept, as `tender_notices`.
// Contact names, e-mail addresses and phone numbers in the notices are people's details and are not copied; only the organisation is kept.
// No model is used. The reading itself is in noticeRows.ts, which the live ingestion shares (it now does this step by itself).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isProjectId } from '../packages/data/src/ingestEvents'
import { nodeIo, ROOT } from './nodeIo'
import { noticesSource, readNotices, tenderRows } from './noticeRows'

const ids = process.argv.slice(2).filter((a) => isProjectId(a))
const fresh = process.argv.includes('--fresh')
if (ids.length === 0) { console.error('Usage: pnpm ingest:notices P158504 [P163730 ...] [--fresh]'); process.exit(1) }

async function main() {
  const io = nodeIo({ fresh })
  for (const projectId of ids) {
    const file = join(ROOT, 'mock', 'ingested', `${projectId}.json`)
    if (!existsSync(file)) { console.error(`[notices ${projectId}] no snapshot yet: run pnpm ingest ${projectId} first`); continue }
    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { manifest: Record<string, any>; collections: Record<string, unknown[]> }
    const notices = await readNotices(projectId, io)
    const t = tenderRows(projectId, notices)
    snapshot.collections.tender_notices = t.rows
    snapshot.manifest.sources = [...(snapshot.manifest.sources as { name: string }[]).filter((s) => s.name !== 'Procurement Notices API'), noticesSource(projectId, notices.length, t.rows.length, t.tenders, t.byType)]
    snapshot.manifest.counts = { ...snapshot.manifest.counts, tender_notices: t.rows.length }
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`[notices ${projectId}] ${notices.length} notices in the source, ${t.tenders} tenders, kept ${t.rows.length}`)
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
