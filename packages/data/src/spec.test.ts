import { describe, expect, it } from 'vitest'
import { specificationChecks, type SpecInput } from './spec'
import { tenderCandidates } from './retender'
import type { Chunk, Contract, Doc, Plan, Project, TenderDraft, TenderRecord } from './schemas'

const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'PL', project_id: 'P', name: 'Lot 3 works', planned_advertisement: '2026-06-15', planned_bid_opening: '2026-07-20', planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-25', category: 'Works', method: 'Open competitive', ...over })
const draft = (over: Partial<TenderDraft> = {}): TenderDraft => ({ id: 'T', project_id: 'P', duration_months: 18, bid_validity_days: 90, performance_security_pct: 10, min_similar_contracts: 2, min_similar_value_usd: 2_000_000, evaluation_method: 'Lowest evaluated price', ...over })
const project = { project_id: 'P', closing_date_planned: '2028-06-30', closing_date_revised: null } as Project
const doc = { doc_id: 'G', type: 'Guidance' } as Doc
const chunks = [{ chunk_id: 'CG1', doc_id: 'G', section_path: 'Bid validity' }, { chunk_id: 'CG2', doc_id: 'G', section_path: 'Performance security' }] as Chunk[]
const contract = (amt: number) => ({ procurement_category: 'Works', supplier_contract_amount_usd: amt }) as Contract
const run = (o: Partial<SpecInput> = {}) => specificationChecks({ draft: draft(), plan: plan(), project, contracts: [], candidates: [], docs: [doc], chunks, evaluationReference: { value: 66, year: 2022 }, ...o })
const status = (id: string, o: Partial<SpecInput> = {}) => run(o).find((c) => c.id === id)!

describe('specificationChecks', () => {
  it('fails bid validity that ends before signing, warns with no margin, passes with margin', () => {
    expect(status('bid_validity', { draft: draft({ bid_validity_days: 60 }) })).toMatchObject({ status: 'fail' })
    expect(status('bid_validity', { draft: draft({ bid_validity_days: 67 }) }).status).toBe('warn')
    const ok = status('bid_validity')
    expect(ok.status).toBe('pass')
    expect(ok.citations.map((c) => c.ref_id)).toEqual(['PL', 'CG1'])
  })
  it('applies the performance security range to works only', () => {
    expect(status('performance_security', { draft: draft({ performance_security_pct: 3 }) }).status).toBe('warn')
    expect(status('performance_security', { plan: plan({ category: 'Goods' }) }).status).toBe('not_checkable')
  })
  it('fails when the contract would end after the project closes', () => {
    expect(status('duration_vs_closing', { draft: draft({ duration_months: 36 }) }).status).toBe('fail')
    expect(status('duration_vs_closing').status).toBe('pass')
  })
  it('flags an evaluation method that does not fit, and a long evaluation period', () => {
    expect(status('evaluation_method', { plan: plan({ method: 'Quality-based' }) }).status).toBe('warn')
    expect(status('evaluation_period', { plan: plan({ planned_evaluation_complete: '2026-10-30' }) }).status).toBe('warn')
    expect(status('evaluation_period', { evaluationReference: null }).status).toBe('not_checkable')
  })
  it('gates the qualification value check on the sample size', () => {
    expect(status('qualification_value', { contracts: [contract(5_000_000)] }).status).toBe('not_checkable')
    const many = Array.from({ length: 10 }, () => contract(1_000_000))
    expect(status('qualification_value', { contracts: many }).status).toBe('warn')
    expect(status('qualification_value', { contracts: many, draft: draft({ min_similar_value_usd: 500_000 }) }).status).toBe('pass')
  })
  it('warns when a tender with the same name was cancelled, and cites the reason', () => {
    const history: TenderRecord[] = [{ id: 'TND-1', project_id: 'X', name: 'Lot 3 works', status: 'cancelled', date: null, reason: 'Bid validity expired.', contract_ref: null, replaces: null, citation: { ref_type: 'chunk', ref_id: 'C9', label: 'ISR' } }]
    const c = status('earlier_tender', { candidates: tenderCandidates(history, [plan()]) })
    expect(c.status).toBe('warn')
    expect(c.detail).toContain('Bid validity expired.')
    expect(c.citations[0]?.ref_id).toBe('C9')
    expect(status('earlier_tender').status).toBe('pass')
  })
  it('fails an empty draft', () => {
    expect(status('completeness', { draft: draft({ bid_validity_days: 0 }) }).status).toBe('fail')
  })
  it('cannot check plan-based clauses without a plan', () => {
    const none = run({ plan: undefined }).filter((c) => c.id !== 'completeness')
    expect(none.every((c) => c.status === 'not_checkable')).toBe(true)
  })
})
