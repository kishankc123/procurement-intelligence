// More mock records, so every list is long enough to page and scroll. Everything here is mock data and is labelled that way.
// seed.ts merges these into db.json. To add more of anything, add a row to the matching list below and run `pnpm reset-db`.
import { fiscalYearOf } from '../packages/config/src/index'
import { classifySource, ingestionSteps } from '../packages/data/src/ai'

const P = 'P-MOCK-001'
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- contracts
const SUPPLIERS = [
  'Mock Earthworks Group', 'Mock Concrete Supply', 'Mock Signage Systems', 'Mock Geotech Services', 'Mock Steel Fabricators',
  'Mock Traffic Engineering', 'Mock Landscaping Co', 'Mock Lighting Works', 'Mock Equipment Rental', 'Mock Environmental Consultants',
  'Mock Quarry Materials', 'Mock Paving Partners', 'Mock Culvert Builders', 'Mock Design Studio',
]
const BY_CATEGORY: Record<string, string[]> = {
  Works: ['Open competitive', 'Limited competitive'],
  Goods: ['Shopping', 'Open competitive'],
  'Consulting services': ['Quality-based', 'Consultant qualification'],
}
const CATEGORIES = ['Works', 'Goods', 'Consulting services', 'Works', 'Goods']

// Supplier numbers 1 to 6 are defined in seed.ts; the ones here start at 7.
let wb = 15
const contract = (ref: string, project: string, supplierIdx: number, i: number, signed: string) => {
  const category = CATEGORIES[i % CATEGORIES.length]!
  return {
    borrower_contract_reference_number: ref, wb_contract_number: `MOCK-WB-${String(wb++).padStart(3, '0')}`,
    project_id: project, supplier: SUPPLIERS[supplierIdx % SUPPLIERS.length]!, supplier_id: `MOCK-SUP-${7 + (supplierIdx % SUPPLIERS.length)}`, supplier_country: 'Romania',
    procurement_category: category, procurement_method: BY_CATEGORY[category]![i % 2]!, review_type: i % 3 === 0 ? 'Prior' : 'Post',
    supplier_contract_amount_usd: 150_000 + ((i * 7919) % 40) * 95_000, contract_signing_date: signed, fiscal_year: fiscalYearOf(signed),
    contract_description: `Mock ${category.toLowerCase()} package for ${project}`,
  }
}
// Four signed in FY2025 (REF-007 to REF-010), then 22 in FY2026 (REF-011 to REF-032), two weeks apart.
const fy2025 = ['2025-02-11', '2025-03-24', '2025-05-06', '2025-06-17'].map((d, i) => contract(`REF-${String(7 + i).padStart(3, '0')}`, P, i, i, d))
const fy2026Dates = Array.from({ length: 22 }, (_, i) => addDays('2025-07-08', i * 14))
const fy2026 = fy2026Dates.map((d, i) => contract(`REF-${String(11 + i).padStart(3, '0')}`, P, i + 4, i + 4, d))
const others = [
  ...['2025-10-02', '2025-12-11', '2026-02-05', '2026-03-19', '2026-04-23'].map((d, i) => contract(i === 0 ? 'REF-201' : `REF-20${i + 2}`, 'P-MOCK-002', i + 2, i, d)),
  ...['2026-01-22', '2026-03-05', '2026-04-16', '2026-05-12'].map((d, i) => contract(`REF-30${i + 1}`, 'P-MOCK-003', i + 8, i + 1, d)),
]
export const extraContracts = [...fy2025, ...fy2026, ...others]

