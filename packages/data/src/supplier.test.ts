import { describe, expect, it } from 'vitest'
import { supplierProfiles } from './supplier'
import type { Amendment, Contract, ContractMilestone } from './schemas'

const contract = (ref: string, supplier: string, project: string, amount: number, signed = '2024-01-01'): Contract => ({
  borrower_contract_reference_number: ref, wb_contract_number: 'W', project_id: project, supplier: `Name ${supplier}`, supplier_id: supplier, supplier_country: 'RO',
  procurement_category: 'Works', procurement_method: 'Open', review_type: 'Prior', supplier_contract_amount_usd: amount, contract_signing_date: signed, fiscal_year: 2024, contract_description: 'd',
})
const amd = (id: string, ref: string, days: number, value: number, status: Amendment['status'] = 'approved'): Amendment => ({ id, contract_ref: ref, type: 't', date: '2024-06-01', days_added: days, value_change_usd: value, reason: 'r', status, entered_by_role: 'contract_manager' })
const ms = (id: string, ref: string, planned: string, actual: string | null): ContractMilestone => ({ id, contract_ref: ref, name: 'm', planned_date: planned, actual_date: actual })

const three = [contract('A', 'S1', 'P1', 1000), contract('B', 'S1', 'P2', 1000), contract('C', 'S1', 'P3', 1000), contract('D', 'S2', 'P1', 1000), contract('E', 'S2', 'P2', 1000)]
const profile = (id: string, a: Amendment[] = [], m: ContractMilestone[] = []) => supplierProfiles(three, a, m).find((p) => p.supplierId === id)!

describe('supplierProfiles', () => {
  it('groups contracts by supplier across projects', () => {
    const p = profile('S1')
    expect(p.contracts).toHaveLength(3)
    expect(p.projects).toEqual(['P1', 'P2', 'P3'])
    expect(p.committedUsd).toBe(3000)
  })
  it('counts only approved amendments in the price change', () => {
    const p = profile('S1', [amd('1', 'A', 0, 300), amd('2', 'B', 0, 999, 'pending'), amd('3', 'C', 0, 100, 'rejected')])
    expect(p.valueChangeUsd).toBe(300)
    expect(p.priceChangePct).toBe(10)
    expect(p.flags.map((f) => f.id)).not.toContain('price_growth') // 10 is not above 10
    expect(profile('S1', [amd('1', 'A', 0, 400)]).flags.map((f) => f.id)).toContain('price_growth')
  })
  it('measures delay only on completed milestones', () => {
    const p = profile('S1', [], [ms('m1', 'A', '2024-01-01', '2024-03-01'), ms('m2', 'B', '2024-01-01', null), ms('m3', 'C', '2024-02-01', '2024-02-01')])
    expect(p.completedMilestones).toBe(2)
    expect(p.avgDelayDays).toBe(30)
    expect(p.flags.map((f) => f.id)).not.toContain('milestone_delay') // 30 is not above 30
  })
  it('flags time extensions at half the contracts or more, with evidence', () => {
    const p = profile('S1', [amd('1', 'A', 60, 0), amd('2', 'B', 30, 0)])
    const flag = p.flags.find((f) => f.id === 'time_extensions')
    expect(flag).toBeDefined()
    expect(flag?.evidence.map((e) => e.ref_id)).toEqual(['1', '2'])
  })
  it('shows the history but raises no flag below the minimum number of contracts', () => {
    const p = profile('S2', [amd('1', 'D', 90, 900), amd('2', 'E', 90, 900)])
    expect(p.gate.ok).toBe(false)
    expect(p.priceChangePct).toBe(90)
    expect(p.flags).toEqual([])
  })
  it('handles no contracts, and no milestones', () => {
    expect(supplierProfiles([], [], [])).toEqual([])
    expect(profile('S1').avgDelayDays).toBeNull()
  })
})
