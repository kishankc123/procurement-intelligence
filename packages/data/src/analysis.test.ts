import { describe, expect, it } from 'vitest'
import { withDefaults } from './assistant'
import { analyseProject, analyseProjectRisks, chunkIdsIn, findComparableProjects, getDataGaps, RISK_THEMES, scanRiskEvidence, type RiskItem } from './analysis'
import type { Chunk, Contract, Doc, Project, SupervisionReport } from './schemas'

// A small world: three real projects (R1 is the one analysed), one mock project, and the documents and chunks they would have.
const project = (id: string, over: Partial<Project> = {}): Project => ({
  project_id: id, project_name: `Road ${id}`, borrower_country: 'Laos', borrower_country_code: 'LA', region: 'East Asia and Pacific', project_global_practice: 'Transportation',
  approval_date: '2015-01-01', effectiveness_planned: '2015-06-01', effectiveness_actual: '2015-06-01', closing_date_planned: '2020-01-01', closing_date_revised: null, ...over,
} as Project)
const contract = (id: string, ref: string, supplier: string, amount: number, method = 'Request for Bids', category = 'Works'): Contract => ({
  borrower_contract_reference_number: ref, wb_contract_number: ref, project_id: id, supplier, supplier_id: supplier, supplier_country: 'Laos', procurement_category: category,
  procurement_method: method, review_type: 'Prior', supplier_contract_amount_usd: amount, contract_signing_date: '2017-03-01', fiscal_year: 2017, contract_description: 'x',
} as Contract)
const isr = (id: string, n: number, date: string, p: string, i: string, risk: string, disb: number, restructurings: { date: string; note: string }[] = []): SupervisionReport => ({
  id: `ISR-${id}-${n}`, project_id: id, sequence: n, date, progress_rating_prev: null, progress_rating: p, implementation_rating: i, overall_risk_prev: null, overall_risk: risk, fiduciary_risk: 'Moderate', disbursed_pct: disb, restructurings,
} as unknown as SupervisionReport)
const doc = (id: string, docId: string, type: string, parse = 'parsed', date = '2019-01-01'): Doc => ({ doc_id: docId, project_id: id, type, title: `${type} ${docId}`, date, pages: 5, parse_status: parse })
const chunk = (chunkId: string, docId: string, text: string, embedded = 'none'): Chunk => ({ chunk_id: chunkId, doc_id: docId, page: 1, section_path: 'Text', strategy: 's', token_count: 10, text, embedding_status: embedded })

