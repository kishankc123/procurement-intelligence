import { describe, expect, it } from 'vitest'
import { planStages } from './stages'
import type { Plan } from './schemas'

const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'PL', project_id: 'P', name: 'Lot 3', planned_advertisement: '2026-06-15', planned_bid_opening: '2026-07-20', planned_evaluation_complete: '2026-08-10', planned_signing: '2026-09-25', category: 'Works', method: 'Open', ...over })

describe('planStages', () => {
  it('lists the four stages in order with the days between them', () => {
    const r = planStages(plan(), '2026-05-31')
    expect(r.stages.map((s) => s.id)).toEqual(['advertisement', 'bid_opening', 'evaluation_complete', 'contract_signing'])
    expect(r.stages.map((s) => s.daysSincePrevious)).toEqual([null, 35, 21, 46])
    expect(r.totalDays).toBe(102)
    expect(r.outOfOrder).toBe(false)
  })
  it('measures each stage from the date of the data, past negative and ahead positive', () => {
    const r = planStages(plan({ planned_advertisement: '2026-05-01' }), '2026-05-31')
    expect(r.stages[0]?.daysFromAsOf).toBe(-30)
    expect(r.stages[3]?.daysFromAsOf).toBe(117)
  })
  it('flags dates that are out of order', () => {
    const r = planStages(plan({ planned_bid_opening: '2026-06-01' }), '2026-05-31')
    expect(r.outOfOrder).toBe(true)
    expect(r.stages[1]?.daysSincePrevious).toBe(-14)
  })
})
