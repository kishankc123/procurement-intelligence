import { describe, expect, it } from 'vitest'
import type { LifecycleItem } from '@pi/data'
import { datePlanningEstimates } from '@pi/data'
import { applyClauseChanges, applyEstimateChanges, applyPlanChanges, milestoneOf, planEditCommand, planFieldOf } from './lifecycleEdit'

const planDetail = { plan: { name: 'Road works', category: 'Works', method: 'Open', planned_advertisement: '2027-01-10', planned_bid_opening: '2027-02-10', planned_evaluation_complete: '2027-03-10', planned_signing: '2027-04-10' }, basis: { sample_size: 3 } }
const clauseDetail = { clauses: [
  { field: 'bid_validity_days', label: 'Bid validity', unit: 'days', value: 60, source: 'mock' },
  { field: 'evaluation_method', label: 'Evaluation method', unit: '', value: 'Lowest evaluated cost', source: 'mock' },
], lessons: [] }
const item = (id: string, kind: LifecycleItem['kind'], title: string, detail: unknown, over: Partial<LifecycleItem> = {}): LifecycleItem =>
  ({ id, key: id, stage: kind === 'plan' ? 'planning' : 'tender-design', kind, title, summary: '', basis: '', provenance: 'derived', detail, addedAt: '', edited: false, final: false, ...over })

describe('applyPlanChanges', () => {
  it('changes a date, keeps the basis, rebuilds the summary and says what changed', () => {
    const r = applyPlanChanges(planDetail, { planned_bid_opening: '2027-02-20' })
    if (!r.ok) throw new Error(r.error)
    expect((r.edit.detail as typeof planDetail).plan.planned_bid_opening).toBe('2027-02-20')
    expect((r.edit.detail as typeof planDetail).basis.sample_size).toBe(3)
    expect(r.edit.summary).toContain('open bids 2027-02-20')
    expect(r.changed).toEqual(['Bid opening: 2027-02-10 → 2027-02-20'])
  })
  it('refuses a date that is not real, empty text, and dates out of order', () => {
    expect(applyPlanChanges(planDetail, { planned_signing: '2027-02-30' })).toMatchObject({ ok: false })
    expect(applyPlanChanges(planDetail, { planned_signing: '15 March' })).toMatchObject({ ok: false })
    expect(applyPlanChanges(planDetail, { name: '  ' })).toMatchObject({ ok: false })
    const r = applyPlanChanges(planDetail, { planned_signing: '2027-03-01' })
    expect(r).toMatchObject({ ok: false })
    expect(r.ok ? '' : r.error).toMatch(/cannot be before evaluation complete/)
  })
  it('accepts several changes together when the result is in order', () => {
    expect(applyPlanChanges(planDetail, { planned_evaluation_complete: '2027-05-01', planned_signing: '2027-06-01' })).toMatchObject({ ok: true })
  })
})

describe('applyClauseChanges', () => {
  it('changes a number clause by label or field key and marks it edited', () => {
    const r = applyClauseChanges(clauseDetail, [{ clause: 'bid validity', value: '90' }])
    if (!r.ok) throw new Error(r.error)
    const clauses = (r.edit.detail as typeof clauseDetail).clauses as { value: unknown; edited?: boolean }[]
    expect(clauses[0]).toMatchObject({ value: 90, edited: true })
    expect(clauses[1]!.edited).toBeUndefined()
    expect(r.edit.summary).toBe('Bid validity: 90 days; Evaluation method: Lowest evaluated cost')
    expect(applyClauseChanges(clauseDetail, [{ clause: 'bid_validity_days', value: 120 }])).toMatchObject({ ok: true })
  })
  it('refuses a non-number for a number clause and an unknown clause, naming the clauses', () => {
    expect(applyClauseChanges(clauseDetail, [{ clause: 'Bid validity', value: 'long' }])).toMatchObject({ ok: false })
    const r = applyClauseChanges(clauseDetail, [{ clause: 'Warranty', value: 1 }])
    expect(r.ok ? '' : r.error).toMatch(/Bid validity, Evaluation method/)
  })
})

