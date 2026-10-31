// Analysis the assistant can call as tools (server side). Pure functions over the stored data: no React, no files, no network, no model. Each returns
// what the records show, which records show it (so an answer can cite them), what is NOT known and why, and a suggested next step. Nothing here estimates
// a probability or a score: a priority is a stated rule applied to stored figures, and a comparison lists similarities and differences instead of one number.
// Every item says how it is known: `documented` (a field of a record or a passage of a document), `derived` (computed from records by the rule it names).
// Interpretation and prediction are left to the assistant, which is told to label them as such.
import { THRESHOLDS } from '@pi/config'
import type { AssistantDb } from './assistant'
import type { Doc, Project, SupervisionReport } from './schemas'
import { projectScope, scopeLabel, type DataScope } from './scope'
import { dayDiff } from './selectors'

// ------------------------------------------------------------------ vocabulary

/** The four stages of the lifecycle as the analysis names them, with the ids the app uses for them. */
export const ANALYSIS_STAGES = ['plans_executed', 'tenders_published', 'monitoring', 'lessons_learned'] as const
export type Stage = (typeof ANALYSIS_STAGES)[number]
export const STAGE_LABEL: Record<Stage, string> = { plans_executed: 'Plans executed', tenders_published: 'Tenders published', monitoring: 'Monitoring', lessons_learned: 'Lessons learned' }
export const STAGE_APP_ID: Record<Stage, string> = { plans_executed: 'planning', tenders_published: 'tender-design', monitoring: 'monitoring', lessons_learned: 'learning' }

/** A record or passage an answer can cite. */
export interface Evidence { type: 'record' | 'chunk' | 'document'; id: string; label: string }
export type Basis = 'documented' | 'derived'

const RATING_ORDER = ['HS', 'S', 'MS', 'MU', 'U', 'HU']
const RISK_ORDER = ['Low', 'Moderate', 'Substantial', 'High']
const round1 = (n: number) => Math.round(n * 10) / 10
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0)
const usd = (n: number) => `USD ${Math.round(n).toLocaleString('en-US')}`
const months = (from: string, to: string) => round1(dayDiff(from, to) / 30.44)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const sortedByDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date))

// How a stored document is recognised. The ingested World Bank documents and the mock ones name their types differently.
const isIsr = (d: Doc) => /implementation status|supervision/i.test(d.type)
const isIcrReview = (d: Doc) => /completion report review/i.test(d.type)
const isIcr = (d: Doc) => !isIcrReview(d) && /implementation completion|completion report/i.test(d.type)
const isAppraisal = (d: Doc) => /appraisal/i.test(d.type)
const isPlanDoc = (d: Doc) => /procurement plan/i.test(d.type)

/** The method names the World Bank data uses for selecting without open competition (direct or single-source selection, limited or restricted competition). Quotations and shopping are low-value but competitive, so they are not counted. A label does not show how a selection was justified. */
const LESS_COMPETITIVE = /direct|single[- ]source|sole|limited|restricted/i

function projectOf(db: AssistantDb, id: string): Project | null { return db.projects.find((p) => p.project_id === id) ?? null }
const asOfOf = (db: AssistantDb, reports: SupervisionReport[]) => (db.meta as { as_of_date?: string } | undefined)?.as_of_date ?? sortedByDate(reports).at(-1)?.date ?? new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ what is on record, and what is not

export type GapStatus =
  /** The data is stored. */
  | 'available'
  /** The public sources do not publish it for projects like this (bidder counts, amendments of a real project, tender clauses). */
  | 'not_in_public_sources'
  /** It exists, or is listed, but its content has not been downloaded, read or extracted. */
  | 'not_retrieved'
  /** It was read, but the figures could not be checked (a report the parser could not read, plan rows not found in the text). */
  | 'could_not_verify'
  /** Nothing is stored, and the records do not say whether none exists or it was not retrieved. */
  | 'not_found'

export interface DataItem {
  stage: Stage | 'general'
  item: string
  status: GapStatus
  detail: string
  /** How a gap limits the analysis. */
  limits?: string
  /** Another stored source that can partly stand in. */
  alternative?: string
  /** A practical next step. */
  next_step?: string
  evidence?: Evidence[]
}

/**
 * What the app holds for one project, stage by stage, and for every gap which of three things it is: not published at all, not retrieved, or retrieved
 * but not verifiable (plus "not found" when the records cannot tell). Each gap says how it limits the analysis, what could stand in, and what to do next.
 */
