// Pure functions over API data. No React, no fetch: easy to test and to explain.
import { THRESHOLDS } from '@pi/config'
import type {
  Amendment, AlertState, Citation, Contract, CountryYear, Enrichment, Feedback, Plan, SupervisionReport, TenderDraft, Project,
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

export interface ComparisonRow {
  label: string
  draft: string
  benchmark: { gated: Gate } | { value: string; n: number }
  finding: { text: string; citations: Citation[] } | null
}

/** Tender draft vs. benchmarks. Benchmarks only render above the sample threshold. */
export function tenderComparison(draft: TenderDraft, plan: Plan | undefined, contracts: Contract[], enrichments: Enrichment[]): ComparisonRow[] {
  const approved = approvedValues(enrichments)
  const validity = contracts
    .map((c) => Number(approved.get(`${c.borrower_contract_reference_number}:bid_validity_days`)))
    .filter((v) => Number.isFinite(v) && v > 0)
  const need = THRESHOLDS.tenderBenchmarkMinContracts
  const g = gate(validity.length, need)
  const median = validity.length ? [...validity].sort((a, b) => a - b)[Math.floor(validity.length / 2)] : 0

  let finding: ComparisonRow['finding'] = null
  if (plan) {
    const needed = plannedDurations(plan).bidOpeningToSigning
    finding = draft.bid_validity_days < needed
      ? { text: `Bid validity of ${draft.bid_validity_days} days ends before the planned signing, which is ${needed} days after bid opening in your plan.`, citations: [{ ref_type: 'record', ref_id: plan.id, label: 'Your plan' }] }
      : { text: `Bid validity of ${draft.bid_validity_days} days covers the planned ${needed} days from bid opening to signing.`, citations: [{ ref_type: 'record', ref_id: plan.id, label: 'Your plan' }] }
  }
  return [{
    label: 'Bid validity (days)',
    draft: String(draft.bid_validity_days),
    benchmark: g.ok ? { value: `${median} days (median)`, n: validity.length } : { gated: g },
    finding,
  }]
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