describe('planEditCommand', () => {
  const plan = item('P1', 'plan', 'Road works', planDetail)
  const clauses = item('T1', 'tender-clauses', 'Tender clauses', clauseDetail)

  it('maps words to plan fields', () => {
    expect(planFieldOf('Bid opening')).toBe('planned_bid_opening')
    expect(planFieldOf('signing date')).toBe('planned_signing')
    expect(planFieldOf('nonsense')).toBeNull()
  })
  it('edits the plan and the clauses, and can save as final in the same command', () => {
    const a = planEditCommand([plan, clauses], { what: 'plan', changes: [{ field: 'bid opening', value: '2027-02-15' }], finalize: true })
    expect(a).toMatchObject({ ok: true, id: 'P1', final: true })
    expect(a.text).toMatch(/Bid opening: 2027-02-10 → 2027-02-15.*Saved "Road works" as final/)
    expect(planEditCommand([plan, clauses], { what: 'tender', changes: [{ field: 'Bid validity', value: 90 }] })).toMatchObject({ ok: true, id: 'T1' })
  })
  it('refuses when there is nothing to edit, the item is final, or it is ambiguous', () => {
    expect(planEditCommand([clauses], { what: 'plan', changes: [{ field: 'signing', value: '2027-05-01' }] })).toMatchObject({ ok: false })
    expect(planEditCommand([{ ...plan, final: true }], { what: 'plan', changes: [{ field: 'signing', value: '2027-05-01' }] }).text).toMatch(/saved as final/)
    expect(planEditCommand([plan, item('P2', 'plan', 'Pipe supply', planDetail)], { what: 'plan', changes: [{ field: 'signing', value: '2027-05-01' }] }).text).toMatch(/2 items for the plan/)
    expect(planEditCommand([plan, item('P2', 'plan', 'Pipe supply', planDetail)], { what: 'plan', title: 'pipe', changes: [{ field: 'signing', value: '2027-05-01' }] })).toMatchObject({ ok: true, id: 'P2' })
  })
  it('can reopen a final item and refuses an empty command', () => {
    expect(planEditCommand([{ ...plan, final: true }], { what: 'plan', finalize: false })).toMatchObject({ ok: true, final: false })
    expect(planEditCommand([plan], { what: 'plan' })).toMatchObject({ ok: false })
  })
  it('passes a refusal from the checks to the model as the reason', () => {
    const r = planEditCommand([plan], { what: 'plan', changes: [{ field: 'signing', value: 'soon' }] })
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/Nothing was changed.*YYYY-MM-DD/)
  })
})