// ---------------------------------------------------------------- entered data on the FY2026 contracts of P-MOCK-001
const ref = (n: number) => `REF-${String(n).padStart(3, '0')}`
const signingOf = (r: string) => fy2026Dates[Number(r.slice(4)) - 11]!
let enrN = 0
const enr = (r: string, field: string, value: string, status: 'approved' | 'pending' | 'rejected', role: 'planner' | 'contract_manager' = 'contract_manager', note = 'Mock record') => ({
  id: `ENR-X${++enrN}`, contract_ref: r, field, value, entered_by_role: role, fiscal_year: 2026, status, source_note: note,
  entered_at: `2026-0${3 + (enrN % 3)}-${String(5 + (enrN % 20)).padStart(2, '0')}T09:30:00Z`,
})
const enrichmentRows: ReturnType<typeof enr>[] = []
const VALIDITY = [60, 90, 120, 75, 90, 60, 120, 90, 100, 60, 90, 120]
for (let n = 11; n <= 22; n++) enrichmentRows.push(enr(ref(n), 'bid_validity_days', String(VALIDITY[n - 11]), 'approved', 'planner', 'Mock bidding documents'))
enrichmentRows.push(enr(ref(23), 'bid_validity_days', '90', 'pending', 'planner', 'Mock bidding documents'), enr(ref(24), 'bid_validity_days', '120', 'pending', 'planner', 'Mock bidding documents'))
enrichmentRows.push(enr(ref(26), 'bid_validity_days', '0', 'approved', 'planner', 'Mock typo: zero days is not usable'))
enrichmentRows.push(enr(ref(25), 'bid_validity_days', '-30', 'rejected', 'planner', 'Mock typo, rejected by reviewer'))
// Advertised and bid-opening dates on REF-011 to REF-019: ten contracts with REF-001, so the tender duration benchmark has enough data.
for (let n = 11; n <= 19; n++) {
  const s = signingOf(ref(n))
  enrichmentRows.push(enr(ref(n), 'advertised_date', addDays(s, -100), 'approved', 'planner', 'Mock tender notice'))
  enrichmentRows.push(enr(ref(n), 'bids_opened_date', addDays(s, -60), 'approved', 'planner', 'Mock bid opening minutes'))
}
enrichmentRows.push(enr(ref(20), 'advertised_date', addDays(signingOf(ref(20)), -95), 'pending', 'planner', 'Mock tender notice'))
// Bidders: seven contracts with REF-001 and REF-002 below the 10 needed, so the competition benchmark stays gated.
;[3, 5, 4, 2, 6].forEach((b, k) => enrichmentRows.push(enr(ref(11 + k), 'bidders_received', String(b), 'approved', 'planner', 'Mock bid opening minutes')))
enrichmentRows.push(enr(ref(16), 'bidders_received', '4', 'pending', 'planner', 'Mock bid opening minutes'))
;[2, 3, 2].forEach((b, k) => enrichmentRows.push(enr(ref(11 + k), 'bidders_qualified', String(b), 'approved', 'planner', 'Mock evaluation report')))
// End dates on nine contracts, one short of the 10 needed. REF-011 and REF-012 are already past their end date.
const ENDS = ['2026-03-31', '2026-05-15', '2026-09-30', '2026-10-31', '2026-12-15', '2027-01-31', '2027-03-15', '2027-05-31', '2027-06-30']
ENDS.forEach((e, k) => enrichmentRows.push(enr(ref(11 + k), 'contract_end_date', e, 'approved', 'contract_manager', 'Mock contract data sheet')))
enrichmentRows.push(enr(ref(20), 'contract_end_date', '2027-08-31', 'pending', 'contract_manager', 'Mock contract data sheet'), enr(ref(21), 'contract_end_date', '2027-09-30', 'pending', 'contract_manager', 'Mock contract data sheet'))
export const extraEnrichments = enrichmentRows

// ---------------------------------------------------------------- amendments and milestones
let amdN = 4
const amd = (contractRef: string, type: string, date: string, days: number, value: number, reason: string, status: 'approved' | 'pending' | 'rejected') =>
  ({ id: `AMD-MOCK-${++amdN}`, contract_ref: contractRef, type, date, days_added: days, value_change_usd: value, reason, status, entered_by_role: 'contract_manager' as const })
