// Pure lookups the model can call as tools (server side). No React, no files, no network: they take the data and return plain objects,
// so they are tested here and the server only wraps them. Every result is short and carries ids the model can cite.
import { buildDossier, type AssistantDb } from './assistant'
import type { Project } from './schemas'
import { projectScope, scopeLabel, type DataScope } from './scope'

const kindOf = (p: Project) => scopeLabel(projectScope(p.project_id))

/** Every project, or only the real or only the mock ones when a scope is given. */
export function listProjects(db: AssistantDb, scope?: DataScope) {
  return db.projects.filter((p) => !scope || projectScope(p.project_id) === scope).map((p) => ({
    project_id: p.project_id, name: p.project_name, country: p.borrower_country, sector: p.project_global_practice,
    kind: kindOf(p),
  }))
}

export function projectOverview(db: AssistantDb, projectId: string) {
  const project = db.projects.find((p) => p.project_id === projectId)
  if (!project) return { error: `No project with id ${projectId}.` }
  const { dossier } = buildDossier(db, project)
  const latest = [...db.supervision_reports.filter((r) => r.project_id === projectId)].sort((a, b) => b.sequence - a.sequence)[0]
  return {
    project_id: project.project_id, name: project.project_name, country: project.borrower_country, region: project.region, sector: project.project_global_practice,
    kind: kindOf(project),
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

const median = (xs: number[]) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2]! : Math.round(((s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) * 10) / 10
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const tally = <T,>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [key(r)]: (n[key(r)] ?? 0) + 1 }), {})

/**
 * What the stored projects did that a new procurement can learn from: each project's tender draft clauses, how long its plans take from
 * advertisement to signing, the mix of categories and methods in its contracts, and the lessons of the completion reports.
 * `keyword` narrows the projects by sector, name or country. Anything the data does not hold is the text "missing", never a guess.
 */
export function referencePractice(db: AssistantDb, keyword?: string) {
  const k = keyword?.trim().toLowerCase()
  const projects = db.projects.filter((p) => !k || [p.project_name, p.project_global_practice, p.borrower_country].some((s) => s.toLowerCase().includes(k)))
  const lessons = db.completion_reports
    .filter((r) => !k || r.project_name.toLowerCase().includes(k) || r.lessons.some((l) => l.text.toLowerCase().includes(k)))
    .flatMap((r) => r.lessons.map((l) => ({ report: r.id, project: r.project_name, outcome_rating: r.outcome_rating, lesson: l.text, chunk_id: l.chunk_id })))
  return {
    projects: projects.map((p) => {
      const draft = db.tender_drafts.find((d) => d.project_id === p.project_id)
      const plans = db.plans.filter((x) => x.project_id === p.project_id)
      const contracts = db.contracts.filter((c) => c.project_id === p.project_id)
      return {
        project_id: p.project_id, name: p.project_name, country: p.borrower_country, sector: p.project_global_practice,
        kind: kindOf(p),
        tender_draft: draft
          ? { id: draft.id, duration_months: draft.duration_months, bid_validity_days: draft.bid_validity_days, performance_security_pct: draft.performance_security_pct, min_similar_contracts: draft.min_similar_contracts, min_similar_value_usd: draft.min_similar_value_usd, evaluation_method: draft.evaluation_method }
          : 'missing: no tender draft saved for this project',
        plans: plans.length
          ? { count: plans.length, median_days_advertisement_to_signing: median(plans.map((x) => daysBetween(x.planned_advertisement, x.planned_signing))), by_method: tally(plans, (x) => x.method) }
          : 'missing: no procurement plans',
        contracts: contracts.length
          ? { count: contracts.length, total_amount_usd: Math.round(contracts.reduce((n, c) => n + c.supplier_contract_amount_usd, 0)), by_category: tally(contracts, (c) => c.procurement_category), by_method: tally(contracts, (c) => c.procurement_method) }
          : 'missing: no contracts',
      }
    }),
    lessons: lessons.length ? lessons : 'missing: no completion report lessons match',
  }
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10)
const medianInt = (xs: number[]) => Math.round(median(xs) ?? 0)
const matchesKeyword = (p: Project, k?: string) => !k || [p.project_name, p.project_global_practice, p.borrower_country].some((s) => s.toLowerCase().includes(k.trim().toLowerCase()))

export interface PlanProposalInput {
  /** The day the tender is advertised. Give this or `signing_by`. */
  start_date?: string
  /** The day the contract must be signed by; the plan is worked back from it. */
  signing_by?: string
  name?: string
  category?: string
  method?: string
  /** Narrows the reference plans to projects of this sector, name or country. */
  keyword?: string
}

/**
 * A suggested plan for the user's own procurement: the four stage dates, built from the median gaps between stages in the stored plans
 * (matching the category and sector when given). The basis says how many plans and which projects it rests on. No reference plans means no plan, never a guess.
 */