describe('estimates', () => {
  const rows = [
    { stage: 'planning', metric: 'Planned project length', unit: 'months', value: 48, n: 3, counts: 'projects', thin: false },
    { stage: 'planning', metric: 'Approval to effectiveness', unit: 'days', value: 100, n: 3, counts: 'projects', thin: false },
    { stage: 'planning', metric: 'Bidding period', unit: 'days', value: 40, n: 3, counts: 'tenders', thin: false },
    { stage: 'planning', metric: 'Evaluation period', unit: 'days', value: 30, n: 3, counts: 'tenders', thin: false },
    { stage: 'planning', metric: 'Award to signing', unit: 'days', value: 20, n: 3, counts: 'tenders', thin: false },
    { stage: 'planning', metric: 'Missing one', unit: '', value: null, n: 0, counts: '', thin: false },
  ]
  const detail = { scope: 'real', rows, timeline: datePlanningEstimates(rows, '2030-06-30', '2026-01-01') }
  const dateOf = (d: unknown, id: string) => (d as typeof detail).timeline.milestones.find((m) => m.id === id)!.date

  it('changes a figure, works the dates out again and marks the figure edited', () => {
    const before = dateOf(detail, 'contract_signing')
    const r = applyEstimateChanges(detail, { figures: [{ metric: 'bidding', value: 100 }] })
    if (!r.ok) throw new Error(r.error)
    expect((r.edit.detail as typeof detail).rows[2]).toMatchObject({ value: 100, edited: true })
    expect(dateOf(r.edit.detail, 'contract_signing') > before).toBe(true)
    expect(dateOf(r.edit.detail, 'completion')).toBe('2030-06-30')
    expect(r.edit.summary).toContain('Bidding period: 100 days')
  })

  it('sets a date by hand, marks it, and keeps it when a figure changes later', () => {
    const a = applyEstimateChanges(detail, { dates: [{ milestone: 'bid opening', value: dateOf(detail, 'bid_opening').replace(/^\d{4}/, (y) => String(Number(y))) }] })
    expect(a).toMatchObject({ ok: true })
    const set = applyEstimateChanges(detail, { dates: [{ milestone: 'signing', value: '2030-01-15' }] })
    if (!set.ok) throw new Error(set.error)
    expect((set.edit.detail as typeof detail).timeline.milestones.find((m) => m.id === 'contract_signing')).toMatchObject({ date: '2030-01-15', how: 'Set by you.' })
    const later = applyEstimateChanges(set.edit.detail, { figures: [{ metric: 'Evaluation period', value: 10 }] })
    if (!later.ok) throw new Error(later.error)
    expect(dateOf(later.edit.detail, 'contract_signing')).toBe('2030-01-15')
  })

  it('refuses dates that are not real, out of order, or a date on estimates with no calendar', () => {
    expect(applyEstimateChanges(detail, { dates: [{ milestone: 'signing', value: 'soon' }] })).toMatchObject({ ok: false })
    const early = applyEstimateChanges(detail, { dates: [{ milestone: 'signing', value: '2001-01-01' }] })
    expect(early.ok ? '' : early.error).toMatch(/cannot be before/)
    expect(applyEstimateChanges({ rows, timeline: undefined }, { dates: [{ milestone: 'signing', value: '2030-01-15' }] })).toMatchObject({ ok: false })
    expect(applyEstimateChanges(detail, { figures: [{ metric: 'Missing one', value: 3 }] })).toMatchObject({ ok: false })
    expect(applyEstimateChanges(detail, { figures: [{ metric: 'bidding', value: 'many' }] })).toMatchObject({ ok: false })
  })

  it('a completion date changed by the user is no longer assumed, and a run past it is flagged', () => {
    const assumed = { ...detail, timeline: { ...detail.timeline, assumed: true } }
    const r = applyEstimateChanges(assumed, { dates: [{ milestone: 'project completion', value: '2030-06-29' }] })
    if (!r.ok) throw new Error(r.error)
    expect((r.edit.detail as typeof detail).timeline).toMatchObject({ completion: '2030-06-29', assumed: false })
    expect(milestoneOf('Contract signing')).toBe('contract_signing')
  })

  it('the command edits planning estimates as "the plan" and tender design estimates as "the tender draft"', () => {
    const plan = item('E1', 'estimates', 'Planning estimates (real projects)', detail, { stage: 'planning' })
    const tender = item('E2', 'estimates', 'Tender design estimates', { rows: [{ stage: 'tender-design', metric: 'Bid validity', unit: 'days', value: 90, n: 4, counts: 'drafts', thin: false }] }, { stage: 'tender-design' })
    const a = planEditCommand([plan, tender], { what: 'plan', changes: [{ field: 'signing', value: '2030-01-15' }] })
    expect(a).toMatchObject({ ok: true, id: 'E1' })
    expect(a.text).toMatch(/Contract signing:/)
    expect(planEditCommand([plan, tender], { what: 'tender', changes: [{ field: 'Bid validity', value: 120 }] })).toMatchObject({ ok: true, id: 'E2' })
    expect(planEditCommand([plan, tender], { what: 'plan', changes: [{ field: 'Bidding period', value: 60 }], finalize: true }).text).toMatch(/Bidding period: 40 days → 60 days.*as final/)
  })
})
