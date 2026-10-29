import { describe, expect, it } from 'vitest'
import { listProjects, projectOverview, proposePlan, proposeTenderDraft, referencePractice, queryContracts, searchDocuments, supervisionSeries } from './assistantData'
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

describe('referencePractice', () => {
  const ref = withDefaults({
    projects: [project('P-MOCK-001', 'Mock Road'), { ...project('P-MOCK-002', 'Mock Water'), project_global_practice: 'Water' }],
    tender_drafts: [{ id: 'TD-1', project_id: 'P-MOCK-001', duration_months: 18, bid_validity_days: 60, performance_security_pct: 10, min_similar_contracts: 2, min_similar_value_usd: 2000000, evaluation_method: 'Lowest evaluated price' }],
    plans: [
      { id: 'PL1', project_id: 'P-MOCK-001', name: 'a', planned_advertisement: '2026-01-01', planned_bid_opening: '', planned_evaluation_complete: '', planned_signing: '2026-04-11', category: 'Works', method: 'Open' },
      { id: 'PL2', project_id: 'P-MOCK-001', name: 'b', planned_advertisement: '2026-01-01', planned_bid_opening: '', planned_evaluation_complete: '', planned_signing: '2026-05-01', category: 'Works', method: 'Open' },
    ] as never,
    completion_reports: [{ id: 'ICR-1', project_id: 'X', project_name: 'Mock Highway', outcome_rating: 'MS', restructurings: 0, closing_extension_months: 0, lessons: [{ section: 'Section 6', text: 'Bid validity was too short.', chunk_id: 'CH-9' }] }] as never,
  })
  it('gives clauses, plan durations and lessons from the data, and says missing where there is none', () => {
    const r = referencePractice(ref)
    const road = r.projects.find((p) => p.project_id === 'P-MOCK-001')!
    expect(road.tender_draft).toMatchObject({ bid_validity_days: 60 })
    expect(road.plans).toMatchObject({ count: 2, median_days_advertisement_to_signing: 110 })
    expect(road.contracts).toBe('missing: no contracts')
    expect(r.projects.find((p) => p.project_id === 'P-MOCK-002')!.tender_draft).toContain('missing')
    expect(r.lessons).toMatchObject([{ chunk_id: 'CH-9' }])
  })
  it('narrows by keyword and reports no match for lessons', () => {
    expect(referencePractice(ref, 'water').projects.map((p) => p.project_id)).toEqual(['P-MOCK-002'])
    expect(referencePractice(ref, 'water').lessons).toContain('missing')
  })
})

describe('proposals', () => {
  const plan = (id: string, pid: string, a: string, b: string, e: string, sgn: string, category = 'Works') => ({ id, project_id: pid, name: id, planned_advertisement: a, planned_bid_opening: b, planned_evaluation_complete: e, planned_signing: sgn, category, method: 'Open competitive' })
  const base = withDefaults({
    projects: [project('P-MOCK-001', 'Mock Road'), { ...project('P-MOCK-002', 'Mock Water'), project_global_practice: 'Water' }],
    plans: [plan('A', 'P-MOCK-001', '2026-01-01', '2026-02-01', '2026-02-21', '2026-04-01'), plan('B', 'P-MOCK-001', '2026-03-01', '2026-04-01', '2026-04-21', '2026-06-01'), plan('C', 'P-MOCK-002', '2026-01-01', '2026-03-01', '2026-04-01', '2026-05-01', 'Goods')] as never,
    tender_drafts: [
      { id: 'T1', project_id: 'P-MOCK-001', duration_months: 18, bid_validity_days: 60, performance_security_pct: 10, min_similar_contracts: 2, min_similar_value_usd: 2000000, evaluation_method: 'Lowest evaluated price' },
      { id: 'T2', project_id: 'P-MOCK-002', duration_months: 14, bid_validity_days: 90, performance_security_pct: 8, min_similar_contracts: 2, min_similar_value_usd: 1000000, evaluation_method: 'Lowest evaluated price' },
    ] as never,
  })
  it('builds the four stage dates from the median gaps and states its basis', () => {
    const r = proposePlan(base, { start_date: '2027-01-01', keyword: 'road' }) as { plan: Record<string, string>; basis: { sample_size: number; median_gap_days: Record<string, number> } }
    expect(r.basis.sample_size).toBe(2)
    expect(r.basis.median_gap_days).toEqual({ to_bid_opening: 31, to_evaluation_complete: 20, to_signing: 40 })
    expect(r.plan).toMatchObject({ planned_advertisement: '2027-01-01', planned_bid_opening: '2027-02-01', planned_evaluation_complete: '2027-02-21', planned_signing: '2027-04-02' })
  })
  it('works back from a signing deadline and says whether a start date fits it', () => {
    const back = proposePlan(base, { signing_by: '2027-06-30', keyword: 'road' }) as { plan: { planned_advertisement: string; planned_signing: string } }
    expect(back.plan.planned_signing).toBe('2027-06-30')
    const late = proposePlan(base, { start_date: '2027-01-01', signing_by: '2027-03-01', keyword: 'road' }) as { deadline_check: { fits: boolean; days_over: number } }
    expect(late.deadline_check).toEqual({ fits: false, days_over: 32 })
  })
  it('treats empty strings as not given', () => {
    const r = proposePlan(base, { start_date: '', signing_by: '2027-06-30', name: '', category: 'works', method: '', keyword: 'road' }) as { plan: { name: string; planned_signing: string } }
    expect(r.plan).toMatchObject({ name: 'Your procurement', planned_signing: '2027-06-30' })
  })
  it('works back from the deadline when the start date is not before it', () => {
    const r = proposePlan(base, { start_date: '2027-06-30', signing_by: '2027-06-30', keyword: 'road' }) as { plan: { planned_signing: string }; note: string }
    expect(r.plan.planned_signing).toBe('2027-06-30')
    expect(r.note).toContain('worked back')
  })
  it('suggests no plan or draft when there is no reference, and no plan without a date', () => {
    expect(proposePlan(base, { start_date: '2027-01-01', keyword: 'health' })).toHaveProperty('missing')
    expect(proposePlan(base, { keyword: 'road' })).toHaveProperty('missing')
    expect(proposeTenderDraft(base, 'health')).toHaveProperty('missing')
  })
  it('takes each clause from the stored drafts with the sample size and sources', () => {
    const d = proposeTenderDraft(base) as { clauses: { field: string; value: number | string; sample_size: number; from: string[] }[] }
    expect(d.clauses.find((c) => c.field === 'bid_validity_days')).toMatchObject({ value: 75, sample_size: 2, from: ['P-MOCK-001', 'P-MOCK-002'] })
    expect(d.clauses.find((c) => c.field === 'evaluation_method')?.value).toBe('Lowest evaluated price')
  })
})