export function getDataGaps(db: AssistantDb, projectId: string) {
  const project = projectOf(db, projectId)
  if (!project) return { error: `No project with id ${projectId}.` }
  const real = projectScope(projectId) === 'real'
  const contracts = db.contracts.filter((c) => c.project_id === projectId)
  const reports = db.supervision_reports.filter((r) => r.project_id === projectId)
  const docs = db.documents.filter((d) => d.project_id === projectId)
  const chunks = db.chunks.filter((c) => docs.some((d) => d.doc_id === c.doc_id))
  const rows = db.plan_packages.filter((r) => r.project_id === projectId)
  const notices = db.tender_notices.filter((t) => t.project_id === projectId)
  const asOf = asOfOf(db, reports)
  const closing = project.closing_date_revised ?? project.closing_date_planned
  const items: DataItem[] = []
  const add = (i: DataItem) => items.push(i)

  // Plans executed
  if (rows.length > 0) {
    add({ stage: 'plans_executed', item: 'Procurement plan packages', status: 'available', detail: `${rows.length} package rows from the World Bank plan of ${rows[0]!.plan_date}, copied as written (estimated costs in ${rows[0]!.cost_unit ?? 'an unstated unit'}).`,
      limits: 'Only the first rows of one plan document are stored, so the plan is not complete and totals cannot be taken from it.', evidence: [{ type: 'document', id: rows[0]!.plan_doc, label: `Procurement plan of ${rows[0]!.plan_date}` }] })
  } else if (docs.some(isPlanDoc)) {
    add({ stage: 'plans_executed', item: 'Procurement plan packages', status: 'could_not_verify', detail: 'A plan document is stored, but no package row could be read and checked against its text.',
      limits: 'Planned packages, methods and expected bid openings cannot be listed.', alternative: 'The plan text is stored in chunks and can be searched.', next_step: 'Search the plan document text for the package or method in question.' })
  } else {
    add({ stage: 'plans_executed', item: 'Procurement plan', status: 'not_found', detail: 'No procurement plan document and no plan rows are stored for this project.',
      limits: 'What was planned cannot be compared with what was awarded.', alternative: 'The contract awards show what was procured.', next_step: 'Check whether a plan is published for the project; otherwise compare the contract awards with comparable projects.' })
  }
  if (contracts.length > 0) {
    const dates = contracts.map((c) => c.contract_signing_date).sort()
    add({ stage: 'plans_executed', item: 'Contract awards', status: 'available', detail: `${contracts.length} contracts, ${usd(sum(contracts.map((c) => c.supplier_contract_amount_usd)))} committed, signed ${dates[0]} to ${dates.at(-1)}.`,
      limits: 'Amounts are committed at signing, not paid; joint ventures may appear as several rows.' })
  } else {
    add({ stage: 'plans_executed', item: 'Contract awards', status: real ? 'not_in_public_sources' : 'not_found', detail: real ? 'The public contract-awards list has no rows for this project.' : 'No contracts are stored for this project.',
      limits: 'Suppliers, values, methods and categories cannot be analysed for this project.', alternative: 'Comparable projects that do have contract awards.', next_step: 'Use find_comparable_projects to see what similar projects awarded.' })
  }
  add({ stage: 'plans_executed', item: 'Procurement durations (advertisement to award) and contract completion dates', status: 'not_in_public_sources',
    detail: 'The contract awards carry a signing date only. No advertisement, bid opening, award or completion date is published with them.',
    limits: 'A reliable procurement-duration or contract-delay benchmark cannot be calculated from the contract awards.',
    alternative: 'Plan rows give an expected bid opening as text, and tender notices give a posting date; neither gives an award date.', next_step: 'Ask the user for the dates they hold, or compare comparable projects only on what is recorded (signing dates and supervision reports).' })

  // Tenders published
  if (notices.length > 0) add({ stage: 'tenders_published', item: 'Tender notices', status: 'available', detail: `${notices.length} Invitation for Bids notices, newest ${sortedByDate(notices.map((n) => ({ date: n.posted }))).at(-1)!.date}.`, limits: 'Only the newest 60 are stored; notice text and bidding documents are not.' })
  else add({ stage: 'tenders_published', item: 'Tender notices', status: 'not_found', detail: 'No tender notices are stored for this project.', limits: 'What was tendered, when and by whom cannot be listed.',
    alternative: 'Contract awards show what was bought.', next_step: 'Re-run the ingestion for this project to read its notices, or accept that none are published.' })
  add({ stage: 'tenders_published', item: 'Tender clauses, bidder counts, bid dates and evaluation results', status: real ? 'not_in_public_sources' : 'available',
    detail: real ? 'The public sources hold none of these for a World Bank project.' : 'Demonstration tender drafts and amendments exist for the mock projects.',
    limits: real ? 'Competition (how many bid), bid validity and evaluation outcomes cannot be assessed; the method label is the only competition signal.' : 'These are made-up figures.',
    next_step: real ? 'Ask the user for the bidding documents or evaluation reports, if they hold them.' : undefined })
  add({ stage: 'tenders_published', item: 'Contract amendments and variations', status: real ? 'not_in_public_sources' : 'available',
    detail: real ? 'Amendments are not published with the contract awards.' : `${db.amendments.length} demonstration amendments exist.`,
    limits: real ? 'Cost and time changes after signing cannot be measured.' : undefined, alternative: real ? 'Supervision reports record restructurings and closing-date extensions at project level.' : undefined })

  // Monitoring
  const isrDocs = docs.filter(isIsr)
  if (reports.length > 0) {
    const sorted = sortedByDate(reports)
    add({ stage: 'monitoring', item: 'Supervision reports', status: 'available', detail: `${reports.length} reports with ratings, risk and disbursement, ${sorted[0]!.date} to ${sorted.at(-1)!.date}.` })
  } else add({ stage: 'monitoring', item: 'Supervision reports', status: isrDocs.length > 0 ? 'could_not_verify' : 'not_found',
    detail: isrDocs.length > 0 ? `${isrDocs.length} supervision report documents are stored but none could be read into ratings.` : 'No supervision reports are stored for this project.',
    limits: 'Performance, risk and disbursement trends cannot be assessed.', next_step: 'Search the stored report text, or re-run the ingestion.' })
  const unread = isrDocs.filter((d) => d.parse_status === 'parsed').length - reports.length
  if (reports.length > 0 && unread > 0) add({ stage: 'monitoring', item: 'Supervision reports the parser could not read', status: 'could_not_verify', detail: `${unread} of ${isrDocs.length} report documents were stored as text but are not in the ratings series.`,
    limits: 'The ratings series has gaps, so a change between two reports may be larger than it looks.', alternative: 'The text of those reports is searchable.', next_step: 'Search the report text for the periods missing from the series.' })
  const refused = docs.filter((d) => d.parse_status === 'failed')
  if (refused.length > 0) add({ stage: 'monitoring', item: 'Documents whose text could not be downloaded', status: 'not_retrieved', detail: `${refused.length} documents were listed but the World Bank site refused or did not have their text: ${refused.slice(0, 4).map((d) => d.title).join('; ')}.`,
    limits: 'Anything those documents say is missing from the analysis.', next_step: 'Re-run the ingestion later (a refusal is retried after a day), or open them on the World Bank site.', evidence: refused.slice(0, 4).map((d) => ({ type: 'document' as const, id: d.doc_id, label: d.title })) })

  // Lessons learned
  const icr = docs.filter(isIcr)
  const structured = db.completion_reports.filter((r) => r.project_id === projectId)
  if (structured.length > 0) add({ stage: 'lessons_learned', item: 'Completion report lessons', status: 'available', detail: `${structured.reduce((n, r) => n + r.lessons.length, 0)} lessons extracted from the completion report, each with its source passage.`, evidence: structured.flatMap((r) => r.lessons.map((l) => ({ type: 'chunk' as const, id: l.chunk_id, label: l.section }))).slice(0, 6) })
  else if (icr.some((d) => d.parse_status === 'parsed')) add({ stage: 'lessons_learned', item: 'Completion report lessons', status: 'not_retrieved',
    detail: `The completion report text is stored (${chunks.filter((c) => icr.some((d) => d.doc_id === c.doc_id)).length} searchable chunks), but its lessons have not been extracted into a list.`,
    limits: 'Lessons cannot be listed or counted; they have to be read from the text.', alternative: 'The completion report text itself.', next_step: 'Search the completion report text for lessons, causes of delay and procurement problems (semantic_search_documents).',
    evidence: icr.map((d) => ({ type: 'document' as const, id: d.doc_id, label: d.title })) })
  else add({ stage: 'lessons_learned', item: 'Completion report', status: 'not_found', detail: `No completion report is stored. The project's closing date is ${closing}${closing >= asOf ? ', which has not passed, so it may simply not exist yet' : ', which has passed, so one may exist that was not retrieved'}.`,
    limits: 'There is no documented hindsight on how this project turned out.', alternative: 'Lessons from comparable projects that have a completion report.', next_step: 'Use find_comparable_projects and scan_risk_evidence on projects that do have one; do not infer lessons for this project.' })
  if (docs.some((d) => isIcrReview(d) && d.parse_status !== 'parsed')) add({ stage: 'lessons_learned', item: 'Completion report review', status: 'not_retrieved', detail: 'The independent review of the completion report is listed but its text was not read.', limits: 'The reviewers\' rating of the outcome is not available.' })

  // Cross-cutting
  if (docs.some((d) => isAppraisal(d) && d.parse_status !== 'parsed')) add({ stage: 'general', item: 'Project appraisal document', status: 'not_retrieved', detail: 'The appraisal document is listed but its text was not read.',
    limits: 'The original objectives, risk assessment and procurement arrangements are not available to check later findings against.', next_step: 'Open it on the World Bank site, or ask for text ingestion of this document type.' })
  const embedded = chunks.filter((c) => c.embedding_status === 'embedded').length
  if (chunks.length > 0 && embedded === 0) add({ stage: 'general', item: 'Search by meaning', status: 'not_retrieved', detail: `None of the ${chunks.length} document chunks has been embedded, so only keyword search works.`, limits: 'A question phrased differently from the text may miss relevant passages.', next_step: 'Re-ingest the project with the embedding model switched on.' })
  if (chunks.length === 0) add({ stage: 'general', item: 'Document text', status: 'not_found', detail: 'No document text is stored for this project.', limits: 'Nothing can be cited from documents.' })

  const by = (s: GapStatus) => items.filter((i) => i.status === s).length
  return {
    project_id: projectId, project: project.project_name, kind: scopeLabel(projectScope(projectId)),
    meaning: {
      not_in_public_sources: 'Not published by the public sources for this kind of project. It cannot be retrieved by ingesting again.',
      not_retrieved: 'It exists or is listed, but its content was not downloaded, read or extracted. It may be obtainable.',
      could_not_verify: 'It was read, but the figures could not be checked against the text.',
      not_found: 'Nothing is stored, and the records do not say whether none exists or it was not retrieved.',
    },
    counts: { available: by('available'), not_in_public_sources: by('not_in_public_sources'), not_retrieved: by('not_retrieved'), could_not_verify: by('could_not_verify'), not_found: by('not_found') },
    items,
  }
}

