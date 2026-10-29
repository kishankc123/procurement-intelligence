// Pure lookups the model can call as tools (server side). No React, no files, no network: they take the data and return plain objects,
// so they are tested here and the server only wraps them. Every result is short and carries ids the model can cite.
import { buildDossier, type AssistantDb } from './assistant'
import type { Project } from './schemas'

const isReal = (p: Project) => !/^P-MOCK/i.test(p.project_id)

export function listProjects(db: AssistantDb) {
  return db.projects.map((p) => ({
    project_id: p.project_id, name: p.project_name, country: p.borrower_country, sector: p.project_global_practice,
    kind: isReal(p) ? 'real World Bank data (ingested snapshot)' : 'mock',
  }))
}

export function projectOverview(db: AssistantDb, projectId: string) {
  const project = db.projects.find((p) => p.project_id === projectId)
  if (!project) return { error: `No project with id ${projectId}.` }
  const { dossier } = buildDossier(db, project)
  const latest = [...db.supervision_reports.filter((r) => r.project_id === projectId)].sort((a, b) => b.sequence - a.sequence)[0]
  return {
    project_id: project.project_id, name: project.project_name, country: project.borrower_country, region: project.region, sector: project.project_global_practice,
    kind: isReal(project) ? 'real World Bank data (ingested snapshot)' : 'mock',
    dates: { approval: project.approval_date, effectiveness: project.effectiveness_actual ?? project.effectiveness_planned, closing_planned: project.closing_date_planned, closing_revised: project.closing_date_revised },
    counts: dossier.counts,
    latest_supervision_report: latest
      ? { date: latest.date, sequence: latest.sequence, progress_rating: latest.progress_rating, progress_rating_previous: latest.progress_rating_prev, implementation_rating: latest.implementation_rating, overall_risk: latest.overall_risk, fiduciary_risk: latest.fiduciary_risk, disbursed_pct: latest.disbursed_pct }
      : 'missing: no supervision reports',
  }
}

export interface ContractQuery {
  project_id: string
  supplier?: string
  category?: string
  method?: string
  signed_from?: string
  signed_to?: string
  min_amount_usd?: number
  sort_by?: 'amount' | 'date'
  limit?: number
}

/** Contracts of a project that match the filters, largest first by default, at most `limit` (default 10, never more than 25). */
export function queryContracts(db: AssistantDb, q: ContractQuery) {
  const has = (hay: string, needle?: string) => !needle || hay.toLowerCase().includes(needle.toLowerCase())
  const rows = db.contracts.filter((c) => c.project_id === q.project_id
    && has(c.supplier, q.supplier) && has(c.procurement_category, q.category) && has(c.procurement_method, q.method)
    && (!q.signed_from || c.contract_signing_date >= q.signed_from) && (!q.signed_to || c.contract_signing_date <= q.signed_to)
    && (q.min_amount_usd === undefined || c.supplier_contract_amount_usd >= q.min_amount_usd))
  rows.sort((a, b) => (q.sort_by === 'date' ? b.contract_signing_date.localeCompare(a.contract_signing_date) : b.supplier_contract_amount_usd - a.supplier_contract_amount_usd))
  const limit = Math.min(Math.max(q.limit ?? 10, 1), 25)
  return {
    matched: rows.length,
    total_amount_usd: Math.round(rows.reduce((n, c) => n + c.supplier_contract_amount_usd, 0)),
    shown: Math.min(limit, rows.length),
    contracts: rows.slice(0, limit).map((c) => ({
      reference: c.borrower_contract_reference_number, supplier: c.supplier, category: c.procurement_category, method: c.procurement_method,
      amount_usd: c.supplier_contract_amount_usd, signed: c.contract_signing_date, description: c.contract_description.slice(0, 140),
    })),
  }
}

export function supervisionSeries(db: AssistantDb, projectId: string) {
  const reports = db.supervision_reports.filter((r) => r.project_id === projectId).sort((a, b) => a.sequence - b.sequence)
  if (reports.length === 0) return { reports: 'missing: no supervision reports for this project' }
  return {
    reports: reports.map((r) => ({ id: r.id, sequence: r.sequence, date: r.date, progress_rating: r.progress_rating, implementation_rating: r.implementation_rating, overall_risk: r.overall_risk, fiduciary_risk: r.fiduciary_risk, disbursed_pct: r.disbursed_pct, restructurings: r.restructurings })),
  }
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []

/** Keyword search over the ingested document text. Returns the best chunks with their ids, so an answer can cite them. */
export function searchDocuments(db: AssistantDb, query: string, projectId?: string, limit = 5) {
  const terms = [...new Set(words(query))]
  const docs = new Map(db.documents.filter((d) => !projectId || d.project_id === projectId || d.project_id === 'GENERAL').map((d) => [d.doc_id, d]))
  const scored = db.chunks
    .filter((c) => docs.has(c.doc_id))
    .map((c) => {
      const text = c.text.toLowerCase()
      const hits = terms.filter((t) => text.includes(t)).length
      return { c, hits, score: hits + terms.reduce((n, t) => n + Math.min(3, text.split(t).length - 1) * 0.1, 0) }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limit, 1), 8))
  if (scored.length === 0) return { results: 'No supporting evidence found in the ingested documents.' }
  return {
    results: scored.map(({ c }) => {
      const doc = docs.get(c.doc_id)!
      const at = Math.max(0, c.text.toLowerCase().indexOf(terms.find((t) => c.text.toLowerCase().includes(t)) ?? ''))
      return { chunk_id: c.chunk_id, document: doc.title, document_type: doc.type, date: doc.date, page: c.page, section: c.section_path, snippet: c.text.slice(Math.max(0, at - 80), at + 320) }
    }),
  }
}