const db = withDefaults({
  meta: { dataset_label: 'test', as_of_date: '2026-05-31' } as never,
  projects: [
    // R1: closed 18 months late; ratings slip to MU; disbursement behind; one dominant supplier; direct selection on a third of the value
    project('P000001', { closing_date_revised: '2021-06-30' }),
    // R2: very like R1 and has a completion report
    project('P000002', { closing_date_planned: '2020-06-01' }),
    // R3: nothing like it: another country, consultants, much bigger
    project('P000003', { borrower_country: 'Peru', borrower_country_code: 'PE', region: 'Latin America', closing_date_planned: '2030-01-01' }),
    project('P-MOCK-001', { project_global_practice: 'Transport' }),
  ],
  contracts: [
    contract('P000001', 'A-1', 'Alpha Ltd', 7_000_000), contract('P000001', 'A-2', 'Beta Ltd', 2_000_000, 'Direct Selection'), contract('P000001', 'A-3', 'Gamma', 1_000_000, 'Direct Selection', 'Consultant Services'),
    contract('P000002', 'B-1', 'Delta', 6_000_000), contract('P000002', 'B-2', 'Eps', 3_000_000), contract('P000002', 'B-3', 'Zeta', 1_000_000, 'Direct Selection'),
    contract('P000003', 'C-1', 'Eta', 90_000_000, 'Individual Consultant Selection', 'Consultant Services'),
    contract('P-MOCK-001', 'M-1', 'Mock Co', 500, 'Open competitive'),
  ],
  supervision_reports: [
    isr('P000001', 1, '2016-01-01', 'S', 'S', 'Moderate', 5), isr('P000001', 2, '2017-06-01', 'S', 'S', 'Moderate', 15),
    isr('P000001', 3, '2018-06-01', 'MS', 'MS', 'Substantial', 30, [{ date: '2018-03-01', note: 'Level 2' }]),
    isr('P000001', 4, '2019-09-01', 'MU', 'MU', 'Substantial', 40, [{ date: '2018-03-01', note: 'Level 2' }, { date: '2019-05-01', note: 'Level 2' }]),
    isr('P000002', 1, '2016-01-01', 'S', 'S', 'Moderate', 10), isr('P000002', 2, '2019-06-01', 'S', 'S', 'Moderate', 90),
  ],
  documents: [
    ...[1, 2, 3, 4, 5].map((n) => doc('P000001', `D1-ISR${n}`, 'Implementation Status and Results Report')), // five report documents, four of them in the series
    doc('P000001', 'D1-PAD', 'Project Appraisal Document', 'pending'), doc('P000001', 'D1-PLAN', 'Procurement Plan'),
    doc('P000001', 'D1-ISRX', 'Implementation Status and Results Report', 'failed'),
    doc('P000002', 'D2-ICR', 'Implementation Completion and Results Report'), doc('P000002', 'D2-ISR', 'Implementation Status and Results Report'),
    doc('P000003', 'D3-X', 'Guidance'),
  ],
  chunks: [
    chunk('CH-1', 'D2-ICR', 'Procurement delays and re-bidding followed when the bidding documents were incomplete. The works were of good quality.', 'embedded'),
    chunk('CH-2', 'D2-ICR', 'The new office building was inaugurated by the minister. Procurement was completed on schedule and the procurement team was praised.'),
    chunk('CH-3', 'D1-ISR2', 'Land acquisition problems and resettlement compensation delays slowed the section 3 works. The contractor mobilised late.'),
    chunk('CH-4', 'D1-ISR3', 'Disbursement 12 34 56 78 90 11 22 33 44 55 66 77 88 99 100 delay 1 2 3 4 5 6 7 8 9 procurement delay 10 11 12'),
    chunk('CH-5', 'D1-ISR3', 'ESMP RAP ICR PMU GRM Resettlement Policy Framework Land Acquisition Safeguards Delays Government Of Laos Ministry Of Public Works And Transport Environmental'),
    chunk('CH-6', 'D1-ISR4', 'The closing date was extended by 18 months to complete the remaining works, and the project was restructured twice.'),
    chunk('CH-7', 'D1-ISR4', 'Slow disbursement was caused by delays in contractor payments and insufficient counterpart funds.'),
  ],
  amendments: [], completion_reports: [], tender_notices: [{ id: 'T1', project_id: 'P000001', reference: 'r', description: 'd', category: 'Works', method: 'm', posted: '2017-01-01', deadline: null, status: 'Closed', organization: 'o', url: 'u' }] as never,
  plan_packages: [{ id: 'PP1', project_id: 'P000001', plan_doc: 'D1-PLAN', plan_date: '2016-01-01', ref_no: 'W-1', description: 'Section works', category: 'Civil Works', estimated_cost: '5', cost_unit: 'USD million', packages: null, method: 'NCB', review: 'Prior', expected_bid_opening: 'Mar. 2017', source_url: 'u' }] as never,
})

