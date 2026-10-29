// Potential suppliers for the user's own procurement: who won contracts on similar real projects. The contract awards hold the supplier, its country,
// the amount and the category; they hold no contact details, which the answer must say. Nothing here says who will bid or recommends a supplier.
import type { AssistantDb } from './assistant'
import { matchProjects, scopedDb } from './scope'

export interface SupplierRow {
  supplier_id: string
  name: string
  country: string
  contracts: number
  total_usd: number
  categories: string[]
  projects: string[]
}

const MAX_ROWS = 25

/**
 * Suppliers with contracts on the real projects a keyword matches (a country, a sector or part of a project name; with no match, all real projects, and the
 * result says so). Ranked by the value of their contracts. Falls back to the mock projects only when there are no real projects at all, and says that too.
 */
export function potentialSuppliers(db: AssistantDb, keyword?: string) {
  const real = scopedDb(db, 'real')
  const useMock = real.projects.length === 0
  const pool = useMock ? scopedDb(db, 'mock') : real
  const wanted = keyword?.trim() ? matchProjects(pool.projects, keyword) : pool.projects
  const projects = wanted.length > 0 ? wanted : pool.projects
  const ids = new Set(projects.map((p) => p.project_id))
  const notes: string[] = []
  if (useMock) notes.push('There are no real projects, so these are the mock demonstration projects.')
  if (keyword?.trim() && wanted.length === 0 && pool.projects.length > 0) notes.push(`No project matches "${keyword}", so all ${pool.projects.length} ${useMock ? 'mock' : 'real'} projects are used.`)

  const bySupplier = new Map<string, SupplierRow>()
  for (const c of pool.contracts.filter((x) => ids.has(x.project_id))) {
    const row = bySupplier.get(c.supplier_id) ?? { supplier_id: c.supplier_id, name: c.supplier, country: c.supplier_country, contracts: 0, total_usd: 0, categories: [], projects: [] }
    row.contracts += 1
    row.total_usd += c.supplier_contract_amount_usd
    if (!row.categories.includes(c.procurement_category)) row.categories.push(c.procurement_category)
    if (!row.projects.includes(c.project_id)) row.projects.push(c.project_id)
    bySupplier.set(c.supplier_id, row)
  }
  const all = [...bySupplier.values()].sort((a, b) => b.total_usd - a.total_usd || b.contracts - a.contracts || a.name.localeCompare(b.name))
  if (all.length === 0) return { missing: 'The matching projects have no contract awards on record, so there are no suppliers to list.' }
  return {
    data_kind: useMock ? 'mock demonstration data' : 'real World Bank data (ingested snapshot)',
    keyword: keyword?.trim() || null,
    projects: projects.map((p) => ({ id: p.project_id, name: p.project_name, country: p.borrower_country })),
    supplier_count: all.length,
    suppliers: all.slice(0, MAX_ROWS).map((s) => ({ ...s, total_usd: Math.round(s.total_usd) })),
    notes: [...notes, 'These are suppliers that won contracts on the projects above, not a list of who will bid and not a recommendation. The contract awards hold no contact details, so a supplier has to be found through its name and country.'],
  }
}