// ------------------------------------------------------------------ comparable projects

interface Profile {
  id: string; name: string; country: string; region: string; sector: string[]
  committed: number | null; contracts: number; avgContract: number | null
  dominantCategory: { name: string; share: number } | null
  lessCompetitiveShare: number | null
  plannedYears: number | null; extensionMonths: number | null
  stage: 'completed' | 'supervised' | 'no reports'
  reports: number; hasCompletionReport: boolean
}

const sectorOf = (p: Project) => p.project_global_practice.split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean)

function profileOf(db: AssistantDb, p: Project): Profile {
  const contracts = db.contracts.filter((c) => c.project_id === p.project_id)
  const committed = sum(contracts.map((c) => c.supplier_contract_amount_usd))
  const byCat = new Map<string, number>()
  for (const c of contracts) byCat.set(c.procurement_category, (byCat.get(c.procurement_category) ?? 0) + c.supplier_contract_amount_usd)
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0]
  const lessValue = sum(contracts.filter((c) => LESS_COMPETITIVE.test(c.procurement_method)).map((c) => c.supplier_contract_amount_usd))
  const reports = db.supervision_reports.filter((r) => r.project_id === p.project_id)
  const docs = db.documents.filter((d) => d.project_id === p.project_id)
  const hasIcr = db.completion_reports.some((r) => r.project_id === p.project_id) || docs.some((d) => isIcr(d) && d.parse_status === 'parsed')
  return {
    id: p.project_id, name: p.project_name, country: p.borrower_country, region: p.region, sector: sectorOf(p),
    committed: contracts.length ? committed : null, contracts: contracts.length, avgContract: contracts.length ? committed / contracts.length : null,
    dominantCategory: top && committed > 0 ? { name: top[0], share: pct(top[1], committed) } : null,
    lessCompetitiveShare: contracts.length && committed > 0 ? pct(lessValue, committed) : null,
    plannedYears: p.approval_date && p.closing_date_planned ? round1(dayDiff(p.approval_date, p.closing_date_planned) / 365.25) : null,
    extensionMonths: p.closing_date_revised ? months(p.closing_date_planned, p.closing_date_revised) : 0,
    stage: hasIcr ? 'completed' : reports.length ? 'supervised' : 'no reports', reports: reports.length, hasCompletionReport: hasIcr,
  }
}

export interface ComparableInput {
  /** Compare other projects with this stored project. */
  project_id?: string
  /** Or describe the user's own procurement; only what is given is compared. */
  sector?: string; country?: string; category?: string; value_usd?: number; method?: string
  /** Which kind of stored project to compare with when no project is named (default real, when there are any). */
  scope?: DataScope
  limit?: number
}

type Verdict = 'similar' | 'partly' | 'different' | 'unknown'
interface Dim { dimension: string; target: string; candidate: string; verdict: Verdict; note?: string }

const ratioVerdict = (a: number | null, b: number | null, similarWithin: number, differentAbove: number): { verdict: Verdict; ratio: number | null } => {
  if (a === null || b === null || a <= 0 || b <= 0) return { verdict: 'unknown', ratio: null }
  const r = Math.max(a, b) / Math.min(a, b)
  return { verdict: r <= similarWithin ? 'similar' : r >= differentAbove ? 'different' : 'partly', ratio: round1(r) }
}

/**
 * Other stored projects of the same kind, each with WHY it may be relevant and what limits that: the dimensions compared (sector, country, scale,
 * dominant category, share procured less competitively, planned length, stage), the verdict on each and the values behind it. There is no single
 * similarity number and no claim of statistical significance. Closer / partial / limited follows a stated rule over the dimensions that could be compared.
 */