export const extraAmendments = [
  amd('REF-001', 'Time extension', '2026-03-12', 45, 0, 'Utility relocation delayed the start (mock).', 'approved'),
  amd('REF-002', 'Time extension and value change', '2026-04-02', 60, 310_000, 'Extra pier protection after river survey (mock).', 'approved'),
  amd('REF-004', 'Value change', '2026-04-14', 0, 42_000, 'Additional signage quantities (mock).', 'approved'),
  amd('REF-011', 'Time extension', '2026-02-10', 30, 0, 'Weather delay (mock).', 'approved'),
  amd('REF-012', 'Time extension and value change', '2026-03-03', 75, 120_000, 'Design change on drainage (mock).', 'approved'),
  amd('REF-013', 'Value change', '2026-03-20', 0, 65_000, 'Price adjustment on asphalt (mock).', 'approved'),
  amd('REF-014', 'Time extension', '2026-04-08', 21, 0, 'Late access to site (mock).', 'approved'),
  amd('REF-015', 'Time extension and value change', '2026-05-06', 90, 210_000, 'Ground conditions differed from survey (mock).', 'approved'),
  amd('REF-016', 'Time extension', '2026-05-12', 30, 0, 'Supplier delivery delay (mock).', 'pending'),
  amd('REF-017', 'Value change', '2026-05-14', 0, 88_000, 'Quantity adjustment (mock).', 'pending'),
  amd('REF-018', 'Time extension and value change', '2026-05-18', 40, 54_000, 'Added kerb works (mock).', 'pending'),
  amd('REF-019', 'Time extension', '2026-05-20', 14, 0, 'Permit delay (mock).', 'pending'),
  amd('REF-020', 'Value change', '2026-05-21', 0, 900_000, 'Value change above the contract limit, queried by reviewer (mock).', 'rejected'),
]
let msN = 11
const ms = (contractRef: string, name: string, planned: string, actual: string | null) => ({ id: `MS-MOCK-${++msN}`, contract_ref: contractRef, name, planned_date: planned, actual_date: actual })
export const extraMilestones = [
  ms('REF-002', 'Mobilisation', '2025-12-15', '2026-01-12'), ms('REF-002', 'Substantial completion', '2026-11-30', null),
  ms('REF-003', 'Delivery complete', '2026-03-15', '2026-03-20'), ms('REF-004', 'Mobilisation', '2026-03-01', '2026-03-24'),
  ms('REF-005', 'Inception report', '2026-04-15', '2026-04-10'), ms('REF-006', 'Mobilisation', '2026-05-20', null),
  ms('REF-011', 'Mobilisation', '2025-08-15', '2025-08-29'), ms('REF-011', 'Substantial completion', '2026-03-15', '2026-04-20'),
  ms('REF-012', 'Mobilisation', '2025-09-01', '2025-09-15'), ms('REF-012', 'Substantial completion', '2026-04-30', null),
  ms('REF-013', 'Delivery complete', '2025-10-15', '2025-10-14'), ms('REF-014', 'Mobilisation', '2025-10-20', '2025-11-04'),
  ms('REF-015', 'Mobilisation', '2025-11-01', '2025-11-20'), ms('REF-016', 'Final report', '2026-02-28', '2026-03-05'),
  ms('REF-017', 'Delivery complete', '2026-03-31', '2026-03-29'), ms('REF-018', 'Mobilisation', '2026-02-15', null),
]

// ---------------------------------------------------------------- plans and drafts
const PLAN_NAMES: [string, string, string][] = [
  ['Pedestrian bridge steel supply', 'Goods', 'Open competitive'], ['Highway lighting retrofit', 'Works', 'Open competitive'],
  ['Culvert replacement, Lot 4', 'Works', 'Limited competitive'], ['Environmental monitoring services', 'Consulting services', 'Quality-based'],
  ['Road marking paint supply', 'Goods', 'Shopping'], ['Geotechnical survey, southern section', 'Consulting services', 'Consultant qualification'],
  ['Traffic counting equipment', 'Goods', 'Shopping'], ['Drainage rehabilitation, Lot 5', 'Works', 'Open competitive'],
  ['Technical audit consultancy', 'Consulting services', 'Quality-based'], ['Asphalt plant equipment', 'Goods', 'Open competitive'],
  ['Resettlement action plan support', 'Consulting services', 'Quality-based'],
]
const plan = (project: string, n: number, name: string, category: string, method: string, firstAd: string, i: number) => {
  const ad = addDays(firstAd, i * 10)
  const opening = addDays(ad, 35)
  const evaluation = addDays(opening, 21 + (i % 3) * 7)
  return { id: `PLAN-${project}-${n}`, project_id: project, name, planned_advertisement: ad, planned_bid_opening: opening,
    planned_evaluation_complete: evaluation, planned_signing: addDays(evaluation, 35 + (i % 4) * 5), category, method }
}
export const extraPlans = [
  ...PLAN_NAMES.map(([name, cat, method], i) => plan(P, i + 4, name, cat, method, '2026-07-06', i)),
  ...([['Pipe supply, Phase 2', 'Goods', 'Open competitive'], ['Pump station civil works', 'Works', 'Open competitive'], ['Supervision consultancy', 'Consulting services', 'Quality-based'], ['Telemetry equipment', 'Goods', 'Shopping']] as const)
    .map(([name, cat, method], i) => plan('P-MOCK-002', i + 1, name, cat, method, '2026-08-03', i)),
  ...([['Clinic refurbishment, Lot 1', 'Works', 'Open competitive'], ['Medical equipment supply', 'Goods', 'Open competitive'], ['Design review services', 'Consulting services', 'Quality-based'], ['Clinic furniture supply', 'Goods', 'Shopping']] as const)
    .map(([name, cat, method], i) => plan('P-MOCK-003', i + 1, name, cat, method, '2026-09-07', i)),
]
export const extraDrafts = [
  { id: 'TD-P-MOCK-002', project_id: 'P-MOCK-002', duration_months: 14, bid_validity_days: 90, performance_security_pct: 8, min_similar_contracts: 2, min_similar_value_usd: 1_000_000, evaluation_method: 'Lowest evaluated price' },
  { id: 'TD-P-MOCK-003', project_id: 'P-MOCK-003', duration_months: 20, bid_validity_days: 75, performance_security_pct: 10, min_similar_contracts: 3, min_similar_value_usd: 1_500_000, evaluation_method: 'Quality and cost based' },
]

