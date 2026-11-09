import { describe, expect, it } from 'vitest'
import { draftComplete, suggestTenderDraft } from './draftSuggestion'
import type { Contract, Enrichment, Plan } from './schemas'

const plan = { id: 'PL1', planned_advertisement: '2026-06-01', planned_bid_opening: '2026-07-01', planned_evaluation_complete: '2026-07-20', planned_signing: '2026-09-01', category: 'Works', method: 'Open competitive' } as Plan
const contract = (ref: string, signed: string, amount: number, category = 'Works') => ({ borrower_contract_reference_number: ref, contract_signing_date: signed, supplier_contract_amount_usd: amount, procurement_category: category }) as Contract
const end = (ref: string, value: string) => ({ id: `E-${ref}`, contract_ref: ref, field: 'contract_end_date', value, status: 'approved', entered_at: '2026-01-01T00:00:00Z' }) as Enrichment

describe('suggestTenderDraft', () => {
  it('suggests bid validity as the plan period plus the margin, and the evaluation method from the plan method', () => {
    const s = suggestTenderDraft({ plan, contracts: [], enrichments: [] })
    expect(s.bid_validity_days.value).toBe(62 + 30) // bid opening 2026-07-01 to signing 2026-09-01
    expect(s.evaluation_method.value).toBe('Lowest evaluated price')
    expect(suggestTenderDraft({ plan: { ...plan, method: 'Quality-based' }, contracts: [], enrichments: [] }).evaluation_method.value).toBe('Quality and cost based')
  })
  it('suggests the midpoint of the guidance range for works only', () => {
    expect(suggestTenderDraft({ plan, contracts: [], enrichments: [] }).performance_security_pct.value).toBe(7.5)
    const goods = suggestTenderDraft({ plan: { ...plan, category: 'Goods' }, contracts: [], enrichments: [] }).performance_security_pct
    expect(goods.value).toBeNull()
  })
  it('gives no benchmark-based value below the sample threshold, and says how many there are', () => {
    const contracts = [contract('A', '2025-01-01', 100), contract('B', '2025-01-01', 300)]
    const s = suggestTenderDraft({ plan, contracts, enrichments: [end('A', '2026-01-01')] })
    expect(s.duration_months.value).toBeNull()
    expect(s.duration_months.basis).toContain('1 so far')
    expect(s.min_similar_value_usd.value).toBeNull()
  })
  it('uses the median once there are enough contracts', () => {
    const contracts = Array.from({ length: 10 }, (_, i) => contract(`C${i}`, '2025-01-01', (i + 1) * 100))
    const ends = contracts.map((c) => end(c.borrower_contract_reference_number, '2026-01-01'))
    const s = suggestTenderDraft({ plan, contracts, enrichments: ends })
    expect(s.duration_months.value).toBe(12)
    expect(s.duration_months.n).toBe(10)
    expect(s.min_similar_value_usd.value).toBe(600)
  })
  it('never suggests how many similar contracts, and suggests nothing without a plan', () => {
    expect(suggestTenderDraft({ plan, contracts: [], enrichments: [] }).min_similar_contracts.value).toBeNull()
    const s = suggestTenderDraft({ plan: undefined, contracts: [], enrichments: [] })
    expect(Object.values(s).every((f) => f.value === null)).toBe(true)
  })
})

describe('draftComplete', () => {
  it('needs every clause', () => {
    const full = { duration_months: 18, bid_validity_days: 90, performance_security_pct: 7.5, min_similar_contracts: 2, min_similar_value_usd: 1000, evaluation_method: 'Lowest evaluated price' }
    expect(draftComplete(full)).toBe(true)
    expect(draftComplete({ ...full, min_similar_contracts: null })).toBe(false)
    expect(draftComplete({ ...full, evaluation_method: '' })).toBe(false)
  })
})
