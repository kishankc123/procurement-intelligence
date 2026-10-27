import { describe, expect, it } from 'vitest'
import { fiscalYearOf } from '@pi/config'
import { deriveAlerts, gate, tenderComparison, tenderCoverage, type Contract, type Enrichment, type Plan, type Project, type SupervisionReport, type TenderDraft } from './index'

const contract = (ref: string): Contract => ({
  borrower_contract_reference_number: ref, wb_contract_number: 'W', project_id: 'P', supplier: 's', supplier_id: 'i', supplier_country: 'c',
  procurement_category: 'Works', procurement_method: 'Open', review_type: 'Prior', supplier_contract_amount_usd: 1, contract_signing_date: '2026-01-01',
  fiscal_year: 2026, contract_description: 'd',
})
const enr = (ref: string, status: Enrichment['status'], field: Enrichment['field'] = 'bidders_received', value = '3'): Enrichment => ({
  id: `E-${ref}-${field}-${status}`, contract_ref: ref, field, value, entered_by_role: 'contract_manager', fiscal_year: 2026, status, source_note: '', entered_at: '2026-01-01T00:00:00Z',
})

describe('fiscalYearOf', () => {
  it('rolls over on 1 July', () => {
    expect(fiscalYearOf('2026-06-30')).toBe(2026)
    expect(fiscalYearOf('2026-07-01')).toBe(2027)
  })
})

describe('tenderCoverage', () => {
  it('counts only contracts with an approved entry', () => {
    const cs = [contract('A'), contract('B'), contract('C')]
    const es = [enr('A', 'approved'), enr('B', 'pending'), enr('A', 'approved', 'advertised_date', '2026-01-01')]
    expect(tenderCoverage(cs, es)).toEqual({ covered: 1, total: 3 })
  })
})

describe('tenderComparison', () => {
  const plan = { id: 'PL', project_id: 'P', name: 'Test plan', planned_advertisement: '2026-01-12', planned_bid_opening: '2026-02-16', planned_evaluation_complete: '2026-03-09', planned_signing: '2026-04-24', category: 'Works', method: 'Open' } as Plan
  const draft = (days: number) => ({ id: 'T', project_id: 'P', duration_months: 1, bid_validity_days: days, performance_security_pct: 10, min_similar_contracts: 1, min_similar_value_usd: 1, evaluation_method: 'x' }) as TenderDraft
  const row = (days: number, id = 'bid_validity') => tenderComparison(draft(days), plan, [contract('A')], []).find((r) => r.id === id)!
  it('compares bid validity with the plan, shows the difference, and gates the benchmark', () => {
    const short = row(60).comparisons[0]!
    const long = row(90).comparisons[0]!
    expect(short.reference).toBe('67 days')
    expect(short.difference).toBe('−7 days')
    expect(short.verdict?.tone).toBe('attention')
    expect(long.difference).toBe('+23 days')
    expect(long.verdict?.tone).toBe('ok')
    expect(row(60).comparisons[1]?.gated).toEqual(gate(0, 10))
  })
  it('says Missing instead of inventing a reference where no source exists', () => {
    expect(row(60, 'security').comparisons[0]?.missing).toContain('Nothing is estimated')
  })
  it('flags an evaluation method that does not fit the plan method', () => {
    expect(row(60, 'evaluation_method').comparisons[0]?.verdict?.tone).toBe('attention')
  })
})

describe('deriveAlerts', () => {
  const project = { project_id: 'P', effectiveness_planned: '2025-01-15', effectiveness_actual: '2025-03-15', closing_date_planned: '2027-12-31', closing_date_revised: '2028-06-30' } as Project
  const report = { id: 'R3', project_id: 'P', sequence: 3, date: '2026-04-30', progress_rating_prev: 'S', progress_rating: 'MU', implementation_rating: 'S', overall_risk_prev: 'Moderate', overall_risk: 'Moderate', fiduciary_risk: 'x', disbursed_pct: 11, restructurings: [] } as SupervisionReport
  const base = { project, reports: [report], contracts: [contract('A')], amendments: [], states: [], asOf: '2026-05-31' }
  it('raises rating-drop and disbursement-lag from a report', () => {
    const signals = deriveAlerts({ ...base, enrichments: [] }).map((a) => a.signal)
    expect(signals).toEqual(expect.arrayContaining(['rating_drop', 'disbursement_lag']))
  })
  it('ignores pending end dates and fires only once approved and past', () => {
    const pending = deriveAlerts({ ...base, enrichments: [enr('A', 'pending', 'contract_end_date', '2026-04-30')] })
    const approved = deriveAlerts({ ...base, enrichments: [enr('A', 'approved', 'contract_end_date', '2026-04-30')] })
    expect(pending.some((a) => a.signal === 'contract_past_end')).toBe(false)
    expect(approved.some((a) => a.signal === 'contract_past_end')).toBe(true)
  })
})