// ---------------------------------------------------------------- documents and chunks (continue after CH-MOCK-012)
let chN = 12
const chunk = (docId: string, page: number, section: string, text: string) => ({
  chunk_id: `CH-MOCK-${String(++chN).padStart(3, '0')}`, doc_id: docId, page, section_path: section,
  strategy: 'section-aware', token_count: Math.round(text.split(/\s+/).length * 1.3), text, embedding_status: 'simulated',
})
const doc = (id: string, project: string, type: string, title: string, date: string, pages: number, parse_status = 'parsed') => ({ doc_id: id, project_id: project, type, title, date, pages, parse_status })

const docsAndChunks: { doc: ReturnType<typeof doc>; chunks: ReturnType<typeof chunk>[] }[] = [
  { doc: doc('DOC-MOCK-ISR-201', 'P-MOCK-002', 'Supervision report', 'Mock Implementation Status Report 1 (Rural Water)', '2025-12-01', 10), chunks: [
    chunk('DOC-MOCK-ISR-201', 3, 'Ratings', 'Mock supervision report for P-MOCK-002. Progress toward the development objective is rated Satisfactory and overall risk is Moderate.'),
    chunk('DOC-MOCK-ISR-201', 6, 'Procurement', 'Mock supervision report for P-MOCK-002. The pipe supply tender was cancelled when no compliant bids were received and was re-issued.') ] },
  { doc: doc('DOC-MOCK-ISR-202', 'P-MOCK-002', 'Supervision report', 'Mock Implementation Status Report 2 (Rural Water)', '2026-04-15', 11), chunks: [
    chunk('DOC-MOCK-ISR-202', 3, 'Ratings', 'Mock supervision report 2 for P-MOCK-002. Ratings are unchanged. Disbursement is 9 percent of the loan.') ] },
  { doc: doc('DOC-MOCK-ISR-301', 'P-MOCK-003', 'Supervision report', 'Mock Implementation Status Report 1 (Urban Health)', '2026-04-20', 9), chunks: [
    chunk('DOC-MOCK-ISR-301', 3, 'Ratings', 'Mock supervision report for P-MOCK-003. The project is not yet effective; progress toward the objective is rated Satisfactory.') ] },
  { doc: doc('DOC-MOCK-ICR-104', 'P-MOCK-104', 'Completion report', 'Mock Completion Report: Coastal Road D', '2024-06-28', 60), chunks: [
    chunk('DOC-MOCK-ICR-104', 40, 'Section 6 Lessons Learned', 'Mock completion report. Prequalifying bidders for the complex bridge package reduced the number of unresponsive bids and shortened evaluation by about three weeks.') ] },
  { doc: doc('DOC-MOCK-ICR-105', 'P-MOCK-105', 'Completion report', 'Mock Completion Report: Municipal Roads E', '2023-03-31', 55), chunks: [
    chunk('DOC-MOCK-ICR-105', 36, 'Section 6 Lessons Learned', 'Mock completion report. Contract amendments for time were approved late, so liquidated damages could not be applied and two contractors stayed on site without cover.') ] },
  { doc: doc('DOC-MOCK-ICR-106', 'P-MOCK-106', 'Completion report', 'Mock Completion Report: Rail Crossings F', '2025-02-14', 70), chunks: [
    chunk('DOC-MOCK-ICR-106', 47, 'Section 6 Lessons Learned', 'Mock completion report. A single consultant framework for design and supervision reduced procurement time but weakened independent review of design changes.') ] },
  { doc: doc('DOC-MOCK-GUIDE-2', 'GENERAL', 'Guidance', 'Mock Guidance Note: Evaluation and Award', '2024-03-05', 12), chunks: [
    chunk('DOC-MOCK-GUIDE-2', 4, 'Evaluation', 'Mock procurement guidance. The evaluation report should record each bidder against the stated criteria, and the award should be made within the bid validity period.'),
    chunk('DOC-MOCK-GUIDE-2', 8, 'Standstill', 'Mock procurement guidance. A standstill period lets unsuccessful bidders ask for a debrief before the contract is signed.') ] },
  { doc: doc('DOC-MOCK-GUIDE-3', 'GENERAL', 'Guidance', 'Mock Guidance Note: Contract Management and Amendments', '2024-05-20', 16), chunks: [
    chunk('DOC-MOCK-GUIDE-3', 3, 'Amendments', 'Mock procurement guidance. Amendments that change time or value should be recorded with a reason, approved before they take effect and reported with the next supervision report.'),
    chunk('DOC-MOCK-GUIDE-3', 7, 'Milestones', 'Mock procurement guidance. Planned and actual dates for mobilisation and completion should be recorded for every works contract so delays can be seen early.') ] },
  { doc: doc('DOC-MOCK-GUIDE-4', 'GENERAL', 'Guidance', 'Mock Guidance Note: Selecting Consultants', '2024-08-12', 18), chunks: [
    chunk('DOC-MOCK-GUIDE-4', 5, 'Selection methods', 'Mock procurement guidance. Quality-based selection suits assignments where the quality of the advice matters more than cost; the shortlist normally has between three and six firms.') ] },
  { doc: doc('DOC-MOCK-PAD-1', P, 'Appraisal', 'Mock Project Appraisal Document (Road Rehabilitation)', '2024-08-30', 120), chunks: [
    chunk('DOC-MOCK-PAD-1', 22, 'Procurement arrangements', 'Mock appraisal document for P-MOCK-001. Works above the national threshold are procured by open competitive tender; REF-001 and REF-002 are the first two packages.'),
    chunk('DOC-MOCK-PAD-1', 31, 'Implementation risks', 'Mock appraisal document for P-MOCK-001. Land acquisition and late payment to contractors are identified as the main implementation risks.') ] },
  { doc: doc('DOC-MOCK-PLAN-1', P, 'Procurement plan', 'Mock Procurement Plan (Road Rehabilitation)', '2025-01-20', 8), chunks: [
    chunk('DOC-MOCK-PLAN-1', 2, 'Works packages', 'Mock procurement plan for P-MOCK-001. Contracts REF-003 and REF-004 are shopping and limited competitive packages with expected signing in the first half of 2026.'),
    chunk('DOC-MOCK-PLAN-1', 5, 'Consultancies', 'Mock procurement plan for P-MOCK-001. Contract REF-005 covers survey services selected on quality, and REF-006 covers drainage works.') ] },
  { doc: doc('DOC-MOCK-EVAL-1', P, 'Evaluation report', 'Mock Bid Evaluation Report, REF-001', '2025-10-06', 18), chunks: [
    chunk('DOC-MOCK-EVAL-1', 6, 'Summary', 'Mock bid evaluation report for contract REF-001. Three bids were received and opened; the lowest evaluated bid was recommended for award.') ] },
  { doc: doc('DOC-MOCK-ESMP-1', P, 'Safeguards document', 'Mock Environmental and Social Management Plan', '2024-09-02', 44), chunks: [
    chunk('DOC-MOCK-ESMP-1', 12, 'Mitigation', 'Mock safeguards plan for P-MOCK-001. Contractors prepare a site-specific management plan before mobilisation; contract REF-002 requires river protection measures.') ] },
  { doc: doc('DOC-MOCK-CMP-1', P, 'Contract management plan', 'Mock Contract Management Plan', '2025-06-10', 15, 'pending'), chunks: [] },
  { doc: doc('DOC-MOCK-AUD-1', P, 'Audit report', 'Mock Annual Audit Report FY2025', '2025-11-30', 30, 'failed'), chunks: [] },
]
export const extraDocuments = docsAndChunks.map((d) => d.doc)
export const extraChunks = docsAndChunks.flatMap((d) => d.chunks)
const chunkOf = (docId: string) => docsAndChunks.find((d) => d.doc.doc_id === docId)!.chunks[0]!.chunk_id

