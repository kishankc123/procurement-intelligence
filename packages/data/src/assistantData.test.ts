import { describe, expect, it } from 'vitest'
import { listProjects, projectOverview, queryContracts, searchDocuments, supervisionSeries } from './assistantData'
import { withDefaults } from './assistant'
import type { Chunk, Contract, Doc, Project, SupervisionReport } from './schemas'

const project = (id: string, name: string) => ({ project_id: id, project_name: name, borrower_country: 'Laos', borrower_country_code: 'LA', region: 'EAP', project_global_practice: 'Transport', approval_date: '2016-12-13', effectiveness_planned: '2017-03-23', effectiveness_actual: '2017-03-23', closing_date_planned: '2022-08-31', closing_date_revised: '2025-12-31' }) as Project
const contract = (ref: string, supplier: string, amount: number, signed: string, category = 'Works') => ({ borrower_contract_reference_number: ref, project_id: 'P1', supplier, supplier_id: supplier, supplier_contract_amount_usd: amount, contract_signing_date: signed, procurement_category: category, procurement_method: 'Open', contract_description: `${ref} description` }) as Contract
const db = withDefaults({
  projects: [project('P1', 'Real Road'), project('P-MOCK-001', 'Mock Road')],
  contracts: [contract('A', 'Alpha Ltd', 500, '2020-01-01'), contract('B', 'Beta Co', 900, '2021-06-01'), contract('C', 'Alpha Ltd', 100, '2022-03-01', 'Goods')],
  supervision_reports: [{ id: 'R2', project_id: 'P1', sequence: 2, date: '2021-01-01', progress_rating: 'S', implementation_rating: 'MS', overall_risk: 'Moderate', fiduciary_risk: 'Moderate', disbursed_pct: 40, restructurings: [] }, { id: 'R1', project_id: 'P1', sequence: 1, date: '2020-01-01', progress_rating: 'S', progress_rating_prev: null, implementation_rating: 'S', overall_risk: 'Substantial', fiduciary_risk: 'Substantial', disbursed_pct: 10, restructurings: [] }] as unknown as SupervisionReport[],
  documents: [{ doc_id: 'D1', project_id: 'P1', type: 'Completion report', title: 'ICR', date: '2025-01-01', pages: 5, parse_status: 'parsed' }, { doc_id: 'D2', project_id: 'OTHER', type: 'x', title: 'Other', date: '2020-01-01', pages: 1, parse_status: 'parsed' }] as Doc[],
  chunks: [
    { chunk_id: 'CH1', doc_id: 'D1', page: 3, section_path: 'Lessons', text: 'Delays in land acquisition slowed road maintenance contracts and raised costs.' },
    { chunk_id: 'CH2', doc_id: 'D1', page: 4, section_path: 'Lessons', text: 'Procurement of consultants was completed on time.' },
    { chunk_id: 'CH3', doc_id: 'D2', page: 1, section_path: 'Text', text: 'Land acquisition in another project.' },
  ] as Chunk[],
})

describe('data tools', () => {
  it('lists projects and says which are real and which are mock', () => {
    expect(listProjects(db).map((p) => p.kind)).toEqual(['real World Bank data (ingested snapshot)', 'mock'])
  })
  it('gives an overview with counts and the latest report, or says what is missing', () => {
    const o = projectOverview(db, 'P1') as { counts: { contracts: number }; latest_supervision_report: { sequence: number; disbursed_pct: number } }
    expect(o.counts.contracts).toBe(3)
    expect(o.latest_supervision_report).toMatchObject({ sequence: 2, disbursed_pct: 40 })
    expect((projectOverview(db, 'P-MOCK-001') as { latest_supervision_report: unknown }).latest_supervision_report).toContain('missing')
    expect(projectOverview(db, 'NOPE')).toEqual({ error: 'No project with id NOPE.' })
  })
  it('filters, sorts and limits contracts, and reports how many matched', () => {
    const all = queryContracts(db, { project_id: 'P1' })
    expect(all.matched).toBe(3)
    expect(all.total_amount_usd).toBe(1500)
    expect(all.contracts[0]?.reference).toBe('B')
    expect(queryContracts(db, { project_id: 'P1', supplier: 'alpha' }).matched).toBe(2)
    expect(queryContracts(db, { project_id: 'P1', category: 'goods' }).contracts.map((c) => c.reference)).toEqual(['C'])
    expect(queryContracts(db, { project_id: 'P1', min_amount_usd: 400, sort_by: 'date' }).contracts.map((c) => c.reference)).toEqual(['B', 'A'])
    expect(queryContracts(db, { project_id: 'P1', limit: 1 }).shown).toBe(1)
    expect(queryContracts(db, { project_id: 'NOPE' }).matched).toBe(0)
  })
  it('returns reports in order, or the missing note', () => {
    const s = supervisionSeries(db, 'P1') as { reports: { sequence: number }[] }
    expect(s.reports.map((r) => r.sequence)).toEqual([1, 2])
    expect((supervisionSeries(db, 'P-MOCK-001') as { reports: string }).reports).toContain('missing')
  })
  it('searches document text by keyword, within the project, with citable ids, or says nothing was found', () => {
    const r = searchDocuments(db, 'land acquisition delays', 'P1') as { results: { chunk_id: string; page: number }[] }
    expect(r.results.map((x) => x.chunk_id)).toEqual(['CH1'])
    expect(r.results[0]?.page).toBe(3)
    expect((searchDocuments(db, 'earthquake', 'P1') as { results: string }).results).toContain('No supporting evidence')
  })
})
