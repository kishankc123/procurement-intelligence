// Adds the tender notices of a project to its stored snapshot (mock/ingested/<project>.json).
//   pnpm ingest:notices P158504 P163730 ...     (reuses ingest/cache, so a second run is quick; add --fresh to fetch again)
// Source: the public World Bank Procurement Notices API. Only "Invitation for Bids" notices (the tenders) are kept, as `tender_notices`.
// Contact names, e-mail addresses and phone numbers in the notices are people's details and are not copied; only the organisation is kept.
// No model is used here.
// @ts-ignore Node.js type declarations are not included for this script.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// @ts-ignore Node.js type declarations are not included for this script.
import { dirname, join } from 'node:path'
// @ts-ignore Node.js type declarations are not included for this script.
import { fileURLToPath } from 'node:url'

declare const process: { argv: string[]; exit: (code: number) => never }
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'ingest', 'cache')
const snapshotDir = join(root, 'mock', 'ingested')
const ids = process.argv.slice(2).filter((a) => /^P\d{6}$/.test(a))
const fresh = process.argv.includes('--fresh')
if (ids.length === 0) { console.error('Usage: pnpm ingest:notices P158504 [P163730 ...] [--fresh]'); process.exit(1) }

/** The newest tenders kept per project, so the stored file stays small. The count in the source is kept in the manifest. */
const KEEP = 60

interface RawNotice {
  id: string; notice_type: string; noticedate?: string; submission_date?: string; submission_deadline_date?: string; notice_status?: string
  bid_reference_no?: string; bid_description?: string; procurement_group?: string; procurement_method_name?: string; contact_organization?: string
}

async function getJson(url: string, tries = 4): Promise<any> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await res.json()
    } catch (e) {
      if (i >= tries) throw new Error(`Could not read ${url.slice(0, 90)}: ${e instanceof Error ? e.message : e}`)
      await new Promise((r) => setTimeout(r, 1500 * i))
    }
  }
}

async function allNotices(projectId: string): Promise<RawNotice[]> {
  const file = join(cacheDir, `notices-${projectId}.json`)
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as RawNotice[]
  const all: RawNotice[] = []
  for (let page = 0; ; page++) {
    const j = await getJson(`https://search.worldbank.org/api/v2/procnotices?format=json&rows=100&os=${page * 100}&project_id=${projectId}`)
    all.push(...((j.procnotices ?? []) as RawNotice[]))
    if (all.length >= Number(j.total) || (j.procnotices ?? []).length === 0) break
  }
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(file, JSON.stringify(all))
  return all
}

const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const GROUP: Record<string, string> = { CW: 'Works', GO: 'Goods', NC: 'Non-consulting services', CS: 'Consulting services' }

async function main() {
  for (const projectId of ids) {
  const file = join(snapshotDir, `${projectId}.json`)
  if (!existsSync(file)) { console.error(`[notices ${projectId}] no snapshot yet: run pnpm ingest ${projectId} first`); continue }
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { manifest: Record<string, any>; collections: Record<string, unknown[]> }
  const notices = await allNotices(projectId)
  const tenders = notices.filter((n) => n.notice_type === 'Invitation for Bids' && day(n.submission_date))
  const rows = tenders
    .map((n) => ({
      id: n.id, project_id: projectId, reference: String(n.bid_reference_no ?? '').trim(), description: String(n.bid_description ?? '').replace(/\s+/g, ' ').trim(),
      category: GROUP[String(n.procurement_group)] ?? 'Not reported', method: String(n.procurement_method_name ?? 'Not reported'),
      posted: day(n.submission_date)!, deadline: day(n.submission_deadline_date), status: String(n.notice_status ?? 'Not reported'),
      organization: String(n.contact_organization ?? '').trim() || 'Not reported',
      url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${n.id}`,
    }))
    .sort((a, b) => b.posted.localeCompare(a.posted))
    .slice(0, KEEP)
  snapshot.collections.tender_notices = rows
  const byType: Record<string, number> = {}
  for (const n of notices) byType[n.notice_type] = (byType[n.notice_type] ?? 0) + 1
  snapshot.manifest.sources = [...(snapshot.manifest.sources as { name: string }[]).filter((s) => s.name !== 'Procurement Notices API'), {
    name: 'Procurement Notices API', url: `https://search.worldbank.org/api/v2/procnotices?format=json&rows=100&project_id=${projectId}`, records: notices.length,
    note: `Invitation for Bids notices kept as tender_notices (${rows.length} of ${tenders.length}, newest first). Notice types in the source: ${JSON.stringify(byType)}. Contact names, e-mails and phones are not copied.`,
  }]
  snapshot.manifest.counts = { ...snapshot.manifest.counts, tender_notices: rows.length }
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`[notices ${projectId}] ${notices.length} notices in the source, ${tenders.length} tenders, kept ${rows.length}`)
}
}

main().catch((e) => { console.error(e); process.exit(1) })
