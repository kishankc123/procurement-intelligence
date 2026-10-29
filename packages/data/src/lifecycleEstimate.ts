// Estimates for a NEW procurement, worked out from the stored projects: for each lifecycle stage, the median of what similar projects did, with how many
// projects (or plans, contracts, reports) it rests on. Real and mock projects are never averaged together: each kind is its own group, so a figure is
// always either "real World Bank data" or "mock demonstration data". What a kind does not hold is reported as missing, with the reason, never filled in.
import type { AssistantDb, LifecycleStage } from './assistant'
import { projectScope, scopedDb, scopeLabel, type DataScope } from './scope'
import type { Project } from './schemas'

/** Below this many samples an estimate is still given, but flagged as thin. */
export const THIN_SAMPLE_BELOW = 3

export interface EstimateRow {
  stage: LifecycleStage
  metric: string
  /** Null when the data does not hold it; `missing` then says why. */
  value: number | string | null
  unit: string
  n: number
  /** What n counts: projects, plans, contracts, reports, drafts. */
  counts: string
  thin: boolean
  basis: string
  missing?: string
}

export interface EstimateGroup {
  scope: DataScope
  label: string
  projects: string[]
  note?: string
  rows: EstimateRow[]
}

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
const median = (xs: number[]) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}
const round = (x: number | null, places = 0) => (x === null ? null : Math.round(x * 10 ** places) / 10 ** places)
const valid = (d?: string | null): d is string => !!d && !Number.isNaN(Date.parse(d))
const tally = <T,>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, number>>((n, r) => ({ ...n, [key(r)]: (n[key(r)] ?? 0) + 1 }), {})

const row = (stage: LifecycleStage, metric: string, values: number[], unit: string, counts: string, basis: string, places = 0): EstimateRow => {
  const value = round(median(values), places)
  return value === null
    ? { stage, metric, value: null, unit, n: 0, counts, thin: false, basis, missing: `No ${counts} hold this.` }
    : { stage, metric, value, unit, n: values.length, counts, thin: values.length < THIN_SAMPLE_BELOW, basis }
}
const gap = (stage: LifecycleStage, metric: string, why: string): EstimateRow => ({ stage, metric, value: null, unit: '', n: 0, counts: '', thin: false, basis: '', missing: why })

const matches = (p: Project, k: string) => [p.project_name, p.project_global_practice, p.borrower_country].some((s) => s.toLowerCase().includes(k))

