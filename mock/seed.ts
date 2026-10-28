// Rebuilds mock/db.json from scratch. `pnpm reset-db` runs this. Everything here is mock data.
// @ts-ignore Node.js type declarations are not included for this mock script.
import { writeFileSync } from 'node:fs'
// @ts-ignore Node.js type declarations are not included for this mock script.
import { fileURLToPath } from 'node:url'
import { fiscalYearOf } from '../packages/config/src/index'
import { buildCountryYears } from './import-gppd'

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
  contracts, enrichments, amendments: [], contract_milestones: [],
  // Future tenders this project team is preparing to run (dates are after as_of_date). Entered by the planner.
  plans: [
    { id: `PLAN-${P}-1`, project_id: P, name: 'Road resurfacing works, Lot 3', planned_advertisement: '2026-06-15', planned_bid_opening: '2026-07-20',
      planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-25', category: 'Works', method: 'Open competitive' },
    { id: `PLAN-${P}-2`, project_id: P, name: 'Road safety signage supply', planned_advertisement: '2026-06-22', planned_bid_opening: '2026-07-27',
      planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-04', category: 'Goods', method: 'Shopping' },
    { id: `PLAN-${P}-3`, project_id: P, name: 'Construction supervision consultancy', planned_advertisement: '2026-07-01', planned_bid_opening: '2026-08-12',
      planned_evaluation_complete: '2026-09-30', planned_signing: '2026-11-10', category: 'Consulting services', method: 'Quality-based' },
  ],
  tender_drafts: [{ id: `TD-${P}`, project_id: P, duration_months: 18, bid_validity_days: 60, performance_security_pct: 10,
    min_similar_contracts: 2, min_similar_value_usd: 2_000_000, evaluation_method: 'Lowest evaluated price' }],
  supervision_reports, completion_reports, documents, chunks,
  country_years: buildCountryYears(countries),
  // Illustrative placeholders: the Mock data label covers them. Replace with real WGI/CPIA before sharing outside the demo.
  governance: [
    { id: 'RO-2023', country: 'RO', year: 2023, wgi: { regulatory_quality: 68, government_effectiveness: 52, control_of_corruption: 55 }, cpia_16: null },
    { id: 'EE-2023', country: 'EE', year: 2023, wgi: { regulatory_quality: 90, government_effectiveness: 88, control_of_corruption: 90 }, cpia_16: null },
  ],
  recommendations, alerts: [], feedback: [], audit_log: [],
  sources: [
    { id: 'SRC-MOCK-1', name: 'Mock contract awards extract', publisher: 'Mock registry', kind: 'Contract awards', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-MOCK-2', name: 'Mock supervision reports (ISR)', publisher: 'Mock registry', kind: 'Supervision reports', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-MOCK-3', name: 'Mock completion reports (ICR)', publisher: 'Mock registry', kind: 'Completion reports', status: 'registered', last_fetched: null, simulated: false },
    { id: 'SRC-GPPD', name: 'GPPD country profiles (local file)', publisher: 'gppd_data.json supplied by K', kind: 'Country indicators', status: 'registered', last_fetched: null, simulated: false },
  ],
  conflicts: [{
    id: 'CNF-MOCK-1', project_id: P, type: 'Public vs entered date', subject: 'REF-002 advertised after it was signed',
    left: { label: 'Public contract award record', value: 'Signed 2025-11-18', provenance: 'public', citation: { ref_type: 'record', ref_id: 'REF-002', label: 'Contract REF-002 · signing date' } },
    right: { label: 'Entered by a contract manager', value: 'Advertised 2025-12-02', provenance: 'entered', citation: { ref_type: 'record', ref_id: 'ENR-S5', label: 'Entered · REF-002 advertised date' } },
    rule_applied: 'Advertisement must not be after contract signing. Public record outranks entered data for signing.',
    status: 'open', resolution: null, entered_ref: 'ENR-S5',
  }],
}

const out = fileURLToPath(new URL('./db.json', import.meta.url))
writeFileSync(out, JSON.stringify(db, null, 2))
console.log(`Wrote ${out}: ${contracts.length} contracts, ${db.country_years.length} country-years`)