describe('getDataGaps', () => {
  const g = getDataGaps(db, 'P000001') as Exclude<ReturnType<typeof getDataGaps>, { error: string }>
  const item = (name: RegExp) => g.items.find((i) => name.test(i.item))!

  it('names three different kinds of absence, and says what each means', () => {
    expect(Object.keys(g.meaning).sort()).toEqual(['could_not_verify', 'not_found', 'not_in_public_sources', 'not_retrieved'])
    expect(item(/Procurement durations/)).toMatchObject({ status: 'not_in_public_sources', limits: expect.stringContaining('cannot be calculated') })
    expect(item(/amendments/i).status).toBe('not_in_public_sources')
    expect(item(/Tender clauses/)).toMatchObject({ status: 'not_in_public_sources' })
    expect(item(/appraisal/i)).toMatchObject({ status: 'not_retrieved' })
    expect(item(/Documents whose text could not be downloaded/)).toMatchObject({ status: 'not_retrieved' })
    expect(item(/parser could not read/)).toMatchObject({ status: 'could_not_verify', detail: expect.stringContaining('1 of 6') })
  })
  it('says what is available, and how each gap limits the analysis and what to do', () => {
    expect(item(/Contract awards/)).toMatchObject({ status: 'available', detail: expect.stringContaining('3 contracts') })
    expect(item(/Supervision reports$/).status).toBe('available')
    expect(item(/Procurement plan packages/)).toMatchObject({ status: 'available', limits: expect.stringContaining('first rows') })
    for (const i of g.items.filter((x) => x.status !== 'available' && x.stage !== 'general')) expect(i.limits, i.item).toBeTruthy()
    expect(g.counts.not_in_public_sources).toBeGreaterThanOrEqual(3)
    expect(g.counts.available + g.counts.not_in_public_sources + g.counts.not_retrieved + g.counts.could_not_verify + g.counts.not_found).toBe(g.items.length)
  })
  it('tells a closed project with no completion report from one that may not have one yet, and never invents lessons', () => {
    expect(item(/Completion report$/)).toMatchObject({ status: 'not_found', detail: expect.stringContaining('has passed') })
    expect(JSON.stringify(g)).not.toMatch(/lesson learned that/i)
    const active = getDataGaps(db, 'P000003') as typeof g
    expect(active.items.find((i) => /Completion report$/.test(i.item))!.detail).toContain('has not passed')
  })
  it('separates "no contract rows in the public list" from a stored project that lacks them, and says embeddings are missing', () => {
    const none = getDataGaps(withDefaults({ projects: [project('P000009')] }), 'P000009') as typeof g
    expect(none.items.find((i) => i.item === 'Contract awards')).toMatchObject({ status: 'not_in_public_sources', alternative: expect.stringContaining('Comparable') })
    expect(item(/Search by meaning/)).toMatchObject({ status: 'not_retrieved' })
  })
  it('lists lessons as available only when they are extracted, and as not retrieved when only the text is stored', () => {
    const d2 = getDataGaps(db, 'P000002') as typeof g
    expect(d2.items.find((i) => /Completion report lessons/.test(i.item))).toMatchObject({ status: 'not_retrieved', alternative: expect.stringContaining('text') })
    const withLessons = withDefaults({ ...db, completion_reports: [{ id: 'ICR-2', project_id: 'P000002', project_name: 'x', outcome_rating: 'S', restructurings: 0, closing_extension_months: 0, lessons: [{ section: 's', text: 'a lesson', chunk_id: 'CH-1' }] }] })
    expect((getDataGaps(withLessons, 'P000002') as typeof g).items.find((i) => /Completion report lessons/.test(i.item))).toMatchObject({ status: 'available', evidence: [{ id: 'CH-1' }] })
  })
  it('answers for an unknown project with an error', () => { expect(getDataGaps(db, 'P999999')).toEqual({ error: 'No project with id P999999.' }) })
})

