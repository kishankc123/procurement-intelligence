// Pure specification checks of a tender draft. No React, no fetch.
import { SPEC_RULES, THRESHOLDS } from '@pi/config'
import { checkRetender, type TenderCandidate } from './retender'
import { DEFAULT_EVALUATION, EXPECTED_EVALUATION, dayDiff, evaluationFinding, gate, plannedDurations } from './selectors'
import type { Chunk, Citation, Contract, Doc, Plan, Project, TenderDraft } from './schemas'

export type SpecStatus = 'pass' | 'warn' | 'fail' | 'not_checkable'

export interface SpecCheck {
  id: string
  clause: string
  /** The rule applied, in words, so a reader can judge it. */
  rule: string
  status: SpecStatus
  draftValue: string
  /** What the draft was compared with, or null when nothing could be. */
  reference: string | null
  detail: string
  citations: Citation[]
}

export const SPEC_STATUS_LABEL: Record<SpecStatus, string> = { pass: 'Pass', warn: 'Check', fail: 'Fail', not_checkable: 'Cannot check' }

export interface SpecInput {
  draft: TenderDraft
  plan: Plan | undefined
  project: Project
  /** Contracts of the project; the same set Tender design uses for its benchmarks. */
  contracts: Contract[]
  candidates: TenderCandidate[]
  docs: Doc[]
  chunks: Chunk[]
  /** Country reference for days of bid evaluation (GPPD C5.2), or null when no year reports it. */
  evaluationReference: { value: number; year: number } | null
}