export const extraCompletionReports = [
  { id: 'ICR-MOCK-104', project_id: 'P-MOCK-104', project_name: 'Mock Coastal Road D', outcome_rating: 'Satisfactory', restructurings: 1, closing_extension_months: 3,
    lessons: [{ section: 'Section 6', text: 'Prequalifying bidders for the complex bridge package shortened evaluation.', chunk_id: chunkOf('DOC-MOCK-ICR-104') }] },
  { id: 'ICR-MOCK-105', project_id: 'P-MOCK-105', project_name: 'Mock Municipal Roads E', outcome_rating: 'Moderately unsatisfactory', restructurings: 2, closing_extension_months: 11,
    lessons: [{ section: 'Section 6', text: 'Late approval of time amendments left contractors without cover.', chunk_id: chunkOf('DOC-MOCK-ICR-105') }] },
  { id: 'ICR-MOCK-106', project_id: 'P-MOCK-106', project_name: 'Mock Rail Crossings F', outcome_rating: 'Moderately satisfactory', restructurings: 1, closing_extension_months: 6,
    lessons: [{ section: 'Section 6', text: 'A single consultant framework weakened independent review of design changes.', chunk_id: chunkOf('DOC-MOCK-ICR-106') }] },
]

// ---------------------------------------------------------------- supervision reports for the two other projects
const report = (project: string, n: number, date: string, prev: string | null, cur: string, disb: number) => ({
  id: `ISR-${project.slice(2)}-${n}`, project_id: project, sequence: n, date, progress_rating_prev: prev, progress_rating: cur,
  implementation_rating: 'S', overall_risk_prev: prev ? 'Moderate' : null, overall_risk: 'Moderate', fiduciary_risk: 'Moderate', disbursed_pct: disb, restructurings: [] as { date: string; note: string }[],
})
export const extraReports = [
  report('P-MOCK-002', 1, '2025-12-01', null, 'S', 4), report('P-MOCK-002', 2, '2026-04-15', 'S', 'S', 9),
  report('P-MOCK-003', 1, '2026-04-20', null, 'S', 1),
]

