import { describe, expect, it } from 'vitest'
import { compareProjects } from './compare'
import type { Amendment, Contract, Project, SupervisionReport } from './schemas'

const project = (id: string): Project => ({ project_id: id, project_name: `Project ${id}`, borrower_country: 'X', borrower_country_code: 'XX', region: 'R', project_global_practice: 'Transport', closing_date_planned: '2027-01-01', closing_date_revised: null, effectiveness_planned: '2025-01-01', effectiveness_actual: '2025-01-01', approval_date: '2024-06-01' })
const contract = (ref: string, projectId: string, supplier: string, amount: number): Contract => ({ borrower_contract_reference_number: ref, wb_contract_number: ref, project_id: projectId, supplier, supplier_id: supplier, supplier_country: 'X', procurement_category: 'Works', procurement_method: 'ICB', review_type: 'Prior', supplier_contract_amount_usd: amount, contract_signing_date: '2025-02-01', fiscal_year: 2025, contract_description: '' } as Contract)
const amendment = (id: string, ref: string, days: number, value: number, status: Amendment['status'] = 'approved'): Amendment => ({ id, contract_ref: ref, type: 'Extension', date: '2025-09-01', days_added: days, value_change_usd: value, reason: 'r', status, entered_by_role: 'contract_manager' })
const report = (projectId: string, pct: number): SupervisionReport => ({ id: `R-${projectId}`, project_id: projectId, sequence: 1, date: '2026-01-01', progress_rating_prev: null, progress_rating: 'S', implementation_rating: 'S', overall_risk_prev: null, overall_risk: 'Moderate', fiduciary_risk: 'Low', disbursed_pct: pct, restructurings: [] })

const base = {
  projects: [project('P-MOCK-001'), project('P-MOCK-002'), project('P111'), project('P222')],
  contracts: [contract('A', 'P-MOCK-001', 's1', 1000), contract('B', 'P-MOCK-001', 's2', 3000), contract('C', 'P-MOCK-002', 's1', 500), contract('D', 'P111', 's9', 800)],
  amendments: [amendment('1', 'A', 30, 100), amendment('2', 'B', 0, 200), amendment('3', 'A', 10, 999, 'pending')],
  reports: [report('P-MOCK-001', 40)],
  completionReports: [{ project_id: 'P-MOCK-002' }],
}

describe('compareProjects', () => {
  it('counts contracts, suppliers and committed money, and only approved amendments', () => {
    const r = compareProjects(base, ['P-MOCK-001', 'P-MOCK-002'])
    if (!r.ok) throw new Error(r.text)
    const [a, b] = r.rows
    expect(a!.values).toMatchObject({ committedUsd: 4000, contracts: 2, suppliers: 2, avgContractUsd: 2000, timesExtended: 1, priceChangePct: 7.5, disbursedPct: 40 })
    expect(a!.status).toMatch(/Under supervision/)
    expect(b!.status).toMatch(/Completed/)
    expect(r.scope).toBe('mock')
  })

  it('reports a figure with no source as missing (null), never zero', () => {
    const r = compareProjects(base, ['P-MOCK-001', 'P-MOCK-002'])
    if (!r.ok) throw new Error(r.text)
    const b = r.rows[1]!
    expect(b.values.timesExtended).toBeNull()
    expect(b.values.priceChangePct).toBeNull()
    expect(b.values.disbursedPct).toBeNull()
    expect(b.values.timeElapsedPct).toBeNull()
  })

  it('refuses to compare real with mock, and a single project', () => {
    expect(compareProjects(base, ['P-MOCK-001', 'P111'])).toMatchObject({ ok: false, reason: 'mixed' })
    expect(compareProjects(base, ['P-MOCK-001'])).toMatchObject({ ok: false, reason: 'too_few' })
    expect(compareProjects(base, ['P-MOCK-001', 'P-NOPE'])).toMatchObject({ ok: false, reason: 'too_few' })
  })

  it('names unknown ids but still compares the rest', () => {
    const r = compareProjects(base, ['P111', 'P222', 'P999'])
    expect(r).toMatchObject({ ok: true, unknown: ['P999'], scope: 'real' })
  })
})
