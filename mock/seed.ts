// Rebuilds mock/db.json from scratch. `pnpm reset-db` runs this. Everything here is mock data.
// @ts-ignore Node.js type declarations are not included for this mock script.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
// @ts-ignore Node.js type declarations are not included for this mock script.
import { fileURLToPath } from 'node:url'
import { fiscalYearOf } from '../packages/config/src/index'
import { buildCountryYears } from './import-gppd'
import * as X from './seed-extra'

const P = 'P-MOCK-001'
const contractRows: [string, string, string, string, number, string][] = [
  // ref, supplier, category, method, amount, signing
  ['REF-001', 'Mock Civil Works Ltd', 'Works', 'Open competitive', 4_200_000, '2025-10-20'],
  ['REF-002', 'Mock Bridge Builders', 'Works', 'Open competitive', 2_650_000, '2025-11-18'],
  ['REF-003', 'Mock Asphalt Supply', 'Goods', 'Shopping', 310_000, '2026-01-14'],
  ['REF-004', 'Mock Road Safety Co', 'Works', 'Limited competitive', 880_000, '2026-02-09'],
  ['REF-005', 'Mock Survey Partners', 'Consulting services', 'Quality-based', 420_000, '2026-03-02'],
  ['REF-006', 'Mock Drainage Works', 'Works', 'Open competitive', 1_540_000, '2026-04-21'],
]
const contracts = contractRows.map(([ref, supplier, cat, method, amt, signed], i) => ({
  borrower_contract_reference_number: ref,
  wb_contract_number: `MOCK-WB-${String(i + 1).padStart(3, '0')}`,
  project_id: P, supplier, supplier_id: `MOCK-SUP-${i + 1}`, supplier_country: 'Romania',
  procurement_category: cat, procurement_method: method, review_type: i % 2 ? 'Post' : 'Prior',
  supplier_contract_amount_usd: amt, contract_signing_date: signed, fiscal_year: fiscalYearOf(signed),
  contract_description: `Mock ${cat.toLowerCase()} package ${i + 1} for the road rehabilitation`,
}))

// Earlier and current contracts of the same suppliers on other projects, so a supplier has a history across projects.
// [ref, supplier number (1 to 6, as in contractRows), project, category, method, amount, signing]
const SUPPLIER_NAMES = contractRows.map((r) => r[1])
const otherRows: [string, number, string, string, string, number, string][] = [
  ['REF-101', 1, 'P-MOCK-101', 'Works', 'Open competitive', 6_800_000, '2022-03-15'],
  ['REF-103', 1, 'P-MOCK-103', 'Works', 'Open competitive', 3_100_000, '2023-09-01'],
  ['REF-104', 2, 'P-MOCK-103', 'Works', 'Open competitive', 5_500_000, '2023-02-20'],
  ['REF-102', 3, 'P-MOCK-102', 'Goods', 'Shopping', 900_000, '2021-09-10'],
  ['REF-107', 3, 'P-MOCK-103', 'Goods', 'Shopping', 400_000, '2023-11-05'],
  ['REF-105', 4, 'P-MOCK-101', 'Works', 'Limited competitive', 600_000, '2022-08-22'],
  ['REF-106', 5, 'P-MOCK-102', 'Consulting services', 'Quality-based', 250_000, '2021-06-14'],
  ['REF-202', 5, 'P-MOCK-002', 'Consulting services', 'Quality-based', 180_000, '2026-02-12'],
]
const otherContracts = otherRows.map(([ref, sup, project, cat, method, amt, signed], i) => ({
  borrower_contract_reference_number: ref, wb_contract_number: `MOCK-WB-${String(i + 7).padStart(3, '0')}`,
  project_id: project, supplier: SUPPLIER_NAMES[sup - 1], supplier_id: `MOCK-SUP-${sup}`, supplier_country: 'Romania',
  procurement_category: cat, procurement_method: method, review_type: i % 2 ? 'Post' : 'Prior',
  supplier_contract_amount_usd: amt, contract_signing_date: signed, fiscal_year: fiscalYearOf(signed),
  contract_description: `Mock ${cat.toLowerCase()} package for ${project}`,
}))
const allContracts = [...contracts, ...otherContracts, ...X.extraContracts]

