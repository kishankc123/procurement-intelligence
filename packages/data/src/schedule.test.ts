import { describe, expect, it } from 'vitest'
import { expectedPct, projectPhase, scheduleRange, scheduleRows } from './schedule'
import type { Plan, Project, ScheduleItem } from './schemas'

const item = (over: Partial<ScheduleItem>): ScheduleItem => ({ id: 'S', project_id: 'P', name: 'n', group: 'Works', start: '2026-01-01', end: '2026-01-31', progress_pct: 0, ...over })
const status = (over: Partial<ScheduleItem>, asOf = '2026-01-16') => scheduleRows([item(over)], [], asOf)[0]!

describe('scheduleRows status', () => {
  it('flags behind only when the gap is above the threshold', () => {
    expect(expectedPct('2026-01-01', '2026-01-31', '2026-01-16')).toBe(50)
    expect(status({ progress_pct: 30 }).status).toBe('on_track') // gap 20 is not above 20
    expect(status({ progress_pct: 29 }).status).toBe('behind')
    expect(status({ progress_pct: 29 }).gap).toBe(21)
  })
  it('handles complete, upcoming, overdue and unrecorded progress', () => {
    expect(status({ progress_pct: 100 }).status).toBe('complete')
    expect(status({ start: '2026-03-01', end: '2026-04-01' }).status).toBe('upcoming')
    expect(status({ progress_pct: 80 }, '2026-02-15').status).toBe('overdue')
    expect(status({ progress_pct: null }).status).toBe('no_progress')
    expect(status({ progress_pct: null }, '2026-02-15').status).toBe('overdue')
  })
  it('treats a milestone as complete once its date has passed', () => {
    expect(status({ start: '2026-01-10', end: '2026-01-10', progress_pct: null }).status).toBe('complete')
    expect(status({ start: '2026-02-10', end: '2026-02-10', progress_pct: null }).status).toBe('upcoming')
  })
  it('adds a tender row per plan, using the plan dates and no invented progress', () => {
    const plan = { id: 'PL1', name: 'Lot 3', planned_advertisement: '2026-06-15', planned_signing: '2026-09-25' } as Plan
    const [row] = scheduleRows([], [plan], '2026-05-31')
    expect(row).toMatchObject({ id: 'PL1', source: 'plan', start: '2026-06-15', end: '2026-09-25', progress: null, status: 'upcoming' })
  })
  it('returns nothing for no items', () => {
    expect(scheduleRows([], [], '2026-05-31')).toEqual([])
  })
})

describe('projectPhase', () => {
  const project = (over: Partial<Project>) => ({ effectiveness_actual: '2025-01-01', closing_date_planned: '2030-01-01', closing_date_revised: null, ...over }) as Project
  const rows = (items: Partial<ScheduleItem>[]) => scheduleRows(items.map(item), [], '2026-05-31')
  it('walks through the phases', () => {
    expect(projectPhase(project({ effectiveness_actual: null }), [], '2026-05-31')).toBe('Preparation')
    expect(projectPhase(project({ closing_date_planned: '2027-03-01' }), [], '2026-05-31')).toBe('Closing')
    expect(projectPhase(project({}), rows([{ group: 'Procurement', start: '2026-04-01', end: '2026-08-01' }, { group: 'Works', start: '2026-11-01', end: '2027-01-01' }]), '2026-05-31')).toBe('Procurement')
    expect(projectPhase(project({}), rows([{ group: 'Works', start: '2026-01-01', end: '2027-01-01' }]), '2026-05-31')).toBe('Implementation')
  })
})

describe('scheduleRange', () => {
  it('widens to whole months and includes the as-of date', () => {
    const r = scheduleRows([item({ start: '2026-02-10', end: '2026-04-20' })], [], '2026-05-31')
    expect(scheduleRange(r, '2026-05-31')).toEqual({ start: '2026-02-01', end: '2026-05-31' })
  })
})
