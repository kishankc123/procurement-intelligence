import { DRAFT_SUGGESTION, SPEC_RULES, THRESHOLDS } from '@pi/config'
import { DEFAULT_EVALUATION, EXPECTED_EVALUATION, approvedValues, bidValidityDays, contractDurationMonths, gate, plannedDurations } from './selectors'
import type { Contract, Enrichment, Plan, TenderDraft } from './schemas'

export type DraftField = Exclude<keyof TenderDraft, 'id' | 'project_id'>

export interface FieldSuggestion {
  field: DraftField
  /** The suggested value, or null when no source can support one. Nothing is estimated. */
  value: number | string | null
  /** How it was worked out, or why there is no suggestion. */
  basis: string
  /** Derived values show how many records they rest on. */
  n?: number
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
const none = (field: DraftField, basis: string): FieldSuggestion => ({ field, value: null, basis })

/**
 * A starting tender draft, one suggestion per clause, from the chosen plan and the project's contract data.
 * A clause with no source (or too small a sample) gets no value and says why; the user enters it.
 */
export function suggestTenderDraft(input: { plan: Plan | undefined; contracts: Contract[]; enrichments: Enrichment[] }): Record<DraftField, FieldSuggestion> {
  const { plan, contracts, enrichments } = input
  const approved = approvedValues(enrichments)
  const need = THRESHOLDS.tenderBenchmarkMinContracts
  const noPlan = 'Choose a plan first.'

  const durations = contracts.flatMap((c) => contractDurationMonths(c, approved.get(`${c.borrower_contract_reference_number}:contract_end_date`)) ?? [])
  const durationGate = gate(durations.length, need)

  const validityDays = plan ? plannedDurations(plan).bidOpeningToSigning + DRAFT_SUGGESTION.bidValidityMarginDays : null

  const sameCategory = plan ? contracts.filter((c) => c.procurement_category === plan.category).map((c) => c.supplier_contract_amount_usd) : []
  const valueGate = gate(sameCategory.length, need)

  const sec = SPEC_RULES.performanceSecurityPct
  const securityApplies = plan?.category === sec.category

  return {
    duration_months: durationGate.ok
      ? { field: 'duration_months', value: median(durations), n: durations.length, basis: `Median of ${durations.length} contracts with an entered end date (signing to end).` }
      : none('duration_months', `Needs ${need} contracts with an entered end date; ${durations.length} so far.`),
    bid_validity_days: plan && validityDays !== null
      ? { field: 'bid_validity_days', value: validityDays, basis: `Your plan allows ${plannedDurations(plan).bidOpeningToSigning} days from bid opening to signing, plus a ${DRAFT_SUGGESTION.bidValidityMarginDays}-day margin.` }
      : none('bid_validity_days', noPlan),
    performance_security_pct: securityApplies
      ? { field: 'performance_security_pct', value: (sec.min + sec.max) / 2, basis: `Midpoint of the ${sec.min} to ${sec.max} percent range in the guidance note for ${sec.category.toLowerCase()}.` }
      : none('performance_security_pct', plan ? `No guidance range for ${plan.category.toLowerCase()} in this demo.` : noPlan),
    min_similar_contracts: none('min_similar_contracts', 'No source in this demo holds how many similar contracts bidders usually hold.'),
    min_similar_value_usd: plan && valueGate.ok
      ? { field: 'min_similar_value_usd', value: median(sameCategory), n: sameCategory.length, basis: `Median of ${sameCategory.length} signed ${plan.category.toLowerCase()} contracts.` }
      : none('min_similar_value_usd', plan ? `Needs ${need} signed ${plan.category.toLowerCase()} contracts; ${sameCategory.length} so far.` : noPlan),
    evaluation_method: plan
      ? { field: 'evaluation_method', value: EXPECTED_EVALUATION[plan.method] ?? DEFAULT_EVALUATION, basis: `The plan's method is ${plan.method}, which normally pairs with this evaluation method.` }
      : none('evaluation_method', noPlan),
  }
}

/** True when every clause of a draft form has a usable value. */
export function draftComplete(v: Partial<Record<DraftField, number | string | null>>): v is Record<DraftField, number | string> {
  return (['duration_months', 'bid_validity_days', 'performance_security_pct', 'min_similar_contracts', 'min_similar_value_usd'] as const)
    .every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) > 0) && typeof v.evaluation_method === 'string' && v.evaluation_method !== ''
}