// Approved changes after signing, and milestones with planned and actual dates (mock history).
const amd = (n: number, ref: string, type: string, date: string, days: number, value: number, reason: string) => ({
  id: `AMD-MOCK-${n}`, contract_ref: ref, type, date, days_added: days, value_change_usd: value, reason, status: 'approved', entered_by_role: 'contract_manager',
})
const amendmentRows = [
  amd(1, 'REF-101', 'Time extension and value change', '2023-01-12', 120, 1_220_000, 'Land acquisition delays and extra earthworks (mock).'),
  amd(2, 'REF-103', 'Time extension and value change', '2024-04-02', 90, 280_000, 'Foundation redesign (mock).'),
  amd(3, 'REF-104', 'Time extension and value change', '2023-12-18', 180, 1_210_000, 'Scope change on the abutments (mock).'),
  amd(4, 'REF-102', 'Value change', '2022-02-03', 0, 18_000, 'Quantity adjustment (mock).'),
]
const ms = (n: number, ref: string, name: string, planned: string, actual: string | null) => ({ id: `MS-MOCK-${n}`, contract_ref: ref, name, planned_date: planned, actual_date: actual })
const milestoneRows = [
  ms(1, 'REF-101', 'Mobilisation', '2022-05-01', '2022-06-20'), ms(2, 'REF-101', 'Substantial completion', '2023-06-30', '2023-10-28'),
  ms(3, 'REF-103', 'Mobilisation', '2023-10-15', '2023-11-30'), ms(4, 'REF-103', 'Substantial completion', '2024-08-30', '2024-11-28'),
  ms(5, 'REF-001', 'Mobilisation', '2025-11-15', '2026-01-20'),
  ms(6, 'REF-104', 'Substantial completion', '2024-01-31', '2024-07-29'),
  ms(7, 'REF-102', 'Delivery complete', '2021-12-15', '2021-12-15'), ms(8, 'REF-107', 'Delivery complete', '2024-01-20', '2024-01-25'),
  ms(9, 'REF-105', 'Substantial completion', '2022-12-15', '2023-01-10'),
  ms(10, 'REF-106', 'Final report', '2021-12-01', '2021-11-26'), ms(11, 'REF-202', 'Final report', '2026-04-30', '2026-04-27'),
]

const enr = (id: string, ref: string, field: string, value: string, note: string) => ({
  id, contract_ref: ref, field, value, entered_by_role: 'contract_manager', fiscal_year: 2026,
  status: 'approved', source_note: note, entered_at: '2026-03-01T10:00:00Z',
})
const enrichments = [
  enr('ENR-S1', 'REF-001', 'advertised_date', '2025-08-04', 'Mock tender notice'),
  enr('ENR-S2', 'REF-001', 'bids_opened_date', '2025-09-08', 'Mock bid opening minutes'),
  enr('ENR-S3', 'REF-001', 'bidders_received', '3', 'Mock bid opening minutes'),
  enr('ENR-S4', 'REF-002', 'bidders_received', '4', 'Mock bid opening minutes'),
  // Deliberately inconsistent with the public signing date (2025-11-18): drives the Evidence workbench conflict.
  enr('ENR-S5', 'REF-002', 'advertised_date', '2025-12-02', 'Mock tender notice, transcribed by hand'),
]