describe('findComparableProjects', () => {
  const r = findComparableProjects(db, { project_id: 'P000001' }) as { comparables: { project_id: string; comparability: string; why_relevant: string[]; differences_that_limit_use: string[]; partly_similar: string[] }[]; limits: string[]; how_ranked: string; candidates_considered: number }

  it('ranks a project like this one above one that is not, and says why each is or is not relevant', () => {
    expect(r.comparables.map((c) => c.project_id)).toEqual(['P000002', 'P000003'])
    const [near, far] = r.comparables
    expect(near!.comparability).toBe('closer')
    expect(near!.why_relevant.join(' ')).toMatch(/country: yours Laos, this one Laos/)
    expect(near!.why_relevant.join(' ')).toMatch(/main procurement category/)
    expect(far!.comparability).toBe('limited')
    expect(far!.differences_that_limit_use.join(' ')).toMatch(/country: yours Laos, this one Peru/)
    expect(far!.differences_that_limit_use.join(' ')).toMatch(/scale.*×/)
  })
  it('never mixes real and mock projects, and states its limits and its rule instead of a score', () => {
    expect(r.candidates_considered).toBe(2)
    expect(JSON.stringify(r)).not.toContain('P-MOCK')
    expect(r.limits.join(' ')).toMatch(/not.*statistical|nothing here supports a statistical conclusion/)
    expect(r.limits.join(' ')).toMatch(/same sector/)
    expect(r.how_ranked).toMatch(/not a statistical score/)
    expect(JSON.stringify(r)).not.toMatch(/"(score|similarity|probability)"/)
  })
  it('uses sector as a dimension only when the stored projects differ in it', () => {
    const mixed = withDefaults({ ...db, projects: [...db.projects, project('P000004', { project_global_practice: 'Water' })] })
    const out = findComparableProjects(mixed, { project_id: 'P000001' }) as typeof r
    expect(out.comparables.find((c) => c.project_id === 'P000004')!.differences_that_limit_use.join(' ')).toMatch(/sector: yours transportation, this one water/)
    expect(out.limits.join(' ')).not.toMatch(/same sector/)
  })
  it('compares a procurement described in a sentence on the few things given, and cannot call anything "closer"', () => {
    const own = findComparableProjects(db, { sector: 'transportation', country: 'Laos', category: 'Works', value_usd: 11_000_000 }) as typeof r
    expect(own.comparables.every((c) => c.comparability !== 'closer')).toBe(true)
    expect(own.comparables[0]!.project_id).toMatch(/P00000[12]/)
    expect(own.how_ranked).toMatch(/"closer" cannot be reached/)
  })
  it('reports a project with no contracts as not comparable on scale rather than as different, and answers for unknown ids', () => {
    expect(findComparableProjects(db, { project_id: 'P999999' })).toEqual({ error: 'No project with id P999999.' })
    const alone = findComparableProjects(withDefaults({ projects: [project('P000001')] }), { project_id: 'P000001' })
    expect(alone).toEqual({ comparables: 'missing: no other stored project of this kind to compare with.' })
  })
})