// ---------------------------------------------------------------- schedule, tender history, sources, governance, conflicts
const sch = (project: string, start: number, rows: readonly (readonly [string, 'Procurement' | 'Works' | 'Supplies' | 'Manpower' | 'Milestone', string, string, number | null])[]) =>
  rows.map(([name, group, s, e, progress_pct], i) => ({ id: `SCH-${project}-${start + i}`, project_id: project, name, group, start: s, end: e, progress_pct }))
export const extraSchedule = sch(P, 6, [
  ['Culvert crew mobilisation', 'Manpower', '2026-08-01', '2026-10-31', null],
  ['Asphalt stock build-up', 'Supplies', '2026-07-15', '2026-12-15', null], ['Lot 2 drainage works', 'Works', '2026-02-02', '2026-10-30', 45],
  ['Lighting retrofit works', 'Works', '2026-10-01', '2027-04-30', null], ['Signage installation', 'Works', '2026-10-15', '2027-01-31', null],
  ['Environmental monitoring crew', 'Manpower', '2026-09-01', '2027-08-31', null], ['Equipment rental call-off', 'Supplies', '2026-06-01', '2026-12-31', 20],
  ['Mid-term review preparation', 'Procurement', '2026-07-01', '2026-08-31', null], ['Closing date review', 'Milestone', '2027-06-30', '2027-06-30', null],
])
export const extraTenderHistory = [
  { id: 'TND-MOCK-009', project_id: P, name: 'Culvert replacement, Lot 1', status: 'awarded', date: '2025-08-19', reason: null, contract_ref: 'REF-011', replaces: null, citation: { ref_type: 'record', ref_id: 'REF-011', label: 'Contract REF-011' } },
  { id: 'TND-MOCK-010', project_id: P, name: 'Culvert replacement, Lot 2', status: 'awarded', date: '2025-09-02', reason: null, contract_ref: 'REF-012', replaces: null, citation: { ref_type: 'record', ref_id: 'REF-012', label: 'Contract REF-012' } },
  { id: 'TND-MOCK-011', project_id: P, name: 'Kerb and drainage works', status: 'cancelled', date: '2025-12-04', reason: 'Bids exceeded the budget by more than 30 percent (mock record).', contract_ref: null, replaces: null, citation: null },
  { id: 'TND-MOCK-012', project_id: P, name: 'Kerb and drainage works (re-issued)', status: 're_tendered', date: '2026-01-19', reason: 'Re-issued with the scope split into two lots.', contract_ref: 'REF-018', replaces: 'TND-MOCK-011', citation: { ref_type: 'record', ref_id: 'REF-018', label: 'Contract REF-018' } },
  { id: 'TND-MOCK-013', project_id: 'P-MOCK-102', name: 'Rural road grading', status: 'cancelled', date: '2021-04-12', reason: 'Bid validity expired before approvals were complete.', contract_ref: null, replaces: null,
    citation: { ref_type: 'chunk', ref_id: 'CH-MOCK-007', label: 'ICR 101 · Section 6' } },
  { id: 'TND-MOCK-014', project_id: 'P-MOCK-102', name: 'Rural road grading (re-issued)', status: 're_tendered', date: '2021-06-30', reason: 'Re-issued with a longer bid validity.', contract_ref: null, replaces: 'TND-MOCK-013',
    citation: { ref_type: 'chunk', ref_id: 'CH-MOCK-007', label: 'ICR 101 · Section 6' } },
  { id: 'TND-MOCK-015', project_id: 'P-MOCK-003', name: 'Clinic refurbishment, Lot 1', status: 'cancelled', date: '2026-04-02', reason: 'Only one bid was received (mock record).', contract_ref: null, replaces: null, citation: null },
  { id: 'TND-MOCK-016', project_id: 'P-MOCK-104', name: 'Bridge package', status: 'awarded', date: '2023-04-18', reason: null, contract_ref: null, replaces: null, citation: { ref_type: 'chunk', ref_id: chunkOf('DOC-MOCK-ICR-104'), label: 'ICR 104 · Section 6' } },
]
export const extraSources = [
  { id: 'SRC-MOCK-5', name: 'Mock procurement plans extract', publisher: 'Mock registry', kind: 'Procurement plans', status: 'registered', last_fetched: null, simulated: false },
  { id: 'SRC-MOCK-6', name: 'Mock guidance notes', publisher: 'Mock registry', kind: 'Guidance', status: 'registered', last_fetched: null, simulated: false },
  { id: 'SRC-MOCK-7', name: 'Mock evaluation reports', publisher: 'Mock registry', kind: 'Evaluation reports', status: 'registered', last_fetched: null, simulated: false },
  { id: 'SRC-MOCK-8', name: 'Mock audit reports', publisher: 'Mock registry', kind: 'Audit reports', status: 'registered', last_fetched: null, simulated: false },
]
export const extraGovernance = [
  { id: 'RO-2021', country: 'RO', year: 2021, wgi: { regulatory_quality: 66, government_effectiveness: 49, control_of_corruption: 52 }, cpia_16: null },
  { id: 'RO-2022', country: 'RO', year: 2022, wgi: { regulatory_quality: 67, government_effectiveness: 51, control_of_corruption: 54 }, cpia_16: null },
  { id: 'EE-2021', country: 'EE', year: 2021, wgi: { regulatory_quality: 89, government_effectiveness: 87, control_of_corruption: 89 }, cpia_16: null },
  { id: 'EE-2022', country: 'EE', year: 2022, wgi: { regulatory_quality: 90, government_effectiveness: 88, control_of_corruption: 90 }, cpia_16: null },
]