const chunk = (n: number, doc: string, page: number, section: string, text: string) => ({
  chunk_id: `CH-MOCK-${String(n).padStart(3, '0')}`, doc_id: doc, page, section_path: section,
  strategy: 'section-aware', token_count: Math.round(text.split(/\s+/).length * 1.3), text, embedding_status: 'simulated',
})
const chunks = [
  chunk(1, 'DOC-MOCK-ISR-1', 3, 'Ratings', 'Mock supervision report 1. Progress toward the development objective is rated Satisfactory. Implementation progress is Satisfactory. Overall risk is Moderate.'),
  chunk(2, 'DOC-MOCK-ISR-1', 6, 'Disbursement', 'Mock supervision report 1. Cumulative disbursement is 2 percent of the loan. Mobilisation of the first works contract is under way.'),
  chunk(3, 'DOC-MOCK-ISR-2', 3, 'Ratings', 'Mock supervision report 2. Progress toward the development objective remains Satisfactory. Overall risk is Moderate. Contract REF-001 is behind its mobilisation schedule.'),
  chunk(4, 'DOC-MOCK-ISR-2', 7, 'Disbursement', 'Mock supervision report 2. Cumulative disbursement is 6 percent of the loan. Land acquisition delays are noted.'),
  chunk(5, 'DOC-MOCK-ISR-3', 3, 'Ratings', 'Mock supervision report 3. Progress toward the development objective is downgraded from Satisfactory to Moderately Unsatisfactory. Overall risk rises from Moderate to Substantial.'),
  chunk(6, 'DOC-MOCK-ISR-3', 8, 'Risk', 'Mock supervision report 3. Fiduciary risk is Substantial: procurement packages were re-bid after low participation, and bid validity expired on two packages.'),
  chunk(7, 'DOC-MOCK-ICR-101', 41, 'Section 6 Lessons Learned', 'Mock completion report. Bid validity shorter than the evaluation and approval period forced re-bidding on two works packages and added months to the closing date.'),
  chunk(8, 'DOC-MOCK-ICR-102', 38, 'Section 6 Lessons Learned', 'Mock completion report. Splitting a large works contract into smaller lots raised the number of bidders and shortened the time to award.'),
  chunk(9, 'DOC-MOCK-ICR-103', 44, 'Section 6 Lessons Learned', 'Mock completion report. Late land acquisition delayed site handover; contract amendments extended time by 14 months in total.'),
  chunk(10, 'DOC-MOCK-GUIDE-1', 2, 'Bid validity', 'Mock procurement guidance. Bid validity should cover the evaluation period plus the time for approvals and contract signing, with a margin.'),
  chunk(11, 'DOC-MOCK-GUIDE-1', 5, 'Performance security', 'Mock procurement guidance. Performance security for works contracts is commonly set between five and ten percent of the contract price.'),
  chunk(12, 'DOC-MOCK-GUIDE-1', 9, 'Evaluation', 'Mock procurement guidance. Evaluation of bids is normally completed within a few weeks of bid opening for works contracts without a prequalification stage.'),
]

const doc = (id: string, project: string, type: string, title: string, date: string, pages: number) =>
  ({ doc_id: id, project_id: project, type, title, date, pages, parse_status: 'parsed' })
const documents = [
  doc('DOC-MOCK-ISR-1', P, 'Supervision report', 'Mock Implementation Status Report 1', '2025-06-30', 12),
  doc('DOC-MOCK-ISR-2', P, 'Supervision report', 'Mock Implementation Status Report 2', '2025-12-15', 12),
  doc('DOC-MOCK-ISR-3', P, 'Supervision report', 'Mock Implementation Status Report 3', '2026-04-30', 14),
  doc('DOC-MOCK-ICR-101', 'P-MOCK-101', 'Completion report', 'Mock Completion Report: Highway Upgrade A', '2023-12-20', 62),
  doc('DOC-MOCK-ICR-102', 'P-MOCK-102', 'Completion report', 'Mock Completion Report: Rural Roads B', '2022-06-30', 58),
  doc('DOC-MOCK-ICR-103', 'P-MOCK-103', 'Completion report', 'Mock Completion Report: Bridge Programme C', '2024-03-15', 66),
  doc('DOC-MOCK-GUIDE-1', 'GENERAL', 'Guidance', 'Mock Procurement Guidance Note', '2024-01-10', 14),
]