export function findComparableProjects(db: AssistantDb, input: ComparableInput) {
  const target = input.project_id ? projectOf(db, input.project_id) : null
  if (input.project_id && !target) return { error: `No project with id ${input.project_id}.` }
  const scope: DataScope = target ? projectScope(target.project_id) : input.scope ?? (db.projects.some((p) => projectScope(p.project_id) === 'real') ? 'real' : 'mock')
  const pool = db.projects.filter((p) => projectScope(p.project_id) === scope && p.project_id !== target?.project_id)
  if (pool.length === 0) return { comparables: 'missing: no other stored project of this kind to compare with.' }
  const t: Partial<Profile> & { sectorText?: string } = target ? profileOf(db, target) : {
    sector: input.sector ? [input.sector.toLowerCase()] : undefined, country: input.country, committed: input.value_usd ?? null,
    dominantCategory: input.category ? { name: input.category, share: 100 } : null,
  }
  const targetLabel = target ? `${target.project_name} (${target.project_id})` : 'your procurement as described'

  // Sector only says something when the stored projects differ in it.
  const allSectors = new Set([...pool.flatMap((p) => sectorOf(p)), ...(t.sector ?? [])])
  const sectorDiscriminates = allSectors.size > 1
  const out = pool.map((p) => {
    const c = profileOf(db, p)
    const dims: Dim[] = []
    if (t.sector?.length && sectorDiscriminates) {
      const same = c.sector.some((s) => t.sector!.some((x) => s.includes(x) || x.includes(s)))
      dims.push({ dimension: 'sector', target: t.sector.join(', '), candidate: c.sector.join(', '), verdict: same ? 'similar' : 'different' })
    }
    if (t.country) {
      const norm = (s: string) => s.toLowerCase()
      const same = norm(c.country).includes(norm(t.country)) || norm(t.country).includes(norm(c.country))
      const sameRegion = !!(t.region && c.region && norm(t.region) === norm(c.region))
      dims.push({ dimension: 'country', target: t.country, candidate: c.country, verdict: same ? 'similar' : sameRegion ? 'partly' : 'different', note: same ? undefined : sameRegion ? `a different country in the same region (${c.region})` : `a different region (${c.region})` })
    }
    if (t.committed != null) {
      const { verdict, ratio } = ratioVerdict(t.committed, c.committed, 2, 5)
      dims.push({ dimension: 'scale (committed value)', target: usd(t.committed), candidate: c.committed === null ? 'no contracts' : usd(c.committed), verdict, note: ratio ? `${ratio}× apart (similar within 2×, different at 5× or more)` : undefined })
    }
    if (t.dominantCategory) {
      const same = !!c.dominantCategory && c.dominantCategory.name.toLowerCase().includes(t.dominantCategory.name.toLowerCase().slice(0, 5))
      dims.push({ dimension: 'main procurement category', target: t.dominantCategory.name, candidate: c.dominantCategory ? `${c.dominantCategory.name} (${c.dominantCategory.share}% of value)` : 'no contracts', verdict: c.dominantCategory ? (same ? 'similar' : 'different') : 'unknown' })
    }
    if (input.method) dims.push({ dimension: 'method', target: input.method, candidate: c.lessCompetitiveShare === null ? 'no contracts' : `${c.lessCompetitiveShare}% of value by less competitive methods`, verdict: 'unknown', note: 'only the share of less competitive methods is compared when a project is the target' })
    if (t.lessCompetitiveShare != null) {
      const d = c.lessCompetitiveShare === null ? null : Math.abs(c.lessCompetitiveShare - t.lessCompetitiveShare)
      dims.push({ dimension: 'share procured less competitively (direct, single-source or limited selection)', target: `${t.lessCompetitiveShare}%`, candidate: c.lessCompetitiveShare === null ? 'no contracts' : `${c.lessCompetitiveShare}%`, verdict: d === null ? 'unknown' : d <= 15 ? 'similar' : d >= 30 ? 'different' : 'partly', note: 'by value; the label does not show how a selection was justified' })
    }
    if (t.plannedYears != null) {
      const { verdict, ratio } = ratioVerdict(t.plannedYears, c.plannedYears, 1.25, 2)
      dims.push({ dimension: 'planned length (approval to planned closing)', target: `${t.plannedYears} years`, candidate: c.plannedYears === null ? 'unknown' : `${c.plannedYears} years`, verdict, note: ratio ? `${ratio}× apart` : undefined })
    }
    // Stage is not a dimension: a candidate with a completion report is more useful because its outcome is documented, not less comparable. It is reported in history_available.

    const known = dims.filter((d) => d.verdict !== 'unknown')
    const similar = known.filter((d) => d.verdict === 'similar')
    const different = dims.filter((d) => d.verdict === 'different')
    const share = similar.length / Math.max(known.length, 1)
    const comparability = known.length >= 4 && share >= 0.75 && different.length === 0 ? 'closer' : similar.length >= 2 && share >= 0.5 && different.length <= 1 ? 'partial' : 'limited'
    return {
      project_id: c.id, name: c.name, country: c.country, sector: c.sector.join(', '), comparability,
      why_relevant: similar.map((d) => `${d.dimension}: yours ${d.target}, this one ${d.candidate}${d.note ? ` (${d.note})` : ''}`),
      partly_similar: dims.filter((d) => d.verdict === 'partly').map((d) => `${d.dimension}: yours ${d.target}, this one ${d.candidate}${d.note ? ` (${d.note})` : ''}`),
      differences_that_limit_use: different.map((d) => `${d.dimension}: yours ${d.target}, this one ${d.candidate}${d.note ? ` (${d.note})` : ''}`),
      not_comparable_for_lack_of_data: dims.filter((d) => d.verdict === 'unknown').map((d) => d.dimension),
      history_available: { supervision_reports: c.reports, completion_report: c.hasCompletionReport, stage: c.stage },
      _rank: [comparability === 'closer' ? 0 : comparability === 'partial' ? 1 : 2, -similar.length, c.id] as const,
    }
  }).sort((a, b) => a._rank[0] - b._rank[0] || a._rank[1] - b._rank[1] || a._rank[2].localeCompare(b._rank[2]))
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10)
  const stripped = out.slice(0, limit).map(({ _rank, ...rest }) => rest)
  return {
    compared_with: targetLabel, kind: scopeLabel(scope), candidates_considered: pool.length, shown: stripped.length,
    how_ranked: 'Each dimension is judged similar, partly similar, different or unknown (not enough data). closer = at least 4 dimensions could be compared, at least 75% of them similar and none different; partial = at least 2 similar, at least half of those compared similar, and at most 1 different; limited = otherwise. Ties are ordered by the number of similar dimensions. This is a rule over the stored figures, not a statistical score, and with few dimensions known (for example a procurement you describe in a sentence) "closer" cannot be reached.',
    limits: [
      `Only ${pool.length} stored ${scope} project${pool.length === 1 ? '' : 's'} can be compared, so nothing here supports a statistical conclusion.`,
      ...(!sectorDiscriminates ? [`Every stored ${scope} project is in the same sector (${[...allSectors].join(', ')}), so sector is not used to rank them; country, scale, procurement mix, length and stage matter more.`] : []),
      'Similar figures do not mean a similar cause; a difference listed here may explain why a finding does not carry over.',
    ],
    comparables: stripped,
  }
}

// ------------------------------------------------------------------ documented mentions of risk themes

/** A theme is found where one sentence names the topic and also names a problem with it: a mention of "procurement" alone is not a procurement problem. */
interface Theme { id: string; label: string; topic: RegExp; needsProblem: boolean; /** Replaces the general list of problem words for this theme. */ problem?: RegExp }
const PROBLEM = /\b(delay\w*|late(r)?|slow\w*|problem\w*|issue\w*|weak\w*|poor\w*|constraint\w*|challeng\w*|difficult\w*|shortfall\w*|overrun\w*|fail\w*|insufficient|lack\w*|inadequate|bottleneck\w*|cancel\w*|terminat\w*|re-?bid\w*|re-?tender\w*|dispute\w*|complain\w*|non-?complian\w*|backlog|arrears|escalat\w*|increase[ds]?|unsatisfactory)\b/i
export const RISK_THEMES: Theme[] = [
  { id: 'procurement_delay', label: 'Procurement and bidding problems', topic: /\b(procure\w*|bid(s|ding)?|tender\w*|contract award|award of contract|bid validity|bid evaluation)\b/i, needsProblem: true },
  { id: 'contractor_performance', label: 'Contractor performance and capacity', topic: /\b(contractor\w*|civil works|works contract\w*)\b/i, needsProblem: true },
  { id: 'land_and_safeguards', label: 'Land acquisition, resettlement and safeguards', topic: /\b(land acquisition|resettlement|right[- ]of[- ]way|compensation|safeguards?|ESMP|environmental and social)\b/i, needsProblem: true },
  { id: 'cost_and_variations', label: 'Cost increases and contract variations', topic: /\b(cost\w*|price\w*|variation\w*|amendment\w*|additional works|contingenc\w*)\b/i, needsProblem: true },
  { id: 'design_and_specification', label: 'Design and specification quality', topic: /\b(design|technical specification\w*|specification\w*|bidding documents?)\b/i, needsProblem: true },
  { id: 'institutional_capacity', label: 'Implementing agency capacity', topic: /\b(capacity|staff\w*|implementing (agency|unit)|project management unit|PMU|turnover)\b/i, needsProblem: true },
  { id: 'disbursement_and_funds', label: 'Disbursement and funding', topic: /\b(disburse\w*|payments?|counterpart fund\w*|funding)\b/i, needsProblem: true },
  { id: 'closing_and_restructuring', label: 'Extensions and restructuring', topic: /\b(closing date|extension|restructur\w*|additional financing)\b/i, needsProblem: true, problem: /\b(extend\w*|extension\w*|delay\w*|slow\w*|shortfall\w*|unsatisf\w*|challeng\w*|insufficient|lack\w*)\b/i },
]
const THEME_IDS = RISK_THEMES.map((t) => t.id)

