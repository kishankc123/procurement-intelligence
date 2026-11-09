// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fakePlanExtractor, PLAN_TEXT } from './fixtures'
import { groundRows, MAX_ROWS, parsePlanExtract, partsInOrder, planRequest, readPlanPackages, tableStart, type PlanDoc } from './planRows'
import { memoryStore, storeCache } from './store'

const doc: PlanDoc = { id: '7', docdt: '2018-03-01T00:00:00Z', txturl: 'https://documents.worldbank.org/t/7.txt', pdfurl: 'https://documents.worldbank.org/p/7.pdf' }

describe('reading a plan table', () => {
  it('finds where the package table starts, and says -1 when there is none', () => {
    expect(tableStart(PLAN_TEXT)).toBe(PLAN_TEXT.indexOf('Ref. No.'))
    expect(tableStart('A plan with no table. Ref. is mentioned once, with Description and Cost but few numbers.')).toBe(-1)
    expect(tableStart('')).toBe(-1)
  })
  it('matches a reference whose wrapped parts appear in order and close together', () => {
    expect(partsInOrder('CW-FIX-01 and more', 'CW-FIX-01')).toBe(true)
    expect(partsInOrder('CW- some wrapped cell FIX- other cell 01', 'CW-FIX-01')).toBe(true)
    expect(partsInOrder('FIX-01 CW', 'CW-FIX-01')).toBe(false)
    expect(partsInOrder('CW ' + 'x'.repeat(600) + ' FIX 01', 'CW-FIX-01')).toBe(false)
    expect(partsInOrder('anything', '1.')).toBe(false)
  })
  it('keeps only rows the text backs, completes a cut cost and drops a cut date', async () => {
    const slice = PLAN_TEXT
    const base = { category: null, packages: null, method: 'NCB', review: 'Prior' }
    const { rows, dropped } = groundRows('P999001', doc, slice, { cost_unit: 'USD million', packages: [
      { ...base, ref_no: 'CW-FIX-01', description: 'Rehabilitation of Road Section A, 12 km', estimated_cost: '1.25', expected_bid_opening: '2019-03-1' }, // cost cut: "1.25" for "1.250"
      { ...base, ref_no: 'CW-FAKE-99', description: 'Construction of a bridge that is not in the plan', estimated_cost: '9.999', expected_bid_opening: null }, // invented
      { ...base, ref_no: 'CW-FIX-02', description: 'Rehabilitation of Road Section B, 18 km', estimated_cost: '8.888', expected_bid_opening: 'Jun. 2019' }, // real row, wrong cost
      { ...base, ref_no: '', description: 'Supply of road signs and markings', estimated_cost: '0.150', expected_bid_opening: 'Aug. 2019' }, // no reference: the cost has to be found
    ] })
    expect(dropped).toBe(2)
    expect(rows.map((r) => [r.id, r.ref_no, r.estimated_cost, r.expected_bid_opening])).toEqual([['PP-P999001-01', 'CW-FIX-01', '1.250', null], ['PP-P999001-04', null, '0.150', 'Aug. 2019']])
    expect(rows[0]).toMatchObject({ plan_doc: 'DOC-WB-7', plan_date: '2018-03-01', cost_unit: 'USD million', source_url: 'https://documents.worldbank.org/p/7.pdf' })
  })
  it('checks the model answer has the shape asked for', () => {
    const ok = parsePlanExtract(JSON.stringify({ cost_unit: 'USD', packages: [{ ref_no: 'A-1', description: 'x', category: null, estimated_cost: '1', packages: null, method: 'NCB', review: 'Prior', expected_bid_opening: 'Mar. 2019' }] }))
    expect(ok.packages[0]).toMatchObject({ ref_no: 'A-1', method: 'NCB' })
    expect(parsePlanExtract(JSON.stringify({ packages: [{ description: 'only this' }] })).packages[0]).toEqual({ ref_no: '', description: 'only this', category: null, estimated_cost: null, packages: null, method: null, review: null, expected_bid_opening: null })
    expect(parsePlanExtract(JSON.stringify({ cost_unit: 7, packages: Array.from({ length: 40 }, () => ({ description: 'd' })) }))).toMatchObject({ cost_unit: null, packages: expect.any(Array) })
    expect(parsePlanExtract(JSON.stringify({ packages: Array.from({ length: 40 }, () => ({ description: 'd' })) })).packages).toHaveLength(MAX_ROWS)
    expect(() => parsePlanExtract('{"cost_unit":null}')).toThrow('no packages list')
    expect(() => parsePlanExtract('{"packages":[{"ref_no":"x"}]}')).toThrow('no description')
    expect(() => parsePlanExtract('not json')).toThrow()
  })
  it('asks for rows with the schema and the instructions the stored projects were read with', () => {
    const req = planRequest('P1', 'SLICE', 'gpt-test')
    expect(req).toMatchObject({ model: 'gpt-test', temperature: 0, response_format: { type: 'json_schema', json_schema: { name: 'plan_packages', strict: true } } })
    expect(req.messages[0]!.content).toContain('Never invent')
    expect(req.messages[1]!.content).toContain(`first ${MAX_ROWS} rows`)
    expect(req.messages[1]!.content.endsWith('SLICE')).toBe(true)
  })
  it('reads the newest plans, uses the one with the most checked rows, caches the model answer, and skips an unreadable plan', async () => {
    const extractor = fakePlanExtractor()
    const cache = storeCache(memoryStore())
    const docs: PlanDoc[] = [{ id: '9', docdt: '2020-01-01' }, doc, { id: '8', docdt: '2017-03-01' }]
    const texts: Record<string, string | null> = { 9: null, 7: PLAN_TEXT, 8: 'An older plan with no table.' }
    const run = () => readPlanPackages({ projectId: 'P999001', docs, extractor, io: { cache }, getText: async (d) => texts[d.id] ?? null })
    const first = await run()
    expect(first).toMatchObject({ looked: 3, withTable: 1, dropped: 1, tokens: 1200 })
    expect(first.chosen!.id).toBe('7')
    expect(first.rows).toHaveLength(3)
    const again = await run()
    expect(again.rows).toEqual(first.rows)
    expect(extractor.calls).toHaveLength(1) // the second reading came from the cache
    expect(await readPlanPackages({ projectId: 'P', docs: [{ id: '8' }], extractor, io: { cache }, getText: async () => 'no table here' })).toMatchObject({ rows: [], chosen: null, withTable: 0 })
  })
})