describe('analyseProjectRisks', () => {
  const r = analyseProjectRisks(db, 'P000001') as { risks: RiskItem[]; framing: string; project_status: string; priority_rule: string; not_assessed: string[] }
  const byId = (s: string) => r.risks.find((x) => x.id.endsWith(s))

  it('finds the signals the records support, each with evidence that exists in the data', () => {
    expect(r.risks.map((x) => x.id.split('-').at(-1)).sort()).toEqual(['competition', 'concentration', 'disbursement', 'extension', 'overall', 'rating', 'restructuring'].sort())
    const reportIds = new Set(db.supervision_reports.map((x) => x.id)), refs = new Set(db.contracts.map((c) => c.borrower_contract_reference_number))
    for (const x of r.risks) {
      expect(x.evidence.length, x.id).toBeGreaterThan(0)
      for (const e of x.evidence) expect(e.type === 'record' ? reportIds.has(e.id) || refs.has(e.id) || e.id === 'P000001' : true, e.id).toBe(true)
      expect(x.uncertain.length, x.id).toBeGreaterThan(0)
      expect(x.reduce_or_investigate.length, x.id).toBeGreaterThan(0)
      expect(['documented', 'derived']).toContain(x.basis)
    }
  })
  it('orders by the stated rule, and applies it', () => {
    expect(byId('rating')).toMatchObject({ attention: 'higher', statement: expect.stringContaining('MU') })
    expect(byId('disbursement')!.attention).toBe('higher')
    expect(byId('overall')!.attention).toBe('moderate')
    const order = r.risks.map((x) => ({ higher: 0, moderate: 1, lower: 2 })[x.attention])
    expect(order).toEqual([...order].sort())
    expect(r.priority_rule).toMatch(/not a probability/)
  })
  it('raises a moderate signal to higher when another signal on the same theme is at least moderate', () => {
    expect(byId('extension')).toMatchObject({ attention: 'higher', statement: expect.stringContaining('18 months') })
    expect(byId('restructuring')).toMatchObject({ attention: 'higher', statement: expect.stringContaining('2 restructurings') })
  })
  it('states the share and the less competitive methods without calling it a problem, and flags what it cannot know', () => {
    expect(byId('concentration')!.statement).toContain('70%')
    expect(byId('competition')!.statement).toMatch(/30%.*Direct Selection/)
    expect(byId('competition')!.uncertain.join(' ')).toMatch(/does not show how a selection was justified/)
    expect(r.not_assessed.join(' ')).toMatch(/amendments are not published/)
  })
  it('attaches the project\'s own document sentences on the same theme, as documented mentions that exist', () => {
    const support = r.risks.flatMap((x) => x.document_support ?? [])
    expect(support.length).toBeGreaterThan(0)
    const known = new Set(db.chunks.map((c) => c.chunk_id))
    for (const s of support) expect(known.has(s.chunk_id)).toBe(true)
    expect(byId('disbursement')!.document_support![0]!.chunk_id).toBe('CH-7')
    expect(byId('extension')!.document_support![0]!.chunk_id).toBe('CH-6')
  })
  it('says the project has closed, so these are documented difficulties and not live risks; an open project is framed as signals to follow up', () => {
    expect(r.project_status).toMatch(/closed/)
    expect(r.framing).toMatch(/not live risks/)
    expect((analyseProjectRisks(db, 'P000003') as typeof r).framing).toMatch(/still running/)
  })
  it('says what could not be assessed when records are missing, instead of reporting "no risk"', () => {
    const bare = analyseProjectRisks(withDefaults({ projects: [project('P000007')] }), 'P000007') as unknown as { risks: string; not_assessed: string[] }
    expect(bare.risks).toMatch(/^none:.*not evidence of low risk/)
    expect(bare.not_assessed.join(' ')).toMatch(/no supervision reports/)
    expect(bare.not_assessed.join(' ')).toMatch(/no contract awards/)
    expect(analyseProjectRisks(db, 'P999999')).toEqual({ error: 'No project with id P999999.' })
  })
  it('uses recorded amendments only where they exist (the mock project)', () => {
    const withAmend = withDefaults({ ...db, amendments: [{ id: 'AMD-1', contract_ref: 'M-1', type: 'Time extension', date: '2021-01-01', days_added: 30, value_change_usd: 100, reason: 'Land acquisition delays', status: 'approved', entered_by_role: 'contract_manager' }] as never })
    const m = analyseProjectRisks(withAmend, 'P-MOCK-001') as typeof r
    expect(m.risks.find((x) => x.id.endsWith('amendments'))).toMatchObject({ basis: 'documented', statement: expect.stringContaining('30 days') })
  })
})

