// Finds World Bank projects by name or id with the public Projects API, so the chat can offer candidates before anything is ingested.
import { isProjectId, type ProjectCandidate } from '../packages/data/src/ingestEvents'
import type { PipelineIo } from './pipeline'

const base = 'https://search.worldbank.org/api/v2/projects?format=json&fl=id,project_name,countryname,status,boardapprovaldate,sector1,mjsector'

/** Reads the first value of a field that the API gives as a string, an array or an object keyed by position. */
const first = (v: unknown): string | null => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return first(v[0])
  if (v && typeof v === 'object') return first((v as Record<string, unknown>).Name ?? Object.values(v)[0])
  return null
}

export async function findProjects(query: string, io: Pick<PipelineIo, 'getJson'>, rows = 6): Promise<ProjectCandidate[]> {
  const q = query.trim().replace(/\s+/g, ' ')
  if (q.length < 2) return []
  const url = isProjectId(q.toUpperCase()) ? `${base}&rows=1&id=${q.toUpperCase()}` : `${base}&rows=${rows}&qterm=${encodeURIComponent(q.slice(0, 120))}`
  const body = await io.getJson(url)
  const found = Object.values((body?.projects ?? {}) as Record<string, any>)
  return found.filter((p) => typeof p?.id === 'string' && isProjectId(p.id)).slice(0, rows).map((p) => ({
    project_id: p.id as string,
    project_name: String(p.project_name ?? '').replace(/\s+/g, ' ').trim(),
    country: first(p.countryname) ?? 'Not reported',
    status: String(p.status ?? 'Not reported'),
    approval_date: typeof p.boardapprovaldate === 'string' ? p.boardapprovaldate.slice(0, 10) : null,
    sector: first(p.mjsector) ?? first(p.sector1),
  }))
}
