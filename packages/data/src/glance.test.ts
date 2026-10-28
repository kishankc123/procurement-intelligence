import { describe, expect, it } from 'vitest'
import { glanceGaps, glanceRows, validityCoverage } from './glance'
import { specificationChecks } from './spec'
import { tenderComparison } from './selectors'
import type { Contract, Plan, Project, TenderDraft } from './schemas'

const plan: Plan = { id: 'PL', project_id: 'P', name: 'Lot 3', planned_advertisement: '2026-06-15', planned_bid_opening: '2026-07-20', planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-25', category: 'Works', method: 'Open competitive' }
const draft = (days: number): TenderDraft => ({ id: 'T', project_id: 'P', duration_months: 18, bid_validity_days: days, performance_security_pct: 10, min_similar_contracts: 2, min_similar_value_usd: 2_000_000, evaluation_method: 'Lowest evaluated price' })
const project = { project_id: 'P', closing_date_planned: '2028-06-30', closing_date_revised: null } as Project

describe('glanceRows', () => {
  const build = (d: TenderDraft, contracts: Contract[] = []) =>
    glanceRows(
      tenderComparison(d, plan, contracts, []),
      specificationChecks({ draft: d, plan, project, contracts, candidates: [], docs: [], chunks: [], evaluationReference: { value: 66, year: 2022 } }),
    )
  it('draws only the clauses that have two real numbers', () => {
    const rows = build(draft(60))
    expect(rows.map((r) => r.label)).toEqual(['Bid validity (days)', 'Evaluation period (plan)', 'Contract duration (months)'])
    expect(rows[0]).toMatchObject({ draft: 60, reference: 67, unit: 'days', tone: 'attention', referenceLabel: 'Your plan' })
    expect(rows[1]).toMatchObject({ draft: 21, reference: 66, tone: 'good' })
    expect(rows[2]?.unit).toBe('months')
  })
  it('follows the draft, and adds a benchmark row only once its sample gate is met', () => {
    expect(build(draft(90))[0]?.tone).toBe('good')
    const many = Array.from({ length: 10 }, (_, i) => ({ borrower_contract_reference_number: `R${i}`, procurement_category: 'Works', supplier_contract_amount_usd: 1_000_000, contract_signing_date: '2025-01-01' }) as Contract)
    expect(build(draft(60), many).some((r) => r.label === 'Minimum similar contract value (USD)')).toBe(true)
  })
})

describe('glanceGaps', () => {
  it('lists the clauses that cannot be drawn, and says which ones more contract data would fix', () => {
    const gaps = glanceGaps(tenderComparison(draft(60), plan, [], []))
    const byLabel = Object.fromEntries(gaps.map((g) => [`${g.label} / ${g.referenceLabel}`, g]))
    expect(byLabel['Bid validity (days) / Entered contracts (median)']).toMatchObject({ canAdd: true, reason: 'Needs 10 contracts with this value. 0 so far.' })
    expect(byLabel['Performance security (%) / No source']?.canAdd).toBe(false)
    expect(gaps.some((g) => g.label === 'Evaluation method')).toBe(false) // a text clause: compared in the checks, not drawn
  })
  it('has no gap for a row that is drawn', () => {
    expect(glanceGaps(tenderComparison(draft(60), plan, [], [])).some((g) => g.referenceLabel === 'Your plan')).toBe(false)
  })
})

describe('validityCoverage', () => {
  it('says how far bids reach compared with signing', () => {
    expect(validityCoverage(plan, draft(60))).toMatchObject({ needed: 67, shortBy: 7, spare: 0, validityEnd: '2026-09-18' })
    expect(validityCoverage(plan, draft(90))).toMatchObject({ shortBy: 0, spare: 23, validityEnd: '2026-10-18' })
    expect(validityCoverage(plan, draft(67))).toMatchObject({ shortBy: 0, spare: 0 })
  })
})