describe('scanRiskEvidence', () => {
  const scan = scanRiskEvidence(db, { scope: 'real', themes: ['procurement_delay', 'land_and_safeguards', 'disbursement_and_funds'] }) as { themes: { theme: string; passages: { chunk_id: string; excerpt: string; document_type: string }[]; projects: { project_id: string; mentions: number }[]; passages_matching: number }[]; caution: string; chunks_scanned: number }
  const theme = (id: string) => scan.themes.find((t) => t.theme === id)!

  it('keeps a sentence only when it names the topic and a problem with it, and quotes that sentence', () => {
    expect(theme('procurement_delay').passages.map((p) => p.chunk_id)).toEqual(['CH-1'])
    expect(theme('procurement_delay').passages[0]!.excerpt).toMatch(/^Procurement delays and re-bidding followed when the bidding documents were incomplete\.?$/)
    // CH-2 mentions procurement only in praise, so it is not a hit
    expect(theme('procurement_delay').passages.some((p) => p.chunk_id === 'CH-2')).toBe(false)
  })
  it('skips tables and acronym lists, and reports how many chunks it read', () => {
    const all = scan.themes.flatMap((t) => t.passages.map((p) => p.chunk_id))
    expect(all).not.toContain('CH-4')
    expect(all).not.toContain('CH-5')
    expect(scan.chunks_scanned).toBe(5)
  })
  it('counts mentions per project and puts completion reports first', () => {
    expect(theme('land_and_safeguards').passages[0]!.chunk_id).toBe('CH-3')
    expect(theme('disbursement_and_funds').projects).toEqual([{ project_id: 'P000001', name: 'Road P000001', mentions: 1, document_types: ['Implementation Status and Results Report'] }])
    const icrFirst = scanRiskEvidence(db, { scope: 'real', themes: ['procurement_delay', 'land_and_safeguards'], keyword: 'works' }) as typeof scan
    expect(icrFirst.themes.find((t) => t.theme === 'custom')!.passages[0]!.document_type).toMatch(/Completion/)
  })
  it('warns that a mention is not a cause or a frequency, and never mixes in mock projects', () => {
    expect(scan.caution).toMatch(/not how often it happened/)
    expect(scan.caution).toMatch(/solved/)
    expect(JSON.stringify(scan)).not.toContain('M-1')
    expect(scanRiskEvidence(db, { scope: 'real', project_ids: ['P-MOCK-001'] })).toEqual({ themes: 'missing: no stored project matches the request.' })
  })
  it('lists the themes it knows, and limits passages per theme', () => {
    expect(RISK_THEMES.map((t) => t.id)).toEqual(expect.arrayContaining(['procurement_delay', 'land_and_safeguards', 'cost_and_variations']))
    const one = scanRiskEvidence(db, { scope: 'real', limit_per_theme: 1 }) as typeof scan
    for (const t of one.themes) expect(t.passages.length).toBeLessThanOrEqual(1)
  })
})

describe('analyseProject', () => {
  const a = analyseProject(db, 'P000001') as Record<string, any>
  it('gathers context, the four stages, ranked risks, data gaps and comparables in one answer', () => {
    expect(a.project).toMatchObject({ id: 'P000001', sector: 'Transportation', stage_of_record: 'supervised' })
    expect(Object.keys(a.stages)).toEqual(['plans_executed', 'tenders_published', 'monitoring', 'lessons_learned'])
    expect(a.stages.plans_executed.planned.basis).toBe('documented')
    expect(a.stages.monitoring.observed.text).toMatch(/Progress rating S→MU/)
    expect(a.stages.lessons_learned.observed).toMatch(/^missing: no completion report/)
    expect(a.stages.tenders_published.planned).toMatch(/^none: no tender clauses/)
    expect(a.risks.length).toBeGreaterThan(0)
    expect(a.data_gaps.counts.not_in_public_sources).toBeGreaterThan(0)
    expect(a.comparable_projects[0]).toMatchObject({ project_id: 'P000002', comparability: 'closer' })
    expect(a.comparable_projects[0].why_relevant.length).toBeGreaterThan(0)
  })
  it('keeps general procurement logic apart from evidence, and labels how a fact is known', () => {
    expect(a.stage_links_to_check).toMatch(/NOT evidence about this project/)
    expect(a.how_to_read).toMatch(/planned.*completed.*observed.*suggested/)
  })
  it('every passage it cites exists in the data', () => {
    const known = new Set(db.chunks.map((c) => c.chunk_id))
    for (const id of chunkIdsIn(a)) expect(known.has(id), id).toBe(true)
  })
  it('answers for an unknown project with an error', () => { expect(analyseProject(db, 'P999999')).toEqual({ error: 'No project with id P999999.' }) })
})
