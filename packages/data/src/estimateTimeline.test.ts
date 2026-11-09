import { describe, expect, it } from 'vitest'
import { datePlanningEstimates, defaultCompletion } from './estimateTimeline'

const rows = [
  { metric: 'Approval to effectiveness', value: 100 },
  { metric: 'Planned project length (approval to planned closing)', value: 60 },
  { metric: 'Bidding period (advertisement to bid opening)', value: 30 },
  { metric: 'Evaluation period (bid opening to evaluation complete)', value: 20 },
  { metric: 'Award to signing (evaluation complete to signing)', value: 10 },
]

describe('datePlanningEstimates', () => {
  it('uses ten years from today when no date is given', () => {
    expect(defaultCompletion('2026-10-29')).toBe('2036-10-29')
    const r = datePlanningEstimates(rows, '', '2026-10-29')
    expect(r.assumed).toBe(true)
    expect(r.completion).toBe('2036-10-29')
    expect(r.milestones.at(-1)).toMatchObject({ id: 'completion', date: '2036-10-29' })
  })
  it('works every date back from the date the user gave, in order', () => {
    const r = datePlanningEstimates(rows, '2032-06-30', '2026-10-29')
    expect(r.assumed).toBe(false)
    expect(r.milestones.map((m) => m.id)).toEqual(['approval', 'effectiveness', 'advertisement', 'bid_opening', 'evaluation_complete', 'contract_signing', 'completion'])
    const dates = r.milestones.map((m) => m.date)
    expect([...dates].sort()).toEqual(dates)
    expect(r.milestones[1]!.date).toBe(r.milestones[2]!.date)
  })
  it('leaves out a milestone whose duration is missing, and says why', () => {
    const r = datePlanningEstimates(rows.filter((x) => !x.metric.startsWith('Bidding')), '2032-06-30', '2026-10-29')
    expect(r.milestones.map((m) => m.id)).toEqual(['approval', 'effectiveness', 'advertisement', 'completion'])
    expect(r.notes.join(' ')).toMatch(/bidding period/i)
  })
  it('shows only the completion date when there is no project length', () => {
    const r = datePlanningEstimates([], undefined, '2026-10-29')
    expect(r.milestones.map((m) => m.id)).toEqual(['completion'])
    expect(r.notes).toHaveLength(1)
  })
  it('flags procurement that runs past the completion date', () => {
    const r = datePlanningEstimates([{ metric: 'Planned project length', value: 0.1 }, { metric: 'Approval to effectiveness', value: 400 }], '2030-01-01', '2026-10-29')
    expect(r.overrun).toBe(true)
  })

  it('never places a date before today: a 90-month length ending 2029-12-30 starts today, not in 2022', () => {
    const long = rows.map((x) => (x.metric.startsWith('Planned project length') ? { ...x, value: 90 } : x))
    const r = datePlanningEstimates(long, '2029-12-30', '2026-10-31')
    expect(r.milestones.every((m) => m.date >= '2026-10-31')).toBe(true)
    expect(r.milestones[0]).toMatchObject({ id: 'approval', date: '2026-10-31' })
    expect(r.completion).toBe('2029-12-30')
    expect(r.notes.join(' ')).toMatch(/starts today/)
  })
  it('keeps working back from the completion date when that lands after today', () => {
    const r = datePlanningEstimates(rows, '2032-06-30', '2026-10-31')
    expect(r.milestones[0]!.how).toMatch(/Completion date minus/)
    expect(r.milestones[0]!.date > '2026-10-31').toBe(true)
  })
  it('treats a completion date in the past as not given', () => {
    const r = datePlanningEstimates(rows, '2020-01-01', '2026-10-31')
    expect(r.assumed).toBe(true)
    expect(r.completion).toBe('2036-10-31')
    expect(r.notes.join(' ')).toMatch(/before today/)
  })
})