/** Table text is mostly numbers, and a glossary of acronyms is mostly capitals; neither says anything about what happened. Both are skipped. */
const looksLikeTable = (text: string) => (text.match(/\d/g) ?? []).length / Math.max(text.length, 1) > 0.15
const looksLikeGlossary = (text: string) => { const words = text.split(/\s+/).filter(Boolean); return words.length > 0 && words.filter((w) => /^[A-Z(]/.test(w)).length / words.length > 0.45 }
const sentencesOf = (text: string) => text.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+(?=[A-Z(])/).filter((x) => x.length >= 30)
const trimTo = (s: string, n = 340) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`)

export interface ScanInput { scope?: DataScope; project_ids?: string[]; themes?: string[]; keyword?: string; limit_per_theme?: number }

/**
 * Where the stored documents mention a risk theme: how many passages, in which projects and document types, and the best passages with chunk ids.
 * It is a keyword scan. A mention shows that a document talks about the theme, not how often it happened, how much it mattered or that it caused anything.
 */
export function scanRiskEvidence(db: AssistantDb, input: ScanInput) {
  const scope = input.scope ?? 'real'
  const projects = db.projects.filter((p) => projectScope(p.project_id) === scope && (!input.project_ids?.length || input.project_ids.includes(p.project_id)))
  if (projects.length === 0) return { themes: 'missing: no stored project matches the request.' }
  const wanted = (input.themes?.length ? RISK_THEMES.filter((t) => input.themes!.includes(t.id)) : RISK_THEMES)
  const custom: Theme[] = input.keyword?.trim() ? [{ id: 'custom', label: `"${input.keyword.trim()}"`, topic: new RegExp(input.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), needsProblem: false }] : []
  const themes = [...wanted, ...custom]
  const docOf = new Map(db.documents.map((d) => [d.doc_id, d]))
  const nameOf = new Map(projects.map((p) => [p.project_id, p.project_name]))
  const pool = db.chunks.filter((c) => { const d = docOf.get(c.doc_id); return d && nameOf.has(d.project_id) && !looksLikeTable(c.text) && !looksLikeGlossary(c.text) })
  const sentences = new Map(pool.map((c) => [c.chunk_id, sentencesOf(c.text)]))
  const limit = Math.min(Math.max(input.limit_per_theme ?? 2, 1), 6)
  const rank = (d: Doc) => (isIcr(d) ? 0 : isIsr(d) ? 1 : 2) // completion reports state hindsight, so they come first
  const results = themes.map((theme) => {
    const hits = pool.flatMap((c) => {
      const sentence = sentences.get(c.chunk_id)!.find((x) => theme.topic.test(x) && (!theme.needsProblem || (theme.problem ?? PROBLEM).test(x)))
      return sentence ? [{ c, d: docOf.get(c.doc_id)!, sentence }] : []
    })
    const perProject = new Map<string, { mentions: number; types: Set<string> }>()
    for (const h of hits) { const e = perProject.get(h.d.project_id) ?? { mentions: 0, types: new Set<string>() }; e.mentions++; e.types.add(h.d.type); perProject.set(h.d.project_id, e) }
    // The best passages: completion reports first, then newer documents, spread over projects so one project does not fill the list.
    const ordered = [...hits].sort((a, b) => rank(a.d) - rank(b.d) || b.d.date.localeCompare(a.d.date) || a.c.chunk_id.localeCompare(b.c.chunk_id))
    const taken: typeof ordered = []
    const seen = new Map<string, number>()
    for (const h of ordered) { if ((seen.get(h.d.project_id) ?? 0) >= 2) continue; taken.push(h); seen.set(h.d.project_id, (seen.get(h.d.project_id) ?? 0) + 1); if (taken.length >= limit) break }
    return {
      theme: theme.id, label: theme.label, passages_matching: hits.length,
      projects: [...perProject].map(([id, e]) => ({ project_id: id, name: nameOf.get(id)!, mentions: e.mentions, document_types: [...e.types] })).sort((a, b) => b.mentions - a.mentions),
      passages: taken.map((h) => ({ chunk_id: h.c.chunk_id, project_id: h.d.project_id, document: h.d.title, document_type: h.d.type, date: h.d.date, section: h.c.section_path, excerpt: trimTo(h.sentence) })),
    }
  })
  return {
    kind: scopeLabel(scope), projects_scanned: projects.length, chunks_scanned: pool.length,
    caution: 'Keyword scan of stored document text: a sentence is kept when it names the topic and a problem word together. It shows that a document discusses the theme, not how often it happened, how much it mattered, or that it caused a delay or cost, and it can match a sentence that says the problem was solved. Tables and acronym lists are skipped. Read the passage before relying on it.',
    themes: results,
    available_themes: THEME_IDS,
  }
}

// ------------------------------------------------------------------ risks of one project

export type Attention = 'higher' | 'moderate' | 'lower'
export interface RiskItem {
  id: string
  stage: Stage
  theme: string
  attention: Attention
  statement: string
  basis: Basis
  evidence: Evidence[]
  why_it_matters: string
  uncertain: string[]
  reduce_or_investigate: string[]
  document_support?: { chunk_id: string; document: string; excerpt: string }[]
}

/** The rules behind each priority, stated in the result. Thresholds that already exist in the app are reused. */
export const RISK_RULES = {
  disbursementLagPoints: THRESHOLDS.disbursementLagPoints,
  supplierShareLower: 40, supplierShareModerate: 60,
  lessCompetitiveShareLower: 25, lessCompetitiveShareModerate: 50,
  extensionMonthsLower: 6, extensionMonthsModerate: 12,
  restructuringsModerate: 2,
} as const

const PRIORITY_RULE = `Priority is a rule, not a probability. higher = a threshold is breached in the latest supervision report (a rating at moderately unsatisfactory or worse, a downgrade of two levels or more, disbursement more than ${RISK_RULES.disbursementLagPoints} points behind the time used, overall risk High), or two or more separate signals about the same theme are each at least moderate. moderate = one signal above its threshold (overall risk Substantial, a one-level downgrade, a closing date moved ${RISK_RULES.extensionMonthsModerate}+ months, ${RISK_RULES.restructuringsModerate}+ restructurings, one supplier above ${RISK_RULES.supplierShareModerate}% of committed value, ${RISK_RULES.lessCompetitiveShareModerate}%+ of value procured by direct, single-source or limited selection, recorded amendments that add cost). lower = context worth knowing (a closing date moved ${RISK_RULES.extensionMonthsLower}-${RISK_RULES.extensionMonthsModerate} months, one supplier at ${RISK_RULES.supplierShareLower}-${RISK_RULES.supplierShareModerate}%, ${RISK_RULES.lessCompetitiveShareLower}-${RISK_RULES.lessCompetitiveShareModerate}% by less competitive methods).`

const ATTN: Record<Attention, number> = { higher: 0, moderate: 1, lower: 2 }

/**
 * Risks that warrant attention for one stored project, from its supervision reports, project dates, contracts and (where recorded) amendments, each with
 * the records behind it, what is uncertain, and what could reduce or investigate it. The risks are ordered by the stated priority rule. Passages from the
 * project's own documents that mention the same theme are attached where they exist, as documented mentions.
 */
export function analyseProjectRisks(db: AssistantDb, projectId: string) {
  const project = projectOf(db, projectId)
  if (!project) return { error: `No project with id ${projectId}.` }
  const reports = sortedByDate(db.supervision_reports.filter((r) => r.project_id === projectId))
  const contracts = db.contracts.filter((c) => c.project_id === projectId)
  const latest = reports.at(-1)
  const prev = reports.at(-2)
  const asOf = asOfOf(db, reports)
  const closing = project.closing_date_revised ?? project.closing_date_planned
  const closed = closing < asOf
  const risks: RiskItem[] = []
  const ref = (r: SupervisionReport): Evidence => ({ type: 'record', id: r.id, label: `Supervision report ${r.sequence} (${r.date})` })
  const notAssessed: string[] = []

  // Monitoring: ratings
  if (latest) {
    const pi = RATING_ORDER.indexOf(latest.progress_rating), ii = RATING_ORDER.indexOf(latest.implementation_rating)
    const worst = Math.max(pi, ii)
    const prevWorst = prev ? Math.max(RATING_ORDER.indexOf(prev.progress_rating), RATING_ORDER.indexOf(prev.implementation_rating)) : null
    const dropLevels = prevWorst === null ? 0 : worst - prevWorst
    const weak = worst >= RATING_ORDER.indexOf('MU')
    const weakRun = (() => { let n = 0; for (const r of [...reports].reverse()) { if (Math.max(RATING_ORDER.indexOf(r.progress_rating), RATING_ORDER.indexOf(r.implementation_rating)) >= 3) n++; else break } return n })()
    if (weak || dropLevels > 0) risks.push({
      id: `RISK-${projectId}-rating`, stage: 'monitoring', theme: 'performance', basis: 'documented',
      attention: weak || dropLevels >= 2 ? 'higher' : 'moderate',
      statement: weak
        ? `The latest supervision report rates progress toward the objective ${latest.progress_rating} and implementation ${latest.implementation_rating} (moderately unsatisfactory or worse)${weakRun > 1 ? `, and ${weakRun} consecutive reports have been at that level` : ''}.`
        : `A rating fell by ${dropLevels} level${dropLevels > 1 ? 's' : ''} in the latest report (progress ${prev!.progress_rating}→${latest.progress_rating}, implementation ${prev!.implementation_rating}→${latest.implementation_rating}).`,
      evidence: [ref(latest), ...(prev ? [ref(prev)] : [])],
      why_it_matters: 'The World Bank\'s own rating is the clearest documented signal of how delivery is going; a weak or falling rating usually precedes restructuring or a closing-date extension, though that is a pattern in these records, not a rule.',
      uncertain: ['The reports give ratings but not the reasons in structured form; the reasons are in the report text.', 'Two consecutive reports show a direction, not a trend.'],
      reduce_or_investigate: ['Read the latest report text for the stated reasons behind the rating.', 'Check whether a restructuring or closing-date extension followed earlier downgrades in this project.'],
    })
    // Overall risk
    const riskIdx = RISK_ORDER.indexOf(latest.overall_risk)
    const riskUp = prev ? riskIdx > RISK_ORDER.indexOf(prev.overall_risk) : false
    if (riskIdx >= RISK_ORDER.indexOf('Substantial') || riskUp) risks.push({
      id: `RISK-${projectId}-overall`, stage: 'monitoring', theme: 'overall_risk', basis: 'documented',
      attention: latest.overall_risk === 'High' ? 'higher' : 'moderate',
      statement: `Overall risk is rated ${latest.overall_risk}${riskUp ? ` (it was ${prev!.overall_risk} in the previous report)` : ''}; fiduciary risk is ${latest.fiduciary_risk}.`,
      evidence: [ref(latest)],
      why_it_matters: 'Overall and fiduciary risk are the World Bank team\'s own assessment of what could keep the project from its objectives, including procurement and financial management.',
      uncertain: ['The rating does not say which risk drives it.'], reduce_or_investigate: ['Read the risk section of the latest report for the drivers, and compare it with the ratings of the other stored projects.'],
    })
    // Disbursement against time
    const gapAt = (r: SupervisionReport) => { const start = project.effectiveness_actual ?? project.effectiveness_planned; const end = project.closing_date_revised ?? project.closing_date_planned; const elapsed = Math.max(0, Math.min(100, (dayDiff(start, r.date) / Math.max(dayDiff(start, end), 1)) * 100)); return round1(elapsed - r.disbursed_pct) }
    const gap = gapAt(latest)
    if (gap > RISK_RULES.disbursementLagPoints) {
      const earlier = reports.slice(0, -1).map(gapAt)
      const atClosing = latest.date >= closing
      risks.push({
        id: `RISK-${projectId}-disbursement`, stage: 'monitoring', theme: 'schedule_delivery', basis: 'derived', attention: 'higher',
        statement: atClosing
          ? `Only ${latest.disbursed_pct}% had been disbursed at the last supervision report (${latest.date}), on or after the closing date: ${round1(100 - latest.disbursed_pct)}% of the financing was not used (rule: more than ${RISK_RULES.disbursementLagPoints} points behind the time used).`
          : `${latest.disbursed_pct}% was disbursed when about ${round1(gap + latest.disbursed_pct)}% of the time to the closing date had been used: ${gap} points behind (rule: more than ${RISK_RULES.disbursementLagPoints}).${earlier.length ? ` The gap was ${earlier.at(-1)} points in the previous report.` : ''}`,
        evidence: [ref(latest)],
        why_it_matters: 'Funds not yet spent late in a project\'s life leave less time to deliver the remaining works and to correct problems.',
        uncertain: ['Disbursement can lag for reasons that are not delivery problems (advance payments, slow documentation).', 'The time-used figure depends on the closing date, which may have been extended.'],
        reduce_or_investigate: ['Check the latest report for the stated cause of slow disbursement.', 'See whether the closing date has been extended since.'],
      })
    }
  } else notAssessed.push('Rating, risk and disbursement trends: no supervision reports are stored for this project.')

  // Monitoring: extension and restructuring
  const ext = project.closing_date_revised ? months(project.closing_date_planned, project.closing_date_revised) : 0
  const restruct = new Map<string, string>()
  for (const r of reports) for (const x of r.restructurings) restruct.set(x.date, x.note)
  if (ext >= RISK_RULES.extensionMonthsLower) risks.push({
    id: `RISK-${projectId}-extension`, stage: 'monitoring', theme: 'schedule_delivery', basis: 'documented', attention: ext >= RISK_RULES.extensionMonthsModerate ? 'moderate' : 'lower',
    statement: `The closing date moved from ${project.closing_date_planned} to ${project.closing_date_revised}, ${Math.round(ext)} months later than planned.`,
    evidence: [{ type: 'record', id: project.project_id, label: 'Project record: planned and revised closing dates' }, ...(latest ? [ref(latest)] : [])],
    why_it_matters: 'An extension means the original schedule was not met; it is documented, but the record gives the fact, not the reason.',
    uncertain: ['Extensions can be requested for reasons outside the implementing agency\'s control, or to use additional financing.', 'The record does not say how many extensions there were.'],
    reduce_or_investigate: ['Search the supervision and completion report text for the reason given for the extension.'],
  })
  if (restruct.size >= RISK_RULES.restructuringsModerate) risks.push({
    id: `RISK-${projectId}-restructuring`, stage: 'monitoring', theme: 'schedule_delivery', basis: 'documented', attention: 'moderate',
    statement: `${restruct.size} restructurings are recorded across the supervision reports (${[...restruct.keys()].sort().join(', ')}).`,
    evidence: latest ? [ref(latest)] : [], why_it_matters: 'Restructuring changes scope, targets, financing or dates; repeated restructuring suggests the original design needed adjusting.',
    uncertain: ['The records list that a restructuring happened and its level, not what it changed.'], reduce_or_investigate: ['Read the restructuring paper or the report section describing each change.'],
  })

  // Plans executed: supplier concentration and competition
  if (contracts.length > 0) {
    const committed = sum(contracts.map((c) => c.supplier_contract_amount_usd))
    const bySupplier = new Map<string, { name: string; value: number; refs: string[] }>()
    for (const c of contracts) { const e = bySupplier.get(c.supplier_id) ?? { name: c.supplier, value: 0, refs: [] }; e.value += c.supplier_contract_amount_usd; e.refs.push(c.borrower_contract_reference_number); bySupplier.set(c.supplier_id, e) }
    const top = [...bySupplier.values()].sort((a, b) => b.value - a.value)[0]!
    const share = pct(top.value, committed)
    const refCounts = new Map<string, number>(); for (const c of contracts) refCounts.set(c.borrower_contract_reference_number, (refCounts.get(c.borrower_contract_reference_number) ?? 0) + 1)
    if (share >= RISK_RULES.supplierShareLower && bySupplier.size > 1) risks.push({
      id: `RISK-${projectId}-concentration`, stage: 'plans_executed', theme: 'concentration', basis: 'derived', attention: share >= RISK_RULES.supplierShareModerate ? 'moderate' : 'lower',
      statement: `${top.name} holds ${share}% of the ${usd(committed)} committed (${top.refs.length} contract${top.refs.length > 1 ? 's' : ''}).`,
      evidence: top.refs.slice(0, 5).map((r) => ({ type: 'record' as const, id: r, label: `Contract ${r}` })),
      why_it_matters: 'Heavy reliance on one supplier means a performance problem with that supplier affects a large part of the programme.',
      uncertain: [...(top.refs.some((r) => (refCounts.get(r) ?? 0) > 1) ? ['This supplier\'s contract appears on more than one row (a joint venture is split into one row per member), so the share may be over- or understated.'] : []), 'Concentration can be appropriate where only a few firms are qualified.'],
      reduce_or_investigate: ['Check the performance of that supplier\'s contracts in the supervision reports.', 'Compare with the share held by the largest supplier in comparable projects.'],
    })
    const less = contracts.filter((c) => LESS_COMPETITIVE.test(c.procurement_method))
    const lessShare = pct(sum(less.map((c) => c.supplier_contract_amount_usd)), committed)
    if (lessShare >= RISK_RULES.lessCompetitiveShareLower) risks.push({
      id: `RISK-${projectId}-competition`, stage: 'tenders_published', theme: 'competition', basis: 'derived', attention: lessShare >= RISK_RULES.lessCompetitiveShareModerate ? 'moderate' : 'lower',
      statement: `${lessShare}% of committed value (${less.length} of ${contracts.length} contracts) was procured by less competitive methods (${[...new Set(less.map((c) => c.procurement_method))].join(', ')}).`,
      evidence: [...less].sort((a, b) => b.supplier_contract_amount_usd - a.supplier_contract_amount_usd).slice(0, 5).map((c) => ({ type: 'record' as const, id: c.borrower_contract_reference_number, label: `Contract ${c.borrower_contract_reference_number}: ${c.procurement_method}, ${usd(c.supplier_contract_amount_usd)}` })),
      why_it_matters: 'Less competition can mean less price discipline; it can also be the proper method for small purchases, individual consultants or urgent needs.',
      uncertain: ['The method name does not show how a selection was justified.', 'Bidder counts and evaluation results are not published, so actual competition cannot be measured.'],
      reduce_or_investigate: ['Look at which categories the less competitive contracts fall in (consultants and small purchases are expected).', 'Ask for the justification of any large direct selection.'],
    })
  } else notAssessed.push('Supplier concentration and procurement method mix: no contract awards are stored for this project.')

  // Tenders: amendments where recorded
  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const approved = db.amendments.filter((a) => refs.has(a.contract_ref) && a.status === 'approved')
  if (approved.length > 0) {
    const days = sum(approved.map((a) => a.days_added)), change = sum(approved.map((a) => a.value_change_usd))
    risks.push({
      id: `RISK-${projectId}-amendments`, stage: 'monitoring', theme: 'contract_changes', basis: 'documented', attention: approved.length >= 3 || change > 0 ? 'moderate' : 'lower',
      statement: `${approved.length} approved amendments add ${days} days and ${usd(change)} across ${new Set(approved.map((a) => a.contract_ref)).size} contracts.`,
      evidence: approved.map((a) => ({ type: 'record' as const, id: a.id, label: `${a.contract_ref}: ${a.type}. Reason given: ${a.reason}` })),
      why_it_matters: 'Amendments show where scope, time or cost changed after signing, and the reasons given point to what to check in the next procurement.',
      uncertain: ['Entered by the team, not published by the World Bank.'], reduce_or_investigate: ['Check whether the reasons repeat across contracts.'],
    })
  } else if (projectScope(projectId) === 'real') notAssessed.push('Cost and time changes after signing: contract amendments are not published for World Bank projects.')

  // Attach the project's own document mentions, and corroborate within a theme
  const docThemes: Record<string, string[]> = { rating: ['contractor_performance', 'institutional_capacity'], overall: ['institutional_capacity', 'land_and_safeguards', 'procurement_delay'], disbursement: ['disbursement_and_funds'], extension: ['closing_and_restructuring'], restructuring: ['closing_and_restructuring'], concentration: ['contractor_performance'], competition: ['procurement_delay'], amendments: ['cost_and_variations'] }
  const scan = scanRiskEvidence(db, { scope: projectScope(projectId), project_ids: [projectId], limit_per_theme: 2 })
  const scanThemes = Array.isArray((scan as { themes?: unknown }).themes) ? (scan as { themes: { theme: string; passages: { chunk_id: string; document: string; excerpt: string }[] }[] }).themes : []
  for (const r of risks) {
    const support = (docThemes[r.id.split('-').at(-1)!] ?? []).flatMap((t) => scanThemes.find((s) => s.theme === t)?.passages ?? []).slice(0, 2)
    if (support.length) r.document_support = support.map((p) => ({ chunk_id: p.chunk_id, document: p.document, excerpt: p.excerpt }))
  }
  const sameTheme = (r: RiskItem) => risks.filter((o) => o.theme === r.theme && o.id !== r.id && ATTN[o.attention] <= ATTN.moderate)
  // Two separate signals about the same theme, each at least moderate, raise a moderate one to higher.
  for (const r of risks) if (r.attention === 'moderate' && sameTheme(r).length >= 1) r.attention = 'higher'
  risks.sort((a, b) => ATTN[a.attention] - ATTN[b.attention] || a.stage.localeCompare(b.stage) || a.id.localeCompare(b.id))

  return {
    project_id: projectId, project: project.project_name, kind: scopeLabel(projectScope(projectId)), as_of: asOf,
    project_status: closed ? `closed (the closing date, ${closing}, has passed)` : `active (closing date ${closing})`,
    framing: closed
      ? 'This project has closed, so these are documented difficulties that can inform similar projects, not live risks to manage. The ratings and disbursement are those of its last supervision report.'
      : 'This project is still running, so these are signals to follow up now. They are not predictions.',
    basis: 'Rules applied to the stored supervision reports, project dates, contracts and recorded amendments. Not a model and not a forecast.',
    priority_rule: PRIORITY_RULE,
    risks: risks.length ? risks : 'none: none of the rules is triggered by the stored records. That is not evidence of low risk where records are missing; see not_assessed.',
    not_assessed: notAssessed,
    reminders: ['A risk here is a documented signal worth attention, not a predicted outcome.', 'Cite the evidence ids. Say what is uncertain. Do not turn attention levels into probabilities.'],
  }
}

// ------------------------------------------------------------------ one call that gathers the lot

/**
 * The starting point for an analytical answer about one stored project: its context, what is on record at each of the four stages (labelled planned,
 * completed or observed), the risks ranked by the stated rule, the data gaps that limit the analysis, and the closest comparable projects.
 */
export function analyseProject(db: AssistantDb, projectId: string) {
  const project = projectOf(db, projectId)
  if (!project) return { error: `No project with id ${projectId}.` }
  const prof = profileOf(db, project)
  const reports = sortedByDate(db.supervision_reports.filter((r) => r.project_id === projectId))
  const latest = reports.at(-1), first = reports[0]
  const contracts = db.contracts.filter((c) => c.project_id === projectId)
  const rows = db.plan_packages.filter((r) => r.project_id === projectId)
  const notices = db.tender_notices.filter((t) => t.project_id === projectId)
  const drafts = db.tender_drafts.filter((d) => d.project_id === projectId)
  const lessons = db.completion_reports.filter((r) => r.project_id === projectId)
  const tally = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((n, x) => ({ ...n, [key(x)]: (n[key(x)] ?? 0) + 1 }), {})
  const gaps = getDataGaps(db, projectId) as { counts: Record<string, number>; items: DataItem[] }
  const risks = analyseProjectRisks(db, projectId) as { risks: RiskItem[] | string; priority_rule: string; not_assessed: string[] }
  const comps = findComparableProjects(db, { project_id: projectId, limit: 3 }) as { comparables?: unknown; limits?: string[] }
  const compShort = Array.isArray(comps.comparables) ? (comps.comparables as { project_id: string; name: string; country: string; comparability: string; why_relevant: string[]; differences_that_limit_use: string[] }[]).map((c) => ({ project_id: c.project_id, name: c.name, country: c.country, comparability: c.comparability, why_relevant: c.why_relevant.slice(0, 3), main_differences: c.differences_that_limit_use.slice(0, 3) })) : comps.comparables

  return {
    project: { id: project.project_id, name: project.project_name, country: project.borrower_country, region: project.region, sector: project.project_global_practice, kind: scopeLabel(projectScope(projectId)),
      dates: { approval: project.approval_date, closing_planned: project.closing_date_planned, closing_revised: project.closing_date_revised }, stage_of_record: prof.stage,
      scale: { contracts: prof.contracts, committed_usd: prof.committed === null ? 'missing' : Math.round(prof.committed), dominant_category: prof.dominantCategory, share_by_less_competitive_methods_pct: prof.lessCompetitiveShare } },
    how_to_read: 'Each fact is labelled planned (a plan or draft), completed (an award or a published tender), observed (a supervision or completion finding) or suggested (only ever from the propose_ tools). Say which when you write it.',
    stages: {
      plans_executed: {
        label: STAGE_LABEL.plans_executed,
        planned: rows.length ? { basis: 'documented', text: `${rows.length} package rows read from the procurement plan of ${rows[0]!.plan_date} (first rows only); methods ${JSON.stringify(tally(rows, (r) => r.method ?? 'not stated'))}.`, evidence: { type: 'document', id: rows[0]!.plan_doc, label: 'Procurement plan' } } : 'missing: no plan rows stored',
        completed: contracts.length ? { basis: 'documented', text: `${contracts.length} contracts signed, ${usd(sum(contracts.map((c) => c.supplier_contract_amount_usd)))} committed; by category ${JSON.stringify(tally(contracts, (c) => c.procurement_category))}; by method ${JSON.stringify(tally(contracts, (c) => c.procurement_method))}.` } : 'missing: no contract awards stored',
      },
      tenders_published: {
        label: STAGE_LABEL.tenders_published,
        completed: notices.length ? { basis: 'documented', text: `${notices.length} tenders published (newest 60 stored); by category ${JSON.stringify(tally(notices, (n) => n.category))}, by status ${JSON.stringify(tally(notices, (n) => n.status))}.` } : 'missing: no tender notices stored',
        planned: drafts.length ? { basis: 'documented', text: 'A tender draft (demonstration data) is on record; clauses are in the tender draft view.' } : 'none: no tender clauses are on record (not published for World Bank projects)',
      },
      monitoring: {
        label: STAGE_LABEL.monitoring,
        observed: latest ? { basis: 'documented', text: `${reports.length} supervision reports. Progress rating ${first!.progress_rating}→${latest.progress_rating}, implementation ${first!.implementation_rating}→${latest.implementation_rating}, overall risk ${first!.overall_risk}→${latest.overall_risk}, disbursed ${latest.disbursed_pct}% at ${latest.date}.`, evidence: { type: 'record', id: latest.id, label: `Supervision report ${latest.sequence}` } } : 'missing: no supervision reports stored',
      },
      lessons_learned: {
        label: STAGE_LABEL.lessons_learned,
        observed: lessons.length ? { basis: 'documented', text: `${lessons.reduce((n, r) => n + r.lessons.length, 0)} lessons from the completion report (outcome: ${lessons[0]!.outcome_rating}).` } : prof.hasCompletionReport ? 'not extracted: the completion report text is stored and searchable, but its lessons are not listed; read them with semantic_search_documents' : 'missing: no completion report stored',
      },
    },
    risks: Array.isArray(risks.risks) ? risks.risks.slice(0, 6) : risks.risks, priority_rule: risks.priority_rule, not_assessed: risks.not_assessed,
    data_gaps: { counts: gaps.counts, most_limiting: gaps.items.filter((i) => i.status !== 'available').slice(0, 7) },
    comparable_projects: compShort, comparison_limits: comps.limits,
    stage_links_to_check: 'Generic procurement logic, NOT evidence about this project: a weak specification at planning can lead to clarifications, evaluation difficulty or delay at tender; a long tender can compress delivery; weak supervision ratings can precede restructuring. Mention a link only where a risk above or a document passage supports it, and call it a possible risk.',
  }
}

/** Chunk ids of the passages in a result, so a test (or a caller) can check every cited passage exists. */
export const chunkIdsIn = (value: unknown): string[] => JSON.stringify(value).match(/CH-[A-Z0-9-]+/g) ?? []
