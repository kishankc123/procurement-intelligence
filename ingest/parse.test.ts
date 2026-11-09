// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { apiDateToIso, chunkText, dmyToIso, parseIsr } from './parse'

// Trimmed from real supervision reports of P158504 (World Bank public data), newer and older layouts.
const NEW = `The World Bank Implementation Status & Results Report ... FY 2017 | Seq No: 17 | Archived on 29-Sep-2025 | ISR05203
3. OVERALL RATINGS Name Previous Current Progress towards achievement of PDO Satisfactory Satisfactory Overall Implementation Progress (IP) Moderately Satisfactory Satisfactory Overall Risk Rating Moderate Moderate Sep 30, 2025 Page 1 of 9
5. SYSTEMATIC OPERATIONS RISK-RATING TOOL Fiduciary Substantial Moderate Moderate Overall Substantial Moderate Moderate Sep 30, 2025 Page 2 of 9
7. DATA ON FINANCIAL PERFORMANCE 7.2 Disbursements (by loan) Loan/Credit/TF Status Original Revised Cancelled Disbursed Undisbursed % Disbursed IDA-59200 Effective 25.00 24.72 0.00 24.83 0.00 99.99% IDA-65150 Effective 25.00 24.92 0.00 24.54 0.00 99.81% 7.3 Key Dates (by loan) Loan/Credit/TF Status Approval Signing Effectiveness Orig. Closing Rev. Closing IDA-59200 Effective 13-Dec-2016 07-Feb-2017 23-Mar-2017 31-Aug-2022 31-Dec-2025 Sep 30, 2025 Page 8 of 9
9. RESTRUCTURING HISTORY Restructuring Level 2 Approved on 09-Oct-2018 Restructuring Level 2 Approved on 09-May-2024 10. ASSOCIATED OPERATION(S) There are no associated operations Page 9 of 9`
const MID = `FY 2017 | Seq No: 12 | ISR1 Progress towards achievement of PDO Satisfactory Satisfactory Overall Implementation Progress (IP) Moderately Satisfactory Moderately Satisfactory Overall Risk Rating Substantial Substantial
Loan/Credit/TF Status Currency Original Revised Cancelled Disbursed Undisbursed % Disbursed P158504 IDA-59200 Effective USD 25.00 25.00 0.00 21.73 3.06 88% P158504 IDA-65150 Effective USD 25.00 25.00 0.00 7.94 16.64 32% Key Dates (by loan) Project Loan/Credit/TF Status Approval Date Signing Date Effectiveness Date Orig. Closing Date Rev. Closing Date P158504 IDA-59200 Effective 13-Dec-2016 07-Feb-2017 23-Mar-2017 31-Aug-2022 31-Dec-2023`
const OLD = `Seq No: 1 | ARCHIVED on 28-Apr-2017 Key Dates Key Project Dates Bank Approval Date:13-Dec-2016 Effectiveness Date:23-Mar-2017 Planned Mid Term Review Date:15-Oct-2018 Actual Mid-Term Review Date:-- Original Closing Date:31-Aug-2022 Revised Closing Date:31-Aug-2022
Progress towards achievement of PDO -- Satisfactory Overall Implementation Progress (IP) -- Satisfactory Overall Risk Rating -- Substantial
Loan/Credit/TF Status Currency Original Revised Cancelled Disbursed Undisbursed Disbursed P158504 IDA-59200 Effective XDR 18.00 18.00 0.00 0.00 18.00 0% Key Dates (by loan)`

describe('dates', () => {
  it('reads day-month-year and API dates, and returns null for anything else', () => {
    expect(dmyToIso('13-Dec-2016')).toBe('2016-12-13')
    expect(dmyToIso('09-OCT-2018')).toBe('2018-10-09')
    expect(dmyToIso('not a date')).toBeNull()
    expect(dmyToIso(undefined)).toBeNull()
    expect(apiDateToIso('12/31/2025 12:00:00 AM')).toBe('2025-12-31')
    expect(apiDateToIso('2016-12-13T00:00:00Z')).toBe('2016-12-13')
  })
})

