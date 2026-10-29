import { describe, expect, it } from 'vitest'
import { isSampleId, sampleAlerts, sampleScheduleItems } from './monitoringSamples'
import { scheduleRows } from './schedule'

describe('monitoring samples', () => {
  it('schedule samples show on track, behind and overdue at any as-of date', () => {
    for (const asOf of ['2026-03-01', '2027-01-15']) {
      const rows = scheduleRows(sampleScheduleItems('P-X', asOf), [], asOf)
      expect(rows.map((r) => r.status).sort()).toEqual(['behind', 'on_track', 'overdue'])
      expect(rows.every((r) => isSampleId(r.id) && r.name.startsWith('Sample: '))).toBe(true)
    }
  })

  it('alert samples cover every severity, are labelled, and always cite a record', () => {
    const alerts = sampleAlerts('P-X', { id: 'ISR-1', sequence: 3 })
    expect(alerts.map((a) => a.severity)).toEqual(['high', 'medium', 'low'])
    expect(alerts.every((a) => isSampleId(a.id) && a.title.startsWith('Sample: ') && a.citations.length > 0 && a.assignee === null)).toBe(true)
  })

  it('makes no alert sample when there is no report to cite', () => {
    expect(sampleAlerts('P-X', undefined)).toEqual([])
  })
})