export function proposePlan(db: AssistantDb, raw: PlanProposalInput) {
  // A model that leaves a field out often sends an empty string for it; that means "not given".
  const input = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v])) as PlanProposalInput
  const ids = new Set(db.projects.filter((p) => matchesKeyword(p, input.keyword)).map((p) => p.project_id))
  const cat = input.category?.trim().toLowerCase()
  const refs = db.plans.filter((x) => ids.has(x.project_id) && (!cat || x.category.toLowerCase().includes(cat)))
  if (refs.length === 0) return { missing: 'No reference plans match this sector and category, so no plan is suggested.' }
  const gap = {
    to_bid_opening: medianInt(refs.map((x) => daysBetween(x.planned_advertisement, x.planned_bid_opening))),
    to_evaluation_complete: medianInt(refs.map((x) => daysBetween(x.planned_bid_opening, x.planned_evaluation_complete))),
    to_signing: medianInt(refs.map((x) => daysBetween(x.planned_evaluation_complete, x.planned_signing))),
  }
  const total = gap.to_bid_opening + gap.to_evaluation_complete + gap.to_signing
  // A start on or after the signing deadline cannot be meant: work back from the deadline instead, and say so.
  const startIgnored = !!input.start_date && !!input.signing_by && input.start_date >= input.signing_by
  const given = startIgnored ? undefined : input.start_date
  const start = given ?? (input.signing_by ? addDays(input.signing_by, -total) : undefined)
  if (!start) return { missing: 'Give a start date (advertisement) or a date the contract must be signed by.' }
  const bid = addDays(start, gap.to_bid_opening)
  const evalc = addDays(bid, gap.to_evaluation_complete)
  const sign = addDays(evalc, gap.to_signing)
  return {
    plan: {
      name: input.name?.trim() || 'Your procurement', category: input.category?.trim() || refs[0]!.category, method: input.method?.trim() || [...Object.entries(tally(refs, (x) => x.method))].sort((a, b) => b[1] - a[1])[0]![0],
      planned_advertisement: start, planned_bid_opening: bid, planned_evaluation_complete: evalc, planned_signing: sign,
    },
    basis: { sample_size: refs.length, projects: [...new Set(refs.map((x) => x.project_id))], median_gap_days: gap, median_total_days: total, filtered_by: [input.keyword, input.category].filter(Boolean).join(' · ') || 'all stored plans' },
    ...(startIgnored ? { note: 'The start date was on or after the signing deadline, so the plan was worked back from the deadline.' } : {}),
    deadline_check: input.signing_by ? (sign <= input.signing_by ? { fits: true, spare_days: daysBetween(sign, input.signing_by) } : { fits: false, days_over: daysBetween(input.signing_by, sign) }) : 'No signing deadline was given.',
  }
}

const CLAUSES = [
  { field: 'duration_months', label: 'Contract duration', unit: 'months' },
  { field: 'bid_validity_days', label: 'Bid validity', unit: 'days' },
  { field: 'performance_security_pct', label: 'Performance security', unit: '%' },
  { field: 'min_similar_contracts', label: 'Minimum similar contracts', unit: '' },
  { field: 'min_similar_value_usd', label: 'Minimum similar contract value', unit: 'USD' },
] as const

/**
 * A suggested tender draft for the user's own procurement: for each clause the median of the stored drafts (most common for the evaluation method),
 * with how many drafts and which projects it comes from. A clause no draft holds is reported missing. Also the completion-report lessons, with chunk ids.
 */
export function proposeTenderDraft(db: AssistantDb, keyword?: string) {
  const ids = new Set(db.projects.filter((p) => matchesKeyword(p, keyword)).map((p) => p.project_id))
  const drafts = db.tender_drafts.filter((d) => ids.has(d.project_id))
  if (drafts.length === 0) return { missing: 'No stored tender draft matches this sector, so no clause values are suggested.' }
  const from = drafts.map((d) => d.project_id)
  const clauses: { field: string; label: string; unit: string; value: number | string; sample_size: number; from: string[] }[] = CLAUSES.map((c) => {
    const values = drafts.map((d) => d[c.field])
    return { field: c.field, label: c.label, unit: c.unit, value: medianInt(values), sample_size: values.length, from }
  })
  const methods = Object.entries(tally(drafts, (d) => d.evaluation_method)).sort((a, b) => b[1] - a[1])
  clauses.push({ field: 'evaluation_method', label: 'Evaluation method', unit: '', value: methods[0]![0], sample_size: drafts.length, from })
  const lessons = db.completion_reports.flatMap((r) => r.lessons.map((l) => ({ report: r.id, project: r.project_name, lesson: l.text, chunk_id: l.chunk_id })))
  return { clauses, lessons, filtered_by: keyword?.trim() || 'all stored drafts' }
}