describe('parseIsr', () => {
  it('reads the newer layout: ratings, risk, fiduciary, disbursement, restructurings and key dates', () => {
    const r = parseIsr(NEW)
    expect(r.sequence).toBe(17)
    expect(r.progress).toEqual({ previous: 'Satisfactory', current: 'Satisfactory' })
    expect(r.implementation).toEqual({ previous: 'Moderately Satisfactory', current: 'Satisfactory' })
    expect(r.risk).toEqual({ previous: 'Moderate', current: 'Moderate' })
    expect(r.fiduciary).toBe('Moderate')
    expect(r.disbursedPct).toBeCloseTo(99.9, 1)
    expect(r.restructurings).toEqual([{ date: '2018-10-09', note: 'Level 2 restructuring approved' }, { date: '2024-05-09', note: 'Level 2 restructuring approved' }])
    expect(r.keyDates).toEqual({ approval: '2016-12-13', effectiveness: '2017-03-23', originalClosing: '2022-08-31', revisedClosing: '2025-12-31' })
    expect(r.problems).toEqual([])
  })
  it('ignores the private-use bullet symbols the real reports put between cells', () => {
    const r = parseIsr(NEW.replace('Progress towards achievement of PDO Satisfactory', 'Progress towards achievement of PDO \uF06C Satisfactory').replace('Overall Risk Rating Moderate', 'Overall Risk Rating \uF06C Moderate'))
    expect(r.progress.current).toBe('Satisfactory')
    expect(r.risk.current).toBe('Moderate')
    expect(r.problems).toEqual([])
  })
  it('reads the middle layout, weighting each loan by its revised amount', () => {
    const r = parseIsr(MID)
    expect(r.sequence).toBe(12)
    expect(r.risk.current).toBe('Substantial')
    expect(r.fiduciary).toBeNull()
    expect(r.disbursedPct).toBe(60) // (88 + 32) / 2 with equal amounts
    expect(r.keyDates?.revisedClosing).toBe('2023-12-31')
  })
  it('reads the oldest layout, where there is no previous rating', () => {
    const r = parseIsr(OLD)
    expect(r.sequence).toBe(1)
    expect(r.progress).toEqual({ previous: null, current: 'Satisfactory' })
    expect(r.risk).toEqual({ previous: null, current: 'Substantial' })
    expect(r.disbursedPct).toBe(0)
    expect(r.keyDates).toEqual({ approval: '2016-12-13', effectiveness: '2017-03-23', originalClosing: '2022-08-31', revisedClosing: '2022-08-31' })
  })
  it('lists what it could not read instead of guessing', () => {
    const r = parseIsr('Some other document without ratings')
    expect(r.sequence).toBeNull()
    expect(r.progress.current).toBeNull()
    expect(r.disbursedPct).toBeNull()
    expect(r.problems.length).toBeGreaterThanOrEqual(4)
  })
})

describe('chunkText', () => {
  it('splits at sentence ends, keeps sections and takes exact pages from the footers', () => {
    const body = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i} says something useful about the road.`).join(' ')
    const text = `1. OBJECTIVE ${body(40)} Page 1 of 3 3. OVERALL RATINGS ${body(40)} Page 2 of 3 ${body(10)} Page 3 of 3`
    const { pieces, exactPages, pages } = chunkText(text, 600)
    expect(exactPages).toBe(true)
    expect(pages).toBe(3)
    expect(pieces.length).toBeGreaterThan(3)
    expect(pieces.every((p) => p.text.length <= 700)).toBe(true)
    expect(pieces[0]).toMatchObject({ page: 1, section: '1. OBJECTIVE' })
    expect(pieces.some((p) => p.section === '3. OVERALL RATINGS')).toBe(true)
    expect(pieces.at(-1)?.page).toBeGreaterThanOrEqual(2)
    expect(Math.max(...pieces.map((p) => p.page))).toBeLessThanOrEqual(3)
    expect(pieces.map((p) => p.page)).toEqual([...pieces.map((p) => p.page)].sort((a, b) => a - b))
  })
  it('estimates pages and says so when there are no footers', () => {
    const { exactPages, pieces } = chunkText('A sentence. '.repeat(1000), 1500)
    expect(exactPages).toBe(false)
    expect(pieces[0]?.page).toBe(1)
    expect(pieces[0]?.section).toBe('Text')
  })
})
