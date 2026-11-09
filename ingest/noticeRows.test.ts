// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FIXTURE_NOTICES, fixtureIo } from './fixtures'
import { KEEP_NOTICES, noticesSource, noticesUrl, readNotices, tenderRows, type RawNotice } from './noticeRows'

const ifb = (n: number, over: Partial<RawNotice> = {}): RawNotice => ({ id: `OP${String(n).padStart(4, '0')}`, notice_type: 'Invitation for Bids', submission_date: `2019-01-${String((n % 28) + 1).padStart(2, '0')}`, bid_description: `Tender ${n}`, ...over })

describe('tender notices', () => {
  it('keeps only Invitation for Bids with a date, newest first, maps the category and never copies contact details', () => {
    const { rows, tenders, byType } = tenderRows('P999001', FIXTURE_NOTICES.procnotices)
    expect(rows.map((r) => r.id)).toEqual(['OP002', 'OP001'])
    expect(tenders).toBe(2)
    expect(byType).toEqual({ 'Invitation for Bids': 2, 'Contract Award': 1 })
    expect(rows[1]).toMatchObject({ reference: 'CW-FIX-01', category: 'Works', method: 'Request for Bids', posted: '2019-02-10', deadline: '2019-04-01', status: 'Published', organization: 'Ministry of Works', url: 'https://projects.worldbank.org/en/projects-operations/procurement-detail/OP001' })
    expect(rows[0]).toMatchObject({ category: 'Goods', deadline: null, organization: 'Not reported' }) // a blank organisation is not invented
    const text = JSON.stringify(rows)
    for (const secret of ['Jane', 'jane@', '555']) expect(text).not.toContain(secret)
    expect(tenderRows('P1', [ifb(1, { submission_date: undefined })]).rows).toEqual([])
  })
  it('keeps the newest KEEP_NOTICES and says how many there were', () => {
    const many = Array.from({ length: 80 }, (_, i) => ifb(i, { submission_date: `2018-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }))
    const { rows, tenders } = tenderRows('P1', many)
    expect(rows).toHaveLength(KEEP_NOTICES)
    expect(tenders).toBe(80)
    expect(rows.map((r) => r.posted)).toEqual([...rows.map((r) => r.posted)].sort().reverse())
    expect(noticesSource('P1', 90, 60, 80, { 'Invitation for Bids': 80 })).toMatchObject({ name: 'Procurement Notices API', records: 90, url: expect.not.stringContaining('&os=') })
  })
  it('reads every page, once, and caches the result', async () => {
    const io = fixtureIo({ notices: { total: 250, procnotices: [ifb(1)] } })
    const urls: string[] = []
    const counted = { ...io, getJson: async (u: string) => { urls.push(u); const os = Number(/os=(\d+)/.exec(u)![1]); return { total: 250, procnotices: os < 250 ? Array.from({ length: Math.min(100, 250 - os) }, (_, i) => ifb(os + i)) : [] } } }
    const all = await readNotices('P1', counted)
    expect(all).toHaveLength(250)
    expect(urls).toEqual([noticesUrl('P1', 0), noticesUrl('P1', 100), noticesUrl('P1', 200)])
    await readNotices('P1', counted)
    expect(urls).toHaveLength(3)
  })
  it('stops on an empty page and when the run is paused', async () => {
    const io = { cache: fixtureIo().cache, getJson: async () => ({ total: 999, procnotices: [] as RawNotice[] }) }
    expect(await readNotices('P2', io)).toEqual([])
    let n = 0
    await expect(readNotices('P3', { cache: fixtureIo().cache, getJson: async () => ({ total: 999, procnotices: [ifb(1)] }) }, () => { if (++n > 1) throw new Error('paused') })).rejects.toThrow('paused')
  })
})