function estimateGroup(all: AssistantDb, scope: DataScope, keyword?: string): EstimateGroup {
  const db = scopedDb(all, scope)
  const k = keyword?.trim().toLowerCase()
  let projects = db.projects.filter((p) => !k || matches(p, k))
  let note: string | undefined
  if (k && projects.length === 0 && db.projects.length > 0) {
    projects = db.projects
    note = `No ${scope} project matches "${keyword}", so all ${projects.length} ${scope} projects are used. Treat the figures as general, not sector-specific.`
  }
  const ids = new Set(projects.map((p) => p.project_id))
  const label = scope === 'real' ? 'Real World Bank projects' : 'Mock demonstration projects (illustrative, not market benchmarks)'
  if (projects.length === 0) return { scope, label, projects: [], note: `There are no ${scopeLabel(scope)} to estimate from.`, rows: [] }

  const plans = db.plans.filter((x) => ids.has(x.project_id))
  const drafts = db.tender_drafts.filter((d) => ids.has(d.project_id))
  const contracts = db.contracts.filter((c) => ids.has(c.project_id))
  const reports = db.supervision_reports.filter((r) => ids.has(r.project_id))
  // Completion reports can belong to projects that are not themselves stored (the mock ones), so they are matched on name and lesson text like the reference lookup does.
  const completion = db.completion_reports.filter((r) => !k || ids.has(r.project_id) || r.project_name.toLowerCase().includes(k) || r.lessons.some((l) => l.text.toLowerCase().includes(k)))
  const rows: EstimateRow[] = []

  // Planning
  const eff = (p: Project) => p.effectiveness_actual ?? p.effectiveness_planned
  rows.push(row('planning', 'Approval to effectiveness', projects.filter((p) => valid(p.approval_date) && valid(eff(p))).map((p) => days(p.approval_date, eff(p)!)), 'days', 'projects', 'Median of the days between board approval and the project becoming effective.'))
  rows.push(row('planning', 'Planned project length (approval to planned closing)', projects.filter((p) => valid(p.approval_date) && valid(p.closing_date_planned)).map((p) => days(p.approval_date, p.closing_date_planned) / 30.44), 'months', 'projects', 'Median planned length from approval to the originally planned closing date.', 0))
  rows.push(row('planning', 'Closing extension beyond the original plan', projects.filter((p) => valid(p.closing_date_planned) && valid(p.closing_date_revised)).map((p) => days(p.closing_date_planned, p.closing_date_revised!) / 30.44), 'months', 'projects', 'Median months the closing date moved from the original plan (0 when it did not move).', 0))
  if (plans.length > 0) {
    rows.push(row('planning', 'Bidding period (advertisement to bid opening)', plans.map((x) => days(x.planned_advertisement, x.planned_bid_opening)), 'days', 'plans', 'Median of the planned gap between advertisement and bid opening.'))
    rows.push(row('planning', 'Evaluation period (bid opening to evaluation complete)', plans.map((x) => days(x.planned_bid_opening, x.planned_evaluation_complete)), 'days', 'plans', 'Median of the planned gap between bid opening and the end of evaluation.'))
    rows.push(row('planning', 'Award to signing (evaluation complete to signing)', plans.map((x) => days(x.planned_evaluation_complete, x.planned_signing)), 'days', 'plans', 'Median of the planned gap between the end of evaluation and signing.'))
    rows.push(row('planning', 'Advertisement to signing, in total', plans.map((x) => days(x.planned_advertisement, x.planned_signing)), 'days', 'plans', 'Median of the whole planned procurement time.'))
  } else {
    rows.push(gap('planning', 'Evaluation and signing periods', 'No bid-opening, evaluation or signing dates exist in the public sources for these projects, so they cannot be estimated from them.'))
  }
  // Real tender notices carry the day a tender was posted and the day bids were due, which is a real bidding period. A same-day or longer-than-a-year gap is a placeholder, not a period.
  const tenders = db.tender_notices.filter((t) => ids.has(t.project_id) && valid(t.deadline))
  if (tenders.length > 0) {
    rows.push(row('planning', 'Bidding period (tender posted to bids due)', tenders.map((t) => days(t.posted, t.deadline!)).filter((d) => d >= 3 && d <= 365), 'days', 'tender notices', 'Median days between a tender notice being posted and its bid deadline. Notices with the same day or a gap over a year are left out.'))
  }
  for (const [category] of Object.entries(tally(contracts, (c) => c.procurement_category)).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    rows.push(row('planning', `Typical ${category} contract size`, contracts.filter((c) => c.procurement_category === category && c.supplier_contract_amount_usd > 0).map((c) => c.supplier_contract_amount_usd), 'USD', 'contracts', `Median amount of the ${category} contracts.`))
  }
  if (contracts.length > 0) {
    const [method, count] = Object.entries(tally(contracts, (c) => c.procurement_method)).sort((a, b) => b[1] - a[1])[0]!
    rows.push({ stage: 'planning', metric: 'Most common procurement method', value: method, unit: '', n: contracts.length, counts: 'contracts', thin: contracts.length < THIN_SAMPLE_BELOW, basis: `${Math.round((count / contracts.length) * 100)}% of the contracts used it.` })
  }

  // Tender design
  if (drafts.length > 0) {
    const clause = (metric: string, unit: string, pick: (d: (typeof drafts)[number]) => number, places = 0) => row('tender-design', metric, drafts.map(pick), unit, 'drafts', 'Median of the saved tender drafts.', places)
    rows.push(clause('Contract duration', 'months', (d) => d.duration_months))
    rows.push(clause('Bid validity', 'days', (d) => d.bid_validity_days))
    rows.push(clause('Performance security', '%', (d) => d.performance_security_pct, 1))
    rows.push(clause('Minimum similar contracts', '', (d) => d.min_similar_contracts))
    rows.push(clause('Minimum similar contract value', 'USD', (d) => d.min_similar_value_usd))
    const [method, count] = Object.entries(tally(drafts, (d) => d.evaluation_method)).sort((a, b) => b[1] - a[1])[0]!
    rows.push({ stage: 'tender-design', metric: 'Evaluation method', value: method, unit: '', n: drafts.length, counts: 'drafts', thin: drafts.length < THIN_SAMPLE_BELOW, basis: `Most common: ${count} of ${drafts.length} drafts.` })
  } else {
    rows.push(gap('tender-design', 'Bid validity, contract duration, security, qualification, evaluation method', 'No tender drafts or clause values exist in the public sources for these projects.'))
  }

  // Monitoring
  const byProject = new Map<string, typeof reports>()
  for (const r of reports) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r].sort((a, b) => a.date.localeCompare(b.date)))
  const intervals = [...byProject.values()].flatMap((rs) => rs.slice(1).map((r, i) => days(rs[i]!.date, r.date)))
  rows.push(row('monitoring', 'Time between supervision reports', intervals, 'days', 'report intervals', 'Median days between one supervision report and the next.'))
  const to50 = projects.flatMap((p) => {
    const first = byProject.get(p.project_id)?.find((r) => r.disbursed_pct >= 50)
    return first && valid(eff(p)) ? [days(eff(p)!, first.date) / 30.44] : []
  })
  rows.push(row('monitoring', 'Time from effectiveness to 50% disbursed', to50, 'months', 'projects', 'Median months until a supervision report first shows half the money disbursed. Only projects that got there count.', 0))
  if (byProject.size > 0) {
    const restructured = [...byProject.values()].filter((rs) => rs.some((r) => r.restructurings.length > 0)).length
    rows.push({ stage: 'monitoring', metric: 'Projects restructured', value: Math.round((restructured / byProject.size) * 100), unit: '%', n: byProject.size, counts: 'projects', thin: byProject.size < THIN_SAMPLE_BELOW, basis: `${restructured} of ${byProject.size} projects with reports had at least one restructuring.` })
  }

  // Learning
  const lessons = completion.reduce((n, r) => n + r.lessons.length, 0)
  rows.push(lessons > 0
    ? { stage: 'learning', metric: 'Lessons on record from completion reports', value: lessons, unit: 'lessons', n: completion.length, counts: 'completion reports', thin: completion.length < THIN_SAMPLE_BELOW, basis: 'Count of lessons; ask for the tender draft to see them with their sources.' }
    : gap('learning', 'Lessons from completion reports', 'No completion-report lessons have been read for these projects yet.'))

  return { scope, label, projects: [...ids], ...(note ? { note } : {}), rows }
}

/**
 * Estimates for the user's own procurement from similar stored projects. `keyword` narrows by sector, name or country (for example road); when
 * nothing of the chosen kind matches, all projects of that kind are used and the group says so.
 * `scope` picks the kind of data. Left out ("auto"), it is the real projects whenever any exist, and the mock ones only when there are no real
 * projects at all: mock figures are shown only when someone asks for them. Real and mock are never blended.
 */
export function estimateLifecycle(db: AssistantDb, keyword?: string, scope: DataScope | 'auto' = 'auto'): { keyword: string | null; groups: EstimateGroup[]; how_to_read: string } {
  const chosen: DataScope = scope === 'auto' ? (db.projects.some((p) => projectScope(p.project_id) === 'real') ? 'real' : 'mock') : scope
  return {
    keyword: keyword?.trim() || null,
    groups: [estimateGroup(db, chosen, keyword)],
    how_to_read: `Each figure is a median of similar stored ${chosen} projects with the number it rests on. A row marked missing means the data holds nothing for it; it is not filled from the other kind of data.`,
  }
}
