// Real versus mock data. A project id starting P-MOCK is mock; every other project is a real World Bank project ingested as a snapshot.
// The assistant never mixes the two: tools take a scope and work on `scopedDb`, which holds only that kind of data.
import type { AssistantDb } from './assistant'

export type DataScope = 'real' | 'mock'

export const projectScope = (projectId: string): DataScope => (/^P-MOCK/i.test(projectId) || projectId === 'GENERAL' ? 'mock' : 'real')

/** What a person is told a project is, in words. */
export const scopeLabel = (scope: DataScope) => (scope === 'real' ? 'real World Bank data (ingested snapshot)' : 'mock demonstration data')

/** A copy of the data holding only one kind. Records that point at a project or a contract are kept only when that project or contract is kept. */
export function scopedDb(db: AssistantDb, scope: DataScope): AssistantDb {
  const inScope = (projectId: string) => projectScope(projectId) === scope
  const contracts = db.contracts.filter((c) => inScope(c.project_id))
  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const documents = db.documents.filter((d) => inScope(d.project_id))
  const docIds = new Set(documents.map((d) => d.doc_id))
  return {
    ...db,
    projects: db.projects.filter((p) => inScope(p.project_id)),
    contracts,
    plans: db.plans.filter((p) => inScope(p.project_id)),
    tender_drafts: db.tender_drafts.filter((d) => inScope(d.project_id)),
    plan_packages: db.plan_packages.filter((d) => inScope(d.project_id)),
    tender_notices: db.tender_notices.filter((d) => inScope(d.project_id)),
    supervision_reports: db.supervision_reports.filter((r) => inScope(r.project_id)),
    completion_reports: db.completion_reports.filter((r) => inScope(r.project_id)),
    documents,
    chunks: db.chunks.filter((c) => docIds.has(c.doc_id)),
    amendments: db.amendments.filter((a) => refs.has(a.contract_ref)),
    enrichments: db.enrichments.filter((e) => refs.has(e.contract_ref)),
    contract_milestones: db.contract_milestones.filter((m) => refs.has(m.contract_ref)),
    conflicts: db.conflicts.filter((c) => inScope(c.project_id)),
    sources: db.sources.filter((s) => (s.id.startsWith('SRC-WB-') ? scope === 'real' : scope === 'mock')),
  }
}

/**
 * The projects a keyword is about. The keyword is split into words: projects that have every word (in the name, sector or country) win; if none does,
 * those that have any word; if none does either, nothing (the caller then says so and uses all). "road Liberia" finds the Liberia road project.
 */
export function matchProjects<T extends { project_name: string; project_global_practice: string; borrower_country: string }>(projects: T[], keyword?: string): T[] {
  const words = (keyword ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
  if (words.length === 0) return projects
  const text = (p: T) => `${p.project_name} ${p.project_global_practice} ${p.borrower_country}`.toLowerCase()
  const all = projects.filter((p) => words.every((w) => text(p).includes(w)))
  return all.length > 0 ? all : projects.filter((p) => words.some((w) => text(p).includes(w)))
}

/** Null when the project may be used in this scope; otherwise a sentence the model can pass on, so a wrong mix is stopped and explained. */
export function scopeProblem(db: AssistantDb, scope: DataScope, projectId?: string): string | null {
  if (!projectId) return null
  if (!db.projects.some((p) => p.project_id === projectId)) return `No project with id ${projectId}.`
  const actual = projectScope(projectId)
  return actual === scope ? null : `${projectId} is ${scopeLabel(actual)}, but this request is about ${scopeLabel(scope)}. Do not mix them: ask the user which they mean.`
}
