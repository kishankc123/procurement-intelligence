// Pure functions over API data. No React, no fetch: easy to test and to explain.
import { THRESHOLDS } from '@pi/config'
import type {
  Amendment, AlertState, Citation, Contract, CountryYear, Enrichment, EnrichmentField, Feedback, Plan, SupervisionReport, TenderDraft, Project,
} from './schemas'

const DAY = 86_400_000
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY)
}

export interface Gate { ok: boolean; n: number; required: number }
export function gate(n: number, required: number): Gate {
  return { ok: n >= required, n, required }
}

export function plannedDurations(plan: Plan) {
  return {
    advertisementToSigning: dayDiff(plan.planned_advertisement, plan.planned_signing),
    bidOpeningToEvaluation: dayDiff(plan.planned_bid_opening, plan.planned_evaluation_complete),
    bidOpeningToSigning: dayDiff(plan.planned_bid_opening, plan.planned_signing),
  }
}

/** Latest year with a value for a GPPD indicator. Returns null when no year reports it. */
export function countryReference(rows: CountryYear[], country: string, code: string): { value: number; year: number } | null {
  const hits = rows
    .filter((r) => r.country === country && r.indicators[code] != null)
    .sort((a, b) => b.year - a.year)
  const top = hits[0]
  const value = top?.indicators[code]
  return top && value != null ? { value, year: top.year } : null
}

/** Latest approved entered value per contract + field. */
export function approvedValues(enrichments: Enrichment[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of [...enrichments].sort((a, b) => a.entered_at.localeCompare(b.entered_at))) {
    if (e.status === 'approved') m.set(`${e.contract_ref}:${e.field}`, e.value)
  }
  return m
}

/** Coverage meter: contracts with at least one approved entered field. */
export function tenderCoverage(contracts: Contract[], enrichments: Enrichment[]) {
  const refs = new Set(contracts.map((c) => c.borrower_contract_reference_number))
  const covered = new Set(enrichments.filter((e) => e.status === 'approved' && refs.has(e.contract_ref)).map((e) => e.contract_ref))
  return { covered: covered.size, total: refs.size }
}

export type Tone = 'ok' | 'attention' | 'info'