const report = (n: number, date: string, prev: string | null, cur: string, riskPrev: string | null, risk: string, disb: number, restr: { date: string; note: string }[] = []) => ({
  id: `ISR-MOCK-${n}`, project_id: P, sequence: n, date, progress_rating_prev: prev, progress_rating: cur,
  implementation_rating: n === 3 ? 'MU' : 'S', overall_risk_prev: riskPrev, overall_risk: risk,
  fiduciary_risk: n === 3 ? 'Substantial' : 'Moderate', disbursed_pct: disb, restructurings: restr,
})
const supervision_reports = [
  report(1, '2025-06-30', null, 'S', null, 'Moderate', 2),
  report(2, '2025-12-15', 'S', 'S', 'Moderate', 'Moderate', 6),
  report(3, '2026-04-30', 'S', 'MU', 'Moderate', 'Substantial', 11, [{ date: '2026-03-10', note: 'Mock level-2 restructuring: extend closing date' }]),
]

const completion_reports = [
  { id: 'ICR-MOCK-101', project_id: 'P-MOCK-101', project_name: 'Mock Highway Upgrade A', outcome_rating: 'Moderately satisfactory', restructurings: 2, closing_extension_months: 8,
    lessons: [{ section: 'Section 6', text: 'Bid validity shorter than the evaluation and approval period forced re-bidding on two works packages.', chunk_id: 'CH-MOCK-007' }] },
  { id: 'ICR-MOCK-102', project_id: 'P-MOCK-102', project_name: 'Mock Rural Roads B', outcome_rating: 'Satisfactory', restructurings: 0, closing_extension_months: 0,
    lessons: [{ section: 'Section 6', text: 'Splitting a large works contract into lots raised the number of bidders.', chunk_id: 'CH-MOCK-008' }] },
  { id: 'ICR-MOCK-103', project_id: 'P-MOCK-103', project_name: 'Mock Bridge Programme C', outcome_rating: 'Moderately unsatisfactory', restructurings: 3, closing_extension_months: 14,
    lessons: [{ section: 'Section 6', text: 'Late land acquisition delayed site handover.', chunk_id: 'CH-MOCK-009' }] },
]

const recommendations = [
  { id: 'REC-MOCK-1', project_id: P, kind: 'lesson', title: 'Keep bid validity longer than the evaluation and approval period.',
    text: 'The most relevant lesson for this sector and method, quoted from the source with its section.',
    citations: [{ ref_type: 'chunk', ref_id: 'CH-MOCK-007', label: 'ICR · P-MOCK-101 · Section 6' }, { ref_type: 'chunk', ref_id: 'CH-MOCK-010', label: 'Guidance · Bid validity' }] },
  { id: 'REC-MOCK-2', project_id: P, kind: 'finding', title: 'Fiduciary risk is rising on this project.',
    text: 'The latest supervision report cites re-bidding after low participation.',
    citations: [{ ref_type: 'chunk', ref_id: 'CH-MOCK-006', label: 'ISR 3 · Risk' }] },
  { id: 'REC-MOCK-3', project_id: P, kind: 'withheld', title: 'Competition risk cannot be assessed yet.',
    text: 'Bidder counts are entered on too few contracts. A statement here would have no basis.', citations: [] },
]

