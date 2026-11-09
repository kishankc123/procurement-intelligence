// Suggested tender clauses for the user's own procurement. The real projects hold no tender clauses in any public source, only their published tender
// notices and contracts, so a draft built from real data alone would be nearly empty. The draft is therefore built clause by clause, each clause from ONE
// source that it names: real data where the real data supports it (the bid submission period from real tender notices, a minimum contract value from
// real works contracts), otherwise the stored demonstration drafts, matched loosely (sector is a preference, not a requirement). Real and demo figures
// are never averaged together, and each clause says which it is.
import type { AssistantDb } from './assistant'
import { proposePlan } from './assistantData'
import { matchProjects, scopedDb, scopeLabel } from './scope'

export interface DraftClause {
  field: string
  label: string
  unit: string
  value: number | string
  sample_size: number
  /** Which projects (or counts) it comes from. */
  from: string[]
  source: 'real' | 'mock'
  basis: string
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? null : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

const DRAFT_CLAUSES = [
  { field: 'duration_months', label: 'Contract duration', unit: 'months', places: 0 },
  { field: 'bid_validity_days', label: 'Bid validity', unit: 'days', places: 0 },
  { field: 'performance_security_pct', label: 'Performance security', unit: '%', places: 1 },
  { field: 'min_similar_contracts', label: 'Minimum similar contracts', unit: '', places: 0 },
] as const

/**
 * Clauses for a new tender. `scope` 'auto' (default) uses real data where it can and the stored demonstration drafts for the rest; 'real' uses real
 * data only (clauses it cannot support are left out); 'mock' uses the demonstration drafts only.
 */
export function suggestTenderClauses(db: AssistantDb, keyword?: string, scope: 'auto' | 'real' | 'mock' = 'auto') {
  const clauses: DraftClause[] = []
  const notes: string[] = []
  const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places

  if (scope !== 'mock') {
    const real = scopedDb(db, 'real')
    const wanted = keyword?.trim() ? matchProjects(real.projects, keyword) : real.projects
    const projects = wanted.length > 0 ? wanted : real.projects
    if (keyword?.trim() && wanted.length === 0 && real.projects.length > 0) notes.push(`No real project matches "${keyword}", so all ${real.projects.length} real projects are used for the figures from real data.`)
    const ids = new Set(projects.map((p) => p.project_id))
    const periods = real.tender_notices.filter((t) => ids.has(t.project_id) && t.deadline).map((t) => days(t.posted, t.deadline!)).filter((d) => d >= 3 && d <= 365)
    if (periods.length > 0) {
      clauses.push({ field: 'bid_submission_days', label: 'Bid submission period', unit: 'days', value: round(median(periods)!, 0), sample_size: periods.length, from: [`${periods.length} tender notices`], source: 'real', basis: `Median days between a real tender notice being posted and its bids being due, across ${periods.length} notices of ${ids.size} real projects.` })
    }
    const works = real.contracts.filter((c) => ids.has(c.project_id) && /works/i.test(c.procurement_category) && c.supplier_contract_amount_usd > 0).map((c) => c.supplier_contract_amount_usd)
    if (works.length > 0) {
      clauses.push({ field: 'reference_works_contract_usd', label: 'Typical works contract size', unit: 'USD', value: round(median(works)!, 0), sample_size: works.length, from: [`${works.length} contracts`], source: 'real', basis: `Median amount of ${works.length} real works contracts. Set the minimum similar contract value near the size of your own contract; this is a reference, not a rule.` })
    }
  }

  let lessons: { report: string; project: string; lesson: string; chunk_id: string; source: 'real' | 'mock' }[] = []
  let draftIds: string[] = []
  if (scope !== 'real') {
    const mock = scopedDb(db, 'mock')
    const sector = (keyword?.trim() ? matchProjects(mock.projects, keyword) : mock.projects).map((p) => p.project_id)
    const preferred = mock.tender_drafts.filter((d) => sector.includes(d.project_id))
    // Sector is a preference: with no draft in the sector, the other stored drafts are still a reasonable starting point for a demo.
    const drafts = preferred.length > 0 ? preferred : mock.tender_drafts
    draftIds = drafts.map((d) => d.project_id)
    if (drafts.length > 0) {
      if (preferred.length === 0 && keyword?.trim()) notes.push(`No stored draft is for "${keyword}", so all ${drafts.length} stored demonstration drafts are used, whatever their sector.`)
      for (const c of DRAFT_CLAUSES) {
        const value = round(median(drafts.map((d) => d[c.field]))!, c.places)
        clauses.push({ field: c.field, label: c.label, unit: c.unit, value, sample_size: drafts.length, from: draftIds, source: 'mock', basis: `Median of ${drafts.length} stored demonstration ${drafts.length === 1 ? 'draft' : 'drafts'} (illustrative, not real tender data).` })
      }
      const value = round(median(drafts.map((d) => d.min_similar_value_usd))!, 0)
      clauses.push({ field: 'min_similar_value_usd', label: 'Minimum similar contract value', unit: 'USD', value, sample_size: drafts.length, from: draftIds, source: 'mock', basis: `Median of ${drafts.length} stored demonstration ${drafts.length === 1 ? 'draft' : 'drafts'} (illustrative).` })
      const [method, n] = Object.entries(drafts.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.evaluation_method]: (acc[d.evaluation_method] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]!
      clauses.push({ field: 'evaluation_method', label: 'Evaluation method', unit: '', value: method, sample_size: drafts.length, from: draftIds, source: 'mock', basis: `Most common in ${drafts.length} stored demonstration drafts (${n} of ${drafts.length}; illustrative).` })
    }
    lessons = mock.completion_reports.flatMap((r) => r.lessons.map((l) => ({ report: r.id, project: r.project_name, lesson: l.text, chunk_id: l.chunk_id, source: 'mock' as const })))
  }

  if (clauses.length === 0) return { missing: scope === 'real' ? 'The real projects hold no tender clauses and no tender notices or contracts to work from, so no clauses are suggested.' : 'No tender drafts are stored, so no clause values are suggested.' }
  if (scope === 'real') notes.push('Only figures from real data are used, so the clauses the real data cannot support (bid validity, contract duration, security, qualification, evaluation method) are left out.')
  else if (clauses.some((c) => c.source === 'mock')) notes.push('Clauses marked as demonstration come from the stored demonstration drafts. They are placeholders to review, not benchmarks.')
  return { clauses, lessons, filtered_by: keyword?.trim() || 'all stored data', notes }
}

type PlanInput = Parameters<typeof proposePlan>[1]

/**
 * A suggested plan for a new procurement, with the same loose matching. The real projects give only an expected bid opening, not the four stage dates a
 * plan needs, so for 'auto' the real plans are tried first and the stored demonstration plans are the fallback (the sector and category are preferences:
 * with no plan matching them, all stored plans are used). The result says which one it is.
 */
export function suggestPlan(db: AssistantDb, input: PlanInput, scope: 'auto' | 'real' | 'mock' = 'auto') {
  if (scope !== 'mock') {
    const real = proposePlan(scopedDb(db, 'real'), input)
    if (!('missing' in real) || scope === 'real') return { data_kind: scopeLabel('real'), ...real }
  }
  const mock = scopedDb(db, 'mock')
  const first = proposePlan(mock, input)
  const result = 'missing' in first ? proposePlan(mock, { ...input, keyword: undefined, category: undefined }) : first
  if ('missing' in result) return { data_kind: scopeLabel('mock'), ...result }
  const loose = 'missing' in first
  return {
    data_kind: scopeLabel('mock'),
    ...result,
    note: `${scope === 'auto' ? 'The real projects give only an expected bid opening, not the four stage dates a plan needs, so this plan comes from the stored demonstration plans (illustrative). ' : ''}${loose ? `No stored plan matches ${[input.keyword, input.category].filter(Boolean).join(' / ') || 'the request'}, so all stored plans are used, whatever their sector.` : ''}`.trim(),
  }
}