// ---------------------------------------------------------------- Work with AI: saved links and their simulated ingestion runs
const LINKS: [string, string, 'reachable' | 'unreachable'][] = [
  ['P-MOCK-001', 'https://documents.worldbank.org/mock/P-MOCK-001/isr-3', 'reachable'],
  ['P-MOCK-001', 'https://finances.worldbank.org/mock/contract-awards', 'reachable'],
  ['P-MOCK-001', 'https://projects.worldbank.org/mock/P-MOCK-001', 'reachable'],
  ['P-MOCK-001', 'https://data.worldbank.org/mock/country/RO', 'reachable'],
  ['P-MOCK-001', 'https://example.org/mock/road-bulletin', 'reachable'],
  ['P-MOCK-001', 'https://documents.worldbank.org/mock/P-MOCK-001/missing', 'unreachable'],
  ['P-MOCK-001', 'https://datacatalog.worldbank.org/mock/gppd', 'reachable'],
  ['P-MOCK-001', 'https://intranet.example.net/mock/plan', 'unreachable'],
  ['P-MOCK-002', 'https://documents.worldbank.org/mock/P-MOCK-002/isr-2', 'reachable'],
  ['P-MOCK-002', 'https://projects.worldbank.org/mock/P-MOCK-002', 'reachable'],
  ['P-MOCK-003', 'https://documents.worldbank.org/mock/P-MOCK-003/isr-1', 'reachable'],
  ['P-MOCK-003', 'https://example.org/mock/clinics', 'reachable'],
]
export const extraSourceLinks = LINKS.map(([project_id, url, reachability], i) => {
  const host = new URL(url).host
  const c = classifySource(host)
  return {
    id: `LNK-SEED-${i + 1}`, project_id, url, host, reachability, checked_at: `2026-05-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
    publisher: c?.publisher ?? null, kind: c?.kind ?? null, added_by_role: i % 3 === 0 ? 'admin' as const : 'planner' as const,
  }
})
export const extraIngestionRuns = extraSourceLinks.filter((_, i) => i % 3 !== 2).map((l, i) => ({
  id: `RUN-SEED-${i + 1}`, project_id: l.project_id, link_id: l.id, ran_at: `2026-05-${String(12 + i).padStart(2, '0')}T11:00:00Z`, simulated: true as const, steps: ingestionSteps(l),
}))

// ---------------------------------------------------------------- feedback and the update log
const FB: [string, 'helpful' | 'not_helpful', string, 'planner' | 'contract_manager' | 'reviewer' | 'admin', 'new' | 'accepted' | 'rejected' | 'edited'][] = [
  ['REC-MOCK-1', 'helpful', '', 'planner', 'accepted'], ['REC-MOCK-1', 'helpful', 'Matches what we saw on Lot 2.', 'contract_manager', 'accepted'],
  ['REC-MOCK-2', 'not_helpful', 'The rating drop is already known to the team.', 'planner', 'new'], ['REC-MOCK-2', 'helpful', '', 'reviewer', 'accepted'],
  ['REC-MOCK-3', 'not_helpful', 'Needs bidder counts; please add data first.', 'planner', 'edited'], ['REC-MOCK-3', 'helpful', '', 'contract_manager', 'new'],
  ['AI-LAYER-spec-P-MOCK-001', 'helpful', '', 'planner', 'new'], ['AI-LAYER-spec-P-MOCK-001', 'not_helpful', 'Performance security range is too wide.', 'reviewer', 'rejected'],
  ['AI-LAYER-link-P-MOCK-001', 'helpful', '', 'admin', 'accepted'], ['AI-LAYER-link-P-MOCK-001', 'not_helpful', 'Unknown host was not explained.', 'planner', 'new'],
  ['AI-LAYER-ingestion-P-MOCK-001', 'helpful', '', 'planner', 'new'], ['AI-LAYER-records-P-MOCK-001', 'not_helpful', 'One link joined the wrong report.', 'contract_manager', 'edited'],
  ['AI-LAYER-retender-P-MOCK-001', 'helpful', '', 'reviewer', 'accepted'], ['AI-LAYER-retender-P-MOCK-001', 'not_helpful', 'Reason text was cut off.', 'planner', 'new'],
  ['AI-LAYER-supplier-P-MOCK-001', 'helpful', '', 'planner', 'rejected'], ['AI-LAYER-schedule-P-MOCK-001', 'helpful', '', 'contract_manager', 'new'],
]
export const extraFeedback = FB.map(([target_id, rating, reason, role, status], i) => ({
  id: `FB-SEED-${i + 1}`, target_id, rating, reason, role, status, created_at: `2026-05-${String(1 + i).padStart(2, '0')}T14:00:00Z`,
}))

type Audit = { id: string; at: string; role: 'planner' | 'contract_manager' | 'reviewer' | 'admin'; action: string; target: string }
const audit: Audit[] = []
const log = (at: string, role: Audit['role'], action: string, target: string) => audit.push({ id: `AUD-SEED-${audit.length + 1}`, at, role, action, target })
for (const e of extraEnrichments) {
  log(e.entered_at, e.entered_by_role, `Entered ${e.field}`, e.contract_ref)
  if (e.status !== 'pending') log(e.entered_at.replace(/T.*/, 'T16:00:00Z'), 'reviewer', `${e.status === 'approved' ? 'Approved' : 'Rejected'} entry`, e.id)
}
for (const a of extraAmendments) {
  log(`${a.date}T09:00:00Z`, 'contract_manager', 'Entered amendment', a.contract_ref)
  if (a.status !== 'pending') log(`${a.date}T15:00:00Z`, 'reviewer', `${a.status === 'approved' ? 'Approved' : 'Rejected'} amendment`, a.id)
}
for (const f of extraFeedback) log(f.created_at, f.role, `Feedback: ${f.rating.replace('_', ' ')}`, f.target_id)
for (const l of extraSourceLinks) log(l.checked_at, l.added_by_role, 'Added source link', `${l.project_id} · ${l.host}`)
for (const r of extraIngestionRuns) log(r.ran_at, 'planner', 'Ran ingestion (simulated)', r.link_id)
for (const p of extraPlans.slice(0, 4)) log('2026-05-20T10:00:00Z', 'planner', 'Saved plan', p.project_id)
export const extraAuditLog = audit.sort((a, b) => a.at.localeCompare(b.at)).map((a, i) => ({ ...a, id: `AUD-SEED-${String(i + 1).padStart(3, '0')}` }))