const countries = ['RO', 'EE']
const db = {
  meta: { dataset_label: 'Mock data · P-MOCK projects · GPPD context is real', as_of_date: '2026-05-31' },
  projects: [{
    project_id: P, project_name: 'Mock Road Rehabilitation Project', borrower_country: 'Romania', borrower_country_code: 'RO',
    region: 'Europe and Central Asia', project_global_practice: 'Transport',
    approval_date: '2024-09-15', effectiveness_planned: '2025-01-15', effectiveness_actual: '2025-03-15',
    closing_date_planned: '2027-12-31', closing_date_revised: '2028-06-30',
  }, {
    // Placeholder projects for the Home picker: no contracts or plans yet, so their pages show the missing-data states.
    project_id: 'P-MOCK-002', project_name: 'Mock Rural Water Supply Program', borrower_country: 'Estonia', borrower_country_code: 'EE',
    region: 'Europe and Central Asia', project_global_practice: 'Water',
    approval_date: '2025-02-10', effectiveness_planned: '2025-06-01', effectiveness_actual: '2025-07-20',
    closing_date_planned: '2029-06-30', closing_date_revised: null,
  }, {
    project_id: 'P-MOCK-003', project_name: 'Mock Urban Health Clinics Upgrade', borrower_country: 'Romania', borrower_country_code: 'RO',
    region: 'Europe and Central Asia', project_global_practice: 'Health',
    approval_date: '2025-05-22', effectiveness_planned: '2025-09-15', effectiveness_actual: null,
    closing_date_planned: '2030-03-31', closing_date_revised: null,
  }],
  contracts: allContracts, enrichments: [...enrichments, ...X.extraEnrichments], amendments: [...amendmentRows, ...X.extraAmendments], contract_milestones: [...milestoneRows, ...X.extraMilestones],
  // Future tenders this project team is preparing to run (dates are after as_of_date). Entered by the planner.
  plans: [
    { id: `PLAN-${P}-1`, project_id: P, name: 'Road resurfacing works, Lot 3', planned_advertisement: '2026-06-15', planned_bid_opening: '2026-07-20',
      planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-25', category: 'Works', method: 'Open competitive' },
    { id: `PLAN-${P}-2`, project_id: P, name: 'Road safety signage supply', planned_advertisement: '2026-06-22', planned_bid_opening: '2026-07-27',
      planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-04', category: 'Goods', method: 'Shopping' },
    { id: `PLAN-${P}-3`, project_id: P, name: 'Construction supervision consultancy', planned_advertisement: '2026-07-01', planned_bid_opening: '2026-08-12',
      planned_evaluation_complete: '2026-09-30', planned_signing: '2026-11-10', category: 'Consulting services', method: 'Quality-based' },
    ...X.extraPlans,
  ],
  // Filled from mock/ingested/*.json (real projects only): the plan rows and tender notices read from World Bank sources.
  plan_packages: [] as unknown[],
  tender_notices: [] as unknown[],
  tender_drafts: [{ id: `TD-${P}`, project_id: P, duration_months: 18, bid_validity_days: 60, performance_security_pct: 10,
    min_similar_contracts: 2, min_similar_value_usd: 2_000_000, evaluation_method: 'Lowest evaluated price' }, ...X.extraDrafts],
  supervision_reports: [...supervision_reports, ...X.extraReports], completion_reports: [...completion_reports, ...X.extraCompletionReports],
  documents: [...documents, ...X.extraDocuments], chunks: [...chunks, ...X.extraChunks],
  country_years: buildCountryYears(countries),
  // Illustrative placeholders: the Mock data label covers them. Replace with real WGI/CPIA before sharing outside the demo.
  governance: [
    { id: 'RO-2023', country: 'RO', year: 2023, wgi: { regulatory_quality: 68, government_effectiveness: 52, control_of_corruption: 55 }, cpia_16: null },
    { id: 'EE-2023', country: 'EE', year: 2023, wgi: { regulatory_quality: 90, government_effectiveness: 88, control_of_corruption: 90 }, cpia_16: null },
    ...X.extraGovernance,
  ],
  recommendations, alerts: [], feedback: X.extraFeedback, audit_log: X.extraAuditLog,
  // Mock operational records for the Schedule page: running projects in different phases. Progress values are mock inputs, not measurements.
  schedule_items: [
    ...X.extraSchedule,
    ...([
      ['Lot 1 earthworks (REF-001)', 'Works', '2025-10-20', '2026-09-30', 38],
      ['Bridge works (REF-002)', 'Works', '2025-11-18', '2026-12-15', 30],
      ['Asphalt delivery (REF-003)', 'Supplies', '2026-01-14', '2026-07-31', 55],
      ['Site crew mobilisation', 'Manpower', '2025-10-01', '2026-03-31', 100],
      ['Mid-term review', 'Milestone', '2026-09-01', '2026-09-01', null],
    ] as const).map(([name, group, start, end, progress_pct], i) => ({ id: `SCH-${P}-${i + 1}`, project_id: P, name, group, start, end, progress_pct })),
    ...([
      ['Pipe supply tender', 'Procurement', '2026-04-15', '2026-08-30', 40],
      ['Pump station works tender', 'Procurement', '2026-05-10', '2026-10-15', 10],
      ['Survey crew mobilisation', 'Manpower', '2026-07-15', '2026-09-30', null],
      ['Pipe stock build-up', 'Supplies', '2026-09-01', '2027-03-31', null],
      ['Pump station works', 'Works', '2026-11-01', '2027-12-31', null],
      ['Mid-term review', 'Milestone', '2027-07-01', '2027-07-01', null],
    ] as const).map(([name, group, start, end, progress_pct], i) => ({ id: `SCH-P-MOCK-002-${i + 1}`, project_id: 'P-MOCK-002', name, group, start, end, progress_pct })),
    ...([
      ['Design and bidding documents', 'Procurement', '2025-11-01', '2026-06-15', 70],
      ['Effectiveness conditions met', 'Milestone', '2026-07-15', '2026-07-15', null],
      ['Clinic works tender', 'Procurement', '2026-07-01', '2026-12-15', null],
      ['Medical equipment stock order', 'Supplies', '2026-09-01', '2027-06-30', null],
      ['Clinic staff recruitment', 'Manpower', '2026-10-01', '2027-03-31', null],
    ] as const).map(([name, group, start, end, progress_pct], i) => ({ id: `SCH-P-MOCK-003-${i + 1}`, project_id: 'P-MOCK-003', name, group, start, end, progress_pct })),
  ],
  // Mock record of earlier tenders across projects, so a new tender can be checked against them. Cancelled and re-tendered ones carry the reason.
  tender_history: [
    ...X.extraTenderHistory,
    { id: 'TND-MOCK-001', project_id: P, name: 'Lot 1 earthworks and drainage', status: 'awarded', date: '2025-10-20', reason: null, contract_ref: 'REF-001', replaces: null,
      citation: { ref_type: 'record', ref_id: 'REF-001', label: 'Contract REF-001' } },
    { id: 'TND-MOCK-002', project_id: P, name: 'Bridge works', status: 'awarded', date: '2025-11-18', reason: null, contract_ref: 'REF-002', replaces: null,
      citation: { ref_type: 'record', ref_id: 'REF-002', label: 'Contract REF-002' } },
    { id: 'TND-MOCK-003', project_id: P, name: 'Road safety signage supply', status: 'cancelled', date: '2026-02-10', reason: 'Bid validity expired on two packages after low participation.', contract_ref: null, replaces: null,
      citation: { ref_type: 'chunk', ref_id: 'CH-MOCK-006', label: 'ISR 3 · Risk' } },
    { id: 'TND-MOCK-005', project_id: 'P-MOCK-101', name: 'Road resurfacing works, Lot 2', status: 'cancelled', date: '2023-05-10', reason: 'Bid validity was shorter than the evaluation and approval period, which forced re-bidding.', contract_ref: null, replaces: null,
      citation: { ref_type: 'chunk', ref_id: 'CH-MOCK-007', label: 'ICR 101 · Section 6' } },
    { id: 'TND-MOCK-006', project_id: 'P-MOCK-101', name: 'Road resurfacing works, Lot 2', status: 're_tendered', date: '2023-07-21', reason: 'Re-issued with a longer bid validity.', contract_ref: null, replaces: 'TND-MOCK-005',
      citation: { ref_type: 'chunk', ref_id: 'CH-MOCK-007', label: 'ICR 101 · Section 6' } },
    { id: 'TND-MOCK-007', project_id: 'P-MOCK-002', name: 'Pipe supply tender', status: 'cancelled', date: '2026-03-12', reason: 'No compliant bids were received (mock record).', contract_ref: null, replaces: null, citation: null },
    { id: 'TND-MOCK-008', project_id: 'P-MOCK-002', name: 'Pipe supply tender (re-issued)', status: 're_tendered', date: '2026-04-15', reason: 'Re-issued after the first tender was cancelled.', contract_ref: null, replaces: 'TND-MOCK-007', citation: null },
  ],
  source_links: X.extraSourceLinks, ingestion_runs: X.extraIngestionRuns,
  sources: [
    { id: 'SRC-MOCK-1', name: 'Mock contract awards extract', publisher: 'Mock registry', kind: 'Contract awards', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-MOCK-2', name: 'Mock supervision reports (ISR)', publisher: 'Mock registry', kind: 'Supervision reports', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-MOCK-3', name: 'Mock completion reports (ICR)', publisher: 'Mock registry', kind: 'Completion reports', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-GPPD', name: 'GPPD country profiles (local file)', publisher: 'gppd_data.json supplied by K', kind: 'Country indicators', status: 'registered', last_fetched: null, simulated: false },
    ...X.extraSources,
  ],
  conflicts: [{
    id: 'CNF-MOCK-1', project_id: P, type: 'Public vs entered date', subject: 'REF-002 advertised after it was signed',
    left: { label: 'Public contract award record', value: 'Signed 2025-11-18', provenance: 'public', citation: { ref_type: 'record', ref_id: 'REF-002', label: 'Contract REF-002 · signing date' } },
    right: { label: 'Entered by a contract manager', value: 'Advertised 2025-12-02', provenance: 'entered', citation: { ref_type: 'record', ref_id: 'ENR-S5', label: 'Entered · REF-002 advertised date' } },
    rule_applied: 'Advertisement must not be after contract signing. Public record outranks entered data for signing.',
    status: 'open', resolution: null, entered_ref: 'ENR-S5',
  }],
}

// Real, pre-ingested projects (pnpm ingest <id>) are merged in as they are: same collections, same shapes.
const ingestedDir = fileURLToPath(new URL('./ingested/', import.meta.url))
const ingested: string[] = []
if (existsSync(ingestedDir)) {
  for (const file of readdirSync(ingestedDir).filter((f: string) => f.endsWith('.json')).sort()) {
    const snapshot = JSON.parse(readFileSync(ingestedDir + file, 'utf8')) as { manifest: { project_id: string; ingested_at: string }; collections: Record<string, unknown[]> }
    for (const [name, rows] of Object.entries(snapshot.collections)) {
      const target = (db as unknown as Record<string, unknown[]>)[name]
      // Every snapshot lists the same three public sources; a row whose id is already there (for example SRC-WB-PROJECTS) is not added twice.
      const known = new Set((target as { id?: string }[]).map((r) => r.id))
      if (Array.isArray(target)) target.push(...rows.filter((r) => name !== 'sources' || !known.has((r as { id: string }).id)))
    }
    ingested.push(`${snapshot.manifest.project_id} (ingested ${snapshot.manifest.ingested_at.slice(0, 10)})`)
  }
}
if (ingested.length > 0) db.meta.dataset_label += ` · Real World Bank data, ingested snapshot: ${ingested.join(', ')}`

const out = fileURLToPath(new URL('./db.json', import.meta.url))
writeFileSync(out, JSON.stringify(db, null, 2))
console.log(`Wrote ${out}: ${db.contracts.length} contracts, ${db.country_years.length} country-years${ingested.length ? `, ingested: ${ingested.join(', ')}` : ''}`)