const addMonths = (iso: string, months: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Check a tender draft against its plan, the project, contract data and the guidance note.
 * Every check names its rule and either passes, needs a look, fails, or says why it cannot be checked.
 * Nothing is estimated: where no source holds the number, the status is "Cannot check".
 */
export function specificationChecks(input: SpecInput): SpecCheck[] {
  const { draft, plan, project, contracts, candidates, docs, chunks, evaluationReference } = input
  const guidanceDocs = new Set(docs.filter((d) => d.type === 'Guidance').map((d) => d.doc_id))
  const guidance = (section: string): Citation[] => {
    const c = chunks.find((k) => guidanceDocs.has(k.doc_id) && k.section_path === section)
    return c ? [{ ref_type: 'chunk', ref_id: c.chunk_id, label: `Guidance · ${section}` }] : []
  }
  const planCite = (p: Plan): Citation[] => [{ ref_type: 'record', ref_id: p.id, label: `Plan · ${p.name}` }]
  const needPlan = (c: Omit<SpecCheck, 'status' | 'reference' | 'detail' | 'citations'>): SpecCheck => ({ ...c, status: 'not_checkable', reference: null, detail: 'Choose a plan to check this clause against.', citations: [] })

  const out: SpecCheck[] = []

  // 1. Completeness
  const empty = [draft.duration_months <= 0 && 'contract duration', draft.bid_validity_days <= 0 && 'bid validity'].filter(Boolean) as string[]
  out.push({
    id: 'completeness', clause: 'Required clauses', rule: 'Contract duration and bid validity must be set above zero.',
    status: empty.length ? 'fail' : 'pass', draftValue: empty.length ? `${empty.join(' and ')} missing` : 'Set', reference: null,
    detail: empty.length ? `The draft has no ${empty.join(' or ')}. A tender cannot go out without it.` : 'Contract duration and bid validity are both set.', citations: [],
  })

  // 2. Bid validity covers bid opening to signing, with a margin
  const validityBase = { id: 'bid_validity', clause: 'Bid validity (days)', rule: 'Bid validity must cover the days from bid opening to contract signing in the plan, with a margin.', draftValue: `${draft.bid_validity_days} days` }
  if (!plan) out.push(needPlan(validityBase))
  else {
    const needed = plannedDurations(plan).bidOpeningToSigning
    const delta = draft.bid_validity_days - needed
    out.push({
      ...validityBase, reference: `${needed} days (bid opening ${plan.planned_bid_opening} to signing ${plan.planned_signing})`,
      status: delta < 0 ? 'fail' : delta === 0 ? 'warn' : 'pass',
      detail: delta < 0 ? `Bids would expire ${-delta} days before signing.` : delta === 0 ? 'Covers the period exactly, with no margin for approvals.' : `Covers the period with ${delta} days to spare.`,
      citations: [...planCite(plan), ...guidance('Bid validity')],
    })
  }

  // 3. Performance security within the guidance range (works only)
  const sec = SPEC_RULES.performanceSecurityPct
  const secBase = { id: 'performance_security', clause: 'Performance security (%)', rule: `For ${sec.category.toLowerCase()} contracts the guidance note gives ${sec.min} to ${sec.max} percent of the contract price.`, draftValue: `${draft.performance_security_pct}%` }
  if (!plan) out.push(needPlan(secBase))
  else if (plan.category !== sec.category) {
    out.push({ ...secBase, status: 'not_checkable', reference: null, detail: `The guidance note gives a range for ${sec.category.toLowerCase()} only. This plan is ${plan.category.toLowerCase()}, and no source here holds a range for it.`, citations: guidance('Performance security') })
  } else {
    const ok = draft.performance_security_pct >= sec.min && draft.performance_security_pct <= sec.max
    out.push({ ...secBase, status: ok ? 'pass' : 'warn', reference: `${sec.min} to ${sec.max}%`, detail: ok ? 'Within the range in the guidance note.' : `Outside the range in the guidance note (${sec.min} to ${sec.max}%).`, citations: guidance('Performance security') })
  }

  // 4. Evaluation method fits the plan's procurement method
  const methodBase = { id: 'evaluation_method', clause: 'Evaluation method', rule: 'Quality-based selection pairs with quality and cost; price-based methods pair with lowest evaluated price.', draftValue: draft.evaluation_method }
  if (!plan) out.push(needPlan(methodBase))
  else {
    const expected = EXPECTED_EVALUATION[plan.method] ?? DEFAULT_EVALUATION
    const ok = draft.evaluation_method === expected
    out.push({ ...methodBase, status: ok ? 'pass' : 'warn', reference: `${expected} (plan method: ${plan.method})`, detail: ok ? 'Matches the plan method.' : `The plan method is ${plan.method}, which normally pairs with ${expected}.`, citations: planCite(plan) })
  }

  // 5. Planned evaluation period against the country reference
  const evalBase = { id: 'evaluation_period', clause: 'Evaluation period (plan)', rule: 'The days planned from bid opening to evaluation complete should not exceed the country reference for bid evaluation.', draftValue: plan ? `${plannedDurations(plan).bidOpeningToEvaluation} days` : '—' }
  if (!plan) out.push(needPlan(evalBase))
  else {
    const finding = evaluationFinding(plan, evaluationReference)
    out.push(finding
      ? { ...evalBase, status: finding.within ? 'pass' : 'warn', reference: `${finding.reference} days (GPPD C5.2, ${finding.year})`, detail: finding.within ? 'Within the country reference.' : 'Longer than the country reference, which raises the risk of bids expiring.', citations: planCite(plan) }
      : { ...evalBase, status: 'not_checkable', reference: null, detail: 'No year of GPPD data reports bid evaluation days for this country, so there is nothing to compare with.', citations: planCite(plan) })
  }

  // 6. Contract ends before the project closes
  const closing = project.closing_date_revised ?? project.closing_date_planned
  const closeBase = { id: 'duration_vs_closing', clause: 'Contract duration (months)', rule: 'The contract, counted from planned signing, must end before the project closing date.', draftValue: `${draft.duration_months} months` }
  if (!plan) out.push(needPlan(closeBase))
  else {
    const end = addMonths(plan.planned_signing, draft.duration_months)
    const margin = dayDiff(end, closing)
    out.push({ ...closeBase, status: margin < 0 ? 'fail' : 'pass', reference: `Project closes ${closing}`, detail: margin < 0 ? `The contract would end ${end}, ${-margin} days after the project closes.` : `The contract would end ${end}, ${margin} days before the project closes.`, citations: planCite(plan) })
  }

  // 7. Qualification value against signed contracts of the same category
  const valueBase = { id: 'qualification_value', clause: 'Minimum similar contract value (USD)', rule: 'The required value of similar contracts should not exceed the largest signed contract of the same category.', draftValue: draft.min_similar_value_usd.toLocaleString('en-US') }
  if (!plan) out.push(needPlan(valueBase))
  else {
    const amounts = contracts.filter((c) => c.procurement_category === plan.category).map((c) => c.supplier_contract_amount_usd)
    const g = gate(amounts.length, THRESHOLDS.tenderBenchmarkMinContracts)
    if (!g.ok) out.push({ ...valueBase, status: 'not_checkable', reference: null, detail: `Needs ${g.required} signed ${plan.category.toLowerCase()} contracts to compare. ${g.n} so far.`, citations: planCite(plan) })
    else {
      const largest = Math.max(...amounts)
      const ok = draft.min_similar_value_usd <= largest
      out.push({ ...valueBase, status: ok ? 'pass' : 'warn', reference: `Largest on record ${largest.toLocaleString('en-US')} (n=${g.n})`, detail: ok ? 'Within what contracts on record show.' : 'No contract on record is that large, so few bidders could qualify.', citations: planCite(plan) })
    }
  }

  // 8. Earlier tender with this name that was cancelled
  const earlierBase = { id: 'earlier_tender', clause: 'Earlier tenders', rule: 'If a tender with this name was cancelled or re-tendered before, the draft should address why.', draftValue: plan ? plan.name : '—' }
  if (!plan) out.push(needPlan(earlierBase))
  else {
    const r = checkRetender(plan.name, candidates, { excludeIds: [plan.id] })
    const bad = r.matches.filter((m) => m.kind !== 'numbered_variant' && (m.candidate.status === 'cancelled' || m.candidate.status === 're_tendered'))
    out.push(bad.length > 0
      ? { ...earlierBase, status: 'warn', reference: bad.map((m) => `${m.candidate.id} (${m.candidate.status.replace('_', '-')})`).join(', '), detail: `Earlier: ${bad.map((m) => m.candidate.reason ?? 'no reason recorded').join(' ')} Confirm the draft addresses this.`, citations: bad.flatMap((m) => (m.candidate.citation ? [m.candidate.citation] : [])) }
      : { ...earlierBase, status: 'pass', reference: `${r.compared} tenders compared`, detail: 'No cancelled tender with this name on record.', citations: [] })
  }

  return out
}
