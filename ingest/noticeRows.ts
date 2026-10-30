// Tender notices of a project from the public World Bank Procurement Notices API: only "Invitation for Bids" notices (the tenders) are kept.
// Contact names, e-mail addresses and phone numbers in the notices are people's details and are not copied; only the organisation is kept.
// No model is used. Shared by the live pipeline and `pnpm ingest:notices`.
import type { PipelineIo } from './pipeline'

/** The newest tenders kept per project, so a stored project stays small. The number in the source is kept in the manifest. */
export const KEEP_NOTICES = 60
/** Most pages of notices read for one project (100 a page), so a project with a huge history cannot run a request out of time. */
const MAX_PAGES = 30

export interface RawNotice {
  id: string; notice_type: string; noticedate?: string; submission_date?: string; submission_deadline_date?: string; notice_status?: string
  bid_reference_no?: string; bid_description?: string; procurement_group?: string; procurement_method_name?: string; contact_organization?: string
}

export const noticesUrl = (projectId: string, offset = 0) => `https://search.worldbank.org/api/v2/procnotices?format=json&rows=100&os=${offset}&project_id=${projectId}`

/** Every notice of the project (cached, so a run continued in a later request does not read them again). */
export async function readNotices(projectId: string, io: Pick<PipelineIo, 'getJson' | 'cache'>, alive: () => void = () => undefined): Promise<RawNotice[]> {
  const key = `notices-${projectId}`
  const hit = await io.cache.get<RawNotice[]>(key)
  if (hit) return hit
  const all: RawNotice[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    alive()
    const j = await io.getJson(noticesUrl(projectId, page * 100))
    const got = (j.procnotices ?? []) as RawNotice[]
    all.push(...got)
    if (all.length >= Number(j.total) || got.length === 0) break
  }
  await io.cache.put(key, all)
  return all
}

const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const GROUP: Record<string, string> = { CW: 'Works', GO: 'Goods', NC: 'Non-consulting services', CS: 'Consulting services' }

export function tenderRows(projectId: string, notices: RawNotice[]) {
  const tenders = notices.filter((n) => n.notice_type === 'Invitation for Bids' && day(n.submission_date))
  const rows = tenders
    .map((n) => ({
      id: n.id, project_id: projectId, reference: String(n.bid_reference_no ?? '').trim(), description: String(n.bid_description ?? '').replace(/\s+/g, ' ').trim(),
      category: GROUP[String(n.procurement_group)] ?? 'Not reported', method: String(n.procurement_method_name ?? 'Not reported'),
      posted: day(n.submission_date)!, deadline: day(n.submission_deadline_date), status: String(n.notice_status ?? 'Not reported'),
      organization: String(n.contact_organization ?? '').trim() || 'Not reported',
      url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${n.id}`,
    }))
    .sort((a, b) => b.posted.localeCompare(a.posted) || a.id.localeCompare(b.id))
    .slice(0, KEEP_NOTICES)
  const byType: Record<string, number> = {}
  for (const n of notices) byType[n.notice_type] = (byType[n.notice_type] ?? 0) + 1
  return { rows, tenders: tenders.length, byType }
}

/** The manifest entry that says where the tenders came from. */
export const noticesSource = (projectId: string, total: number, kept: number, tenders: number, byType: Record<string, number>) => ({
  name: 'Procurement Notices API', url: noticesUrl(projectId).replace(/&os=0/, ''), records: total,
  note: `Invitation for Bids notices kept as tender_notices (${kept} of ${tenders}, newest first). Notice types in the source: ${JSON.stringify(byType)}. Contact names, e-mails and phones are not copied.`,
})
