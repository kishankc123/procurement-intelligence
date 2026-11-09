// Offline fixtures for the pipeline tests: a made-up project (P999001) served by a fake `PipelineIo`. Nothing here is stored in the app or
// shown as data. The supervision report texts are trimmed from real P158504 reports so the real parser is exercised; the rest is invented.
import { HttpError, type PipelineIo } from './pipeline'
import type { PlanExtractor } from './planRows'

export const FIXTURE_ID = 'P999001'
const ISR_NEW = `The World Bank Implementation Status & Results Report ... FY 2017 | Seq No: 17 | Archived on 29-Sep-2025 | ISR05203
3. OVERALL RATINGS Name Previous Current Progress towards achievement of PDO Satisfactory Satisfactory Overall Implementation Progress (IP) Moderately Satisfactory Satisfactory Overall Risk Rating Moderate Moderate Sep 30, 2025 Page 1 of 9
5. SYSTEMATIC OPERATIONS RISK-RATING TOOL Fiduciary Substantial Moderate Moderate Overall Substantial Moderate Moderate Sep 30, 2025 Page 2 of 9
7. DATA ON FINANCIAL PERFORMANCE 7.2 Disbursements (by loan) Loan/Credit/TF Status Original Revised Cancelled Disbursed Undisbursed % Disbursed IDA-59200 Effective 25.00 24.72 0.00 24.83 0.00 99.99% IDA-65150 Effective 25.00 24.92 0.00 24.54 0.00 99.81% 7.3 Key Dates (by loan) Loan/Credit/TF Status Approval Signing Effectiveness Orig. Closing Rev. Closing IDA-59200 Effective 13-Dec-2016 07-Feb-2017 23-Mar-2017 31-Aug-2022 31-Dec-2025 Sep 30, 2025 Page 8 of 9
9. RESTRUCTURING HISTORY Restructuring Level 2 Approved on 09-Oct-2018 Restructuring Level 2 Approved on 09-May-2024 10. ASSOCIATED OPERATION(S) There are no associated operations Page 9 of 9`
const ISR_MID = `FY 2017 | Seq No: 12 | ISR1 Progress towards achievement of PDO Satisfactory Satisfactory Overall Implementation Progress (IP) Moderately Satisfactory Moderately Satisfactory Overall Risk Rating Substantial Substantial
Loan/Credit/TF Status Currency Original Revised Cancelled Disbursed Undisbursed % Disbursed P158504 IDA-59200 Effective USD 25.00 25.00 0.00 21.73 3.06 88% P158504 IDA-65150 Effective USD 25.00 25.00 0.00 7.94 16.64 32% Key Dates (by loan) Project Loan/Credit/TF Status Approval Date Signing Date Effectiveness Date Orig. Closing Date Rev. Closing Date P158504 IDA-59200 Effective 13-Dec-2016 07-Feb-2017 23-Mar-2017 31-Aug-2022 31-Dec-2023`
const ISR_OLD = `Seq No: 1 | ARCHIVED on 28-Apr-2017 Key Dates Key Project Dates Bank Approval Date:13-Dec-2016 Effectiveness Date:23-Mar-2017 Planned Mid Term Review Date:15-Oct-2018 Actual Mid-Term Review Date:-- Original Closing Date:31-Aug-2022 Revised Closing Date:31-Aug-2022
Progress towards achievement of PDO -- Satisfactory Overall Implementation Progress (IP) -- Satisfactory Overall Risk Rating -- Substantial
Loan/Credit/TF Status Currency Original Revised Cancelled Disbursed Undisbursed Disbursed P158504 IDA-59200 Effective XDR 18.00 18.00 0.00 0.00 18.00 0% Key Dates (by loan)`
const LONG = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i + 1} describes how the works were procured, supervised and paid for under the fixture project.`).join(' ')

const contractRow = (project: string, n: number) => ({
  borrower_contract_reference_number: `REF-${project}-${n}`, wb_contract_number: `WB-${n}`, project_id: project, supplier: n % 2 ? 'Alpha Roads Ltd' : 'Beta Works JV',
  supplier_id: n % 3 ? `S${n}` : null, supplier_country: 'Laos', procurement_category: 'Works', procurement_method: 'Open competitive', review_type: 'Prior',
  supplier_contract_amount_usd: 100000 * n, contract_signing_date: `${10 + (n % 10)}-Jan-2018`, fiscal_year: 2018, contract_description: `Road lot ${n}`,
  project_global_practice: 'Transport', borrower_country: 'Lao PDR', borrower_country_code: 'LA', region: 'East Asia and Pacific',
})

/** 2,500 records in pages of 1,000: three pages, with the fixture project's three contracts on pages 0 and 2. Page size is passed to the pipeline as 1000. */
export const CONTRACT_PAGES: Record<number, { count: number; data: ReturnType<typeof contractRow>[] }> = {
  0: { count: 2500, data: [contractRow(FIXTURE_ID, 1), contractRow('P000001', 2), contractRow(FIXTURE_ID, 3)] },
  1: { count: 2500, data: [contractRow('P000002', 4)] },
  2: { count: 2500, data: [contractRow(FIXTURE_ID, 5)] },
}

export const FIXTURE_DOCS = {
  documents: {
    d1: { id: '1', docty: 'Implementation Status and Results Report', docdt: '2025-09-29T00:00:00Z', display_title: 'Implementation Status and Results Report 17', txturl: 'https://documents.worldbank.org/t/1.txt' },
    d2: { id: '2', docty: 'Implementation Status and Results Report', docdt: '2020-05-01T00:00:00Z', display_title: 'Implementation Status and Results Report 12', txturl: 'https://documents.worldbank.org/t/2.txt' },
    d3: { id: '3', docty: 'Implementation Status and Results Report', docdt: '2017-04-28T00:00:00Z', display_title: 'Implementation Status and Results Report 1', txturl: 'https://documents.worldbank.org/t/3.txt' },
    d4: { id: '4', docty: 'Implementation Status and Results Report', docdt: '2019-01-01T00:00:00Z', display_title: 'Implementation Status and Results Report (unreadable)', txturl: 'https://documents.worldbank.org/t/4.txt' },
    d5: { id: '5', docty: 'Implementation Completion and Results Report', docdt: '2024-06-30T00:00:00Z', display_title: 'Implementation Completion and Results Report', txturl: 'https://documents.worldbank.org/t/5.txt' },
    d6: { id: '6', docty: 'Project Appraisal Document', docdt: '2016-11-01T00:00:00Z', display_title: 'Project Appraisal Document', txturl: 'https://documents.worldbank.org/t/6.txt' },
    d7: { id: '7', docty: 'Procurement Plan', docdt: '2018-03-01T00:00:00Z', display_title: 'Procurement Plan', txturl: 'https://documents.worldbank.org/t/7.txt' },
    d8: { id: '8', docty: 'Procurement Plan', docdt: '2017-03-01T00:00:00Z', display_title: 'Procurement Plan (older)', txturl: 'https://documents.worldbank.org/t/8.txt' },
    d9: { id: '9', docty: 'Aide Memoire', docdt: '2019-03-01T00:00:00Z', display_title: 'Aide Memoire', txturl: 'https://documents.worldbank.org/t/9.txt' },
  },
}

/** A plan with a package table the way the World Bank's plan documents lay it out (wrapped cells, columns interleaved). */
export const PLAN_TEXT = `Procurement Plan for the Fixture Road Project. General information follows. ${LONG(6)}
Ref. No. Description Estimated Cost (USD million) Method Review Expected Bid Opening Date
Civil Works
CW-FIX-01 Rehabilitation of Road Section A, 12 km 1.250 NCB Prior Mar. 2019
CW-FIX-02 Rehabilitation of Road Section B, 18 km 2.300 ICB Prior Jun. 2019
Goods
GO-FIX-01 Supply of road signs and markings 0.150 Shopping Post Aug. 2019
`

export const FIXTURE_TEXTS: Record<string, string> = {
  '1': ISR_NEW, '2': ISR_MID, '3': ISR_OLD, '4': 'This report has no table the parser can read.', '5': `1. PROJECT CONTEXT ${LONG(60)} 2. LESSONS LEARNED ${LONG(40)}`,
  '7': PLAN_TEXT, '8': `Older procurement plan with no package table. ${LONG(10)}`,
}

/** What the Procurement Notices API returns for the fixture project: two tenders, one award notice (not a tender), and contact details that must not be copied. */
export const FIXTURE_NOTICES = { total: 3, procnotices: [
  { id: 'OP001', notice_type: 'Invitation for Bids', submission_date: '2019-02-10', submission_deadline_date: '2019-04-01', notice_status: 'Published', bid_reference_no: 'CW-FIX-01', bid_description: 'Rehabilitation of Road Section A', procurement_group: 'CW', procurement_method_name: 'Request for Bids', contact_organization: 'Ministry of Works', contact_name: 'Jane Person', contact_email: 'jane@example.org', contact_phone: '+1 555 0100' },
  { id: 'OP002', notice_type: 'Invitation for Bids', submission_date: '2019-05-20', notice_status: 'Closed', bid_reference_no: 'GO-FIX-01', bid_description: 'Supply of road signs', procurement_group: 'GO', procurement_method_name: 'Shopping', contact_organization: ' ' },
  { id: 'OP003', notice_type: 'Contract Award', submission_date: '2019-09-01', bid_description: 'Award of Section A' },
] }

export const FIXTURE_PROJECT = { projects: { [FIXTURE_ID]: {
  id: FIXTURE_ID, project_name: 'Fixture   Road Project', countryname: ['Lao PDR'], countrycode: ['LA'], regionname: 'East Asia and Pacific', status: 'Closed',
  boardapprovaldate: '2016-12-13T00:00:00Z', closingdate: '2025-12-31T00:00:00Z', mjsector: [{ Name: 'Transport' }],
} } }

/** A fake network and cache. `calls` lists every URL that was fetched, so a test can see what the cache saved. */
/** `status` makes the text of the given documents (by id) fail with that HTTP status. */
export function fixtureIo(over: { fail?: (url: string) => boolean; status?: Record<string, number>; notices?: unknown; noticesStatus?: number } = {}): PipelineIo & { calls: string[]; store: Map<string, unknown> } {
  const calls: string[] = []
  const store = new Map<string, unknown>()
  return {
    calls, store,
    async getJson(url) {
      calls.push(url)
      if (over.fail?.(url)) throw new Error('network down')
      if (url.includes('/api/v2/projects') && url.includes('id=')) return FIXTURE_PROJECT
      if (url.includes('/api/v3/wds')) return FIXTURE_DOCS
      if (url.includes('/procnotices')) { if (over.noticesStatus) throw new HttpError(over.noticesStatus, `${over.noticesStatus} refused`); return over.notices ?? FIXTURE_NOTICES }
      const skip = Number(/skip=(\d+)/.exec(url)?.[1])
      if (url.includes('apiservice')) return CONTRACT_PAGES[skip / 1000]
      throw new Error(`unexpected url ${url}`)
    },
    async getText(url) {
      calls.push(url)
      const id = /\/t\/(\d+)\.txt/.exec(url)?.[1] ?? ''
      if (over.status?.[id]) throw new HttpError(over.status[id]!, `${over.status[id]} refused`)
      const text = FIXTURE_TEXTS[id]
      if (text === undefined) throw new Error(`no text for ${url}`)
      return text
    },
    cache: { get: (k) => store.get(k) as never, put: (k, v) => { store.set(k, v) } },
  }
}

/** A deterministic stand-in for the embedding model: the same text always gives the same vector, and texts that share words are closer. */
export function fakeEmbedder(dimensions = 16) {
  const calls: number[] = []
  return {
    calls, model: 'fake-embedding', dimensions, usdPer1MTokens: 0.02,
    async embed(texts: string[]) {
      calls.push(texts.length)
      const vectors = texts.map((t) => {
        const v = new Array<number>(dimensions).fill(0)
        for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) { let h = 7; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 100003; v[h % dimensions]! += 1 }
        return v
      })
      return { vectors, tokens: texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0) }
    },
  }
}

/**
 * A stand-in for the model that reads a plan table: it returns the three real rows of PLAN_TEXT and one row the text does not contain, which the
 * pipeline must drop. `calls` lists the slices it was given.
 */
export function fakePlanExtractor(): PlanExtractor & { calls: string[] } {
  const calls: string[] = []
  return {
    calls, model: 'fake-plan-model',
    async extract(_projectId, slice) {
      calls.push(slice)
      const row = (ref_no: string, description: string, estimated_cost: string, method: string, review: string, bid: string, category: string) =>
        ({ ref_no, description, category, estimated_cost, packages: null, method, review, expected_bid_opening: bid })
      return { tokens: 1200, data: { cost_unit: 'USD million', packages: [
        row('CW-FIX-01', 'Rehabilitation of Road Section A, 12 km', '1.250', 'NCB', 'Prior', 'Mar. 2019', 'Civil Works'),
        row('CW-FIX-02', 'Rehabilitation of Road Section B, 18 km', '2.300', 'ICB', 'Prior', 'Jun. 2019', 'Civil Works'),
        row('CW-FAKE-99', 'Construction of a bridge that is not in the plan', '9.999', 'ICB', 'Prior', 'Jan. 2020', 'Civil Works'),
        row('GO-FIX-01', 'Supply of road signs and markings', '0.150', 'Shopping', 'Post', 'Aug. 2019', 'Goods'),
      ] } }
    },
  }
}