/** One thing a draft clause is compared against, with the numbers needed to check it. */
/** A usable bid validity is a positive number of days. Shared by the tender benchmark and the readiness counts. */
export function bidValidityDays(value: string | undefined): number | null {
  const n = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/** Contract duration needs the public signing date and a valid entered end date after it. Returns months, or null. */
export function contractDurationMonths(contract: Contract, endDate: string | undefined): number | null {
  if (!endDate) return null
  const months = Math.round(dayDiff(contract.contract_signing_date, endDate) / 30.4)
  return Number.isFinite(months) && months > 0 ? months : null
}

export interface Comparison {
  against: string                       // e.g. "Your plan", "Entered contracts (median)"
  provenance: 'entered' | 'public' | 'derived'
  basis: string                         // how the reference was worked out, so nothing is a guess
  reference: string | null              // the value the draft is compared with
  n?: number                            // sample size for derived references
  difference: string | null             // draft minus reference, with unit and sign
  verdict: { tone: Tone; text: string } | null
  gated?: Gate                          // reference withheld: sample too small
  missing?: string                      // reference withheld: no source holds it
  citations: Citation[]
}

export interface ComparisonRow {
  id: string
  label: string
  draft: string
  comparisons: Comparison[]
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0 : 0)
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('en-US')} ${unit}`

/** Evaluation method that fits each procurement method. A stated rule, shown in the UI as the basis. */
export const EXPECTED_EVALUATION: Record<string, string> = { 'Quality-based': 'Quality and cost based' }
export const DEFAULT_EVALUATION = 'Lowest evaluated price'

/**
 * Tender draft vs. the plan it belongs to and vs. benchmarks from contract data.
 * Each clause lists what it is compared with, the reference value, the difference and what that means.
 * Benchmarks only render above the sample threshold; with no source the row says Missing.
 */
export function tenderComparison(draft: TenderDraft, plan: Plan | undefined, contracts: Contract[], enrichments: Enrichment[]): ComparisonRow[] {
  const approved = approvedValues(enrichments)
  const need = THRESHOLDS.tenderBenchmarkMinContracts
  const planCite: Citation[] = plan ? [{ ref_type: 'record', ref_id: plan.id, label: `Plan · ${plan.name}` }] : []
  const noPlan = 'Choose a plan to compare with.'

  const validity = contracts.flatMap((c) => bidValidityDays(approved.get(`${c.borrower_contract_reference_number}:bid_validity_days`)) ?? [])
  const durations = contracts.flatMap((c) => contractDurationMonths(c, approved.get(`${c.borrower_contract_reference_number}:contract_end_date`)) ?? [])
  const sameCategory = plan ? contracts.filter((c) => c.procurement_category === plan.category).map((c) => c.supplier_contract_amount_usd) : []

  const benchmark = (against: string, provenance: Comparison['provenance'], basis: string, values: number[], draftValue: number, unit: string, wording: string): Comparison => {
    const g = gate(values.length, need)
    if (!g.ok) return { against, provenance, basis, reference: null, difference: null, verdict: null, gated: g, citations: [] }
    const ref = median(values)
    const delta = draftValue - ref
    return {
      against, provenance, basis, n: values.length, reference: `${ref.toLocaleString('en-US')} ${unit}`, difference: signed(delta, unit), citations: [],
      verdict: { tone: 'info', text: delta === 0 ? `Equal to the median of ${values.length} ${wording}.` : `${Math.abs(delta).toLocaleString('en-US')} ${unit} ${delta > 0 ? 'above' : 'below'} the median of ${values.length} ${wording}.` },
    }
  }

  // Bid validity vs the plan: bids must stay valid from bid opening until signing.
  let validityVsPlan: Comparison
  if (!plan) {
    validityVsPlan = { against: 'Your plan', provenance: 'entered', basis: 'Needs a plan', reference: null, difference: null, verdict: null, missing: noPlan, citations: [] }
  } else {
    const required = plannedDurations(plan).bidOpeningToSigning
    const delta = draft.bid_validity_days - required
    validityVsPlan = {
      against: 'Your plan', provenance: 'entered',
      basis: `Bid opening ${plan.planned_bid_opening} to signing ${plan.planned_signing}`,
      reference: `${required} days`, difference: signed(delta, 'days'), citations: planCite,
      verdict: delta < 0
        ? { tone: 'attention', text: `Bids would expire ${Math.abs(delta)} days before the planned signing. Bid validity of ${draft.bid_validity_days} days ends before the plan allows ${required} days from bid opening to signing.` }
        : { tone: 'ok', text: `Covers the ${required} days from bid opening to signing in your plan${delta > 0 ? `, with ${delta} days to spare` : ' exactly'}.` },
    }
  }

  // Evaluation method vs the plan's procurement method, using the stated rule above.
  let evaluationVsPlan: Comparison
  if (!plan) {
    evaluationVsPlan = { against: 'Your plan', provenance: 'entered', basis: 'Needs a plan', reference: null, difference: null, verdict: null, missing: noPlan, citations: [] }
  } else {
    const expected = EXPECTED_EVALUATION[plan.method] ?? DEFAULT_EVALUATION
    const match = draft.evaluation_method === expected
    evaluationVsPlan = {
      against: 'Your plan', provenance: 'entered',
      basis: `Plan method is ${plan.method}. Rule: ${plan.method === 'Quality-based' ? 'quality-based selection uses quality and cost' : 'price-based methods use lowest evaluated price'}.`,
      reference: expected, difference: match ? 'No difference' : `Draft: ${draft.evaluation_method}`, citations: planCite,
      verdict: match ? { tone: 'ok', text: `Matches the ${plan.method} method in your plan.` } : { tone: 'attention', text: `Your plan uses ${plan.method}, which normally pairs with ${expected}. The draft uses ${draft.evaluation_method}.` },
    }
  }

  const noSource = (what: string): Comparison => ({ against: 'No source', provenance: 'public', basis: '', reference: null, difference: null, verdict: null, missing: `No source in this demo holds ${what}. Nothing is estimated.`, citations: [] })

  return [
    {
      id: 'bid_validity', label: 'Bid validity (days)', draft: String(draft.bid_validity_days),
      comparisons: [
        validityVsPlan,
        benchmark('Entered contracts (median)', 'derived', 'Approved entered bid validity on contracts in the selected fiscal year', validity, draft.bid_validity_days, 'days', 'entered contracts'),
      ],
    },
    { id: 'evaluation_method', label: 'Evaluation method', draft: draft.evaluation_method, comparisons: [evaluationVsPlan] },
    {
      id: 'duration', label: 'Contract duration (months)', draft: String(draft.duration_months),
      comparisons: [benchmark('Entered contracts (median)', 'derived', 'Signing date to approved entered contract end date, in months', durations, draft.duration_months, 'months', 'contracts with an end date')],
    },
    {
      id: 'similar_value', label: 'Minimum similar contract value (USD)', draft: draft.min_similar_value_usd.toLocaleString('en-US'),
      comparisons: [plan
        ? benchmark(`${plan.category} contracts (median)`, 'public', `Signed contract amounts for ${plan.category} in the selected fiscal year`, sameCategory, draft.min_similar_value_usd, 'USD', `${plan.category.toLowerCase()} contracts`)
        : { against: 'Public contracts', provenance: 'public', basis: 'Needs a plan', reference: null, difference: null, verdict: null, missing: noPlan, citations: [] }],
    },
    { id: 'similar_count', label: 'Minimum similar contracts', draft: String(draft.min_similar_contracts), comparisons: [noSource('how many similar contracts bidders usually hold')] },
    { id: 'security', label: 'Performance security (%)', draft: String(draft.performance_security_pct), comparisons: [noSource('performance security percentages')] },
  ]
}

export interface ReadinessRow {
  field: EnrichmentField
  label: string
  usedBy: string
  usable: number    // latest approved entered value that passes the rule the comparison uses
  pending: number   // no usable approved value, an entry is waiting for review
  invalid: number   // approved value exists but fails the rule, and nothing is pending
  missing: number   // no approved or pending entry (rejected entries do not count)
}

/**
 * Contract data readiness: for each entered field that Tender design or Monitoring uses, how many of the
 * given contracts have a usable value. Each contract is counted once per field, so
 * usable + pending + invalid + missing equals the number of contracts for every row.
 * Contract awards hold neither field publicly, so there is no public-vs-entered precedence to resolve.
 */
export function dataReadiness(contracts: Contract[], enrichments: Enrichment[]): { eligible: number; rows: ReadinessRow[] } {
  const approved = approvedValues(enrichments)
  const pending = new Set(enrichments.filter((e) => e.status === 'pending').map((e) => `${e.contract_ref}:${e.field}`))
  const rules: { field: EnrichmentField; label: string; usedBy: string; usable: (c: Contract, v: string | undefined) => boolean }[] = [
    { field: 'bid_validity_days', label: 'Bid validity (days)', usedBy: 'Tender design benchmark', usable: (_c, v) => bidValidityDays(v) !== null },
    { field: 'contract_end_date', label: 'Contract end date', usedBy: 'Tender design duration benchmark and Monitoring past-end alert', usable: (c, v) => contractDurationMonths(c, v) !== null },
  ]
  const rows = rules.map((rule): ReadinessRow => {
    const row: ReadinessRow = { field: rule.field, label: rule.label, usedBy: rule.usedBy, usable: 0, pending: 0, invalid: 0, missing: 0 }
    for (const c of contracts) {
      const key = `${c.borrower_contract_reference_number}:${rule.field}`
      const value = approved.get(key)
      if (value !== undefined && rule.usable(c, value)) row.usable++
      else if (pending.has(key)) row.pending++
      else if (value !== undefined) row.invalid++
      else row.missing++
    }
    return row
  })
  return { eligible: contracts.length, rows }
}

export interface DerivedAlert {
  id: string
  project_id: string
  severity: 'high' | 'medium' | 'low'
  signal: 'rating_drop' | 'risk_increase' | 'disbursement_lag' | 'contract_past_end' | 'amendment'
  title: string
  text: string
  provenance: 'public' | 'derived' | 'entered'
  citations: Citation[]
  assignee: string | null
}

const RATING_ORDER = ['HS', 'S', 'MS', 'MU', 'U', 'HU']
const RISK_ORDER = ['Low', 'Moderate', 'Substantial', 'High']

export function timeElapsedPct(project: Project, asOf: string): number {
  const start = project.effectiveness_actual ?? project.effectiveness_planned
  const end = project.closing_date_revised ?? project.closing_date_planned
  const pct = (dayDiff(start, asOf) / dayDiff(start, end)) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

export function deriveAlerts(input: {
  project: Project
  reports: SupervisionReport[]
  contracts: Contract[]
  enrichments: Enrichment[]
  amendments: Amendment[]
  states: AlertState[]
  asOf: string
}): DerivedAlert[] {
  const { project, reports, contracts, enrichments, amendments, states, asOf } = input
  const out: Omit<DerivedAlert, 'assignee'>[] = []
  const latest = [...reports].sort((a, b) => b.sequence - a.sequence)[0]
  const pid = project.project_id

  if (latest?.progress_rating_prev && RATING_ORDER.indexOf(latest.progress_rating) > RATING_ORDER.indexOf(latest.progress_rating_prev)) {
    const levels = RATING_ORDER.indexOf(latest.progress_rating) - RATING_ORDER.indexOf(latest.progress_rating_prev)
    out.push({
      id: `ALR-${pid}-rating`, project_id: pid, severity: levels >= 2 ? 'high' : 'medium', signal: 'rating_drop',
      title: 'Progress toward objective rating dropped',
      text: `Rating moved from ${latest.progress_rating_prev} to ${latest.progress_rating} in supervision report ${latest.sequence}.`,
      provenance: 'public', citations: [{ ref_type: 'record', ref_id: latest.id, label: `ISR ${latest.sequence} · latest vs. previous` }],
    })
  }
  if (latest?.overall_risk_prev && RISK_ORDER.indexOf(latest.overall_risk) > RISK_ORDER.indexOf(latest.overall_risk_prev)) {
    out.push({
      id: `ALR-${pid}-risk`, project_id: pid, severity: 'medium', signal: 'risk_increase',
      title: 'Overall risk rating increased',
      text: `Overall risk moved from ${latest.overall_risk_prev} to ${latest.overall_risk}.`,
      provenance: 'public', citations: [{ ref_type: 'record', ref_id: latest.id, label: `ISR ${latest.sequence} · risk rating` }],
    })
  }
  if (latest) {
    const elapsed = timeElapsedPct(project, latest.date)
    const gap = elapsed - latest.disbursed_pct
    if (gap > THRESHOLDS.disbursementLagPoints) {
      out.push({
        id: `ALR-${pid}-lag`, project_id: pid, severity: 'high', signal: 'disbursement_lag',
        title: 'Disbursement behind time elapsed',
        text: `${latest.disbursed_pct}% disbursed with ${elapsed}% of the time used. Rule: gap above ${THRESHOLDS.disbursementLagPoints} points.`,
        provenance: 'derived', citations: [{ ref_type: 'record', ref_id: latest.id, label: 'ISR · disbursement and key dates' }],
      })
    }
  }
  const approved = enrichments.filter((e) => e.status === 'approved')
  for (const e of approved.filter((x) => x.field === 'contract_end_date' && x.value < asOf)) {
    const c = contracts.find((k) => k.borrower_contract_reference_number === e.contract_ref)
    if (!c) continue
    out.push({
      id: `ALR-${e.contract_ref}-end`, project_id: c.project_id, severity: 'medium', signal: 'contract_past_end',
      title: 'Contract past its end date',
      text: `End date ${e.value} was entered by a ${e.entered_by_role.replace('_', ' ')}. No completion has been recorded.`,
      provenance: 'entered', citations: [{ ref_type: 'record', ref_id: e.id, label: `Entered · ${e.contract_ref} end date` }],
    })
  }
  for (const a of amendments.filter((x) => x.status === 'approved')) {
    out.push({
      id: `ALR-${a.contract_ref}-${a.id}`, project_id: pid, severity: 'low', signal: 'amendment',
      title: 'Contract amendment recorded',
      text: `${a.contract_ref}: ${a.type}, +${a.days_added} days, approved. Reason: ${a.reason}`,
      provenance: 'entered', citations: [{ ref_type: 'record', ref_id: a.id, label: `Entered · amendment ${a.id}` }],
    })
  }
  const rank = { high: 0, medium: 1, low: 2 }
  return out
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .map((a) => ({ ...a, assignee: states.find((s) => s.id === a.id)?.assignee ?? null }))
}

/** Learning KPIs. Returns null when there is nothing to measure: the UI shows an empty state. */
export function feedbackKpis(feedback: Feedback[]) {
  const reviewed = feedback.filter((f) => f.status !== 'new')
  if (feedback.length === 0) return null
  const accepted = feedback.filter((f) => f.status === 'accepted').length
  return { total: feedback.length, reviewed: reviewed.length, accepted, rejected: feedback.filter((f) => f.status === 'rejected').length }
}

/** Compare the planned evaluation period with the country reference (GPPD C5.2). */
export function evaluationFinding(plan: Plan, ref: { value: number; year: number } | null) {
  if (!ref) return null
  const planned = plannedDurations(plan).bidOpeningToEvaluation
  return { planned, reference: ref.value, year: ref.year, within: planned <= ref.value }
}
